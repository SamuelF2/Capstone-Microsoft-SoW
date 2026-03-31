"""
SoW router  —  /api/sow/...

All SoW document operations against PostgreSQL.

ID strategy
-----------
PostgreSQL uses SERIAL integer primary keys (``id``).  The frontend POSTs to
this API to create a SoW and receives the backend integer ``id`` in the
response.  That integer is then used as the canonical identifier everywhere
(localStorage key ``sow-{id}``, URL ``/draft/{id}``).

A ``client_id`` string column is retained for offline/legacy scenarios where
the frontend generated an ID before the backend was reachable.

Endpoints
---------
  GET    /api/sow                         List SoWs (filterable by status/methodology/cycle)
  POST   /api/sow                         Create SoW (returns integer id)
  GET    /api/sow/by-client/{client_id}   Look up by frontend string ID (legacy)
  GET    /api/sow/{sow_id}                Get full SoW by integer ID
  PATCH  /api/sow/{sow_id}                Partial update (auto-save)
  PUT    /api/sow/{sow_id}/status         Update status only
  DELETE /api/sow/{sow_id}                Delete SoW

Content creation
----------------
When a SoW is created via POST, skeleton records are also inserted into
``scope``, ``pricing``, ``assumptions``, ``resources``, and ``content``
(per PDF §2.2).  The ``content_id`` FK is stored on ``sow_documents``.

Collaboration seeding
---------------------
Whenever a SoW is created (POST /api/sow or POST /api/sow/upload) the
authenticated user is automatically inserted into the ``collaboration``
table with role ``'author'``.  This is what makes the SoW visible under
GET /api/my-sows and grants access to GET /api/my-sows/{id}.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import database
from auth import CurrentUser
from config import MAX_UPLOAD_SIZE_MB, RULES_DIR, UPLOAD_DIR
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from models import (
    AIAnalysisResult,
    HistoryEntryResponse,
    ParseResult,
    SectionResult,
    SoWCreate,
    SoWResponse,
    SoWStatusUpdate,
    SoWSummary,
    SoWUpdate,
)
from services.ai import analyze_sow

router = APIRouter(prefix="/api/sow", tags=["sow"])

_VALID_STATUSES = {
    "draft",
    "ai_review",
    "internal_review",
    "drm_review",
    "approved",
    "finalized",
    "rejected",
}

_VALID_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"ai_review"},
    "ai_review": {"internal_review", "draft"},
    "internal_review": {"drm_review", "rejected", "draft"},
    "drm_review": {"approved", "rejected", "internal_review"},
    "approved": {"finalized"},
    "rejected": {"draft"},
    "finalized": set(),
}

_VALID_METHODOLOGIES = {"Agile Sprint Delivery", "Sure Step 365", "Waterfall", "Cloud Adoption"}
_VALID_EXTENSIONS = {".pdf", ".docx"}
_MAX_UPLOAD_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
_FILE_FIELD = File(...)
_METHODOLOGY_FIELD = Form(...)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _row_to_response(row: dict) -> SoWResponse:
    """Map a raw DB row to a SoWResponse, parsing JSONB fields as needed."""
    data = dict(row)
    for field in ("content", "metadata"):
        val = data.get(field)
        if isinstance(val, str):
            data[field] = json.loads(val)
    return SoWResponse(**data)


def _row_to_summary(row: dict) -> SoWSummary:
    return SoWSummary(**dict(row))


async def _require_collaborator(conn, sow_id: int, user_id: int) -> None:
    """Raise 404 if the user is not a collaborator on this SoW.

    Uses 404 rather than 403 so outsiders cannot confirm whether a SoW with
    a given ID exists at all.  Must be called with an already-acquired
    connection so it can share a transaction with the caller's query.
    """
    row = await conn.fetchrow(
        """
        SELECT 1
        FROM   collaboration
        WHERE  sow_id  = $1
        AND    user_id = $2
        LIMIT  1
        """,
        sow_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")


async def _seed_collaboration(conn, sow_id: int, user_id: int, role: str = "author") -> None:
    """Insert the creating user as a collaborator on the new SoW.

    Called inside the same transaction as the SoW insert so the row is
    always present — a SoW can never exist without at least one collaborator.

    Uses INSERT ... ON CONFLICT DO NOTHING so re-entrant calls are safe
    (e.g. if the endpoint is retried after a partial failure).
    """
    await conn.execute(
        """
        INSERT INTO collaboration (sow_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        """,
        sow_id,
        user_id,
        role,
    )


async def _insert_history(
    conn, sow_id: int, user_id: int, change_type: str, diff: dict | None = None
) -> None:
    """Record an audit-trail entry in the ``history`` table.

    Called inside the same transaction as the mutation so the history row
    is always consistent with the change it describes.
    """
    await conn.execute(
        """
        INSERT INTO history (sow_id, changed_by, change_type, diff)
        VALUES ($1, $2, $3, $4::jsonb)
        """,
        sow_id,
        user_id,
        change_type,
        json.dumps(diff) if diff else None,
    )


def _compute_esap_level(deal_value: float | None, margin: float | None) -> str:
    """Determine ESAP type from deal value and estimated margin.

    Rules from Data/rules/workflow/esap-workflow.json:
      type-1: dealValue > $5M  OR  margin < 10%
      type-2: $1M < dealValue <= $5M  OR  10% <= margin < 15%
      type-3: dealValue <= $1M  AND  margin >= 15%
    """
    dv = deal_value or 0
    mg = margin if margin is not None else 0

    if dv > 5_000_000 or mg < 10:
        return "type-1"
    if dv > 1_000_000 or mg < 15:
        return "type-2"
    return "type-3"


async def _create_assignment_with_prior(
    conn, *, sow_id: int, user_id: int, reviewer_role: str, stage: str
) -> None:
    """Create a review assignment, carrying over checklist_responses and comments
    from the most recent prior assignment for the same sow/role/stage (if any).

    This lets reviewers see and edit their previous responses when a SoW is
    resubmitted after rejection.  Skips creation if the user already has a
    pending/in-progress assignment for this sow + role + stage.
    """
    existing = await conn.fetchval(
        """
        SELECT 1 FROM review_assignments
        WHERE sow_id = $1 AND user_id = $2 AND reviewer_role = $3
          AND stage = $4 AND status IN ('pending', 'in_progress')
        """,
        sow_id,
        user_id,
        reviewer_role,
        stage,
    )
    if existing:
        return  # already has an active assignment for this role

    prior = await conn.fetchrow(
        """
        SELECT checklist_responses, comments FROM review_assignments
        WHERE sow_id = $1 AND user_id = $2 AND reviewer_role = $3 AND stage = $4
          AND status IN ('completed', 'canceled')
        ORDER BY COALESCE(completed_at, assigned_at) DESC
        LIMIT 1
        """,
        sow_id,
        user_id,
        reviewer_role,
        stage,
    )
    await conn.execute(
        """
        INSERT INTO review_assignments
            (sow_id, user_id, reviewer_role, stage, checklist_responses, comments)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        sow_id,
        user_id,
        reviewer_role,
        stage,
        prior["checklist_responses"] if prior else None,
        prior["comments"] if prior else None,
    )


