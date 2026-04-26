"""
Workflow router  —  /api/workflow/...

Manages workflow templates and per-SoW workflow instances.

Endpoints
---------
  GET    /api/workflow/templates                  List all workflow templates
  POST   /api/workflow/templates                  Create a workflow template
  GET    /api/workflow/templates/{template_id}     Get full template detail
  PUT    /api/workflow/templates/{template_id}     Update a non-system template
  DELETE /api/workflow/templates/{template_id}     Delete a non-system template
  GET    /api/workflow/sow/{sow_id}               Get SoW workflow instance
  POST   /api/workflow/sow/{sow_id}               Create workflow instance for existing SoW
  PUT    /api/workflow/sow/{sow_id}               Update SoW workflow (mid-lifecycle)
"""

from __future__ import annotations

import json
from typing import Any

import database
from auth import CurrentUser
from fastapi import APIRouter, HTTPException, status
from models import (
    SoWWorkflowResponse,
    WorkflowData,
    WorkflowTemplateCreate,
    WorkflowTemplateResponse,
    WorkflowTemplateSummary,
)
from services.workflow_engine import (
    _find_stage,
    _load_sow_microsoft_metadata,
    _load_workflow_data,
    _validate_workflow_snapshot_change,
    compute_workflow_diff,
    create_stage_assignments,
    recheck_and_maybe_advance,
    required_role_keys,
)
from utils.db_helpers import (
    insert_history,
    require_author,
    require_collaborator,
)

router = APIRouter(prefix="/api/workflow", tags=["workflow"])


# ── Shared helpers (importable by sow.py and review.py) ─────────────────────


async def build_workflow_snapshot(conn, template_id: int) -> dict:
    """Build a self-contained JSONB snapshot of a workflow template.

    This snapshot is stored per-SoW so that template changes do not affect
    in-flight SoWs.
    """
    stages_rows = await conn.fetch(
        """
        SELECT id, stage_key, display_name, stage_order, stage_type, config
        FROM   workflow_template_stages
        WHERE  template_id = $1
        ORDER  BY stage_order
        """,
        template_id,
    )

    stages: list[dict] = []
    for s in stages_rows:
        # Fetch roles for this stage
        role_rows = await conn.fetch(
            """
            SELECT role_key, is_required, esap_levels, required_if
            FROM   workflow_template_stage_roles
            WHERE  stage_id = $1
            """,
            s["id"],
        )
        roles = []
        for r in role_rows:
            req_if = r["required_if"]
            if isinstance(req_if, str):
                req_if = json.loads(req_if)
            roles.append(
                {
                    "role_key": r["role_key"],
                    "is_required": r["is_required"],
                    "esap_levels": list(r["esap_levels"]) if r["esap_levels"] else None,
                    "required_if": req_if if isinstance(req_if, dict) else None,
                }
            )

        raw_cfg = s["config"]
        if isinstance(raw_cfg, dict):
            stage_config = raw_cfg
        elif isinstance(raw_cfg, str):
            stage_config = json.loads(raw_cfg)
        else:
            stage_config = {}

        # Fetch document requirements for this stage (Phase 4)
        doc_req_rows = await conn.fetch(
            """
            SELECT document_type, is_required, description
            FROM   workflow_stage_document_requirements
            WHERE  template_id = $1 AND stage_key = $2
            """,
            template_id,
            s["stage_key"],
        )
        if doc_req_rows:
            stage_config["document_requirements"] = [
                {
                    "document_type": dr["document_type"],
                    "is_required": dr["is_required"],
                    "description": dr["description"],
                }
                for dr in doc_req_rows
            ]

        stages.append(
            {
                "stage_key": s["stage_key"],
                "display_name": s["display_name"],
                "stage_order": s["stage_order"],
                "stage_type": s["stage_type"],
                "roles": roles,
                "config": stage_config,
            }
        )

    transition_rows = await conn.fetch(
        """
        SELECT from_stage_key, to_stage_key, condition, skip_condition
        FROM   workflow_template_transitions
        WHERE  template_id = $1
        """,
        template_id,
    )
    transitions = []
    for t in transition_rows:
        skip = t["skip_condition"]
        if isinstance(skip, str):
            skip = json.loads(skip)
        transitions.append(
            {
                "from_stage": t["from_stage_key"],
                "to_stage": t["to_stage_key"],
                "condition": t["condition"] or "default",
                "skip_condition": skip if isinstance(skip, dict) else None,
            }
        )

    return {"stages": stages, "transitions": transitions}


