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
  POST /api/review/{sow_id}/advance        Advance from internal review → DRM review
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
}

# ── ESAP gating rules ─────────────────────────────────────────────────────────
# Mirrors esap-workflow.json logic for required approvers per stage and level.

_INTERNAL_REVIEW_REQUIRED: dict[str, list[str]] = {
    "type-1": ["solution-architect", "sqa-reviewer"],
    "type-2": ["solution-architect", "sqa-reviewer"],
    "type-3": ["solution-architect"],
}

_DRM_REQUIRED: dict[str, list[str]] = {
    "type-1": ["cpl", "cdp", "delivery-manager"],
    "type-2": ["cpl", "cdp"],
    "type-3": ["cpl"],
}

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


async def _insert_history(
    conn, sow_id: int, user_id: int, change_type: str, diff: dict | None = None
) -> None:
    await conn.execute(
        "INSERT INTO history (sow_id, changed_by, change_type, diff) VALUES ($1, $2, $3, $4::jsonb)",
        sow_id,
        user_id,
        change_type,
        json.dumps(diff) if diff else None,
    )


async def _seed_collaboration(conn, sow_id: int, user_id: int, role: str = "reviewer") -> None:
    await conn.execute(
        "INSERT INTO collaboration (sow_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        sow_id,
        user_id,
        role,
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
    query = f"""
        SELECT ra.id, ra.sow_id,
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
        ORDER BY ra.assigned_at DESC
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
        assignment = await conn.fetchrow(
            "SELECT * FROM review_assignments WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            current_user.id,
        )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No review assignment for this SoW",
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
            "SELECT * FROM review_assignments WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            current_user.id,
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No review assignment for this SoW",
            )

        new_status = "in_progress" if assignment["status"] == "pending" else assignment["status"]
        await conn.execute(
            """
            UPDATE review_assignments
            SET    checklist_responses = $1::jsonb,
                   comments            = $2,
                   status              = $3
            WHERE  sow_id  = $4
              AND  user_id = $5
            """,
            json.dumps(payload.checklist_responses),
            payload.comments,
            new_status,
            sow_id,
            current_user.id,
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
        assignment = await conn.fetchrow(
            "SELECT * FROM review_assignments WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            current_user.id,
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No review assignment for this SoW",
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

        # Mark this assignment as completed
        await conn.execute(
            """
            UPDATE review_assignments
            SET    status              = 'completed',
                   decision            = $1,
                   comments            = $2,
                   conditions          = $3::jsonb,
                   checklist_responses = $4::jsonb,
                   completed_at        = $5
            WHERE  sow_id  = $6
              AND  user_id = $7
            """,
            payload.decision,
            payload.comments,
            json.dumps(payload.conditions) if payload.conditions else None,
            json.dumps(payload.checklist_responses),
            now,
            sow_id,
            current_user.id,
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

        await _insert_history(
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

        # Rejection: send SoW back to draft and cancel peer assignments at this stage
        if payload.decision == "rejected":
            await conn.execute(
                "UPDATE sow_documents SET status = 'draft', updated_at = NOW() WHERE id = $1",
                sow_id,
            )
            await conn.execute(
                """
                UPDATE review_assignments
                SET    status = 'canceled'
                WHERE  sow_id   = $1
                  AND  user_id != $2
                  AND  status  IN ('pending', 'in_progress')
                  AND  stage    = $3
                """,
                sow_id,
                current_user.id,
                assignment["stage"],
            )
            await _insert_history(
                conn,
                sow_id,
                current_user.id,
                "sent_back_to_draft",
                {
                    "reason": payload.comments,
                    "rejected_by_role": assignment["reviewer_role"],
                },
            )

    return {"decision": payload.decision, "sow_id": sow_id}


# ── GET /api/review/{sow_id}/status ──────────────────────────────────────────


@router.get(
    "/{sow_id}/status",
    response_model=ReviewStatus,
    summary="Get the aggregated review status for a SoW",
)
async def get_review_status(sow_id: int, current_user: CurrentUser) -> ReviewStatus:
    """Return all assignments for the SoW and whether gating rules are satisfied."""
    async with database.pg_pool.acquire() as conn:
        sow = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        rows = await conn.fetch(
            "SELECT * FROM review_assignments WHERE sow_id = $1 ORDER BY assigned_at",
            sow_id,
        )

    esap = sow["esap_level"] or "type-3"
    current_stage = sow["status"]

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

    # Determine which stage's gating rules to evaluate
    if current_stage == "internal_review":
        stage_key = "internal-review"
        required_roles = _INTERNAL_REVIEW_REQUIRED.get(esap, ["solution-architect"])
    elif current_stage == "drm_review":
        stage_key = "drm-approval"
        required_roles = _DRM_REQUIRED.get(esap, ["cpl"])
    else:
        stage_key = ""
        required_roles = []

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
    summary="Advance the SoW from internal review to DRM review",
)
async def advance_to_drm(sow_id: int, current_user: CurrentUser) -> dict:
    """Check internal-review gating rules, assign DRM reviewers, advance to ``drm_review``.

    Raises **409** if not all required internal-review approvals are in.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        sow = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

        if sow["status"] != "internal_review":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SoW must be in 'internal_review' to advance; currently '{sow['status']}'",
            )

        esap = sow["esap_level"] or "type-3"
        required_roles = _INTERNAL_REVIEW_REQUIRED.get(esap, ["solution-architect"])

        existing = await conn.fetch(
            "SELECT * FROM review_assignments WHERE sow_id = $1 AND stage = 'internal-review'",
            sow_id,
        )
        completed_roles = {
            r["reviewer_role"]
            for r in existing
            if r["status"] == "completed"
            and r["decision"] in ("approved", "approved-with-conditions")
        }
        outstanding = [role for role in required_roles if role not in completed_roles]
        if outstanding:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Gating rules not met. Pending approvals from: "
                    + ", ".join(_ROLE_DISPLAY_NAMES.get(r, r) for r in outstanding)
                ),
            )

        # Assign DRM reviewers
        drm_roles = _DRM_REQUIRED.get(esap, ["cpl"])
        assigned: list[str] = []
        for role in drm_roles:
            reviewer = await conn.fetchrow(
                "SELECT id FROM users WHERE role = $1 AND is_active = TRUE LIMIT 1",
                role,
            )
            if reviewer:
                await conn.execute(
                    """
                    INSERT INTO review_assignments (sow_id, user_id, reviewer_role, stage)
                    VALUES ($1, $2, $3, 'drm-approval')
                    ON CONFLICT DO NOTHING
                    """,
                    sow_id,
                    reviewer["id"],
                    role,
                )
                await _seed_collaboration(conn, sow_id, reviewer["id"], "approver")
                assigned.append(role)

        # Advance status
        await conn.execute(
            "UPDATE sow_documents SET status = 'drm_review', updated_at = NOW() WHERE id = $1",
            sow_id,
        )
        await _insert_history(
            conn,
            sow_id,
            current_user.id,
            "advanced_to_drm",
            {"esap_level": esap, "assigned_drm_roles": assigned},
        )

    return {"advanced": True, "sow_id": sow_id, "assigned_roles": assigned}
