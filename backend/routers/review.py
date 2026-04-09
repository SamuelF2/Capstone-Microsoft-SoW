"""
Review router  —  /api/review/...

Handles the internal review (Step 2) and DRM review (Step 3) workflows.

Endpoints
---------
  GET  /api/review/assigned                List SoWs assigned to current user
  GET  /api/review/{sow_id}/checklist      Role-specific checklist for a reviewer
  POST /api/review/{sow_id}/save-progress  Save partial checklist progress
  POST /api/review/{sow_id}/submit         Submit final review decision
  GET  /api/review/{sow_id}/status         Aggregated review status for a SoW
  POST /api/review/{sow_id}/advance        Advance SoW through workflow stages
  GET  /api/review/{sow_id}/drm-summary    Role-tailored summary for DRM reviewers
  POST /api/review/{sow_id}/send-back      Return SoW to a previous stage with feedback
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from typing import Any

import database
from auth import CurrentUser
from config import RULES_DIR
from fastapi import APIRouter, HTTPException, Query, status
from models import (
    ChecklistItemModel,
    ReviewAssignmentStatusSummary,
    ReviewAssignmentSummary,
    ReviewChecklistResponse,
    ReviewProgressPayload,
    ReviewStatus,
    ReviewSubmitPayload,
    SendBackPayload,
)
from utils.db_helpers import (
    insert_history,
)

router = APIRouter(prefix="/api/review", tags=["review"])

# ── Role display names ────────────────────────────────────────────────────────

_ROLE_DISPLAY_NAMES: dict[str, str] = {
    "solution-architect": "Solution Architect",
    "sqa-reviewer": "SQA Reviewer",
    "cpl": "Customer Practice Lead",
    "cdp": "Customer Delivery Partner",
    "delivery-manager": "Delivery Manager",
    "consultant": "Consultant",
}

# ── Hardcoded fallback checklists ─────────────────────────────────────────────
# Used when Data/rules/workflow/review-checklists.json is absent.
# Mirrors the structure defined in PHASE-2.md component specs.

_DEFAULT_CHECKLISTS: dict[str, dict] = {
    "solution-architect": {
        "displayName": "Solution Architect",
        "focusAreas": ["Technical Feasibility", "Architecture", "Security", "Integration"],
        "items": [
            {
                "id": "sa-001",
                "text": "Technical solution is feasible and appropriate for the customer's environment",
                "required": True,
                "category": "Technical Feasibility",
                "helpText": "Verify the proposed architecture can be delivered within the agreed timeline and resources.",
            },
            {
                "id": "sa-002",
                "text": "No unsupported SLA commitments (99.9%+ uptime claims reviewed)",
                "required": True,
                "category": "Technical Feasibility",
                "helpText": "Check that any uptime or performance SLAs have been validated against available infrastructure.",
            },
            {
                "id": "sa-003",
                "text": "All assumptions clearly stated and technically sound",
                "required": True,
                "category": "Architecture",
                "helpText": "Assumptions section must be explicit about dependencies and prerequisites.",
            },
            {
                "id": "sa-004",
                "text": "Security and compliance requirements identified and addressed",
                "required": True,
                "category": "Security",
                "helpText": "Review relevant security obligations for the customer's industry and region.",
            },
            {
                "id": "sa-005",
                "text": "Integration points with existing systems documented",
                "required": True,
                "category": "Integration",
                "helpText": "All APIs, data feeds, and system dependencies should be named.",
            },
            {
                "id": "sa-006",
                "text": "Technical governance and sign-off path defined",
                "required": True,
                "category": "Architecture",
                "helpText": "Who approves technical decisions during delivery?",
            },
            {
                "id": "sa-007",
                "text": "Delivery approach is consistent with stated methodology",
                "required": False,
                "category": "Technical Feasibility",
                "helpText": "Agile/Waterfall/Sure Step deliverables should match the stated methodology.",
            },
        ],
    },
    "sqa-reviewer": {
        "displayName": "SQA Reviewer",
        "focusAreas": ["Commercial Terms", "Compliance", "Contractual Clarity"],
        "items": [
            {
                "id": "sqa-001",
                "text": "Commercial terms are clear and unambiguous",
                "required": True,
                "category": "Commercial Terms",
                "helpText": "Payment milestones, rates, and T&M vs Fixed-Price structure must be explicit.",
            },
            {
                "id": "sqa-002",
                "text": "Change control process documented",
                "required": True,
                "category": "Contractual Clarity",
                "helpText": "How are scope changes requested, evaluated, and approved?",
            },
            {
                "id": "sqa-003",
                "text": "Data privacy obligations addressed (GDPR/local regulations)",
                "required": True,
                "category": "Compliance",
                "helpText": "Any personal data handling must reference applicable regulations.",
            },
            {
                "id": "sqa-004",
                "text": "Regulatory compliance requirements identified",
                "required": True,
                "category": "Compliance",
                "helpText": "Industry-specific regulations (finance, healthcare, government) should be called out.",
            },
            {
                "id": "sqa-005",
                "text": "Customer sign-off and acceptance criteria are clear",
                "required": True,
                "category": "Contractual Clarity",
                "helpText": "How does the customer formally accept deliverables?",
            },
            {
                "id": "sqa-006",
                "text": "Deliverable acceptance criteria are measurable",
                "required": True,
                "category": "Contractual Clarity",
                "helpText": "Each deliverable should have a defined 'done' criterion.",
            },
            {
                "id": "sqa-007",
                "text": "Escalation and issue resolution path defined",
                "required": False,
                "category": "Commercial Terms",
                "helpText": "Who is contacted if commercial disputes or delivery issues arise?",
            },
        ],
    },
    "cpl": {
        "displayName": "Customer Practice Lead",
        "focusAreas": ["Financial Viability", "Standards Compliance", "Scope Management"],
        "items": [
            {
                "id": "cpl-001",
                "text": "Margin meets practice target or documented exception approved",
                "required": True,
                "category": "Financial Viability",
                "helpText": "Standard target is 18%. If below, a finance exception must be documented.",
            },
            {
                "id": "cpl-002",
                "text": "Deal structure aligns with commercial policy (T&M vs Fixed-Price thresholds)",
                "required": True,
                "category": "Financial Viability",
                "helpText": "Fixed-price deals over $500K require additional commercial approval.",
            },
            {
                "id": "cpl-003",
                "text": "SoW methodology aligns with practice standards",
                "required": True,
                "category": "Standards Compliance",
                "helpText": "Agile, Sure Step, or approved custom methodology must be explicitly named.",
            },
            {
                "id": "cpl-004",
                "text": "No banned phrases or non-standard commitments present",
                "required": True,
                "category": "Standards Compliance",
                "helpText": "Refer to the prohibited language register for terms that require legal sign-off.",
            },
            {
                "id": "cpl-005",
                "text": "Scope boundaries clearly defined (in-scope and out-of-scope)",
                "required": True,
                "category": "Scope Management",
                "helpText": "Ambiguous scope is the #1 source of delivery disputes.",
            },
            {
                "id": "cpl-006",
                "text": "Customer responsibilities and dependencies documented",
                "required": False,
                "category": "Scope Management",
                "helpText": "What must the customer provide for delivery to succeed?",
            },
        ],
    },
    "cdp": {
        "displayName": "Customer Delivery Partner",
        "focusAreas": ["Account Alignment", "Customer Success", "Consumption Goals"],
        "items": [
            {
                "id": "cdp-001",
                "text": "Customer objectives and success criteria are clearly articulated",
                "required": True,
                "category": "Customer Success",
                "helpText": "What does the customer consider a successful outcome?",
            },
            {
                "id": "cdp-002",
                "text": "Deliverables align with customer's strategic goals",
                "required": True,
                "category": "Account Alignment",
                "helpText": "Check the account plan for strategic priorities that should be reflected.",
            },
            {
                "id": "cdp-003",
                "text": "Support and transition plan defined for post-delivery",
                "required": True,
                "category": "Customer Success",
                "helpText": "How does the customer run the solution after delivery completes?",
            },
            {
                "id": "cdp-004",
                "text": "Customer consumption / Azure adoption goals addressed",
                "required": True,
                "category": "Consumption Goals",
                "helpText": "Does the delivery plan drive measurable Azure consumption growth?",
            },
            {
                "id": "cdp-005",
                "text": "Key customer stakeholders identified and engaged",
                "required": False,
                "category": "Account Alignment",
                "helpText": "Executive sponsor, project owner, and technical lead should be named.",
            },
        ],
    },
    "delivery-manager": {
        "displayName": "Delivery Manager",
        "focusAreas": ["Deliverability", "Resourcing", "Timeline", "Risk Management"],
        "items": [
            {
                "id": "dm-001",
                "text": "Resource plan is realistic and team is available for the stated timeline",
                "required": True,
                "category": "Resourcing",
                "helpText": "Verify named or role-based resources are not double-booked.",
            },
            {
                "id": "dm-002",
                "text": "Delivery methodology is appropriate for scope and timeline",
                "required": True,
                "category": "Deliverability",
                "helpText": "Waterfall for well-defined scope, Agile for iterative or exploratory work.",
            },
            {
                "id": "dm-003",
                "text": "Key milestones and go/no-go checkpoints are defined",
                "required": True,
                "category": "Timeline",
                "helpText": "At minimum: kick-off, mid-point review, and acceptance gate.",
            },
            {
                "id": "dm-004",
                "text": "Risk register is present and mitigations are actionable",
                "required": True,
                "category": "Risk Management",
                "helpText": "Risks must have owners and mitigation actions, not just descriptions.",
            },
            {
                "id": "dm-005",
                "text": "Dependencies on customer environment or third parties are listed",
                "required": True,
                "category": "Deliverability",
                "helpText": "External dependencies are the most common source of delivery delays.",
            },
            {
                "id": "dm-006",
                "text": "Escalation path for delivery blockers is defined",
                "required": False,
                "category": "Risk Management",
                "helpText": "Who does the PM escalate to if a blocker threatens the timeline?",
            },
        ],
    },
}


async def _get_required_roles(conn, sow_id: int, stage_key: str, esap_level: str) -> list[str]:
    """Load required reviewer roles from the SoW's workflow instance.

    ``stage_key`` uses underscore format (e.g. "internal_review", "drm_review")
    matching ``sow_documents.status``.
    """
    row = await conn.fetchrow("SELECT workflow_data FROM sow_workflow WHERE sow_id = $1", sow_id)
    if not row or not row["workflow_data"]:
        return []
    data = (
        row["workflow_data"]
        if isinstance(row["workflow_data"], dict)
        else json.loads(row["workflow_data"])
    )
    for stage in data.get("stages", []):
        if stage["stage_key"] == stage_key:
            roles = []
            for role in stage.get("roles", []):
                if not role.get("is_required", True):
                    continue
                esap_list = role.get("esap_levels")
                if esap_list is None or esap_level in esap_list:
                    roles.append(role["role_key"])
            return roles
    return []


# ── Internal helpers ──────────────────────────────────────────────────────────


def _load_checklist(role: str) -> dict:
    """Load checklist data for *role* from file, falling back to defaults."""
    checklist_path = os.path.join(RULES_DIR, "workflow", "review-checklists.json")
    if os.path.isfile(checklist_path):
        with open(checklist_path) as f:
            data = json.load(f)
        personas = data.get("reviewerPersonas", data.get("personas", {}))
        if role in personas:
            return personas[role]
    return _DEFAULT_CHECKLISTS.get(
        role,
        {
            "displayName": _ROLE_DISPLAY_NAMES.get(role, role),
            "focusAreas": [],
            "items": [],
        },
    )


# ── GET /api/review/assigned ──────────────────────────────────────────────────


@router.get(
    "/assigned",
    response_model=list[ReviewAssignmentSummary],
    summary="List SoWs assigned to the current user for review",
)
async def get_assigned_reviews(
    current_user: CurrentUser,
    stage: str | None = Query(
        default=None, description="Filter by stage: internal-review or drm-approval"
    ),
    status_filter: str | None = Query(
        default=None,
        alias="status",
        description="Filter by assignment status: pending, in_progress, completed",
    ),
) -> list[ReviewAssignmentSummary]:
    """Return all review assignments for the current user, joined with SoW summary data."""
    conditions: list[str] = ["ra.user_id = $1"]
    params: list[Any] = [current_user.id]

    if stage:
        params.append(stage)
        conditions.append(f"ra.stage = ${len(params)}")
    if status_filter:
        params.append(status_filter)
        conditions.append(f"ra.status = ${len(params)}")

    where = " AND ".join(conditions)
    # Use DISTINCT ON to return only the latest assignment per
    # (sow, role, stage), avoiding stale rows from prior cycles.
    query = f"""
        SELECT DISTINCT ON (ra.sow_id, ra.reviewer_role, ra.stage)
               ra.id, ra.sow_id,
               s.title       AS sow_title,
               s.status      AS sow_status,
               s.methodology,
               s.customer_name,
               s.deal_value,
               s.esap_level,
               ra.reviewer_role,
               ra.stage,
               ra.status,
               ra.assigned_at,
               ra.completed_at
        FROM   review_assignments ra
        JOIN   sow_documents s ON s.id = ra.sow_id
        WHERE  {where}
        ORDER BY ra.sow_id, ra.reviewer_role, ra.stage, ra.assigned_at DESC
    """
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return [ReviewAssignmentSummary(**dict(r)) for r in rows]


# ── GET /api/review/{sow_id}/checklist ───────────────────────────────────────


@router.get(
    "/{sow_id}/checklist",
    response_model=ReviewChecklistResponse,
    summary="Get the role-specific checklist for the current reviewer",
)
async def get_checklist(sow_id: int, current_user: CurrentUser) -> ReviewChecklistResponse:
    """Return checklist items for the current user's review assignment on this SoW.

    Includes any previously saved checklist_responses so reviewers can resume.
    """
    async with database.pg_pool.acquire() as conn:
        # Prefer a pending/in-progress assignment so authors with multiple
        # role assignments cycle through them one at a time.
        assignment = await conn.fetchrow(
            """SELECT * FROM review_assignments
               WHERE sow_id = $1 AND user_id = $2
               ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END
               LIMIT 1""",
            sow_id,
            current_user.id,
        )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SoW not found",
        )

    role = assignment["reviewer_role"]
    checklist_data = _load_checklist(role)
    items = [ChecklistItemModel(**item) for item in checklist_data.get("items", [])]

    saved = assignment["checklist_responses"]
    if isinstance(saved, str):
        saved = json.loads(saved)

    return ReviewChecklistResponse(
        reviewer_role=role,
        display_name=checklist_data.get("displayName", _ROLE_DISPLAY_NAMES.get(role, role)),
        focus_areas=checklist_data.get("focusAreas", []),
        items=items,
        saved_responses=saved,
    )


# ── POST /api/review/{sow_id}/save-progress ──────────────────────────────────


@router.post(
    "/{sow_id}/save-progress",
    summary="Save partial review checklist progress",
)
async def save_progress(
    sow_id: int,
    payload: ReviewProgressPayload,
    current_user: CurrentUser,
) -> dict:
    """Persist checklist state and comments without submitting a final decision.

    Sets assignment status to ``in_progress`` if it was previously ``pending``.
    """
    async with database.pg_pool.acquire() as conn:
        assignment = await conn.fetchrow(
            """SELECT * FROM review_assignments
               WHERE sow_id = $1 AND user_id = $2
               ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END
               LIMIT 1""",
            sow_id,
            current_user.id,
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="SoW not found",
            )

        new_status = "in_progress" if assignment["status"] == "pending" else assignment["status"]
        await conn.execute(
            """
            UPDATE review_assignments
            SET    checklist_responses = $1::jsonb,
                   comments            = $2,
                   status              = $3
            WHERE  id = $4
            """,
            json.dumps(payload.checklist_responses),
            payload.comments,
            new_status,
            assignment["id"],
        )

    return {"saved": True}


# ── POST /api/review/{sow_id}/submit ─────────────────────────────────────────


@router.post(
    "/{sow_id}/submit",
    summary="Submit a final review decision",
)
async def submit_review(
    sow_id: int,
    payload: ReviewSubmitPayload,
    current_user: CurrentUser,
) -> dict:
    """Submit a review decision: ``approved``, ``rejected``, or ``approved-with-conditions``.

    Validation:
    - Rejection requires comments.
    - Approved-with-conditions requires a non-empty conditions list.
    - Approving requires all *required* checklist items to be checked.

    Side-effects on rejection:
    - SoW status returns to ``draft``.
    - Other pending/in-progress assignments at this stage are canceled.
    """
    valid_decisions = {"approved", "rejected", "approved-with-conditions"}
    if payload.decision not in valid_decisions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid decision. Must be one of: {sorted(valid_decisions)}",
        )

    if payload.decision == "rejected" and not payload.comments:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comments are required when rejecting",
        )

    if payload.decision == "approved-with-conditions" and not payload.conditions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Conditions list is required for 'approved-with-conditions'",
        )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        # Prefer a pending/in-progress assignment so authors with multiple
        # role assignments cycle through them one at a time.
        assignment = await conn.fetchrow(
            """SELECT * FROM review_assignments
               WHERE sow_id = $1 AND user_id = $2
               ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END
               LIMIT 1""",
            sow_id,
            current_user.id,
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="SoW not found",
            )

        sow = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        if sow["status"] not in ("internal_review", "drm_review"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SoW is in '{sow['status']}' status — cannot submit a review",
            )

        # For approval decisions: all required checklist items must be checked
        if payload.decision in ("approved", "approved-with-conditions"):
            checklist_data = _load_checklist(assignment["reviewer_role"])
            required_ids = {
                item["id"] for item in checklist_data.get("items", []) if item.get("required")
            }
            checked_ids = {r["id"] for r in payload.checklist_responses if r.get("checked")}
            missing = required_ids - checked_ids
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"All required checklist items must be checked before approving. Missing: {sorted(missing)}",
                )

        now = datetime.now(UTC)

        # Mark this specific assignment as completed (by id, not user+sow)
        await conn.execute(
            """
            UPDATE review_assignments
            SET    status              = 'completed',
                   decision            = $1,
                   comments            = $2,
                   conditions          = $3::jsonb,
                   checklist_responses = $4::jsonb,
                   completed_at        = $5
            WHERE  id = $6
            """,
            payload.decision,
            payload.comments,
            json.dumps(payload.conditions) if payload.conditions else None,
            json.dumps(payload.checklist_responses),
            now,
            assignment["id"],
        )

        # Audit: insert into review_results
        await conn.execute(
            """
            INSERT INTO review_results
                (sow_id, reviewer, score, findings, reviewed_at,
                 reviewer_user_id, review_stage, checklist_responses, decision, conditions)
            VALUES
                ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10::jsonb)
            """,
            sow_id,
            current_user.email,
            None,
            json.dumps({"comments": payload.comments}),
            now,
            current_user.id,
            assignment["stage"],
            json.dumps(payload.checklist_responses),
            payload.decision,
            json.dumps(payload.conditions) if payload.conditions else None,
        )

        await insert_history(
            conn,
            sow_id,
            current_user.id,
            "review_submitted",
            {
                "decision": payload.decision,
                "reviewer_role": assignment["reviewer_role"],
                "stage": assignment["stage"],
            },
        )

        # Rejection: route to the on_reject target defined in the workflow
        # template.  Falls back to 'draft' for backward compatibility.
        if payload.decision == "rejected":
            from services.workflow_engine import execute_transition, resolve_transition

            target = await resolve_transition(conn, sow_id, sow["status"], "on_reject")
            target_key = target["stage_key"] if target else "draft"

            # Cancel other pending assignments at the current stage before
            # transitioning (the submitter's own assignment was already marked
            # completed above).
            await conn.execute(
                """
                UPDATE review_assignments
                SET    status = 'canceled'
                WHERE  sow_id  = $1
                  AND  id     != $2
                  AND  status IN ('pending', 'in_progress')
                  AND  stage   = $3
                """,
                sow_id,
                assignment["id"],
                assignment["stage"],
            )

            esap = sow["esap_level"] or "type-3"
            await execute_transition(
                conn, sow_id, target_key, current_user.id, esap, payload.comments
            )

        # Auto-create COA rows for approved-with-conditions decisions.
        # The existing JSONB in review_assignments.conditions is preserved for
        # backward compatibility; COA rows give structured tracking.
        if payload.decision == "approved-with-conditions" and payload.conditions:
            for condition_item in payload.conditions:
                if isinstance(condition_item, str):
                    condition_text = condition_item
                    category = "general"
                else:
                    condition_text = condition_item.get("text", "")
                    category = condition_item.get("category", "general")
                if condition_text:
                    await conn.execute(
                        """
                        INSERT INTO conditions_of_approval
                            (sow_id, review_assignment_id, condition_text, category, created_by)
                        VALUES ($1, $2, $3, $4, $5)
                        """,
                        sow_id,
                        assignment["id"],
                        condition_text,
                        category,
                        current_user.id,
                    )

    result = {"decision": payload.decision, "sow_id": sow_id}

    # Auto-advance: if the stage has auto_advance enabled and the approval
    # decision just satisfied all gating rules, automatically advance.
    # For parallel branches, use complete_parallel_branch instead.
    if payload.decision in ("approved", "approved-with-conditions"):
        from services.workflow_engine import (
            _find_stage,
            _load_workflow_data,
            check_gating_rules,
            complete_parallel_branch,
            execute_transition,
            resolve_transition,
        )

        async with database.pg_pool.acquire() as conn2:
            sow_now = await conn2.fetchrow(
                "SELECT status, esap_level FROM sow_documents WHERE id = $1", sow_id
            )
        if sow_now:
            current = sow_now["status"]
            esap = sow_now["esap_level"] or "type-3"
            async with database.pg_pool.acquire() as conn2:
                wd = await _load_workflow_data(conn2, sow_id)
                # Check if this stage is part of a parallel group
                pb_row = await conn2.fetchrow(
                    "SELECT parallel_branches FROM sow_workflow WHERE sow_id = $1",
                    sow_id,
                )
            parallel_branches = (
                pb_row["parallel_branches"] if pb_row and pb_row["parallel_branches"] else None
            )
            is_parallel_branch = (
                parallel_branches
                and isinstance(parallel_branches, dict)
                and current in parallel_branches
            )

            stage_cfg = _find_stage(wd, current)
            if stage_cfg and (stage_cfg.get("config") or {}).get("auto_advance"):
                async with database.pg_pool.acquire() as conn2, conn2.transaction():
                    met, _ = await check_gating_rules(conn2, sow_id, current, esap)
                    if met:
                        if is_parallel_branch:
                            # This is a parallel branch — check if the join can proceed
                            join_result = await complete_parallel_branch(
                                conn2, sow_id, current, current_user.id, esap
                            )
                            if join_result:
                                result["auto_advanced"] = True
                                result["new_status"] = join_result["new_status"]
                                result["assigned_roles"] = join_result.get("assigned_roles", [])
                            else:
                                # Branch complete but join not ready yet
                                result["parallel_branch_completed"] = True
                                result["branch_stage"] = current
                        else:
                            target = await resolve_transition(conn2, sow_id, current, "on_approve")
                            if not target:
                                target = await resolve_transition(conn2, sow_id, current, "default")
                            if target:
                                advance_result = await execute_transition(
                                    conn2,
                                    sow_id,
                                    target["stage_key"],
                                    current_user.id,
                                    esap,
                                )
                                result["auto_advanced"] = True
                                result["new_status"] = advance_result["new_status"]
                                result["assigned_roles"] = advance_result.get("assigned_roles", [])

    return result


# ── GET /api/review/{sow_id}/status ──────────────────────────────────────────


@router.get(
    "/{sow_id}/status",
    response_model=ReviewStatus,
    summary="Get the aggregated review status for a SoW",
)
async def get_review_status(sow_id: int, current_user: CurrentUser) -> ReviewStatus:
    """Return the *current-cycle* assignments for a SoW and whether gating rules
    are satisfied.

    Only the most recent assignment per (user, reviewer_role, stage) is
    returned.  This prevents stale rows from prior reject/resubmit cycles from
    polluting the status view or incorrectly satisfying gating rules.
    """
    async with database.pg_pool.acquire() as conn:
        sow = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        # Fetch only the latest assignment per (user, role, stage).
        # DISTINCT ON keeps the row with the highest assigned_at for each group.
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (user_id, reviewer_role, stage) *
            FROM   review_assignments
            WHERE  sow_id = $1
            ORDER  BY user_id, reviewer_role, stage, assigned_at DESC
            """,
            sow_id,
        )

        esap = sow["esap_level"] or "type-3"
        current_stage = sow["status"]

        # Determine which stage's gating rules to evaluate
        if current_stage in ("internal_review", "drm_review"):
            stage_key = "internal-review" if current_stage == "internal_review" else "drm-approval"
            required_roles = await _get_required_roles(conn, sow_id, current_stage, esap)
        else:
            stage_key = ""
            required_roles = []

    assignments = [
        ReviewAssignmentStatusSummary(
            reviewer_role=r["reviewer_role"],
            display_name=_ROLE_DISPLAY_NAMES.get(r["reviewer_role"], r["reviewer_role"]),
            stage=r["stage"],
            status=r["status"],
            decision=r["decision"],
            completed_at=r["completed_at"],
        )
        for r in rows
    ]

    if stage_key:
        completed_roles = {
            r["reviewer_role"]
            for r in rows
            if r["stage"] == stage_key
            and r["status"] == "completed"
            and r["decision"] in ("approved", "approved-with-conditions")
        }
        outstanding = [
            f"{_ROLE_DISPLAY_NAMES.get(role, role)} approval pending"
            for role in required_roles
            if role not in completed_roles
        ]
    else:
        outstanding = []

    return ReviewStatus(
        sow_id=sow_id,
        current_stage=current_stage,
        esap_level=esap,
        assignments=assignments,
        gating_rules_met=len(outstanding) == 0,
        outstanding_requirements=outstanding,
    )