# ── History ──────────────────────────────────────────────────────────────────


@router.get(
    "/history/me",
    response_model=list[HistoryEntryResponse],
    summary="List change history for the current user",
)
async def get_my_history(
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[HistoryEntryResponse]:
    """Return all history entries where the authenticated user is the author
    of the change, ordered most-recent first.  Includes the SoW title via a
    LEFT JOIN so that entries for deleted SoWs still appear (with null title).
    """
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT h.id, h.sow_id, h.changed_by, h.change_type,
                   h.changed_at, h.diff, s.title AS sow_title
            FROM   history h
            LEFT JOIN sow_documents s ON s.id = h.sow_id
            WHERE  h.changed_by = $1
            ORDER BY h.changed_at DESC
            LIMIT $2 OFFSET $3
            """,
            current_user.id,
            limit,
            offset,
        )

    return [HistoryEntryResponse(**dict(r)) for r in rows]


# ── List ──────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=list[SoWSummary],
    summary="List all SoW documents",
)
async def list_sows(
    current_user: CurrentUser,
    status_filter: str | None = Query(default=None, alias="status"),
    methodology: str | None = Query(default=None),
    cycle: int | None = Query(default=None, ge=1, le=4),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[SoWSummary]:
    """Return a paginated list of SoW summaries for the current user.

    Only SoWs where the authenticated user appears in the ``collaboration``
    table are returned.  Optional query parameters:

    - ``status``      — filter by status (e.g. ``draft``, ``approved``)
    - ``methodology`` — filter by methodology name
    - ``cycle``       — filter by deal cycle (1–4)
    - ``limit``       — page size (default 100, max 500)
    - ``offset``      — pagination offset
    """
    conditions: list[str] = ["c.user_id = $1"]
    params: list[Any] = [current_user.id]

    if status_filter:
        params.append(status_filter)
        conditions.append(f"s.status = ${len(params)}")

    if methodology:
        params.append(methodology)
        conditions.append(f"s.methodology = ${len(params)}")

    if cycle is not None:
        params.append(cycle)
        conditions.append(f"s.cycle = ${len(params)}")

    where = "WHERE " + " AND ".join(conditions)
    params.extend([limit, offset])

    query = f"""
        SELECT  s.id, s.title, s.status, s.cycle, s.methodology,
                s.customer_name, s.opportunity_id, s.deal_value,
                s.esap_level, s.estimated_margin,
                s.client_id, s.updated_at
        FROM    sow_documents s
        JOIN    collaboration c ON c.sow_id = s.id
        {where}
        ORDER BY s.updated_at DESC
        LIMIT ${len(params) - 1} OFFSET ${len(params)}
    """

    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return [_row_to_summary(dict(r)) for r in rows]


# ── Create ────────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=SoWResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new SoW document",
)
async def create_sow(payload: SoWCreate, current_user: CurrentUser) -> SoWResponse:
    """Create a new SoW and its normalised content skeleton.

    Flow (PDF §2.2):
    1. Insert skeleton rows into ``scope``, ``pricing``, ``assumptions``,
       ``resources`` (no data yet — populated via PATCH auto-save later).
    2. Insert a ``content`` row linking all four child records.
    3. Insert the ``sow_documents`` row with the ``content_id`` FK.
    4. Insert the creating user into ``collaboration`` with role ``'author'``
       so they can access the SoW via GET /api/my-sows/{id}.

    Returns the full SoW response including the backend integer ``id``.
    Raises **409** if a SoW with the same ``client_id`` already exists.
    """
    if payload.client_id:
        async with database.pg_pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT id FROM sow_documents WHERE client_id = $1", payload.client_id
            )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A SoW with client_id '{payload.client_id}' already exists (id={existing})",
            )

    if payload.methodology is not None and payload.methodology not in _VALID_METHODOLOGIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid methodology '{payload.methodology}'. Must be one of: {sorted(_VALID_METHODOLOGIES)}",
        )

    content_json = json.dumps(payload.content) if payload.content else None
    metadata_json = json.dumps(payload.metadata) if payload.metadata else None

    async with database.pg_pool.acquire() as conn, conn.transaction():
        # 1. Child content skeleton records (PDF §2.2.1–2.2.4)
        scope_id = await conn.fetchval("INSERT INTO scope DEFAULT VALUES RETURNING id")
        price_id = await conn.fetchval("INSERT INTO pricing DEFAULT VALUES RETURNING id")
        assumption_id = await conn.fetchval("INSERT INTO assumptions DEFAULT VALUES RETURNING id")
        resource_id = await conn.fetchval("INSERT INTO resources DEFAULT VALUES RETURNING id")

        # 2. Content record linking all four (PDF §2.2)
        content_id = await conn.fetchval(
            """
            INSERT INTO content (scope_id, price_id, assumption_id, resource_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            scope_id,
            price_id,
            assumption_id,
            resource_id,
        )

        # 3. SoW document with content_id FK (PDF §2.1)
        row = await conn.fetchrow(
            """
            INSERT INTO sow_documents
                (title, cycle, content_id, client_id, methodology,
                 customer_name, opportunity_id, deal_value,
                 estimated_margin, content, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
            RETURNING *
            """,
            payload.title,
            payload.cycle,
            content_id,
            payload.client_id,
            payload.methodology,
            payload.customer_name,
            payload.opportunity_id,
            payload.deal_value,
            payload.estimated_margin,
            content_json,
            metadata_json,
        )

        # 4. Seed collaboration so the creator can access this SoW via /api/my-sows
        await _seed_collaboration(conn, sow_id=row["id"], user_id=current_user.id)

        # 5. Audit trail
        await _insert_history(
            conn, sow_id=row["id"], user_id=current_user.id, change_type="created"
        )

    return _row_to_response(dict(row))


# ── Upload ───────────────────────────────────────────────────────────────────


@router.post(
    "/upload",
    response_model=SoWResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a SoW file and create a new SoW record",
)
async def upload_sow(
    current_user: CurrentUser,
    file: UploadFile = _FILE_FIELD,
    methodology: str = _METHODOLOGY_FIELD,
) -> SoWResponse:
    """Upload a PDF or DOCX file and create a SoW record.

    The file is saved to the uploads directory. A sow_documents row is
    created with the filename (sans extension) as the title, status='draft',
    and the selected methodology. The file path is stored in the metadata
    JSONB field. No text extraction or LLM processing happens here.

    The uploading user is added to ``collaboration`` with role ``'author'``
    so they can access the SoW via GET /api/my-sows/{id}.
    """
    # ── Validate methodology ──────────────────────────────────────────────
    if methodology not in _VALID_METHODOLOGIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid methodology '{methodology}'. Must be one of: {sorted(_VALID_METHODOLOGIES)}",
        )

    # ── Validate file extension ───────────────────────────────────────────
    original_filename = file.filename or "unnamed"
    ext = Path(original_filename).suffix.lower()
    if ext not in _VALID_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{ext}'. Must be one of: {sorted(_VALID_EXTENSIONS)}",
        )

    # ── Read file and check size ──────────────────────────────────────────
    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds {MAX_UPLOAD_SIZE_MB} MB limit",
        )

    # ── Derive title from filename ────────────────────────────────────────
    title = Path(original_filename).stem

    # ── Create DB record (same skeleton pattern as create_sow) ────────────
    async with database.pg_pool.acquire() as conn, conn.transaction():
        scope_id = await conn.fetchval("INSERT INTO scope DEFAULT VALUES RETURNING id")
        price_id = await conn.fetchval("INSERT INTO pricing DEFAULT VALUES RETURNING id")
        assumption_id = await conn.fetchval("INSERT INTO assumptions DEFAULT VALUES RETURNING id")
        resource_id = await conn.fetchval("INSERT INTO resources DEFAULT VALUES RETURNING id")

        content_id = await conn.fetchval(
            """
            INSERT INTO content (scope_id, price_id, assumption_id, resource_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            scope_id,
            price_id,
            assumption_id,
            resource_id,
        )

        row = await conn.fetchrow(
            """
            INSERT INTO sow_documents
                (title, cycle, content_id, methodology, metadata)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            RETURNING *
            """,
            title,
            1,
            content_id,
            methodology,
            "{}",
        )

        sow_id = row["id"]

        # Seed collaboration so the uploader can access via /api/my-sows
        await _seed_collaboration(conn, sow_id=sow_id, user_id=current_user.id)

        # Audit trail
        await _insert_history(conn, sow_id=sow_id, user_id=current_user.id, change_type="created")

    # ── Save file to disk (UUID name prevents directory traversal) ──────
    safe_filename = f"{sow_id}_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    # Final guard: ensure resolved path stays inside UPLOAD_DIR
    resolved = os.path.realpath(file_path)
    if not resolved.startswith(os.path.realpath(UPLOAD_DIR)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path",
        )
    with open(file_path, "wb") as f:
        f.write(contents)

    # ── Update metadata with file path ────────────────────────────────────
    metadata_json = json.dumps({"file_path": safe_filename, "original_filename": original_filename})
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE sow_documents SET metadata = $1::jsonb WHERE id = $2 RETURNING *",
            metadata_json,
            sow_id,
        )

    return _row_to_response(dict(row))


# ── Get by client ID  (declared before /{sow_id} to avoid route conflict) ────


@router.get(
    "/by-client/{client_id}",
    response_model=SoWResponse,
    summary="Look up a SoW by frontend-generated client ID (legacy)",
)
async def get_sow_by_client_id(client_id: str, current_user: CurrentUser) -> SoWResponse:
    """Resolve the frontend string ``client_id`` to the full SoW record.

    Raises **404** if the SoW does not exist or the current user is not a
    collaborator on it.
    """
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT  s.*
            FROM    sow_documents s
            JOIN    collaboration  c ON c.sow_id = s.id
            WHERE   s.client_id = $1
            AND     c.user_id   = $2
            LIMIT   1
            """,
            client_id,
            current_user.id,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No SoW found with client_id '{client_id}'",
        )
    return _row_to_response(dict(row))