async def get_default_template_id(conn) -> int | None:
    """Return the ID of the system default workflow template, or None.

    Name-pinned to the ESAP workflow so that adding additional ``is_system``
    templates (e.g. the Microsoft Default Workflow) does not make this lookup
    non-deterministic. Implicit-default callers (SoW creation without a
    template_id, legacy backfill) keep getting ESAP; opt-in templates are
    selected via the picker.
    """
    return await conn.fetchval(
        """
        SELECT id FROM workflow_templates
        WHERE  is_system = TRUE AND name = 'Default ESAP Workflow'
        LIMIT  1
        """
    )


def _validate_workflow_data(wd: WorkflowData) -> None:
    """Validate a workflow's stages and transitions before persisting."""
    stage_keys = {s.stage_key for s in wd.stages}
    stage_map = {s.stage_key: s for s in wd.stages}

    # All transition endpoints must reference existing stages
    for t in wd.transitions:
        if t.from_stage not in stage_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Transition references unknown stage '{t.from_stage}'",
            )
        if t.to_stage not in stage_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Transition references unknown stage '{t.to_stage}'",
            )

    # AI analysis stages may only be entered via a forward edge (default
    # or on_approve) from a draft stage.  Placing an AI review later in the
    # pipeline (e.g. after a human review, or as a non-draft forward edge)
    # breaks the assumption that the SoW content has just been authored and
    # never been reviewed by a human, and produces confusing UX where
    # reviewers re-enter an "AI is analyzing" screen.
    #
    # Send-back edges into ai_analysis (e.g. an old "internal_review →
    # ai_review on_send_back") are intentionally tolerated: they don't
    # change the meaning of "what stage comes immediately after draft",
    # and existing deployments may still carry such edges from earlier
    # seed versions.  The new default seed no longer creates them, but the
    # validator must not retroactively reject snapshots that already do.
    forward_conditions = {"default", "on_approve"}
    for t in wd.transitions:
        if t.condition not in forward_conditions:
            continue
        target = stage_map.get(t.to_stage)
        if not target or target.stage_type != "ai_analysis":
            continue
        source = stage_map.get(t.from_stage)
        source_type = source.stage_type if source else None
        if source_type != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"AI Analysis stage '{t.to_stage}' may only be reached "
                    f"by a forward transition from a Draft stage; found a "
                    f"'{t.condition}' edge from '{t.from_stage}' (type "
                    f"'{source_type or 'unknown'}'). Move the AI review "
                    "immediately after a draft stage, or remove this edge."
                ),
            )

    # Review/approval stages should have at least one on_approve or default
    review_stages = {s.stage_key for s in wd.stages if s.stage_type in ("review", "approval")}
    for stage_key in review_stages:
        conditions = {t.condition for t in wd.transitions if t.from_stage == stage_key}
        if "on_approve" not in conditions and "default" not in conditions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stage '{stage_key}' needs an on_approve or default outgoing transition",
            )

    # ── Parallel gateway validation ──────────────────────────────────────
    gateways = [s for s in wd.stages if s.stage_type == "parallel_gateway"]
    for gw in gateways:
        # Must have at least 2 outgoing transitions
        outgoing = [t for t in wd.transitions if t.from_stage == gw.stage_key]
        if len(outgoing) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Parallel gateway '{gw.stage_key}' must have at least 2 outgoing transitions",
            )
        # No nested gateways (gateway's outgoing targets must not be gateways)
        for t in outgoing:
            target = stage_map.get(t.to_stage)
            if target and target.stage_type == "parallel_gateway":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Parallel gateway '{gw.stage_key}' cannot lead to another gateway (no nesting)",
                )

    # Validate join_config references
    for s in wd.stages:
        config = s.config or {}
        if config.get("join_mode") == "custom":
            required = config.get("required_predecessors", [])
            for pred in required:
                if pred not in stage_keys:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Stage '{s.stage_key}' references unknown predecessor '{pred}' in join config",
                    )


# ── Template endpoints ───────────────────────────────────────────────────────