# ── POST /api/review/{sow_id}/advance ────────────────────────────────────────


@router.post(
    "/{sow_id}/advance",
    summary="Advance the SoW to the next stage based on workflow template routing",
)
async def advance_sow(sow_id: int, current_user: CurrentUser) -> dict:
    """Advance the SoW to the next stage, checking gating rules defined in
    the workflow template.

    Reads the per-SoW workflow snapshot to determine the ``on_approve``
    transition target and required approvals.

    Raises **409** if gating rules are not satisfied or no advance transition
    is defined for the current stage.
    """
    from services.workflow_engine import (
        check_gating_rules,
        complete_parallel_branch,
        execute_transition,
        resolve_transition,
    )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        sow = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        esap = sow["esap_level"] or "type-3"
        current_stage = sow["status"]

        # Check gating rules for the current stage
        met, outstanding = await check_gating_rules(conn, sow_id, current_stage, esap)
        if not met:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Gating rules not met. Pending approvals from: "
                    + ", ".join(_ROLE_DISPLAY_NAMES.get(r, r) for r in outstanding)
                ),
            )

        # Check if this stage is part of a parallel group
        pb_row = await conn.fetchrow(
            "SELECT parallel_branches FROM sow_workflow WHERE sow_id = $1",
            sow_id,
        )
        parallel_branches = (
            pb_row["parallel_branches"] if pb_row and pb_row["parallel_branches"] else None
        )
        is_parallel_branch = (
            parallel_branches
            and isinstance(parallel_branches, dict)
            and current_stage in parallel_branches
        )

        if is_parallel_branch:
            # This is a parallel branch — try to complete it and check the join
            join_result = await complete_parallel_branch(
                conn, sow_id, current_stage, current_user.id, esap
            )
            if join_result:
                return join_result
            # Branch marked complete but join not ready yet
            return {
                "advanced": False,
                "sow_id": sow_id,
                "parallel_branch_completed": True,
                "branch_stage": current_stage,
                "detail": "Branch completed. Waiting for other parallel branches.",
            }

        # Resolve the on_approve transition, falling back to default
        target = await resolve_transition(conn, sow_id, current_stage, "on_approve")
        if not target:
            target = await resolve_transition(conn, sow_id, current_stage, "default")
        if not target:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"No advance transition defined from '{current_stage}'",
            )

        # Execute the transition
        result = await execute_transition(conn, sow_id, target["stage_key"], current_user.id, esap)
        return result


