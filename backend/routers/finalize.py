"""
Finalize router  —  /api/finalize/...

Handles Phase 4: document generation, handoff package creation, and SoW locking.

Endpoints
---------
  POST /api/finalize/{sow_id}/generate-document  Generate DOCX/PDF from SoW content
  GET  /api/finalize/{sow_id}/download            Serve the generated document file
  POST /api/finalize/{sow_id}/handoff             Create / replace the handoff package
  GET  /api/finalize/{sow_id}/handoff             Retrieve the handoff package
  POST /api/finalize/{sow_id}/lock                Finalize and lock the SoW
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

import database
from auth import CurrentUser
from config import UPLOAD_DIR
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from models import (
    DocumentGenerationResponse,
    HandoffPackagePayload,
    HandoffPackageResponse,
)
from services.docx_renderer import render_sow_to_docx
from utils.db_helpers import (
    insert_history,
    require_collaborator,
    safe_json,
)

router = APIRouter(prefix="/api/finalize", tags=["finalize"])

# ── Internal helpers ──────────────────────────────────────────────────────────


def _generated_dir(sow_id: int) -> Path:
    d = Path(UPLOAD_DIR) / "generated" / str(sow_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── POST /api/finalize/{sow_id}/generate-document ────────────────────────────


@router.post(
    "/{sow_id}/generate-document",
    response_model=DocumentGenerationResponse,
    summary="Generate a DOCX or PDF document from the SoW",
)
async def generate_document(
    sow_id: int,
    current_user: CurrentUser,
    fmt: str = Query(default="docx", alias="format", description="Output format: docx or pdf"),
) -> DocumentGenerationResponse:
    """Generate a document from the approved SoW's structured content.

    Stores the file in ``UPLOAD_DIR/generated/{sow_id}/`` and updates
    the handoff package ``document_path`` if one exists.
    """
    if fmt not in ("docx", "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="format must be 'docx' or 'pdf'"
        )

    # Single transaction with row lock so two concurrent generates can't
    # interleave their reads/writes (one could otherwise overwrite the other's
    # file_path while building stale content).  We build the DOCX inside the
    # transaction and only flush bytes to disk after the UPDATE — if the
    # UPDATE raises, the rollback skips the file write entirely.
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        sow = await conn.fetchrow(
            "SELECT * FROM sow_documents WHERE id = $1 FOR UPDATE",
            sow_id,
        )
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
        if sow["status"] not in ("approved", "finalized"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SoW must be 'approved' or 'finalized' to generate a document; currently '{sow['status']}'",
            )

        review_rows = await conn.fetch(
            """
            SELECT rr.reviewer, rr.decision, rr.conditions, rr.reviewed_at, ra.reviewer_role, rr.review_stage
            FROM   review_results rr
            LEFT JOIN review_assignments ra ON ra.sow_id = rr.sow_id AND ra.user_id = rr.reviewer_user_id
            WHERE  rr.sow_id = $1
            ORDER  BY rr.reviewed_at
            """,
            sow_id,
        )

        content = safe_json(sow["content"]) or {}
        review_results = [dict(r) for r in review_rows]

        # ── Build DOCX (in-memory) ────────────────────────────────────────────
        docx_bytes = render_sow_to_docx(dict(sow), content, review_results)

        safe_title = (
            "".join(c if c.isalnum() or c in "-_ " else "" for c in (sow["title"] or "SoW"))
            .strip()
            .replace(" ", "-")[:60]
        )
        file_name = f"SoW-{safe_title}.docx"
        out_dir = _generated_dir(sow_id)
        file_path = out_dir / file_name

        # ── Update handoff package document_path if it exists ────────────────
        await conn.execute(
            "UPDATE handoff_packages SET document_path = $1 WHERE sow_id = $2",
            str(file_path),
            sow_id,
        )

        # Write the bytes last so a DB failure rolls back without leaving an
        # orphaned file on disk.  If this raises, the txn rolls back and the
        # handoff_packages row keeps its previous document_path.
        file_path.write_bytes(docx_bytes)

    return DocumentGenerationResponse(
        file_path=str(file_path),
        file_name=file_name,
        format="docx",
        size_bytes=len(docx_bytes),
    )


# ── GET /api/finalize/{sow_id}/download ──────────────────────────────────────


@router.get(
    "/{sow_id}/download",
    summary="Download the generated document",
)
async def download_document(sow_id: int, current_user: CurrentUser):
    """Serve the most recently generated document for a SoW."""
    async with database.pg_pool.acquire() as conn:
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
    # Find latest file in generated directory
    out_dir = _generated_dir(sow_id)
    candidates = list(out_dir.glob("*.docx")) + list(out_dir.glob("*.pdf"))
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No generated document found. Generate one first.",
        )
    latest = max(candidates, key=lambda p: p.stat().st_mtime)

    ext = latest.suffix.lower()
    if ext == ".pdf":
        media_type = "application/pdf"
    else:
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    file_bytes = latest.read_bytes()
    headers = {"Content-Disposition": f'attachment; filename="{latest.name}"'}
    return StreamingResponse(BytesIO(file_bytes), media_type=media_type, headers=headers)


# ── POST /api/finalize/{sow_id}/handoff ──────────────────────────────────────


@router.post(
    "/{sow_id}/handoff",
    response_model=HandoffPackageResponse,
    summary="Create or replace the handoff package",
)
async def create_handoff(
    sow_id: int,
    payload: HandoffPackagePayload,
    current_user: CurrentUser,
) -> HandoffPackageResponse:
    """Build and persist the handoff package for the approved SoW.

    Automatically bundles approved scope, deliverables, resource plan,
    risk register, and review decisions alongside the supplied payload.
    """
    # All reads, the DELETE, and the INSERT run inside one transaction.  We
    # take a row lock on the SoW so two concurrent create_handoff calls can't
    # interleave their DELETE/INSERT and lose document_path or end up with
    # duplicate rows.  Previously this used three separate pool connections.
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        sow = await conn.fetchrow(
            "SELECT * FROM sow_documents WHERE id = $1 FOR UPDATE",
            sow_id,
        )
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
        if sow["status"] not in ("approved", "finalized"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="SoW must be 'approved' or 'finalized' to create a handoff package",
            )

        review_rows = await conn.fetch(
            """
            SELECT rr.reviewer, rr.decision, rr.conditions, rr.reviewed_at, ra.reviewer_role
            FROM   review_results rr
            LEFT JOIN review_assignments ra ON ra.sow_id = rr.sow_id AND ra.user_id = rr.reviewer_user_id
            WHERE  rr.sow_id = $1
            ORDER  BY rr.reviewed_at
            """,
            sow_id,
        )

        content = safe_json(sow["content"]) or {}
        scope_data = content.get("scope") or content.get("projectScope") or {}
        if isinstance(scope_data, list):
            scope_data = {}

        # ── Gather conditions from approved-with-conditions decisions ─────────
        conditions_to_address: list[str] = []
        review_decisions: list[dict] = []
        for r in review_rows:
            cond = safe_json(r["conditions"])
            if isinstance(cond, list):
                conditions_to_address.extend([str(c) for c in cond if c])
            elif isinstance(cond, str) and cond:
                conditions_to_address.append(cond)
            date_val = r["reviewed_at"]
            review_decisions.append(
                {
                    "reviewer": r["reviewer"],
                    "role": r["reviewer_role"] or "",
                    "decision": r["decision"],
                    "date": date_val.isoformat()
                    if isinstance(date_val, datetime)
                    else str(date_val or ""),
                }
            )

        # ── Build package_data ────────────────────────────────────────────────
        package_data: dict[str, Any] = {
            "sow_summary": {
                "title": sow["title"],
                "customer_name": sow["customer_name"],
                "methodology": sow["methodology"],
                "deal_value": float(sow["deal_value"]) if sow["deal_value"] else None,
                "esap_level": sow["esap_level"],
                "opportunity_id": sow["opportunity_id"],
            },
            "approved_scope": {
                "in_scope": scope_data.get("in_scope") or []
                if isinstance(scope_data, dict)
                else [],
                "out_scope": scope_data.get("out_scope") or []
                if isinstance(scope_data, dict)
                else [],
            },
            "deliverables": content.get("deliverables") or [],
            "resource_plan": content.get("teamStructure") or content.get("resources") or [],
            "risk_register": content.get("risks") or [],
            "review_decisions": review_decisions,
            "conditions_to_address": conditions_to_address,
            "timeline": content.get("phasesMilestones") or content.get("timeline") or {},
            "customer_responsibilities": (
                scope_data.get("customer_responsibilities") if isinstance(scope_data, dict) else []
            )
            or [],
            # From payload
            "delivery_team": payload.delivery_team,
            "key_contacts": payload.key_contacts,
            "kickoff_date": payload.kickoff_date,
            "special_instructions": payload.special_instructions,
            "notes": payload.notes,
        }

        # ── Attachment manifest (Phase 4) ─────────────────────────────────────
        attachment_rows = await conn.fetch(
            """
            SELECT id, original_name, document_type, stage_key, file_size, uploaded_at
            FROM sow_attachments
            WHERE sow_id = $1
            ORDER BY uploaded_at
            """,
            sow_id,
        )
        package_data["attachments"] = [
            {
                "id": a["id"],
                "original_name": a["original_name"],
                "document_type": a["document_type"],
                "stage_key": a["stage_key"],
                "file_size": a["file_size"],
                "uploaded_at": a["uploaded_at"].isoformat() if a["uploaded_at"] else None,
                "download_url": f"/api/attachments/{a['id']}/download",
            }
            for a in attachment_rows
        ]

        # ── Replace any existing handoff package, preserving document_path ────
        existing_doc_path = await conn.fetchval(
            "SELECT document_path FROM handoff_packages WHERE sow_id = $1 LIMIT 1",
            sow_id,
        )
        await conn.execute("DELETE FROM handoff_packages WHERE sow_id = $1", sow_id)
        row = await conn.fetchrow(
            """
            INSERT INTO handoff_packages (sow_id, created_by, document_path, package_data)
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING *
            """,
            sow_id,
            current_user.id,
            existing_doc_path,
            json.dumps(package_data),
        )

    return HandoffPackageResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        created_by=row["created_by"],
        document_path=row["document_path"],
        package_data=safe_json(row["package_data"]) or {},
        created_at=row["created_at"],
    )


# ── GET /api/finalize/{sow_id}/handoff ───────────────────────────────────────


@router.get(
    "/{sow_id}/handoff",
    response_model=HandoffPackageResponse,
    summary="Retrieve the handoff package for a SoW",
)
async def get_handoff(sow_id: int, current_user: CurrentUser) -> HandoffPackageResponse:
    """Return the most recent handoff package for a SoW."""
    async with database.pg_pool.acquire() as conn:
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        row = await conn.fetchrow(
            "SELECT * FROM handoff_packages WHERE sow_id = $1 ORDER BY created_at DESC LIMIT 1",
            sow_id,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No handoff package found for this SoW"
        )
    return HandoffPackageResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        created_by=row["created_by"],
        document_path=row["document_path"],
        package_data=safe_json(row["package_data"]) or {},
        created_at=row["created_at"],
    )


# ── POST /api/finalize/{sow_id}/lock ─────────────────────────────────────────


@router.post(
    "/{sow_id}/lock",
    summary="Finalize and lock the SoW",
)
async def lock_sow(sow_id: int, current_user: CurrentUser) -> dict:
    """Transition the SoW to ``finalized`` status and permanently lock it.

    Prerequisites:
    - SoW must be ``approved``
    - A handoff package must exist
    - A generated document must exist on disk
    - No outstanding conditions of approval

    All checks and the status flip run inside a single transaction with a
    row-level lock (``SELECT … FOR UPDATE``) on the SoW so two concurrent
    finalize calls can't each pass the ``status == 'approved'`` check and
    both flip the status.  After locking, PATCH and DELETE are rejected by
    the sow router guards.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        sow = await conn.fetchrow(
            "SELECT * FROM sow_documents WHERE id = $1 FOR UPDATE",
            sow_id,
        )
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
        if sow["status"] != "approved":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SoW must be 'approved' to lock; currently '{sow['status']}'",
            )

        # Verify handoff package exists
        handoff = await conn.fetchrow(
            "SELECT id, document_path FROM handoff_packages WHERE sow_id = $1 LIMIT 1",
            sow_id,
        )
        if not handoff:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A handoff package must be created before locking",
            )

        # Verify generated document exists
        doc_path = handoff["document_path"]
        if not doc_path or not Path(doc_path).exists():
            # Also check the generated dir for any file
            gen_dir = _generated_dir(sow_id)
            candidates = list(gen_dir.glob("*.docx")) + list(gen_dir.glob("*.pdf"))
            if not candidates:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A document must be generated before locking",
                )

        # Gate: block finalization if any COAs are outstanding (same txn so
        # the check and the status flip see a consistent snapshot).
        outstanding_count = await conn.fetchval(
            """
            SELECT count(*) FROM conditions_of_approval
            WHERE sow_id = $1 AND status NOT IN ('resolved', 'waived')
            """,
            sow_id,
        )
        if outstanding_count and outstanding_count > 0:
            outstanding_rows = await conn.fetch(
                """
                SELECT id, condition_text, status, category, priority
                FROM conditions_of_approval
                WHERE sow_id = $1 AND status NOT IN ('resolved', 'waived')
                ORDER BY priority DESC
                """,
                sow_id,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": f"{outstanding_count} condition(s) of approval still outstanding",
                    "outstanding_conditions": [dict(r) for r in outstanding_rows],
                },
            )

        now = datetime.now(UTC)
        await conn.execute(
            """
            UPDATE sow_documents
            SET    status       = 'finalized',
                   finalized_at = $1,
                   finalized_by = $2,
                   updated_at   = $1
            WHERE  id = $3
            """,
            now,
            current_user.id,
            sow_id,
        )
        await conn.execute(
            "UPDATE sow_workflow SET current_stage = 'finalized', updated_at = NOW() WHERE sow_id = $1",
            sow_id,
        )
        await insert_history(
            conn,
            sow_id,
            current_user.id,
            "finalized",
            {
                "finalized_by_email": current_user.email,
            },
        )

    return {
        "finalized": True,
        "sow_id": sow_id,
        "status": "finalized",
        "finalized_at": now.isoformat(),
    }
