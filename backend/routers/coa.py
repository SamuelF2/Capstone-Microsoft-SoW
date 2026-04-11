"""
COA router  —  /api/coa/...

Manages Conditions of Approval (COAs) — specific, objective, measurable criteria
that deliverables must meet before a SoW can be finalized.

Endpoints
---------
  GET    /api/coa/sow/{sow_id}           List all COAs for a SoW
  GET    /api/coa/sow/{sow_id}/summary   Summary counts (open/resolved/waived)
  POST   /api/coa/sow/{sow_id}           Create a COA manually
  GET    /api/coa/{coa_id}               Get a single COA
  PUT    /api/coa/{coa_id}               Update a COA
  POST   /api/coa/{coa_id}/resolve       Resolve a COA
  POST   /api/coa/{coa_id}/waive         Waive a COA
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import database
from auth import CurrentUser
from fastapi import APIRouter, HTTPException, Query, status
from models import (
    COACreate,
    COAResolvePayload,
    COAResponse,
    COASummary,
    COAUpdate,
    COAWaivePayload,
)

router = APIRouter(prefix="/api/coa", tags=["coa"])

_VALID_CATEGORIES = {"technical", "commercial", "legal", "staffing", "general"}
_VALID_PRIORITIES = {"low", "medium", "high", "critical"}
_VALID_STATUSES = {"open", "in_progress", "resolved", "waived"}


async def _check_condition_met_transition(conn, sow_id: int, user_id: int) -> dict | None:
    """After resolving/waiving a COA, check if ALL remaining COAs for the SoW
    are now resolved or waived.  If so, and the current stage has an
    ``on_condition_met`` transition, execute it automatically.

    Parallel gateways
    -----------------
    When the SoW sits on a ``parallel_gateway``, ``sow.status`` points at
    the gateway (which has no ``on_condition_met`` transition). Instead,
    the helper maps the resolved COAs back to the branch stages via their
    ``review_assignment_id`` → ``review_assignments.stage`` linkage and
    attempts the transition from each unique branch. The first branch
    whose ``on_condition_met`` resolves wins.

    Returns the transition result dict if an auto-advance happened, else None.
    """
    from services.workflow_engine import (
        _find_stage,
        _load_workflow_data,
        _stage_key_from_assignment_stage,
        execute_transition,
        resolve_transition,
    )

    # Check for outstanding (non-terminal) COAs
    outstanding = await conn.fetchval(
        """
        SELECT count(*) FROM conditions_of_approval
        WHERE  sow_id = $1 AND status NOT IN ('resolved', 'waived')
        """,
        sow_id,
    )
    if outstanding > 0:
        return None

    # All COAs cleared — look for an on_condition_met transition
    sow = await conn.fetchrow("SELECT status, esap_level FROM sow_documents WHERE id = $1", sow_id)
    if not sow:
        return None

    esap = sow["esap_level"] or "type-3"
    wd = await _load_workflow_data(conn, sow_id)
    current_cfg = _find_stage(wd, sow["status"])
    is_gateway = bool(current_cfg and current_cfg.get("stage_type") == "parallel_gateway")

    if is_gateway:
        # Map the resolved COAs back to their review assignment stages
        # (hyphenated form) and then to workflow branch keys.
        rows = await conn.fetch(
            """
            SELECT DISTINCT ra.stage
            FROM   conditions_of_approval coa
            JOIN   review_assignments    ra ON ra.id = coa.review_assignment_id
            WHERE  coa.sow_id = $1
              AND  coa.review_assignment_id IS NOT NULL
            """,
            sow_id,
        )
        candidate_stages: list[str] = []
        for r in rows:
            branch_key = _stage_key_from_assignment_stage(wd, r["stage"])
            if branch_key and branch_key not in candidate_stages:
                candidate_stages.append(branch_key)

        for branch_key in candidate_stages:
            target = await resolve_transition(conn, sow_id, branch_key, "on_condition_met")
            if target:
                return await execute_transition(
                    conn,
                    sow_id,
                    target["stage_key"],
                    user_id,
                    esap,
                    "All conditions of approval met",
                )
        return None

    target = await resolve_transition(conn, sow_id, sow["status"], "on_condition_met")
    if not target:
        return None

    return await execute_transition(
        conn, sow_id, target["stage_key"], user_id, esap, "All conditions of approval met"
    )


def _row_to_coa(row: dict) -> COAResponse:
    evidence = row.get("evidence")
    if isinstance(evidence, str):
        evidence = json.loads(evidence)
    elif evidence is None:
        evidence = []
    due = row.get("due_date")
    return COAResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        review_assignment_id=row.get("review_assignment_id"),
        condition_text=row["condition_text"],
        category=row["category"],
        priority=row["priority"],
        assigned_to=row.get("assigned_to"),
        due_date=str(due) if due else None,
        status=row["status"],
        resolution_notes=row.get("resolution_notes"),
        resolved_by=row.get("resolved_by"),
        resolved_at=row.get("resolved_at"),
        evidence=evidence,
        created_by=row.get("created_by"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ── GET /api/coa/sow/{sow_id}/summary — must be before /{coa_id} to avoid clash


@router.get(
    "/sow/{sow_id}/summary",
    response_model=COASummary,
    summary="Get COA summary counts for a SoW",
)
async def get_coa_summary(sow_id: int, current_user: CurrentUser) -> COASummary:
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT status FROM conditions_of_approval WHERE sow_id = $1", sow_id
        )
    counts: dict[str, int] = {"open": 0, "in_progress": 0, "resolved": 0, "waived": 0}
    for r in rows:
        s = r["status"]
        if s in counts:
            counts[s] += 1
    total = sum(counts.values())
    return COASummary(
        sow_id=sow_id,
        total=total,
        open=counts["open"],
        in_progress=counts["in_progress"],
        resolved=counts["resolved"],
        waived=counts["waived"],
        blocks_finalization=(counts["open"] + counts["in_progress"]) > 0,
    )


# ── GET /api/coa/sow/{sow_id} ────────────────────────────────────────────────


@router.get(
    "/sow/{sow_id}",
    response_model=list[COAResponse],
    summary="List COAs for a SoW",
)
async def list_coas(
    sow_id: int,
    current_user: CurrentUser,
    coa_status: str | None = Query(default=None, alias="status"),
    category: str | None = None,
    priority: str | None = None,
) -> list[COAResponse]:
    conditions = ["sow_id = $1"]
    params: list[Any] = [sow_id]

    if coa_status:
        params.append(coa_status)
        conditions.append(f"status = ${len(params)}")
    if category:
        params.append(category)
        conditions.append(f"category = ${len(params)}")
    if priority:
        params.append(priority)
        conditions.append(f"priority = ${len(params)}")

    where = " AND ".join(conditions)
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM conditions_of_approval WHERE {where} ORDER BY created_at DESC",
            *params,
        )
    return [_row_to_coa(dict(r)) for r in rows]


# ── POST /api/coa/sow/{sow_id} ───────────────────────────────────────────────


@router.post(
    "/sow/{sow_id}",
    response_model=COAResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a COA manually",
)
async def create_coa(sow_id: int, payload: COACreate, current_user: CurrentUser) -> COAResponse:
    if payload.category not in _VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category. Must be one of: {sorted(_VALID_CATEGORIES)}",
        )
    if payload.priority not in _VALID_PRIORITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority. Must be one of: {sorted(_VALID_PRIORITIES)}",
        )

    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO conditions_of_approval
                (sow_id, condition_text, category, priority, assigned_to, due_date, created_by)
            VALUES ($1, $2, $3, $4, $5, $6::date, $7)
            RETURNING *
            """,
            sow_id,
            payload.condition_text,
            payload.category,
            payload.priority,
            payload.assigned_to,
            payload.due_date,
            current_user.id,
        )
    return _row_to_coa(dict(row))