# ── GET /api/review/{sow_id}/drm-summary ─────────────────────────────────────


def _safe_json(value: Any) -> Any:
    """Parse a value that may already be a dict/list or a JSON string."""
    if value is None:
        return None
    if isinstance(value, dict | list):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


@router.get(
    "/{sow_id}/drm-summary",
    summary="Role-tailored DRM summary for the current reviewer",
)
async def get_drm_summary(sow_id: int, current_user: CurrentUser) -> dict:
    """Return a persona-specific summary of the SoW for DRM stage reviewers.

    The shape of the response depends on the reviewer's role:
    - **cpl**: financials, standards compliance, scope summary
    - **cdp**: account info, customer success, consumption goals
    - **delivery-manager**: delivery plan, risk register, timeline
    """
    async with database.pg_pool.acquire() as conn:
        assignment = await conn.fetchrow(
            """SELECT * FROM review_assignments
               WHERE sow_id = $1 AND user_id = $2 AND stage = 'drm-approval'
               ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END
               LIMIT 1""",
            sow_id,
            current_user.id,
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="SoW not found",
            )

        sow = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        # Internal review results with reviewer roles
        internal_rows = await conn.fetch(
            """
            SELECT rr.decision, rr.findings, rr.conditions, ra.reviewer_role
            FROM   review_results  rr
            LEFT JOIN review_assignments ra
                   ON ra.sow_id = rr.sow_id
                  AND ra.user_id = rr.reviewer_user_id
                  AND ra.stage = 'internal-review'
            WHERE  rr.sow_id = $1
              AND  rr.review_stage = 'internal-review'
            ORDER BY rr.reviewed_at DESC
            """,
            sow_id,
        )

        # Latest AI analysis — joined through sow_documents.ai_suggestion_id
        ai_row = await conn.fetchrow(
            """
            SELECT a.flag, a.validation_recommendation, a.risks
            FROM   sow_documents sd
            JOIN   ai_suggestion a ON a.id = sd.ai_suggestion_id
            WHERE  sd.id = $1
            """,
            sow_id,
        )

    role = assignment["reviewer_role"]
    content = _safe_json(sow["content"]) or {}

    # ── Build internal review summary ────────────────────────────────────────
    internal_summary: dict[str, Any] = {}
    for r in internal_rows:
        reviewer_role = r["reviewer_role"] or "unknown"
        key = reviewer_role.replace("-", "_")
        if key not in internal_summary:
            conditions = _safe_json(r["conditions"])
            findings = _safe_json(r["findings"]) or {}
            internal_summary[key] = {
                "decision": r["decision"],
                "comments": findings.get("comments"),
                "conditions": conditions,
            }

    # ── AI insights ──────────────────────────────────────────────────────────
    ai_insights: dict[str, Any] | None = None
    if ai_row:
        validation_rec = _safe_json(ai_row["validation_recommendation"]) or {}
        risks_data = _safe_json(ai_row["risks"]) or []
        ai_insights = {
            "approval": validation_rec.get("approval"),
            "high_violations": [
                v for v in validation_rec.get("violations", []) if v.get("severity") == "high"
            ],
            "risks": risks_data,
        }

    # ── Scope helpers ────────────────────────────────────────────────────────
    scope = content.get("scope") or {}
    if isinstance(scope, list):
        scope = {}
    in_scope = scope.get("in_scope") or []
    out_scope = scope.get("out_scope") or []
    customer_resp = scope.get("customer_responsibilities") or []

    # ── Role-specific response ───────────────────────────────────────────────
    if role == "cpl":
        pricing = content.get("pricing") or {}
        if isinstance(pricing, list) and pricing:
            pricing = pricing[0]
        return {
            "role": role,
            "financials": {
                "deal_value": sow["deal_value"],
                "estimated_margin": pricing.get("margin") if isinstance(pricing, dict) else None,
                "pricing_breakdown": pricing if isinstance(pricing, dict) else None,
            },
            "standards_compliance": {
                "methodology": sow["methodology"],
                "high_violations": ai_insights.get("high_violations") if ai_insights else [],
            },
            "scope_summary": {
                "in_scope_count": len(in_scope),
                "out_scope_count": len(out_scope),
                "customer_responsibilities_count": len(customer_resp),
            },
            "internal_review_summary": internal_summary,
            "ai_insights": ai_insights,
        }

    elif role == "cdp":
        deliverables = content.get("deliverables") or []
        return {
            "role": role,
            "account_info": {
                "customer_name": sow["customer_name"],
                "deal_value": sow["deal_value"],
            },
            "customer_success": {
                "deliverables_count": len(deliverables) if isinstance(deliverables, list) else 0,
                "support_transition_defined": bool(content.get("support_transition")),
                "customer_responsibilities": customer_resp,
            },
            "internal_review_summary": internal_summary,
            "ai_insights": ai_insights,
        }

    else:  # delivery-manager
        resources = content.get("resources") or []
        risks = content.get("risks") or []
        timeline = content.get("timeline") or {}
        high_risks = [r for r in risks if isinstance(r, dict) and r.get("level") == "high"]
        has_mitigations = any(r.get("mitigation") for r in risks if isinstance(r, dict))
        return {
            "role": role,
            "delivery_plan": {
                "methodology": sow["methodology"],
                "team_structure": resources if isinstance(resources, list) else [],
                "resource_count": len(resources) if isinstance(resources, list) else 0,
            },
            "risk_register": {
                "total_risks": len(risks) if isinstance(risks, list) else 0,
                "high_risks": high_risks,
                "mitigations_defined": has_mitigations,
            },
            "timeline": timeline if isinstance(timeline, dict) else {},
            "internal_review_summary": internal_summary,
            "ai_insights": ai_insights,
        }