# ── Get by integer ID ─────────────────────────────────────────────────────────


@router.get(
    "/{sow_id}",
    response_model=SoWResponse,
    summary="Get a SoW document by its backend integer ID",
)
async def get_sow(sow_id: int, current_user: CurrentUser) -> SoWResponse:
    """Return the full SoW document including ``content`` (section data).

    Raises **404** if the SoW does not exist or the current user is not a
    collaborator on it.
    """

    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
    return _row_to_response(dict(row))


# ── Partial update (auto-save) ────────────────────────────────────────────────


@router.patch(
    "/{sow_id}",
    response_model=SoWResponse,
    summary="Partially update a SoW document",
)
async def update_sow(sow_id: int, payload: SoWUpdate, current_user: CurrentUser) -> SoWResponse:
    """Apply a partial update to a SoW.

    Only non-None fields are updated.  Designed for the frontend's auto-save —
    send only changed section data in ``content``.

    Raises **404** if the SoW does not exist or the current user is not a
    collaborator on it.
    """
    updates: dict[str, Any] = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        async with database.pg_pool.acquire() as conn:
            await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
            row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
        return _row_to_response(dict(row))

    # Finalization guard — reject edits to locked SoWs
    async with database.pg_pool.acquire() as conn:
        cur_status = await conn.fetchval("SELECT status FROM sow_documents WHERE id = $1", sow_id)
    if cur_status == "finalized":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot edit a finalized SoW",
        )

    if "methodology" in updates and updates["methodology"] not in _VALID_METHODOLOGIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid methodology '{updates['methodology']}'. Must be one of: {sorted(_VALID_METHODOLOGIES)}",
        )

    if "content" in updates and updates["content"] is not None:
        updates["content"] = json.dumps(updates["content"])
    if "metadata" in updates and updates["metadata"] is not None:
        updates["metadata"] = json.dumps(updates["metadata"])

    updates["updated_at"] = datetime.now(UTC)

    params: list[Any] = list(updates.values()) + [sow_id]
    set_clause = ", ".join(
        f"{col} = ${i + 1}" + ("::jsonb" if col in ("content", "metadata") else "")
        for i, col in enumerate(updates)
    )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        # Capture old values for the diff
        old_row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not old_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        row = await conn.fetchrow(
            f"UPDATE sow_documents SET {set_clause} WHERE id = ${len(params)} RETURNING *",
            *params,
        )

        # Build diff of changed fields (skip updated_at and JSONB for brevity)
        diff = {}
        for col in updates:
            if col in ("updated_at", "content", "metadata"):
                continue
            old_val = old_row.get(col)
            new_val = row.get(col)
            if old_val != new_val:
                diff[col] = {
                    "old": str(old_val) if old_val is not None else None,
                    "new": str(new_val) if new_val is not None else None,
                }

        if diff:
            await _insert_history(
                conn,
                sow_id=sow_id,
                user_id=current_user.id,
                change_type="updated",
                diff=diff,
            )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
    return _row_to_response(dict(row))