@router.get(
    "/templates",
    response_model=list[WorkflowTemplateSummary],
    summary="List all workflow templates",
)
async def list_templates(current_user: CurrentUser) -> list[WorkflowTemplateSummary]:
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT wt.id, wt.name, wt.description, wt.is_system, wt.created_by, wt.created_at,
                   (SELECT count(*) FROM workflow_template_stages
                    WHERE template_id = wt.id) AS stage_count
            FROM   workflow_templates wt
            ORDER  BY wt.is_system DESC, wt.name
        """)
    return [
        WorkflowTemplateSummary(
            id=r["id"],
            name=r["name"],
            description=r["description"],
            is_system=r["is_system"],
            created_by=r["created_by"],
            stage_count=r["stage_count"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.post(
    "/templates",
    response_model=WorkflowTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workflow template",
)
async def create_template(
    payload: WorkflowTemplateCreate, current_user: CurrentUser
) -> WorkflowTemplateResponse:
    wd = payload.workflow_data

    _validate_workflow_data(wd)

    async with database.pg_pool.acquire() as conn, conn.transaction():
        template_id = await conn.fetchval(
            """
            INSERT INTO workflow_templates (name, description, created_by)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            payload.name,
            payload.description,
            current_user.id,
        )

        for s in wd.stages:
            stage_id = await conn.fetchval(
                """
                INSERT INTO workflow_template_stages
                    (template_id, stage_key, display_name, stage_order, stage_type, config)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                RETURNING id
                """,
                template_id,
                s.stage_key,
                s.display_name,
                s.stage_order,
                s.stage_type,
                json.dumps(s.config),
            )
            for role in s.roles:
                await conn.execute(
                    """
                    INSERT INTO workflow_template_stage_roles
                        (stage_id, role_key, is_required, esap_levels, required_if)
                    VALUES ($1, $2, $3, $4, $5::jsonb)
                    """,
                    stage_id,
                    role.role_key,
                    role.is_required,
                    role.esap_levels,
                    json.dumps(role.required_if) if role.required_if else None,
                )

        for t in wd.transitions:
            await conn.execute(
                """
                INSERT INTO workflow_template_transitions
                    (template_id, from_stage_key, to_stage_key, condition, skip_condition)
                VALUES ($1, $2, $3, $4, $5::jsonb)
                """,
                template_id,
                t.from_stage,
                t.to_stage,
                t.condition,
                json.dumps(t.skip_condition) if t.skip_condition else None,
            )

        snapshot = await build_workflow_snapshot(conn, template_id)

    row = await database.pg_pool.fetchrow(
        "SELECT * FROM workflow_templates WHERE id = $1", template_id
    )
    return WorkflowTemplateResponse(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        is_system=row["is_system"],
        created_by=row["created_by"],
        workflow_data=WorkflowData(**snapshot),
        created_at=row["created_at"],
    )


@router.get(
    "/templates/{template_id}",
    response_model=WorkflowTemplateResponse,
    summary="Get full workflow template detail",
)
async def get_template(template_id: int, current_user: CurrentUser) -> WorkflowTemplateResponse:
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM workflow_templates WHERE id = $1", template_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        snapshot = await build_workflow_snapshot(conn, template_id)

    return WorkflowTemplateResponse(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        is_system=row["is_system"],
        created_by=row["created_by"],
        workflow_data=WorkflowData(**snapshot),
        created_at=row["created_at"],
    )


