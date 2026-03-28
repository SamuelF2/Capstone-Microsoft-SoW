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
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import database
from auth import CurrentUser
from config import MAX_UPLOAD_SIZE_MB, UPLOAD_DIR
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from models import SoWCreate, SoWResponse, SoWStatusUpdate, SoWSummary, SoWUpdate

router = APIRouter(prefix="/api/sow", tags=["sow"])

_VALID_STATUSES = {"draft", "in_review", "approved", "rejected"}
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
                 customer_name, opportunity_id, deal_value, content, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
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
            content_json,
            metadata_json,
        )

        # 4. Seed collaboration so the creator can access this SoW via /api/my-sows
        await _seed_collaboration(conn, sow_id=row["id"], user_id=current_user.id)

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

    # ── Save file to disk ─────────────────────────────────────────────────
    safe_filename = f"{sow_id}_{original_filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
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

    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        row = await conn.fetchrow(
            f"UPDATE sow_documents SET {set_clause} WHERE id = ${len(params)} RETURNING *",
            *params,
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

    Valid values: ``draft`` | ``in_review`` | ``approved`` | ``rejected``

    Raises **400** for unrecognised statuses.
    Raises **404** if the SoW does not exist or the current user is not a
    collaborator on it.
    """
    if payload.status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Must be one of: {sorted(_VALID_STATUSES)}",
        )

    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
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
    """
    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        result = await conn.execute("DELETE FROM sow_documents WHERE id = $1", sow_id)

    if result == "DELETE 0":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

    return {"deleted": sow_id}
