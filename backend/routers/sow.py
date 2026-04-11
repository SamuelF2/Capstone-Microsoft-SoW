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
    ContentTemplateResponse,
    HistoryEntryResponse,
    ParseResult,
    ReviewerSelectionPayload,
    ReviewerSlot,
    SectionResult,
    SoWCreate,
    SoWResponse,
    SoWStatusUpdate,
    SoWSummary,
    SoWUpdate,
)
from services.ai import analyze_sow
from utils.db_helpers import (
    create_assignment_with_prior,
    insert_history,
    require_author,
    require_collaborator,
    seed_collaboration,
)
from utils.esap import compute_esap_level

from routers.workflow import build_workflow_snapshot, get_default_template_id

router = APIRouter(prefix="/api/sow", tags=["sow"])


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


async def _get_workflow_transitions(conn, sow_id: int) -> dict[str, set[str]] | None:
    """Load transitions from the SoW's workflow instance.

    Returns a dict mapping stage_key -> set of allowed target stage_keys,
    or None if no workflow instance exists (caller should fall back to
    ``_VALID_TRANSITIONS``).
    """
    row = await conn.fetchrow("SELECT workflow_data FROM sow_workflow WHERE sow_id = $1", sow_id)
    if not row or not row["workflow_data"]:
        return None

    data = (
        row["workflow_data"]
        if isinstance(row["workflow_data"], dict)
        else json.loads(row["workflow_data"])
    )
    result: dict[str, set[str]] = {}
    for t in data.get("transitions", []):
        result.setdefault(t["from_stage"], set()).add(t["to_stage"])
    # Ensure every stage key appears even if it has no outgoing transitions
    for s in data.get("stages", []):
        result.setdefault(s["stage_key"], set())
    return result


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

    # ``is_author`` is computed by an EXISTS so it's correct even when a
    # user has multiple collaboration rows on the same SoW (e.g. author +
    # approver). Using DISTINCT below collapses any duplicate rows the
    # collaboration JOIN might produce for the same reason.
    query = f"""
        SELECT  DISTINCT
                s.id, s.title, s.status, s.cycle, s.methodology,
                s.customer_name, s.opportunity_id, s.deal_value,
                s.esap_level, s.estimated_margin,
                s.client_id, s.updated_at,
                (
                    SELECT elem->>'display_name'
                    FROM   jsonb_array_elements(sw.workflow_data->'stages') elem
                    WHERE  elem->>'stage_key' = sw.current_stage
                    LIMIT  1
                ) AS stage_display_name,
                EXISTS (
                    SELECT 1
                    FROM   collaboration c2
                    WHERE  c2.sow_id = s.id
                      AND  c2.user_id = $1
                      AND  c2.role = 'author'
                ) AS is_author
        FROM    sow_documents s
        JOIN    collaboration c ON c.sow_id = s.id
        LEFT JOIN sow_workflow sw ON sw.sow_id = s.id
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
        await seed_collaboration(conn, sow_id=row["id"], user_id=current_user.id)

        # 5. Audit trail
        await insert_history(conn, sow_id=row["id"], user_id=current_user.id, change_type="created")

        # 5b. Apply content template (if requested and not already supplied via payload.content)
        if payload.content_template_id is not None and not payload.content:
            tmpl_row = await conn.fetchrow(
                "SELECT template_data FROM sow_content_templates WHERE id = $1",
                payload.content_template_id,
            )
            if tmpl_row:
                tmpl_data = (
                    tmpl_row["template_data"]
                    if isinstance(tmpl_row["template_data"], dict)
                    else json.loads(tmpl_row["template_data"])
                )
                subs = {
                    "customer_name": payload.customer_name or "",
                    "opportunity_id": payload.opportunity_id or "",
                    "project_name": payload.title or "",
                }
                populated = _substitute_placeholders(tmpl_data, subs)
                row = await conn.fetchrow(
                    "UPDATE sow_documents SET content = $1::jsonb WHERE id = $2 RETURNING *",
                    json.dumps(populated),
                    row["id"],
                )

        # 6. Create workflow instance
        _template_id = payload.workflow_template_id or await get_default_template_id(conn)
        if _template_id is not None:
            snapshot = await build_workflow_snapshot(conn, _template_id)
            await conn.execute(
                """
                INSERT INTO sow_workflow (sow_id, template_id, current_stage, workflow_data)
                VALUES ($1, $2, 'draft', $3::jsonb)
                """,
                row["id"],
                _template_id,
                json.dumps(snapshot),
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
        await seed_collaboration(conn, sow_id=sow_id, user_id=current_user.id)

        # Audit trail
        await insert_history(conn, sow_id=sow_id, user_id=current_user.id, change_type="created")

        # Create workflow instance (mirrors create_sow lines 352-364) so
        # downstream stage transitions (proceed_to_review) can locate the
        # per-SoW snapshot instead of 409-ing on missing workflow data.
        _template_id = await get_default_template_id(conn)
        if _template_id is not None:
            snapshot = await build_workflow_snapshot(conn, _template_id)
            await conn.execute(
                """
                INSERT INTO sow_workflow (sow_id, template_id, current_stage, workflow_data)
                VALUES ($1, $2, 'draft', $3::jsonb)
                """,
                sow_id,
                _template_id,
                json.dumps(snapshot),
            )

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


# ── Content Template helpers ──────────────────────────────────────────────────


def _substitute_placeholders(obj: Any, substitutions: dict[str, str]) -> Any:
    """Recursively walk *obj* (dict / list / str) and replace ``{{key}}``
    tokens with values from *substitutions*.  Non-string leaves are returned
    unchanged.  Unknown tokens are left as-is so the author can fill them in
    manually.
    """
    if isinstance(obj, str):
        for key, value in substitutions.items():
            if value:
                obj = obj.replace(f"{{{{{key}}}}}", value)
        return obj
    if isinstance(obj, dict):
        return {k: _substitute_placeholders(v, substitutions) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_substitute_placeholders(item, substitutions) for item in obj]
    return obj


# ── Content Templates ─────────────────────────────────────────────────────────


@router.get(
    "/templates",
    response_model=list[ContentTemplateResponse],
    summary="List all SoW content templates",
)
async def list_content_templates(
    current_user: CurrentUser,
    methodology: str | None = Query(default=None),
) -> list[ContentTemplateResponse]:
    """Return all available content templates.

    Optional ``methodology`` query param filters by methodology name.
    Templates are returned ordered by name.
    """
    async with database.pg_pool.acquire() as conn:
        if methodology:
            rows = await conn.fetch(
                """
                SELECT id, name, methodology, description, template_data,
                       is_system, created_at
                FROM   sow_content_templates
                WHERE  methodology = $1
                ORDER BY name
                """,
                methodology,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, name, methodology, description, template_data,
                       is_system, created_at
                FROM   sow_content_templates
                ORDER BY methodology, name
                """,
            )

    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("template_data"), str):
            d["template_data"] = json.loads(d["template_data"])
        result.append(ContentTemplateResponse(**d))
    return result