# ── POST /api/review/{sow_id}/send-back ──────────────────────────────────────


@router.post(
    "/{sow_id}/send-back",
    summary="Return a SoW to a previous stage with feedback",
)
async def send_back(
    sow_id: int,
    payload: SendBackPayload,
    current_user: CurrentUser,
) -> dict:
    """Send a SoW back to an earlier stage defined by ``on_send_back``
    transitions in the workflow template.

    Clears pending assignments at the current stage, records an audit entry,
    and creates new assignments at the target stage if it requires reviewers.
    """
    from services.workflow_engine import (
        execute_transition,
        get_valid_send_back_targets,
    )

    if not payload.comments:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comments are required for send-back",
        )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        sow = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        current_stage = sow["status"]

        # Validate target_stage against workflow-defined send-back targets
        valid_targets = await get_valid_send_back_targets(conn, sow_id, current_stage)
        valid_keys = {t["stage_key"] for t in valid_targets}
        if payload.target_stage not in valid_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid target_stage '{payload.target_stage}'. Valid targets: {sorted(valid_keys)}",
            )

        # Find the reviewer's assignment at the current stage
        assignment = await conn.fetchrow(
            """SELECT * FROM review_assignments
               WHERE sow_id = $1 AND user_id = $2
                 AND status IN ('pending', 'in_progress')
               ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END
               LIMIT 1""",
            sow_id,
            current_user.id,
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active assignment found",
            )

        now = datetime.now(UTC)

        # Mark the submitter's assignment as completed/rejected
        await conn.execute(
            """
            UPDATE review_assignments
            SET    status       = 'completed',
                   decision     = 'rejected',
                   comments     = $1,
                   completed_at = $2
            WHERE  id = $3
            """,
            payload.comments,
            now,
            assignment["id"],
        )

        # Cancel other pending assignments at the current stage
        await conn.execute(
            """
            UPDATE review_assignments
            SET    status = 'canceled'
            WHERE  sow_id   = $1
              AND  id      != $2
              AND  stage    = $3
              AND  status  IN ('pending', 'in_progress')
            """,
            sow_id,
            assignment["id"],
            assignment["stage"],
        )

        # Audit entry
        await conn.execute(
            """
            INSERT INTO review_results
                (sow_id, reviewer, score, findings, reviewed_at,
                 reviewer_user_id, review_stage, checklist_responses, decision, conditions)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10::jsonb)
            """,
            sow_id,
            current_user.email,
            None,
            json.dumps({"comments": payload.comments, "action_items": payload.action_items}),
            now,
            current_user.id,
            assignment["stage"],
            json.dumps([]),
            "rejected",
            None,
        )

        # Execute the transition to the target stage (handles status update,
        # assignment creation for review/approval targets, and history).
        esap = sow["esap_level"] or "type-3"
        await execute_transition(
            conn, sow_id, payload.target_stage, current_user.id, esap, payload.comments
        )

    return {"sent_back": True, "sow_id": sow_id, "target_stage": payload.target_stage}