# ── Status update ─────────────────────────────────────────────────────────────


@router.put(
    "/{sow_id}/status",
    response_model=SoWResponse,
    summary="Update SoW status",
)
async def update_sow_status(
    sow_id: int, payload: SoWStatusUpdate, current_user: CurrentUser
) -> SoWResponse:
    """Change the workflow status of a SoW.

    Enforces valid transitions defined in ``_VALID_TRANSITIONS``.

    Raises **400** for unrecognised statuses.
    Raises **409** for invalid transitions.
    Raises **404** if the SoW does not exist or the current user is not a
    collaborator on it.
    """
    if payload.status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Must be one of: {sorted(_VALID_STATUSES)}",
        )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        old_status = await conn.fetchval("SELECT status FROM sow_documents WHERE id = $1", sow_id)
        if old_status is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        allowed = _VALID_TRANSITIONS.get(old_status, set())
        if payload.status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot transition from '{old_status}' to '{payload.status}'. "
                f"Allowed: {sorted(allowed)}",
            )

        row = await conn.fetchrow(
            """
            UPDATE sow_documents
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
            """,
            payload.status,
            sow_id,
        )

        if row and old_status != payload.status:
            await _insert_history(
                conn,
                sow_id=sow_id,
                user_id=current_user.id,
                change_type="status_change",
                diff={"old_status": old_status, "new_status": payload.status},
            )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
    return _row_to_response(dict(row))


