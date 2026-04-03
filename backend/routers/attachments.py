"""
Attachments router  —  /api/attachments/...

File attachment management for SoW documents.  Attachments are tied to a SoW
and optionally to a specific workflow stage and document type.  Per-stage
document requirements (from the workflow template) can gate stage advancement.

Endpoints
---------
  POST   /api/attachments/sow/{sow_id}              Upload attachment
  GET    /api/attachments/sow/{sow_id}               List attachments
  GET    /api/attachments/{attachment_id}              Get attachment metadata
  GET    /api/attachments/{attachment_id}/download     Download the file
  DELETE /api/attachments/{attachment_id}              Delete attachment
  GET    /api/attachments/sow/{sow_id}/requirements   Stage document requirements
"""

from __future__ import annotations

import contextlib
import json
import uuid
from pathlib import Path
from typing import Any

import database
from auth import CurrentUser
from config import MAX_UPLOAD_SIZE_MB, UPLOAD_DIR
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from models import AttachmentResponse, DocumentRequirement, StageRequirementsResponse

router = APIRouter(prefix="/api/attachments", tags=["attachments"])

# ── Constants ────────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".pptx", ".png", ".jpg", ".jpeg"}

DOCUMENT_TYPES = {
    "solution-architecture",
    "staffing-plan",
    "risk-register",
    "test-plan",
    "security-assessment",
    "data-migration-plan",
    "training-plan",
    "srm-presentation",
    "other",
}

_MAX_UPLOAD_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
_FILE_FIELD = File(...)
_DOC_TYPE_FIELD = Form("other")
_STAGE_KEY_FIELD = Form(None)
_DESCRIPTION_FIELD = Form(None)

# Map extensions to MIME types
_MIME_MAP: dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _require_collaborator(conn, *, sow_id: int, user_id: int) -> None:
    """Raise 404 if the user is not a collaborator on this SoW."""
    found = await conn.fetchval(
        "SELECT 1 FROM collaboration WHERE sow_id = $1 AND user_id = $2",
        sow_id,
        user_id,
    )
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")


def _attachments_dir(sow_id: int) -> Path:
    """Return (and create) the attachment directory for a SoW."""
    d = Path(UPLOAD_DIR) / "attachments" / str(sow_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── POST /api/attachments/sow/{sow_id} — Upload ─────────────────────────────


@router.post(
    "/sow/{sow_id}",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a file attachment to a SoW",
)
async def upload_attachment(
    sow_id: int,
    current_user: CurrentUser,
    file: UploadFile = _FILE_FIELD,
    document_type: str = _DOC_TYPE_FIELD,
    stage_key: str | None = _STAGE_KEY_FIELD,
    description: str | None = _DESCRIPTION_FIELD,
) -> AttachmentResponse:
    """Upload a file and attach it to the given SoW."""
    # Validate document type
    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document_type '{document_type}'. Must be one of: {sorted(DOCUMENT_TYPES)}",
        )

    # Validate file extension
    original_name = file.filename or "unnamed"
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    # Read and validate size
    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_UPLOAD_SIZE_MB} MB limit",
        )

    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        # Verify SoW exists
        sow = await conn.fetchrow("SELECT id FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        # Save file
        upload_dir = _attachments_dir(sow_id)
        safe_filename = f"{uuid.uuid4().hex}_{original_name}"
        file_path = upload_dir / safe_filename

        # Security: ensure resolved path stays within UPLOAD_DIR
        resolved = file_path.resolve()
        base_resolved = Path(UPLOAD_DIR).resolve()
        if not str(resolved).startswith(str(base_resolved)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid filename",
            )

        with open(resolved, "wb") as f:
            f.write(contents)

        # Relative path for DB storage
        rel_path = str(file_path.relative_to(Path(UPLOAD_DIR)))
        mime_type = _MIME_MAP.get(ext, "application/octet-stream")

        row = await conn.fetchrow(
            """
            INSERT INTO sow_attachments
                (sow_id, filename, original_name, file_path, file_size,
                 mime_type, document_type, stage_key, description, uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            """,
            sow_id,
            safe_filename,
            original_name,
            rel_path,
            len(contents),
            mime_type,
            document_type,
            stage_key,
            description,
            current_user.id,
        )

    return AttachmentResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        filename=row["filename"],
        original_name=row["original_name"],
        file_size=row["file_size"],
        mime_type=row["mime_type"],
        document_type=row["document_type"],
        stage_key=row["stage_key"],
        description=row["description"],
        uploaded_by=row["uploaded_by"],
        uploaded_at=row["uploaded_at"],
    )


# ── GET /api/attachments/sow/{sow_id} — List ────────────────────────────────


@router.get(
    "/sow/{sow_id}",
    response_model=list[AttachmentResponse],
    summary="List attachments for a SoW",
)
async def list_attachments(
    sow_id: int,
    current_user: CurrentUser,
    document_type: str | None = Query(None),
    stage_key: str | None = Query(None),
) -> list[AttachmentResponse]:
    """Return all attachments for a SoW, optionally filtered."""
    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        filters = ["sow_id = $1"]
        params: list[Any] = [sow_id]
        idx = 2

        if document_type:
            filters.append(f"document_type = ${idx}")
            params.append(document_type)
            idx += 1
        if stage_key:
            filters.append(f"stage_key = ${idx}")
            params.append(stage_key)
            idx += 1

        where = " AND ".join(filters)
        rows = await conn.fetch(
            f"SELECT * FROM sow_attachments WHERE {where} ORDER BY uploaded_at DESC",
            *params,
        )

    return [
        AttachmentResponse(
            id=r["id"],
            sow_id=r["sow_id"],
            filename=r["filename"],
            original_name=r["original_name"],
            file_size=r["file_size"],
            mime_type=r["mime_type"],
            document_type=r["document_type"],
            stage_key=r["stage_key"],
            description=r["description"],
            uploaded_by=r["uploaded_by"],
            uploaded_at=r["uploaded_at"],
        )
        for r in rows
    ]