@router.get(
    "/templates/{template_id}",
    response_model=ContentTemplateResponse,
    summary="Get a single SoW content template by ID",
)
async def get_content_template(
    template_id: int,
    current_user: CurrentUser,
) -> ContentTemplateResponse:
    """Return a single content template including its full ``template_data``."""
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, name, methodology, description, template_data,
                   is_system, created_at
            FROM   sow_content_templates
            WHERE  id = $1
            """,
            template_id,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content template {template_id} not found",
        )
    d = dict(row)
    if isinstance(d.get("template_data"), str):
        d["template_data"] = json.loads(d["template_data"])
    return ContentTemplateResponse(**d)


@router.get(
    "/templates/{template_id}/preview",
    summary="Preview a content template with placeholder substitution",
)
async def preview_content_template(
    template_id: int,
    current_user: CurrentUser,
    customer_name: str | None = Query(default=None),
    opportunity_id: str | None = Query(default=None),
    project_name: str | None = Query(default=None),
) -> dict:
    """Return the template's ``template_data`` with ``{{placeholder}}`` tokens
    substituted using the provided query-parameter values.  Useful for the
    frontend to render a live preview before the user commits to a template.
    """
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT template_data FROM sow_content_templates WHERE id = $1",
            template_id,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content template {template_id} not found",
        )
    data = (
        row["template_data"]
        if isinstance(row["template_data"], dict)
        else json.loads(row["template_data"])
    )
    subs = {
        "customer_name": customer_name or "",
        "opportunity_id": opportunity_id or "",
        "project_name": project_name or "",
    }
    return _substitute_placeholders(data, subs)


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
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
    return _row_to_response(dict(row))


# ── Current user's collaboration role on a SoW ───────────────────────────────


@router.get(
    "/{sow_id}/my-role",
    summary="Return the current user's collaboration role on a SoW",
)
async def get_my_collaboration_role(sow_id: int, current_user: CurrentUser) -> dict:
    """Return the current user's collaboration role on this SoW.

    Used by the ``/sow/[id]/manage`` page to gate access client-side.
    A real ``system-admin`` with no explicit collaboration row is treated
    as ``"admin"`` so they can administer any SoW.

    Returns ``{"role": "<role>"}`` or 404 if the user has no access.
    """
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT role FROM collaboration WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            current_user.id,
        )
    if row:
        return {"role": row["role"]}
    if (current_user.role or "").lower() == "system-admin":
        return {"role": "admin"}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")


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
            await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
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
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

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
            await insert_history(
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

    Enforces valid transitions — reads from the SoW's workflow instance
    if one exists, otherwise falls back to ``_VALID_TRANSITIONS``.

    Raises **400** for unrecognised statuses.
    Raises **409** for invalid transitions.
    Raises **404** if the SoW does not exist or the current user is not a
    collaborator on it.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        old_status = await conn.fetchval("SELECT status FROM sow_documents WHERE id = $1", sow_id)
        if old_status is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        # Use workflow instance transitions (all SoWs must have a workflow instance after migration)
        wf_transitions = await _get_workflow_transitions(conn, sow_id)
        if wf_transitions is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="SoW has no workflow instance. Contact an administrator.",
            )
        all_stages: set[str] = set()
        for src, targets in wf_transitions.items():
            all_stages.add(src)
            all_stages.update(targets)
        if payload.status not in all_stages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status '{payload.status}'. Must be one of: {sorted(all_stages)}",
            )
        allowed = wf_transitions.get(old_status, set())

        if payload.status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot transition from '{old_status}' to '{payload.status}'. "
                f"Allowed: {sorted(allowed)}",
            )

        # ── Document requirement gating (Phase 4) ───────────────────────
        wf_row = await conn.fetchrow(
            "SELECT workflow_data FROM sow_workflow WHERE sow_id = $1", sow_id
        )
        if wf_row and wf_row["workflow_data"]:
            wf_data = wf_row["workflow_data"]
            if isinstance(wf_data, str):
                wf_data = json.loads(wf_data)
            for stage in wf_data.get("stages", []):
                if stage["stage_key"] == old_status:
                    doc_reqs = stage.get("config", {}).get("document_requirements", [])
                    required_types = [r["document_type"] for r in doc_reqs if r.get("is_required")]
                    if required_types:
                        attached = await conn.fetch(
                            """
                            SELECT DISTINCT document_type FROM sow_attachments
                            WHERE sow_id = $1
                              AND (stage_key = $2 OR stage_key IS NULL)
                              AND document_type = ANY($3)
                            """,
                            sow_id,
                            old_status,
                            required_types,
                        )
                        attached_types = {r["document_type"] for r in attached}
                        missing = set(required_types) - attached_types
                        if missing:
                            raise HTTPException(
                                status_code=status.HTTP_409_CONFLICT,
                                detail={
                                    "message": "Required documents missing for this stage",
                                    "missing_documents": sorted(missing),
                                },
                            )
                    break

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
            await insert_history(
                conn,
                sow_id=sow_id,
                user_id=current_user.id,
                change_type="status_change",
                diff={"old_status": old_status, "new_status": payload.status},
            )
            # Keep sow_workflow.current_stage in sync
            await conn.execute(
                "UPDATE sow_workflow SET current_stage = $1, updated_at = NOW() WHERE sow_id = $2",
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
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        # Record deletion before the CASCADE removes related rows.
        # The FK is ON DELETE SET NULL so the history row survives.
        await insert_history(
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
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
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


# ── Reviewer Designation ─────────────────────────────────────────────────────
#
# Lets the SoW author pick which user will fill each required reviewer role
# at each review/approval stage.  Persisted in ``sow_reviewer_assignments``
# and consumed by ``create_stage_assignments`` (workflow_engine.py) at
# transition time.  Designations may be edited at any non-terminal status —
# while in ``draft`` the picks are dormant; once past ``draft`` the
# PUT endpoint also rewrites live ``review_assignments`` rows so swaps take
# effect immediately (see ``set_sow_reviewers`` for the cancel-and-recreate
# semantics).

# Display labels for the standard reviewer roles. Custom roles fall back to
# a humanized version of the role_key.
_ROLE_DISPLAY_NAMES: dict[str, str] = {
    "solution-architect": "Solution Architect",
    "sqa-reviewer": "SQA Reviewer",
    "cpl": "Customer Practice Lead",
    "cdp": "Customer Delivery Partner",
    "delivery-manager": "Delivery Manager",
}


def _humanize_role(role_key: str) -> str:
    return _ROLE_DISPLAY_NAMES.get(role_key) or role_key.replace("-", " ").title()


@router.get(
    "/{sow_id}/reviewers",
    response_model=list[ReviewerSlot],
    summary="List required reviewer slots and current designations for a SoW",
)
async def get_sow_reviewers(sow_id: int, current_user: CurrentUser) -> list[ReviewerSlot]:
    """Return one slot per (stage, required role) for every review/approval
    stage in the SoW's workflow snapshot, joined with the currently designated
    user (if any).

    Stages with ``stage_type`` ``review`` or ``approval`` are included.
    Stages without ``requires_designated_reviewer = True`` in their config are
    still listed so the author can optionally designate, but submit-for-review
    only blocks on the flagged stages.

    Available at any status (any collaborator may read), and is the data
    source for both the draft-page reviewer panel and the post-draft
    ``/sow/{id}/manage`` live-edit dashboard.
    """
    from services.workflow_engine import _load_workflow_data

    async with database.pg_pool.acquire() as conn:
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        wd = await _load_workflow_data(conn, sow_id)

        existing_rows = await conn.fetch(
            """
            SELECT sra.stage_key, sra.role_key, sra.user_id,
                   u.email, u.full_name
            FROM   sow_reviewer_assignments sra
            JOIN   users u ON u.id = sra.user_id
            WHERE  sra.sow_id = $1
            """,
            sow_id,
        )

    designated: dict[tuple[str, str], dict] = {
        (r["stage_key"], r["role_key"]): {
            "user_id": r["user_id"],
            "email": r["email"],
            "full_name": r["full_name"],
        }
        for r in existing_rows
    }

    slots: list[ReviewerSlot] = []
    for stage in wd.get("stages", []):
        if stage.get("stage_type") not in ("review", "approval"):
            continue
        for role in stage.get("roles", []):
            if not role.get("is_required", True):
                continue
            key = (stage["stage_key"], role["role_key"])
            cur = designated.get(key)
            slots.append(
                ReviewerSlot(
                    stage_key=stage["stage_key"],
                    stage_display_name=stage.get("display_name", stage["stage_key"]),
                    role_key=role["role_key"],
                    role_display_name=_humanize_role(role["role_key"]),
                    user_id=cur["user_id"] if cur else None,
                    user_email=cur["email"] if cur else None,
                    user_full_name=cur["full_name"] if cur else None,
                )
            )
    return slots


@router.put(
    "/{sow_id}/reviewers",
    response_model=list[ReviewerSlot],
    summary="Set the designated reviewer for one or more (stage, role) slots",
)
async def set_sow_reviewers(
    sow_id: int,
    payload: ReviewerSelectionPayload,
    current_user: CurrentUser,
) -> list[ReviewerSlot]:
    """Upsert designated reviewers for a SoW.

    Each selection is a ``(stage_key, role_key, user_id)`` tuple; a null
    ``user_id`` clears the slot. Accepted at any non-terminal status so the
    author can swap reviewers mid-review (the old "draft-only" gate was
    removed in Phase 2):

    - In ``draft``: only ``sow_reviewer_assignments`` is updated. Actual
      ``review_assignments`` rows are created later by
      ``create_stage_assignments`` when the SoW first transitions into a
      review stage.
    - Past ``draft``: any swapped or removed reviewer's pending /
      in_progress ``review_assignments`` rows are canceled, and any newly
      assigned reviewer gets a fresh row with ``carry_prior=False`` so
      they start with a clean checklist. Gating rules are then re-evaluated
      and the SoW auto-advances if newly satisfied (typically a no-op for
      pure swaps, since fresh rows contribute nothing to gating).

    Authorization: only the SoW author (or a system-admin) may call this —
    enforced by ``require_author``.
    """
    from services.workflow_engine import (
        _load_workflow_data,
        recheck_and_maybe_advance,
    )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_author(conn, sow_id=sow_id, user_id=current_user.id)

        sow = await conn.fetchrow("SELECT status FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        wd = await _load_workflow_data(conn, sow_id)

        def _runtime_stage_keys(stage_key: str) -> list[str]:
            """Resolve a workflow ``stage_key`` to its runtime
            ``review_assignments.stage`` keys.

            Mirrors :func:`check_gating_rules`: read from
            ``config.assignment_stage_keys``, fall back to swapping ``_``
            for ``-``.
            """
            for stg in wd.get("stages", []):
                if stg.get("stage_key") == stage_key:
                    keys = (stg.get("config") or {}).get("assignment_stage_keys") or []
                    return list(keys) if keys else [stage_key.replace("_", "-")]
            return [stage_key.replace("_", "-")]

        # Snapshot the current designations so we can classify each
        # selection (added | removed | swapped | unchanged).
        before_rows = await conn.fetch(
            "SELECT stage_key, role_key, user_id FROM sow_reviewer_assignments WHERE sow_id = $1",
            sow_id,
        )
        before: dict[tuple[str, str], int] = {
            (r["stage_key"], r["role_key"]): r["user_id"] for r in before_rows
        }

        # Apply the upsert/delete loop to ``sow_reviewer_assignments``.
        for sel in payload.selections:
            if sel.user_id is None:
                await conn.execute(
                    """
                    DELETE FROM sow_reviewer_assignments
                    WHERE  sow_id = $1 AND stage_key = $2 AND role_key = $3
                    """,
                    sow_id,
                    sel.stage_key,
                    sel.role_key,
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO sow_reviewer_assignments
                        (sow_id, stage_key, role_key, user_id, assigned_by)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (sow_id, stage_key, role_key) DO UPDATE SET
                        user_id     = EXCLUDED.user_id,
                        assigned_by = EXCLUDED.assigned_by,
                        assigned_at = NOW()
                    """,
                    sow_id,
                    sel.stage_key,
                    sel.role_key,
                    sel.user_id,
                    current_user.id,
                )

        # Classify each selection in the payload.
        changes: list[dict] = []
        for sel in payload.selections:
            key = (sel.stage_key, sel.role_key)
            old_user_id = before.get(key)
            new_user_id = sel.user_id
            if old_user_id == new_user_id:
                continue
            if new_user_id is None:
                change_type = "removed"
            elif old_user_id is None:
                change_type = "added"
            else:
                change_type = "swapped"
            changes.append(
                {
                    "stage_key": sel.stage_key,
                    "role_key": sel.role_key,
                    "old_user_id": old_user_id,
                    "new_user_id": new_user_id,
                    "type": change_type,
                }
            )

        # Past-draft side effects: keep ``review_assignments`` in sync so
        # the new reviewer can act and the prior reviewer can't keep an
        # in-flight review for a slot they no longer own.
        if sow["status"] != "draft":
            for change in changes:
                runtime_keys = _runtime_stage_keys(change["stage_key"])
                if not runtime_keys:
                    continue

                # Cancel the prior reviewer's active rows for this slot.
                # Targeting only pending/in_progress means a just-completed
                # row is left alone — approvals are immutable.
                if change["type"] in ("removed", "swapped") and change["old_user_id"] is not None:
                    placeholders = ", ".join(f"${i + 4}" for i in range(len(runtime_keys)))
                    await conn.execute(
                        f"""
                        UPDATE review_assignments
                        SET    status = 'canceled'
                        WHERE  sow_id  = $1
                          AND  user_id = $2
                          AND  reviewer_role = $3
                          AND  stage IN ({placeholders})
                          AND  status IN ('pending', 'in_progress')
                        """,
                        sow_id,
                        change["old_user_id"],
                        change["role_key"],
                        *runtime_keys,
                    )

                # Create a fresh assignment for the new reviewer with
                # NULL checklist responses (no inheritance from any prior
                # cycle). ``create_assignment_with_prior`` dedups against
                # any active row that already exists for this user/role.
                if change["type"] in ("added", "swapped") and change["new_user_id"] is not None:
                    await create_assignment_with_prior(
                        conn,
                        sow_id=sow_id,
                        user_id=change["new_user_id"],
                        reviewer_role=change["role_key"],
                        stage=runtime_keys[0],
                        carry_prior=False,
                    )
                    await seed_collaboration(conn, sow_id, change["new_user_id"], "approver")

        # Audit trail: one history entry per actual change.
        for change in changes:
            await insert_history(
                conn,
                sow_id=sow_id,
                user_id=current_user.id,
                change_type="reviewer_swap",
                diff={
                    "stage_key": change["stage_key"],
                    "role_key": change["role_key"],
                    "old_user_id": change["old_user_id"],
                    "new_user_id": change["new_user_id"],
                    "swap_type": change["type"],
                },
            )

        # Re-check gating rules. A pure swap can lower gating but not
        # raise it (the cancel only targets non-completed rows, so prior
        # approvals still count), so this rarely triggers an advance —
        # but stays consistent with the helper used by
        # submit_assignment_review and the workflow editor, and is the
        # right hook for any edge case where a side effect freed the gate.
        if changes:
            await recheck_and_maybe_advance(conn, sow_id, current_user.id)

    # Return the updated slot list so the frontend can refresh its state.
    return await get_sow_reviewers(sow_id, current_user)