@router.put(
    "/templates/{template_id}",
    response_model=WorkflowTemplateResponse,
    summary="Update a non-system workflow template",
)
async def update_template(
    template_id: int, payload: WorkflowTemplateCreate, current_user: CurrentUser
) -> WorkflowTemplateResponse:
    wd = payload.workflow_data
    _validate_workflow_data(wd)

    async with database.pg_pool.acquire() as conn, conn.transaction():
        existing = await conn.fetchrow(
            "SELECT id, is_system FROM workflow_templates WHERE id = $1", template_id
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        if existing["is_system"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="System templates cannot be edited. Clone it first.",
            )

        await conn.execute(
            """
            UPDATE workflow_templates
            SET    name = $1, description = $2, updated_at = NOW()
            WHERE  id = $3
            """,
            payload.name,
            payload.description,
            template_id,
        )

        # Replace stages/roles/transitions wholesale (cascade deletes roles)
        await conn.execute(
            "DELETE FROM workflow_template_stages WHERE template_id = $1", template_id
        )
        await conn.execute(
            "DELETE FROM workflow_template_transitions WHERE template_id = $1", template_id
        )

        for s in wd.stages:
            stage_id = await conn.fetchval(
                """
                INSERT INTO workflow_template_stages
                    (template_id, stage_key, display_name, stage_order, stage_type, config)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                RETURNING id
                """,
                template_id,
                s.stage_key,
                s.display_name,
                s.stage_order,
                s.stage_type,
                json.dumps(s.config),
            )
            for role in s.roles:
                await conn.execute(
                    """
                    INSERT INTO workflow_template_stage_roles
                        (stage_id, role_key, is_required, esap_levels, required_if)
                    VALUES ($1, $2, $3, $4, $5::jsonb)
                    """,
                    stage_id,
                    role.role_key,
                    role.is_required,
                    role.esap_levels,
                    json.dumps(role.required_if) if role.required_if else None,
                )

        for t in wd.transitions:
            await conn.execute(
                """
                INSERT INTO workflow_template_transitions
                    (template_id, from_stage_key, to_stage_key, condition, skip_condition)
                VALUES ($1, $2, $3, $4, $5::jsonb)
                """,
                template_id,
                t.from_stage,
                t.to_stage,
                t.condition,
                json.dumps(t.skip_condition) if t.skip_condition else None,
            )

        snapshot = await build_workflow_snapshot(conn, template_id)
        row = await conn.fetchrow("SELECT * FROM workflow_templates WHERE id = $1", template_id)

    return WorkflowTemplateResponse(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        is_system=row["is_system"],
        created_by=row["created_by"],
        workflow_data=WorkflowData(**snapshot),
        created_at=row["created_at"],
    )


@router.delete(
    "/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a non-system workflow template",
)
async def delete_template(template_id: int, current_user: CurrentUser) -> None:
    async with database.pg_pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "SELECT is_system FROM workflow_templates WHERE id = $1", template_id
        )
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        if row["is_system"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="System templates cannot be deleted",
            )

        # Check if any SoW workflows reference this template
        in_use = await conn.fetchval(
            "SELECT count(*) FROM sow_workflow WHERE template_id = $1", template_id
        )
        if in_use:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Template is in use by {in_use} SoW(s) and cannot be deleted",
            )

        await conn.execute("DELETE FROM workflow_templates WHERE id = $1", template_id)


# ── Per-SoW workflow endpoints ───────────────────────────────────────────────


def _parse_workflow_data(raw: Any) -> dict:
    """Parse workflow_data which may be a dict or JSON string."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        return json.loads(raw)
    return {}


def _row_to_sow_workflow_response(row) -> SoWWorkflowResponse:
    """Map a ``sow_workflow`` row to the public response model.

    Handles JSONB fields (``workflow_data`` and ``parallel_branches``) which
    asyncpg returns as either a parsed dict or a raw string depending on
    codec configuration.  Used by every endpoint that reads or writes the
    sow_workflow table so the JSONB-parsing dance lives in exactly one place.
    """
    pb_raw = row.get("parallel_branches")
    if isinstance(pb_raw, str):
        pb_raw = json.loads(pb_raw)
    return SoWWorkflowResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        template_id=row["template_id"],
        current_stage=row["current_stage"],
        workflow_data=WorkflowData(**_parse_workflow_data(row["workflow_data"])),
        parallel_branches=pb_raw if isinstance(pb_raw, dict) else None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get(
    "/sow/{sow_id}",
    response_model=SoWWorkflowResponse,
    summary="Get workflow instance for a SoW",
)
async def get_sow_workflow(sow_id: int, current_user: CurrentUser) -> SoWWorkflowResponse:
    async with database.pg_pool.acquire() as conn:
        # Any collaborator can read the workflow snapshot; outsiders see 404.
        await require_collaborator(conn, sow_id, current_user.id)
        row = await conn.fetchrow("SELECT * FROM sow_workflow WHERE sow_id = $1", sow_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No workflow instance found for this SoW",
        )
    return _row_to_sow_workflow_response(row)


@router.post(
    "/sow/{sow_id}",
    response_model=SoWWorkflowResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create workflow instance for an existing SoW",
)
async def create_sow_workflow(
    sow_id: int, current_user: CurrentUser, template_id: int | None = None
) -> SoWWorkflowResponse:
    """Attach a workflow instance to an existing SoW (e.g. for migration).

    Authorization: only the SoW author (or a ``system-admin``) may call this,
    matching the author-only contract of ``PUT /api/workflow/sow/{id}``.
    Without this guard any authenticated user could attach a workflow to any
    SoW by guessing its integer ID.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_author(conn, sow_id, current_user.id)

        sow = await conn.fetchrow("SELECT id, status FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        existing = await conn.fetchval("SELECT id FROM sow_workflow WHERE sow_id = $1", sow_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="SoW already has a workflow instance",
            )

        tid = template_id or await get_default_template_id(conn)
        if tid is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No template_id provided and no default template exists",
            )

        snapshot = await build_workflow_snapshot(conn, tid)
        row = await conn.fetchrow(
            """
            INSERT INTO sow_workflow (sow_id, template_id, current_stage, workflow_data)
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING *
            """,
            sow_id,
            tid,
            sow["status"],
            json.dumps(snapshot),
        )

    return _row_to_sow_workflow_response(row)