# ── GET /api/attachments/{attachment_id} — Metadata ──────────────────────────


@router.get(
    "/{attachment_id}",
    response_model=AttachmentResponse,
    summary="Get attachment metadata",
)
async def get_attachment(attachment_id: int, current_user: CurrentUser) -> AttachmentResponse:
    """Return metadata for a single attachment."""
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sow_attachments WHERE id = $1", attachment_id)
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found"
            )
        await _require_collaborator(conn, sow_id=row["sow_id"], user_id=current_user.id)

    return AttachmentResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        filename=row["filename"],
        original_name=row["original_name"],
        file_size=row["file_size"],
        mime_type=row["mime_type"],
        document_type=row["document_type"],
        stage_key=row["stage_key"],
        description=row["description"],
        uploaded_by=row["uploaded_by"],
        uploaded_at=row["uploaded_at"],
    )


# ── GET /api/attachments/{attachment_id}/download — File download ────────────


@router.get(
    "/{attachment_id}/download",
    summary="Download an attachment file",
)
async def download_attachment(attachment_id: int, current_user: CurrentUser):
    """Stream the attachment file to the client."""
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sow_attachments WHERE id = $1", attachment_id)
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found"
            )
        await _require_collaborator(conn, sow_id=row["sow_id"], user_id=current_user.id)

    full_path = Path(UPLOAD_DIR) / row["file_path"]
    if not full_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    return FileResponse(
        path=str(full_path),
        filename=row["original_name"],
        media_type=row["mime_type"] or "application/octet-stream",
    )


# ── DELETE /api/attachments/{attachment_id} — Remove ─────────────────────────


@router.delete(
    "/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an attachment",
)
async def delete_attachment(attachment_id: int, current_user: CurrentUser):
    """Delete an attachment (author or uploader only)."""
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sow_attachments WHERE id = $1", attachment_id)
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found"
            )
        await _require_collaborator(conn, sow_id=row["sow_id"], user_id=current_user.id)

        # Only the uploader or an author can delete
        if row["uploaded_by"] != current_user.id:
            collab = await conn.fetchrow(
                "SELECT role FROM collaboration WHERE sow_id = $1 AND user_id = $2",
                row["sow_id"],
                current_user.id,
            )
            if not collab or collab["role"] != "author":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the uploader or the SoW author can delete attachments",
                )

        # Remove from DB
        await conn.execute("DELETE FROM sow_attachments WHERE id = $1", attachment_id)

    # Remove file from disk (best-effort)
    full_path = Path(UPLOAD_DIR) / row["file_path"]
    with contextlib.suppress(OSError):
        full_path.unlink(missing_ok=True)


# ── GET /api/attachments/sow/{sow_id}/requirements — Stage requirements ─────


@router.get(
    "/sow/{sow_id}/requirements",
    response_model=StageRequirementsResponse,
    summary="Get document requirements for the current workflow stage",
)
async def get_stage_requirements(
    sow_id: int, current_user: CurrentUser
) -> StageRequirementsResponse:
    """Return document requirements for the SoW's current stage with
    fulfillment status (whether matching attachments exist)."""
    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        # Get the SoW's current workflow
        wf_row = await conn.fetchrow(
            "SELECT current_stage, workflow_data FROM sow_workflow WHERE sow_id = $1",
            sow_id,
        )
        if not wf_row:
            # No workflow instance — return empty requirements
            sow = await conn.fetchrow("SELECT status FROM sow_documents WHERE id = $1", sow_id)
            return StageRequirementsResponse(
                sow_id=sow_id,
                stage_key=sow["status"] if sow else "draft",
                requirements=[],
                all_required_met=True,
            )

        current_stage = wf_row["current_stage"]
        wf_data = wf_row["workflow_data"]
        if isinstance(wf_data, str):
            wf_data = json.loads(wf_data)

        # Find the current stage's document requirements
        doc_requirements: list[dict] = []
        for stage in wf_data.get("stages", []):
            if stage["stage_key"] == current_stage:
                doc_requirements = stage.get("config", {}).get("document_requirements", [])
                break

        if not doc_requirements:
            return StageRequirementsResponse(
                sow_id=sow_id,
                stage_key=current_stage,
                requirements=[],
                all_required_met=True,
            )

        # Check which document types have been uploaded
        req_types = [r["document_type"] for r in doc_requirements]
        attached_rows = await conn.fetch(
            """
            SELECT DISTINCT document_type FROM sow_attachments
            WHERE sow_id = $1 AND (stage_key = $2 OR stage_key IS NULL)
            AND document_type = ANY($3)
            """,
            sow_id,
            current_stage,
            req_types,
        )
        attached_types = {r["document_type"] for r in attached_rows}

        requirements = []
        all_required_met = True
        for req in doc_requirements:
            fulfilled = req["document_type"] in attached_types
            if req.get("is_required") and not fulfilled:
                all_required_met = False
            requirements.append(
                DocumentRequirement(
                    document_type=req["document_type"],
                    is_required=req.get("is_required", False),
                    description=req.get("description"),
                    fulfilled=fulfilled,
                )
            )

    return StageRequirementsResponse(
        sow_id=sow_id,
        stage_key=current_stage,
        requirements=requirements,
        all_required_met=all_required_met,
    )