# ── Delete ────────────────────────────────────────────────────────────────────


@router.delete(
    "/{sow_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a SoW document",
)
async def delete_sow(sow_id: int, current_user: CurrentUser) -> dict:
    """Permanently delete a SoW and its cascaded records.

    Cascades to: review_results, history, collaboration.

    Raises **404** if the SoW does not exist or the current user is not a
    collaborator on it.
    Raises **409** if the SoW is finalized.
    """
    # Finalization guard
    async with database.pg_pool.acquire() as conn:
        cur_status = await conn.fetchval("SELECT status FROM sow_documents WHERE id = $1", sow_id)
    if cur_status == "finalized":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a finalized SoW",
        )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        # Record deletion before the CASCADE removes related rows.
        # The FK is ON DELETE SET NULL so the history row survives.
        await _insert_history(
            conn,
            sow_id=sow_id,
            user_id=current_user.id,
            change_type="deleted",
        )

        result = await conn.execute("DELETE FROM sow_documents WHERE id = $1", sow_id)

    if result == "DELETE 0":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

    return {"deleted": sow_id}


# ── Parse (document section extraction + rule-based validation) ──────────────

_SECTION_MARKERS: dict[str, list[str]] = {
    "executiveSummary": ["executive summary", "overview", "introduction"],
    "scope": [
        "project scope",
        "scope of work",
        "in scope",
        "out of scope",
        "in-scope",
        "out-of-scope",
    ],
    "deliverables": ["deliverable", "deliverables", "project deliverables", "outputs"],
    "approach": ["delivery approach", "approach", "delivery method", "methodology approach"],
    "customerResponsibilities": [
        "customer responsibilities",
        "client responsibilities",
        "customer obligations",
    ],
    "supportTransitionPlan": [
        "support transition",
        "support plan",
        "hypercare",
        "support and transition",
    ],
    "assumptions": ["assumptions", "project assumptions"],
    "risks": ["risks", "risk register", "risk assessment"],
}

_METHODOLOGY_RULES_KEY: dict[str, str] = {
    "Agile Sprint Delivery": "agile",
    "Sure Step 365": "sure-step-365",
    "Waterfall": "waterfall",
    "Cloud Adoption": "cloud-adoption",
}