# ── Submit for Review ────────────────────────────────────────────────────────


@router.post(
    "/{sow_id}/submit-for-review",
    response_model=SoWResponse,
    summary="Submit a draft SoW for the next workflow stage",
)
async def submit_for_review(sow_id: int, current_user: CurrentUser) -> SoWResponse:
    """Validate exit criteria, compute ESAP level, and advance the SoW.

    The destination is *not* hardcoded to ``ai_review`` — we ask the per-SoW
    workflow snapshot for the first transition out of ``draft`` (preferring
    ``default``, then ``on_approve``, then any). For the default ESAP
    workflow that resolves to ``ai_review``; workflows that omit the AI
    review stage entirely will route directly to whatever stage actually
    follows draft (e.g. an internal review or approval). The frontend
    inspects the returned ``status`` to decide whether to send the user to
    the AI review screen or to a generic post-submit page.

    Raises **409** if the SoW is not in ``draft`` status, or if the
    workflow has no outgoing transition from ``draft``.
    Raises **422** if required exit criteria are not met.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

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

        # Validate every stage flagged 'requires_designated_reviewer' has a
        # designated reviewer for each of its required roles.  Stages without
        # this flag (e.g. ai_review, draft, terminal) are skipped.
        from services.workflow_engine import _load_workflow_data

        wd = await _load_workflow_data(conn, sow_id)
        designated_rows = await conn.fetch(
            "SELECT stage_key, role_key FROM sow_reviewer_assignments WHERE sow_id = $1",
            sow_id,
        )
        designated_set = {(r["stage_key"], r["role_key"]) for r in designated_rows}

        unfilled: list[str] = []
        for stage in wd.get("stages", []):
            cfg = stage.get("config") or {}
            if not cfg.get("requires_designated_reviewer"):
                continue
            for role in stage.get("roles", []):
                if not role.get("is_required", True):
                    continue
                if (stage["stage_key"], role["role_key"]) not in designated_set:
                    unfilled.append(
                        f"{stage.get('display_name', stage['stage_key'])} → {_humanize_role(role['role_key'])}"
                    )

        if unfilled:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Missing designated reviewers: {', '.join(unfilled)}",
            )

        # Compute ESAP level and stamp it on the row before transitioning,
        # since execute_transition / create_stage_assignments consult the
        # row's esap_level (and the value passed in) to filter required
        # roles in the next stage.
        esap = compute_esap_level(
            deal_value=float(row["deal_value"]) if row["deal_value"] else None,
            margin=float(row["estimated_margin"]) if row["estimated_margin"] else None,
        )
        await conn.execute(
            "UPDATE sow_documents SET esap_level = $1, updated_at = NOW() WHERE id = $2",
            esap,
            sow_id,
        )

        # Resolve the next stage from the per-SoW workflow snapshot.  Prefer
        # a "default" edge (the canonical forward path out of draft) and
        # fall back to "on_approve" for workflows that gate the draft on
        # explicit approval.  Custom workflows can replace, rename, or
        # entirely skip the legacy ai_review stage and submit-for-review
        # will still advance correctly.
        from services.workflow_engine import execute_transition, resolve_transition

        target = await resolve_transition(conn, sow_id, "draft", "default")
        if not target:
            target = await resolve_transition(conn, sow_id, "draft", "on_approve")
        if not target:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Workflow has no outgoing transition from 'draft'. "
                    "Edit the workflow on /sow/{id}/manage to add a "
                    "default or on_approve edge before submitting."
                ),
            )

        await execute_transition(
            conn,
            sow_id,
            target["stage_key"],
            current_user.id,
            esap,
            reason="Submitted for review",
        )

        # Preserve the legacy ``submitted_for_review`` audit entry alongside
        # execute_transition's own ``stage_transition`` row, since downstream
        # filters / dashboards key off this change_type.
        await insert_history(
            conn,
            sow_id=sow_id,
            user_id=current_user.id,
            change_type="submitted_for_review",
            diff={
                "esap_level": esap,
                "old_status": "draft",
                "new_status": target["stage_key"],
            },
        )

        updated = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)

    return _row_to_response(dict(updated))


# ── Full-text search ──────────────────────────────────────────────────────────


@router.get("/search")
async def search_sows(
    q: str = Query(..., min_length=1),
    methodology: str | None = None,
    status: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = None,
):
    """
    Full-text search across SoW titles, customer names, opportunity IDs,
    and deep content (executive summary, scope, assumptions).

    Returns results ranked by relevance with highlighted snippets.
    """
    pool = database.pg_pool

    # Build a safe tsquery: split on whitespace and join with AND operators
    terms = [t for t in q.strip().split() if t]
    if not terms:
        return []
    ts_query_str = " & ".join(terms)

    filters = ["sd.search_vector @@ to_tsquery('english', $1)"]
    params: list[Any] = [ts_query_str]
    idx = 2

    if methodology:
        filters.append(f"sd.methodology = ${idx}")
        params.append(methodology)
        idx += 1
    if status:
        filters.append(f"sd.status = ${idx}")
        params.append(status)
        idx += 1

    where = " AND ".join(filters)
    rows = await pool.fetch(
        f"""
        SELECT sd.id, sd.title, sd.customer_name, sd.methodology, sd.status,
               sd.updated_at,
               ts_rank(sd.search_vector, to_tsquery('english', $1)) AS rank,
               ts_headline(
                   'english',
                   coalesce(sd.title, '') || ' ' || coalesce(sd.customer_name, ''),
                   to_tsquery('english', $1),
                   'MaxWords=30, MinWords=10'
               ) AS snippet
        FROM sow_documents sd
        WHERE {where}
        ORDER BY rank DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
        limit,
        offset,
    )
    return [dict(r) for r in rows]


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
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

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

        await insert_history(
            conn,
            sow_id=sow_id,
            user_id=current_user.id,
            change_type="ai_analysis",
            diff={"ai_suggestion_id": ai_id, "overall_score": result.overall_score},
        )

    return result