@router.put(
    "/sow/{sow_id}",
    response_model=SoWWorkflowResponse,
    summary="Update SoW workflow (mid-lifecycle customization)",
)
async def update_sow_workflow(
    sow_id: int, payload: WorkflowData, current_user: CurrentUser
) -> SoWWorkflowResponse:
    """Allow the author to modify their SoW's workflow snapshot mid-lifecycle.

    Validates the new snapshot for structural well-formedness AND for runtime
    safety against the SoW's current stage. After persisting, rechecks gating
    rules — adding/removing required roles or changing ``approval_mode`` may
    immediately auto-advance the SoW.

    Authorization: only the SoW author (or a ``system-admin``) may call this.
    Enforced by :func:`utils.db_helpers.require_author`, which raises **403**
    on any non-author / non-admin caller. The same helper guards
    ``PUT /api/sow/{id}/reviewers``, so reviewer designation and live
    workflow editing share the same author-only contract.
    """
    # Structural well-formedness — fail fast before opening a connection.
    _validate_workflow_data(payload)

    async with database.pg_pool.acquire() as conn, conn.transaction():
        await require_author(conn, sow_id, current_user.id)

        existing_row = await conn.fetchrow("SELECT id FROM sow_workflow WHERE sow_id = $1", sow_id)
        if not existing_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No workflow instance found for this SoW",
            )

        sow_row = await conn.fetchrow(
            "SELECT status, esap_level FROM sow_documents WHERE id = $1", sow_id
        )
        if not sow_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="SoW not found",
            )
        current_stage = sow_row["status"]
        esap_level = sow_row["esap_level"] or "type-3"

        existing_snapshot = await _load_workflow_data(conn, sow_id)
        new_snapshot = payload.model_dump(mode="json")

        # Runtime safety: SoW's current stage must remain in the new snapshot.
        _validate_workflow_snapshot_change(existing_snapshot, new_snapshot, current_stage)

        # Persist the new snapshot.
        await conn.execute(
            """
            UPDATE sow_workflow
            SET    workflow_data = $1::jsonb, updated_at = NOW()
            WHERE  sow_id = $2
            """,
            json.dumps(new_snapshot),
            sow_id,
        )

        # If a required role was added to the (review/approval) current stage,
        # create assignments for the newly-required roles. ``create_stage_assignments``
        # is idempotent via dedup in ``create_assignment_with_prior``, so existing
        # assignments are left alone.
        # Pass sow_meta so required_if predicates evaluate consistently with
        # what create_stage_assignments and check_gating_rules see.
        sow_meta = await _load_sow_microsoft_metadata(conn, sow_id)
        new_current_cfg = _find_stage(new_snapshot, current_stage)
        existing_current_cfg = _find_stage(existing_snapshot, current_stage)
        if (
            new_current_cfg
            and new_current_cfg.get("stage_type") in ("review", "approval")
            and (
                required_role_keys(new_current_cfg, esap_level, sow_meta)
                - required_role_keys(existing_current_cfg, esap_level, sow_meta)
            )
        ):
            await create_stage_assignments(
                conn, sow_id, new_current_cfg, esap_level, current_user.id
            )

        # Re-evaluate gating rules; may execute a transition.
        await recheck_and_maybe_advance(conn, sow_id, current_user.id)

        # Audit-trail entry — minimal diff so the activity log is readable.
        diff = compute_workflow_diff(existing_snapshot, new_snapshot)
        await insert_history(conn, sow_id, current_user.id, "workflow_edited", diff)

        # Re-fetch in case the recheck above bumped current_stage.
        row = await conn.fetchrow("SELECT * FROM sow_workflow WHERE sow_id = $1", sow_id)

    return _row_to_sow_workflow_response(row)