def _extract_text_pdf(file_path: str) -> str:
    """Extract text from a PDF file using PyPDF2."""
    from PyPDF2 import PdfReader

    reader = PdfReader(file_path)
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)


def _extract_text_docx(file_path: str) -> str:
    """Extract text from a DOCX file without external dependencies by reading
    the document.xml inside the .docx ZIP and extracting text nodes.
    """
    import zipfile
    from xml.etree import ElementTree as ET

    try:
        with zipfile.ZipFile(file_path) as z:
            xml = z.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError):
        return ""

    try:
        tree = ET.fromstring(xml)
    except ET.ParseError:
        return ""

    # WordprocessingML namespace
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    paragraphs: list[str] = []
    for p in tree.findall(".//w:p", ns):
        texts = [t.text for t in p.findall(".//w:t", ns) if t.text]
        if texts:
            paragraphs.append("".join(texts))

    return "\n".join(paragraphs)


def _detect_sections(full_text: str, required_sections: list[dict]) -> list[SectionResult]:
    """Detect required sections in the extracted document text.

    Uses a two-pass approach:
    1. Find section heading positions by scanning for marker phrases
    2. Extract content between detected headings
    """
    lines = full_text.split("\n")
    text_lower = full_text.lower()

    # Build a list of (line_index, section_key) for detected headings
    heading_positions: list[tuple[int, str]] = []
    for section_key, markers in _SECTION_MARKERS.items():
        for i, line in enumerate(lines):
            line_lower = line.strip().lower()
            # Prefer short lines that look like headings
            if len(line.strip()) < 120:
                for marker in markers:
                    if marker in line_lower:
                        heading_positions.append((i, section_key))
                        break
                if heading_positions and heading_positions[-1] == (i, section_key):
                    break  # found this section, stop checking markers

    # Sort by line position and deduplicate (keep first occurrence per section)
    heading_positions.sort(key=lambda x: x[0])
    seen_sections: set[str] = set()
    unique_positions: list[tuple[int, str]] = []
    for pos, key in heading_positions:
        if key not in seen_sections:
            seen_sections.add(key)
            unique_positions.append((pos, key))

    # Extract content between headings
    section_content: dict[str, str] = {}
    for idx, (line_pos, section_key) in enumerate(unique_positions):
        start = line_pos + 1
        end = unique_positions[idx + 1][0] if idx + 1 < len(unique_positions) else len(lines)
        content = "\n".join(lines[start:end]).strip()
        section_content[section_key] = content[:2000]  # cap at 2000 chars

    # Build results for each required section
    results: list[SectionResult] = []
    for req in required_sections:
        key = req["section"]
        found = key in section_content
        content = section_content.get(key)

        issues: list[str] = []
        if not found:
            # Fallback: check if any marker keyword appears anywhere in text
            markers = _SECTION_MARKERS.get(key, [])
            if any(m in text_lower for m in markers):
                found = True
                issues.append("Section content detected but no clear heading found")
            else:
                issues.append(
                    req.get("errorMessage", f"Required section '{req['displayName']}' not found")
                )

        if found and content:
            min_len = req.get("minLength")
            if min_len and len(content) < min_len:
                issues.append(f"Content is {len(content)} characters, minimum is {min_len}")

        results.append(
            SectionResult(
                name=key,
                displayName=req["displayName"],
                found=found,
                content=content,
                issues=issues,
            )
        )

    return results


def _check_methodology_keywords(full_text: str, methodology: str | None) -> list[str]:
    """Return methodology keywords that are missing from the document text."""
    if not methodology:
        return []
    rules_key = _METHODOLOGY_RULES_KEY.get(methodology)
    if not rules_key:
        return []

    rules_path = os.path.join(RULES_DIR, "methodology", "methodology-alignment.json")
    if not os.path.isfile(rules_path):
        return []

    with open(rules_path) as f:
        rules = json.load(f)

    method_rules = rules.get("methodologies", {}).get(rules_key)
    if not method_rules:
        return []

    text_lower = full_text.lower()
    missing = [
        kw for kw in method_rules.get("requiredKeywords", []) if kw.lower() not in text_lower
    ]
    return missing


def _check_banned_phrases(full_text: str) -> list[dict[str, Any]]:
    """Scan document text for banned phrases and return violations with context."""
    rules_path = os.path.join(RULES_DIR, "compliance", "banned-phrases.json")
    if not os.path.isfile(rules_path):
        return []

    with open(rules_path) as f:
        rules = json.load(f)

    text_lower = full_text.lower()
    violations: list[dict[str, Any]] = []

    for entry in rules.get("bannedPhrases", []):
        phrase = entry["phrase"].lower()
        pos = text_lower.find(phrase)
        if pos != -1:
            # Extract context snippet around the match
            start = max(0, pos - 40)
            end = min(len(full_text), pos + len(phrase) + 40)
            context = full_text[start:end].replace("\n", " ").strip()

            violations.append(
                {
                    "phrase": entry["phrase"],
                    "severity": entry.get("severity", "warning"),
                    "category": entry.get("category", ""),
                    "suggestion": entry.get("suggestion", ""),
                    "reason": entry.get("reason", ""),
                    "context": context,
                }
            )

    return violations


