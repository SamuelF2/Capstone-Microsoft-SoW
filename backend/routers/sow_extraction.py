"""
SoW field extraction  —  AI-driven document → ``sow.content`` population.

Two endpoints, both under ``/api/sow``:

* ``POST /api/sow/{sow_id}/extract-from-document`` reads an uploaded file
  (the SoW's own upload, or one of its attachments), extracts plain text,
  asks the ML service to map it to structured SoW sections, and returns
  the proposal **without mutating** the SoW. The caller then renders the
  ``ExtractionPreviewModal`` so the author can pick which sections to
  apply.

* ``POST /api/sow/{sow_id}/apply-extraction`` writes the author-approved
  subset back to ``sow.content`` at the top-level section key. It uses an
  ``expected_content_hash`` for optimistic concurrency so a parallel
  auto-save can't get clobbered: a mismatch returns ``409`` with code
  ``sow_changed_since_extraction`` so the frontend can re-extract.

Permission split:

* Extraction is read-only against the SoW (``require_collaborator``) so
  any reviewer can preview what the AI would propose.
* Apply mutates content (``require_author``) and is gated on
  ``status='draft'`` — once a SoW is in review or finalized we never let
  the AI overwrite content silently.

The new endpoints live in their own router so ``backend/routers/sow.py``
(already 2000+ lines) stays focused on CRUD.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import database
import httpx
from auth import CurrentUser
from config import GRAPHRAG_API_URL, UPLOAD_DIR
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from utils.db_helpers import insert_history, require_author, require_collaborator
from utils.document_text import (
    EXTRACTABLE_EXTENSIONS,
    UnsupportedFileTypeError,
    extract_text_from_file,
)
from utils.section_schemas import SECTION_SCHEMAS, default_target_sections
from utils.sow_text import hash_sow_content

from routers.sow import _row_to_response

router = APIRouter(prefix="/api/sow", tags=["sow-extraction"])


# 60s mirrors services/ai.py _SYNC_TIMEOUT — the LLM call inside the ML
# service is the slow part, and the existing analyze flow uses the same
# upper bound.
_ML_TIMEOUT = 60.0


# ── Request / response models ────────────────────────────────────────────────


class ExtractFromDocumentRequest(BaseModel):
    """Caller picks the source file and (optionally) which sections to extract.

    ``attachment_id`` is omitted when the SoW's own upload (the file from
    ``POST /api/sow/upload``, stored under ``metadata.file_path``) is the
    source — this is the case used by the ``/ai-review`` page. The draft
    page passes the freshly-uploaded attachment's id.

    ``target_sections`` defaults to :func:`default_target_sections` for
    the SoW's methodology, which drops ``agileApproach`` for non-agile
    methodologies so the modal isn't cluttered with low-confidence nulls.
    """

    attachment_id: int | None = None
    target_sections: list[str] | None = None


class ExtractFromDocumentResponse(BaseModel):
    extracted: dict[str, dict[str, Any]]
    notes: str = ""
    content_hash: str
    model_version: str | None = None


class ApplyExtractionRequest(BaseModel):
    """Caller-selected subset of sections to write back to ``sow.content``.

    ``expected_content_hash`` is the ``content_hash`` returned by the
    extract endpoint. The apply endpoint refuses to overwrite if the SoW
    has changed since — usually because the author kept editing in
    another tab while the modal was open.
    """

    sections: dict[str, Any]
    expected_content_hash: str


# ── Helpers ──────────────────────────────────────────────────────────────────


def _resolve_source_path(
    metadata: dict[str, Any] | None,
    attachment: dict[str, Any] | None,
) -> Path:
    """Pick the file path for extraction and validate it lives under UPLOAD_DIR.

    Raises ``HTTPException`` with the appropriate status code on any
    failure (no file recorded, path traversal attempt, file not on disk).
    """
    base = Path(UPLOAD_DIR).resolve()
    if attachment is not None:
        rel = attachment.get("file_path")
    else:
        rel = (metadata or {}).get("file_path")

    if not rel:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No source file is associated with this request",
        )

    candidate = (Path(UPLOAD_DIR) / rel).resolve()
    # str(...).startswith match guards against `..`-traversal escaping the
    # uploads root — same pattern the existing /parse and attachments
    # routes use.
    if not str(candidate).startswith(str(base)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path",
        )
    if not candidate.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source file not found on disk",
        )
    return candidate


async def _call_ml_extract(payload: dict[str, Any]) -> dict[str, Any]:
    """POST to the ML service's ``/extract/sow-fields`` endpoint.

    Translates ML-side failures into 503 responses with a ``retryable``
    flag the frontend uses to drive the AIUnavailableBanner ("Retry"
    button only when retryable). Mirrors the patterns in
    ``services/ai.py`` so callers can rely on uniform error shapes.
    """
    if not GRAPHRAG_API_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "ML service not configured (GRAPHRAG_API_URL is empty)",
                "retryable": False,
            },
        )

    try:
        async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=_ML_TIMEOUT) as client:
            resp = await client.post("/extract/sow-fields", json=payload)
            if resp.status_code in (404, 501):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "message": "Extraction endpoint not available on ML service",
                        "retryable": False,
                    },
                )
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service unreachable: {exc}", "retryable": True},
        ) from exc
    except httpx.ReadTimeout as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service timed out: {exc}", "retryable": True},
        ) from exc
    except httpx.HTTPStatusError as exc:
        retryable = exc.response.status_code >= 500
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service error: {exc}", "retryable": retryable},
        ) from exc


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post(
    "/{sow_id}/extract-from-document",
    response_model=ExtractFromDocumentResponse,
    summary="Use AI to propose SoW section content from an uploaded document",
)
async def extract_from_document(
    sow_id: int,
    payload: ExtractFromDocumentRequest,
    current_user: CurrentUser,
) -> ExtractFromDocumentResponse:
    async with database.pg_pool.acquire() as conn:
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        sow_row = await conn.fetchrow(
            "SELECT id, content, metadata, methodology, title FROM sow_documents WHERE id = $1",
            sow_id,
        )
        if not sow_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        attachment = None
        if payload.attachment_id is not None:
            attachment_row = await conn.fetchrow(
                "SELECT id, file_path FROM sow_attachments WHERE id = $1 AND sow_id = $2",
                payload.attachment_id,
                sow_id,
            )
            if not attachment_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Attachment not found for this SoW",
                )
            attachment = dict(attachment_row)

    metadata = sow_row["metadata"]
    if isinstance(metadata, str):
        metadata = json.loads(metadata) if metadata else {}
    content = sow_row["content"]
    if isinstance(content, str):
        content = json.loads(content) if content else {}
    content = content or {}

    source_path = _resolve_source_path(metadata, attachment)

    if source_path.suffix.lower() not in EXTRACTABLE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File type '{source_path.suffix}' is not supported for "
                f"AI extraction. Supported: {sorted(EXTRACTABLE_EXTENSIONS)}"
            ),
        )

    try:
        document_text = extract_text_from_file(str(source_path))
    except UnsupportedFileTypeError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)
        ) from exc

    if not document_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract any text from the source file",
        )

    target_sections = payload.target_sections or default_target_sections(sow_row["methodology"])
    invalid = [s for s in target_sections if s not in SECTION_SCHEMAS]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown section keys: {invalid}",
        )

    schemas = {k: SECTION_SCHEMAS[k] for k in target_sections}

    ml_payload = {
        "document_text": document_text,
        "methodology": sow_row["methodology"],
        "target_sections": target_sections,
        "section_schemas": schemas,
        "sow_title": sow_row["title"],
    }
    ml_data = await _call_ml_extract(ml_payload)

    extracted_raw = ml_data.get("extracted") or {}
    if not isinstance(extracted_raw, dict):
        extracted_raw = {}
    # Pass the per-section dicts through unchanged; the frontend modal
    # already knows how to read {value, confidence, rationale}.
    extracted = {k: v for k, v in extracted_raw.items() if isinstance(v, dict)}

    return ExtractFromDocumentResponse(
        extracted=extracted,
        notes=str(ml_data.get("notes") or ""),
        content_hash=hash_sow_content(content),
        model_version=ml_data.get("model_version"),
    )


@router.post(
    "/{sow_id}/apply-extraction",
    summary="Apply approved AI-extracted sections to the SoW content",
)
async def apply_extraction(
    sow_id: int,
    payload: ApplyExtractionRequest,
    current_user: CurrentUser,
):
    if not payload.sections:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one section must be provided",
        )
    invalid = [k for k in payload.sections if k not in SECTION_SCHEMAS]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown section keys: {invalid}",
        )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_author(conn, sow_id=sow_id, user_id=current_user.id)
        row = await conn.fetchrow(
            "SELECT id, status, content FROM sow_documents WHERE id = $1 FOR UPDATE",
            sow_id,
        )
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        if row["status"] != "draft":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "sow_not_in_draft",
                    "message": (
                        f"Cannot apply AI extraction to a SoW in status "
                        f"'{row['status']}' — only drafts may be auto-filled"
                    ),
                },
            )

        content = row["content"]
        if isinstance(content, str):
            content = json.loads(content) if content else {}
        content = content or {}

        if hash_sow_content(content) != payload.expected_content_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "sow_changed_since_extraction",
                    "message": (
                        "The SoW changed since extraction. Re-run extraction and try again."
                    ),
                },
            )

        # Section-level replacement (no deep merge): the user picked
        # whole sections to overwrite. Deep-merging arrays here would
        # silently concatenate user-authored items with AI-extracted
        # ones, which is rarely what the author wants.
        new_content = {**content, **payload.sections}

        result_row = await conn.fetchrow(
            """
            UPDATE sow_documents
               SET content = $1::jsonb,
                   updated_at = NOW()
             WHERE id = $2
            RETURNING *
            """,
            json.dumps(new_content),
            sow_id,
        )
        await insert_history(
            conn,
            sow_id=sow_id,
            user_id=current_user.id,
            change_type="auto_filled_from_document",
            diff={"applied_sections": sorted(payload.sections.keys())},
        )

    return _row_to_response(dict(result_row))