# ── Proceed past AI Review ───────────────────────────────────────────────────


@router.post(
    "/{sow_id}/proceed-to-review",
    response_model=SoWResponse,
    summary="Advance from AI review to whatever stage the workflow points at next",
)
async def proceed_to_review(sow_id: int, current_user: CurrentUser) -> SoWResponse:
    """Resolve the workflow's next stage after ``ai_review`` and transition.

    Requires the SoW to be in ``ai_review`` status. The destination is *not*
    hardcoded — we ask the per-SoW workflow snapshot for the first transition
    out of ``ai_review`` (preferring ``on_approve`` over ``default``) and use
    that stage_key. This lets custom workflows rename, replace, or completely
    skip the legacy ``internal_review`` stage and still have the AI-review
    "Proceed" button advance correctly.

    The actual transition is delegated to
    :func:`services.workflow_engine.execute_transition`, which handles
    canceling stale assignments, updating ``sow_documents`` and
    ``sow_workflow``, creating per-role assignments via
    ``create_stage_assignments`` (with pre-designation honoring, role-match
    fallback, author auto-assignment, and system-admin auto-assignment), and
    writing the audit-trail history entry.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        if row["status"] != "ai_review":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SoW status is '{row['status']}', must be 'ai_review' to proceed",
            )

        esap = row["esap_level"] or "type-3"

        from services.workflow_engine import execute_transition, resolve_transition

        # Resolve the next stage from the workflow snapshot. Prefer
        # on_approve (the canonical "happy-path" exit from a review-style
        # stage) and fall back to default (used by linear pipelines that
        # don't gate AI review on approval).
        target = await resolve_transition(conn, sow_id, "ai_review", "on_approve")
        if not target:
            target = await resolve_transition(conn, sow_id, "ai_review", "default")
        if not target:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Workflow has no outgoing transition from 'ai_review'. "
                    "Edit the workflow on /sow/{id}/manage to add an "
                    "on_approve or default edge before proceeding."
                ),
            )

        await execute_transition(
            conn,
            sow_id,
            target["stage_key"],
            current_user.id,
            esap,
            reason="Proceeded from AI review",
        )

        updated = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)

    return _row_to_response(dict(updated))