@router.post(
    "/{sow_id}/parse",
    response_model=ParseResult,
    summary="Parse an uploaded SoW document against methodology rules",
)
async def parse_sow(sow_id: int, current_user: CurrentUser) -> ParseResult:
    """Extract text from the uploaded file and validate it against the
    methodology's required sections, keywords, and compliance rules.

    Returns structured results showing which sections were found, which
    methodology keywords are missing, and any banned-phrase violations.
    """
    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        row = await conn.fetchrow(
            "SELECT metadata, methodology FROM sow_documents WHERE id = $1", sow_id
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

    metadata = row["metadata"]
    if isinstance(metadata, str):
        metadata = json.loads(metadata)

    file_name = (metadata or {}).get("file_path")
    if not file_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No uploaded file associated with this SoW",
        )

    file_path = os.path.join(UPLOAD_DIR, file_name)
    resolved = os.path.realpath(file_path)
    if not resolved.startswith(os.path.realpath(UPLOAD_DIR)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")
    if not os.path.isfile(resolved):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Uploaded file not found on disk"
        )

    # Extract text based on file extension
    ext = Path(resolved).suffix.lower()
    if ext == ".pdf":
        full_text = _extract_text_pdf(resolved)
    elif ext == ".docx":
        full_text = _extract_text_docx(resolved)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'",
        )

    if not full_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract any text from the uploaded file",
        )

    # Load required sections definition
    req_path = os.path.join(RULES_DIR, "compliance", "required-elements.json")
    required_sections: list[dict] = []
    if os.path.isfile(req_path):
        with open(req_path) as f:
            required_sections = json.load(f).get("requiredSections", [])

    sections = _detect_sections(full_text, required_sections)
    missing_keywords = _check_methodology_keywords(full_text, row["methodology"])
    violations = _check_banned_phrases(full_text)

    return ParseResult(
        sections=sections,
        missingKeywords=missing_keywords,
        violations=violations,
    )


# ── Submit for Review ────────────────────────────────────────────────────────


@router.post(
    "/{sow_id}/submit-for-review",
    response_model=SoWResponse,
    summary="Submit a draft SoW for AI review",
)
async def submit_for_review(sow_id: int, current_user: CurrentUser) -> SoWResponse:
    """Validate exit criteria, compute ESAP level, and transition to ``ai_review``.

    Both entry paths (template draft and upload) pass through this endpoint.
    After AI review, the user calls ``proceed-to-review`` to advance to
    ``internal_review``.

    Raises **409** if the SoW is not in ``draft`` status.
    Raises **422** if required exit criteria are not met.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        if row["status"] != "draft":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SoW status is '{row['status']}', must be 'draft' to submit for review",
            )

        # Validate exit criteria
        # Upload path: if metadata has file_path, this is an uploaded document — skip content checks
        metadata = row["metadata"]
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        is_upload = bool((metadata or {}).get("file_path"))

        if not is_upload:
            content = row["content"]
            if isinstance(content, str):
                content = json.loads(content)
            content = content or {}

            methodology = row.get("methodology") or ""

            missing: list[str] = []
            if not content.get("executiveSummary"):
                missing.append("Executive Summary")

            # Scope: Cloud Adoption uses cloudAdoptionScope, others use projectScope
            if methodology == "Cloud Adoption":
                if not content.get("cloudAdoptionScope"):
                    missing.append("Cloud Adoption Scope")
            else:
                if not content.get("projectScope") and not content.get("scope"):
                    missing.append("Project Scope")

            # Deliverables: Sure Step 365 uses phasesDeliverables, others use deliverables
            if methodology == "Sure Step 365":
                if not content.get("phasesDeliverables"):
                    missing.append("Phases & Deliverables")
            else:
                if not content.get("deliverables"):
                    missing.append("Deliverables")

            if missing:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Missing required sections: {', '.join(missing)}",
                )

        # Compute ESAP level
        esap = _compute_esap_level(
            deal_value=float(row["deal_value"]) if row["deal_value"] else None,
            margin=float(row["estimated_margin"]) if row["estimated_margin"] else None,
        )

        # Update SoW: set ESAP level, transition to ai_review
        updated = await conn.fetchrow(
            """
            UPDATE sow_documents
            SET esap_level = $1, status = 'ai_review', updated_at = NOW()
            WHERE id = $2
            RETURNING *
            """,
            esap,
            sow_id,
        )

        await _insert_history(
            conn,
            sow_id=sow_id,
            user_id=current_user.id,
            change_type="submitted_for_review",
            diff={"esap_level": esap, "old_status": "draft", "new_status": "ai_review"},
        )

    return _row_to_response(dict(updated))


# ── AI Analysis ──────────────────────────────────────────────────────────────


@router.post(
    "/{sow_id}/ai-analyze",
    response_model=AIAnalysisResult,
    summary="Run AI analysis on a SoW",
)
async def ai_analyze(sow_id: int, current_user: CurrentUser) -> AIAnalysisResult:
    """Trigger AI analysis on a SoW and store results in ``ai_suggestion``.

    Returns the full analysis result. The SoW must be in ``ai_review`` or
    ``draft`` status (to allow optional pre-submission analysis).
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        if row["status"] not in ("draft", "ai_review"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SoW status is '{row['status']}', must be 'draft' or 'ai_review' for AI analysis",
            )

        content = row["content"]
        if isinstance(content, str):
            content = json.loads(content)
        content = content or {}

        # Call AI service stub
        result = await analyze_sow(content, row["methodology"] or "")

        # Store in ai_suggestion table
        ai_id = await conn.fetchval(
            """
            INSERT INTO ai_suggestion (flag, validation_recommendation, risks)
            VALUES ($1, $2::jsonb, $3::jsonb)
            RETURNING id
            """,
            result.approval.level,
            json.dumps(
                result.model_dump(include={"violations", "checklist", "suggestions", "approval"})
            ),
            json.dumps([r.model_dump() for r in result.risks]),
        )

        # Link to SoW
        await conn.execute(
            "UPDATE sow_documents SET ai_suggestion_id = $1, updated_at = NOW() WHERE id = $2",
            ai_id,
            sow_id,
        )

        await _insert_history(
            conn,
            sow_id=sow_id,
            user_id=current_user.id,
            change_type="ai_analysis",
            diff={"ai_suggestion_id": ai_id, "overall_score": result.overall_score},
        )

    return result


