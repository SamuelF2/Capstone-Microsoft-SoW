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
            SELECT role_key, is_required, esap_levels
            FROM   workflow_template_stage_roles
            WHERE  stage_id = $1
            """,
            s["id"],
        )
        roles = [
            {
                "role_key": r["role_key"],
                "is_required": r["is_required"],
                "esap_levels": list(r["esap_levels"]) if r["esap_levels"] else None,
            }
            for r in role_rows
        ]

        stage_config = s["config"] if isinstance(s["config"], dict) else {}

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
        SELECT from_stage_key, to_stage_key
        FROM   workflow_template_transitions
        WHERE  template_id = $1
        """,
        template_id,
    )
    transitions = [
        {"from_stage": t["from_stage_key"], "to_stage": t["to_stage_key"]} for t in transition_rows
    ]

    return {"stages": stages, "transitions": transitions}


async def get_default_template_id(conn) -> int | None:
    """Return the ID of the system default workflow template, or None."""
    return await conn.fetchval("SELECT id FROM workflow_templates WHERE is_system = TRUE LIMIT 1")


# ── Template endpoints ───────────────────────────────────────────────────────


@router.get(
    "/templates",
    response_model=list[WorkflowTemplateSummary],
    summary="List all workflow templates",
)
async def list_templates(current_user: CurrentUser) -> list[WorkflowTemplateSummary]:
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT wt.id, wt.name, wt.description, wt.is_system, wt.created_at,
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

    # Validate: all transition stage keys must exist in stages
    stage_keys = {s.stage_key for s in wd.stages}
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
                        (stage_id, role_key, is_required, esap_levels)
                    VALUES ($1, $2, $3, $4)
                    """,
                    stage_id,
                    role.role_key,
                    role.is_required,
                    role.esap_levels,
                )

        for t in wd.transitions:
            await conn.execute(
                """
                INSERT INTO workflow_template_transitions
                    (template_id, from_stage_key, to_stage_key)
                VALUES ($1, $2, $3)
                """,
                template_id,
                t.from_stage,
                t.to_stage,
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

    # Validate: all transition stage keys must exist in stages
    stage_keys = {s.stage_key for s in wd.stages}
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
                        (stage_id, role_key, is_required, esap_levels)
                    VALUES ($1, $2, $3, $4)
                    """,
                    stage_id,
                    role.role_key,
                    role.is_required,
                    role.esap_levels,
                )

        for t in wd.transitions:
            await conn.execute(
                """
                INSERT INTO workflow_template_transitions
                    (template_id, from_stage_key, to_stage_key)
                VALUES ($1, $2, $3)
                """,
                template_id,
                t.from_stage,
                t.to_stage,
            )

        snapshot = await build_workflow_snapshot(conn, template_id)
        row = await conn.fetchrow("SELECT * FROM workflow_templates WHERE id = $1", template_id)

    return WorkflowTemplateResponse(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        is_system=row["is_system"],
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


@router.get(
    "/sow/{sow_id}",
    response_model=SoWWorkflowResponse,
    summary="Get workflow instance for a SoW",
)
async def get_sow_workflow(sow_id: int, current_user: CurrentUser) -> SoWWorkflowResponse:
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sow_workflow WHERE sow_id = $1", sow_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No workflow instance found for this SoW",
        )
    return SoWWorkflowResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        template_id=row["template_id"],
        current_stage=row["current_stage"],
        workflow_data=WorkflowData(**_parse_workflow_data(row["workflow_data"])),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post(
    "/sow/{sow_id}",
    response_model=SoWWorkflowResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create workflow instance for an existing SoW",
)
async def create_sow_workflow(
    sow_id: int, current_user: CurrentUser, template_id: int | None = None
) -> SoWWorkflowResponse:
    """Attach a workflow instance to an existing SoW (e.g. for migration)."""
    async with database.pg_pool.acquire() as conn, conn.transaction():
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

    return SoWWorkflowResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        template_id=row["template_id"],
        current_stage=row["current_stage"],
        workflow_data=WorkflowData(**_parse_workflow_data(row["workflow_data"])),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.put(
    "/sow/{sow_id}",
    response_model=SoWWorkflowResponse,
    summary="Update SoW workflow (mid-lifecycle customization)",
)
async def update_sow_workflow(
    sow_id: int, payload: WorkflowData, current_user: CurrentUser
) -> SoWWorkflowResponse:
    """Allow the author to modify their SoW's workflow mid-lifecycle."""
    async with database.pg_pool.acquire() as conn, conn.transaction():
        existing = await conn.fetchrow("SELECT * FROM sow_workflow WHERE sow_id = $1", sow_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No workflow instance found for this SoW",
            )

        snapshot = payload.model_dump(mode="json")
        row = await conn.fetchrow(
            """
            UPDATE sow_workflow
            SET    workflow_data = $1::jsonb, updated_at = NOW()
            WHERE  sow_id = $2
            RETURNING *
            """,
            json.dumps(snapshot),
            sow_id,
        )

    return SoWWorkflowResponse(
        id=row["id"],
        sow_id=row["sow_id"],
        template_id=row["template_id"],
        current_stage=row["current_stage"],
        workflow_data=WorkflowData(**_parse_workflow_data(row["workflow_data"])),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