# ── GET /api/coa/{coa_id} ────────────────────────────────────────────────────


@router.get(
    "/{coa_id}",
    response_model=COAResponse,
    summary="Get a single COA",
)
async def get_coa(coa_id: int, current_user: CurrentUser) -> COAResponse:
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM conditions_of_approval WHERE id = $1", coa_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="COA not found")
    return _row_to_coa(dict(row))


# ── PUT /api/coa/{coa_id} ────────────────────────────────────────────────────


@router.put(
    "/{coa_id}",
    response_model=COAResponse,
    summary="Update a COA",
)
async def update_coa(coa_id: int, payload: COAUpdate, current_user: CurrentUser) -> COAResponse:
    async with database.pg_pool.acquire() as conn, conn.transaction():
        existing = await conn.fetchrow("SELECT * FROM conditions_of_approval WHERE id = $1", coa_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="COA not found")

        if existing["status"] in ("resolved", "waived"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot update a COA that is already '{existing['status']}'",
            )

        updates: list[str] = ["updated_at = NOW()"]
        params: list[Any] = []

        def _add(col: str, val: Any) -> None:
            params.append(val)
            updates.append(f"{col} = ${len(params)}")

        if payload.condition_text is not None:
            _add("condition_text", payload.condition_text)
        if payload.category is not None:
            if payload.category not in _VALID_CATEGORIES:
                raise HTTPException(400, f"Invalid category: {payload.category}")
            _add("category", payload.category)
        if payload.priority is not None:
            if payload.priority not in _VALID_PRIORITIES:
                raise HTTPException(400, f"Invalid priority: {payload.priority}")
            _add("priority", payload.priority)
        if payload.assigned_to is not None:
            _add("assigned_to", payload.assigned_to)
        if payload.due_date is not None:
            _add("due_date", payload.due_date)
        if payload.status is not None:
            if payload.status not in _VALID_STATUSES:
                raise HTTPException(400, f"Invalid status: {payload.status}")
            _add("status", payload.status)
        if payload.resolution_notes is not None:
            _add("resolution_notes", payload.resolution_notes)

        params.append(coa_id)
        row = await conn.fetchrow(
            f"UPDATE conditions_of_approval SET {', '.join(updates)} WHERE id = ${len(params)} RETURNING *",
            *params,
        )
    return _row_to_coa(dict(row))