# ── Proceed to Internal Review ───────────────────────────────────────────────


@router.post(
    "/{sow_id}/proceed-to-review",
    response_model=SoWResponse,
    summary="Advance from AI review to internal review",
)
async def proceed_to_review(sow_id: int, current_user: CurrentUser) -> SoWResponse:
    """Assign internal-review reviewers and transition to ``internal_review``.

    Requires the SoW to be in ``ai_review`` status. Assigns one user per
    required reviewer role for the ``internal-review`` stage based on the
    ESAP level.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        if row["status"] != "ai_review":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SoW status is '{row['status']}', must be 'ai_review' to proceed",
            )

        esap = row["esap_level"] or "type-3"

        # Load required approvers from ESAP rules
        esap_path = os.path.join(RULES_DIR, "workflow", "esap-workflow.json")
        required_roles: list[str] = []
        if os.path.isfile(esap_path):
            with open(esap_path) as f:
                esap_rules = json.load(f)
            level_rules = esap_rules.get("esapLevels", {}).get(esap, {})
            for approver in level_rules.get("requiredApprovers", []):
                if approver.get("stage") == "internal-review" and approver.get("required"):
                    required_roles.append(approver["role"])

        # Fallback: always require SA
        if not required_roles:
            required_roles = ["solution-architect"]

        # Assign one user per required role, carrying over any prior responses
        for role in required_roles:
            reviewer = await conn.fetchrow(
                "SELECT id FROM users WHERE role = $1 AND is_active = TRUE LIMIT 1",
                role,
            )
            if reviewer:
                await _create_assignment_with_prior(
                    conn,
                    sow_id=sow_id,
                    user_id=reviewer["id"],
                    reviewer_role=role,
                    stage="internal-review",
                )
                # Add to collaboration if not already present
                await _seed_collaboration(
                    conn, sow_id=sow_id, user_id=reviewer["id"], role="reviewer"
                )

        # TESTING: Also assign the author as every required reviewer role so
        # they can walk through the full pipeline solo.  Remove this block
        # once proper role assignment is in place.
        # (_create_assignment_with_prior already skips if a pending assignment
        #  exists, so no extra existence check needed here.)
        for role in required_roles:
            await _create_assignment_with_prior(
                conn,
                sow_id=sow_id,
                user_id=current_user.id,
                reviewer_role=role,
                stage="internal-review",
            )

        # Transition to internal_review
        updated = await conn.fetchrow(
            """
            UPDATE sow_documents
            SET status = 'internal_review', updated_at = NOW()
            WHERE id = $1
            RETURNING *
            """,
            sow_id,
        )

        await _insert_history(
            conn,
            sow_id=sow_id,
            user_id=current_user.id,
            change_type="proceeded_to_review",
            diff={
                "old_status": "ai_review",
                "new_status": "internal_review",
                "assigned_roles": required_roles,
            },
        )

    return _row_to_response(dict(updated))