# ── POST /api/coa/{coa_id}/resolve ───────────────────────────────────────────


@router.post(
    "/{coa_id}/resolve",
    response_model=COAResponse,
    summary="Resolve a COA",
)
async def resolve_coa(
    coa_id: int, payload: COAResolvePayload, current_user: CurrentUser
) -> COAResponse:
    async with database.pg_pool.acquire() as conn, conn.transaction():
        existing = await conn.fetchrow(
            "SELECT status FROM conditions_of_approval WHERE id = $1", coa_id
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="COA not found")
        if existing["status"] == "resolved":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="COA already resolved")
        if existing["status"] == "waived":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Cannot resolve a waived COA"
            )

        row = await conn.fetchrow(
            """
            UPDATE conditions_of_approval
            SET    status           = 'resolved',
                   resolution_notes = $1,
                   resolved_by      = $2,
                   resolved_at      = $3,
                   updated_at       = NOW()
            WHERE  id = $4
            RETURNING *
            """,
            payload.resolution_notes,
            current_user.id,
            datetime.now(UTC),
            coa_id,
        )
        # Check if all COAs are now cleared and trigger on_condition_met
        await _check_condition_met_transition(conn, row["sow_id"], current_user.id)

    return _row_to_coa(dict(row))


# ── POST /api/coa/{coa_id}/waive ─────────────────────────────────────────────


@router.post(
    "/{coa_id}/waive",
    response_model=COAResponse,
    summary="Waive a COA",
)
async def waive_coa(
    coa_id: int, payload: COAWaivePayload, current_user: CurrentUser
) -> COAResponse:
    async with database.pg_pool.acquire() as conn, conn.transaction():
        existing = await conn.fetchrow(
            "SELECT status FROM conditions_of_approval WHERE id = $1", coa_id
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="COA not found")
        if existing["status"] in ("resolved", "waived"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"COA is already '{existing['status']}'",
            )

        row = await conn.fetchrow(
            """
            UPDATE conditions_of_approval
            SET    status           = 'waived',
                   resolution_notes = $1,
                   resolved_by      = $2,
                   resolved_at      = $3,
                   updated_at       = NOW()
            WHERE  id = $4
            RETURNING *
            """,
            payload.resolution_notes,
            current_user.id,
            datetime.now(UTC),
            coa_id,
        )

        # Check if all COAs are now cleared and trigger on_condition_met
        await _check_condition_met_transition(conn, row["sow_id"], current_user.id)

    return _row_to_coa(dict(row))
