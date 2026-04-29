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
    AssignmentChecklistResponse,
    ChecklistItemModel,
    ReviewAssignmentStatusSummary,
    ReviewAssignmentSummary,
    ReviewChecklistResponse,
    ReviewProgressPayload,
    ReviewStatus,
    ReviewSubmitPayload,
    SendBackPayload,
)
from services.workflow_engine import (
    _is_role_active,
    _load_sow_microsoft_metadata,
)
from utils.db_helpers import (
    insert_history,
    record_review_result,
    safe_json,
)
from utils.role_labels import ROLE_DISPLAY_NAMES as _ROLE_DISPLAY_NAMES

router = APIRouter(prefix="/api/review", tags=["review"])

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
    sow_meta = await _load_sow_microsoft_metadata(conn, sow_id)
    for stage in data.get("stages", []):
        if stage["stage_key"] == stage_key:
            return [
                role["role_key"]
                for role in stage.get("roles", [])
                if _is_role_active(role, esap_level, sow_meta)
            ]
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


# ── Per-role checklist (workflow-driven) ─────────────────────────────────────


async def _get_role_checklist_config(conn, assignment: dict) -> dict | None:
    """Find the WorkflowStageRoleConfig matching this assignment.

    Reads the per-SoW workflow snapshot in ``sow_workflow.workflow_data`` so
    in-flight reviews stay pinned to the workflow contract that was in
    effect when the SoW entered review (later template edits don't shift
    the rules under their feet).

    Returns ``{"checklist_mode": str, "checklist_items": list, "is_required": bool}``
    or ``None`` if no role row matches (legacy/seeded SoWs without snapshots).
    """
    from services.workflow_engine import _stage_key_from_assignment_stage

    row = await conn.fetchrow(
        "SELECT workflow_data FROM sow_workflow WHERE sow_id = $1",
        assignment["sow_id"],
    )
    if not row:
        return None
    raw = row["workflow_data"]
    wd = raw if isinstance(raw, dict) else json.loads(raw)

    stage_key = _stage_key_from_assignment_stage(wd, assignment["stage"]) or assignment["stage"]
    target_role = assignment["reviewer_role"]
    for stage in wd.get("stages", []):
        if stage.get("stage_key") != stage_key:
            continue
        for role in stage.get("roles", []):
            if role.get("role_key") == target_role:
                return {
                    "checklist_mode": role.get("checklist_mode") or "ai",
                    "checklist_items": role.get("checklist_items") or [],
                    "is_required": role.get("is_required", True),
                }
    return None


async def _fetch_sow_for_checklist(conn, sow_id: int) -> dict:
    """Pull the SoW row used as the AI generation context."""
    row = await conn.fetchrow(
        "SELECT id, title, content, methodology, deal_value FROM sow_documents WHERE id = $1",
        sow_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SoW for assignment not found",
        )
    raw_content = row["content"]
    if isinstance(raw_content, str):
        try:
            content = json.loads(raw_content)
        except json.JSONDecodeError:
            content = {}
    elif isinstance(raw_content, dict):
        content = raw_content
    else:
        content = {}
    return {
        "id": row["id"],
        "title": row["title"],
        "content": content,
        "methodology": row["methodology"],
        "deal_value": row["deal_value"],
    }


async def _generate_ai_checklist_items(
    *,
    sow: dict,
    role_key: str,
    role_display: str,
    seed_items: list[dict],
    current_user: CurrentUser,
) -> list[dict]:
    """Call the ML service to generate checklist items grounded in the SoW.

    Returns a list of ``{"id": str, "text": str}`` dicts. Raises
    HTTPException(503) if the ML service is unavailable — callers handle
    that the same way other AI endpoints do.
    """
    from utils.sow_text import flatten_sow_content

    from routers.ai import _proxy_post  # local import to avoid circular

    flattened = flatten_sow_content(sow.get("content"))
    body = {
        "sow_id": sow.get("id"),
        "sow_title": sow.get("title"),
        "sow_content": flattened,
        "role_key": role_key,
        "role_display": role_display,
        "seed_items": [
            {"id": item.get("id"), "text": item.get("text")}
            for item in (seed_items or [])
            if item.get("text")
        ],
    }
    raw = await _proxy_post("/assist/checklist", json_body=body, timeout=45.0, user=current_user)
    items = raw.get("items") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        return []
    out: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        text = (item.get("text") or "").strip()
        if not text:
            continue
        item_id = (item.get("id") or "").strip()
        if not item_id:
            import uuid

            item_id = f"ai-{uuid.uuid4().hex[:12]}"
        out.append({"id": item_id, "text": text})
    return out


def _items_for_response(items: list[dict], category_label: str) -> list[ChecklistItemModel]:
    """Wrap raw {id, text} dicts in ChecklistItemModel with a default
    category so the existing reviewer UI keeps grouping cleanly."""
    out: list[ChecklistItemModel] = []
    for item in items:
        out.append(
            ChecklistItemModel(
                id=str(item.get("id") or ""),
                text=str(item.get("text") or ""),
                required=False,
                category=category_label,
                helpText=None,
            )
        )
    return out


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
    """Return all review assignments for the current user, joined with SoW summary data.

    The only mandatory predicate is ``ra.user_id = current_user.id`` — if a
    row exists with the caller as the assignee, they see it regardless of
    their stored ``users.role``. The reviewer panel explicitly supports
    self-designation across roles (a consultant author can designate
    themselves as a Solution Architect for their own SoW), so filtering by
    ``users.role`` would mask those legitimate assignments. Optional
    ``stage`` / ``status`` query params still narrow further.
    """
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

    Routes through the same workflow-driven flow as ``/assignment/{id}/checklist``
    so the author's per-role configuration applies on legacy SoW-id-scoped
    pages too. Picks the most relevant assignment when the user has more
    than one (pending → in_progress → other) so reviewers with multi-role
    assignments cycle through them.
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

    full = await get_assignment_checklist(assignment["id"], current_user)
    return ReviewChecklistResponse(
        reviewer_role=full.reviewer_role,
        display_name=full.display_name,
        focus_areas=full.focus_areas,
        items=full.items,
        saved_responses=full.saved_responses,
        comments=full.comments,
        mode=full.mode,
        sow_changed=full.sow_changed,
        generated_at=full.generated_at,
        assignment_id=full.assignment_id,
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


# ── Submit-decision shared helpers ───────────────────────────────────────────
#
# ``submit_review`` (legacy, sow-id-scoped) and ``submit_assignment_review``
# (assignment-id-scoped) share the bulk of their logic — payload validation,
# persistence, audit rows, parallel-aware rejection routing, COA creation,
# and post-decision auto-advance.  These helpers extract that shared core so
# both endpoints stay thin and a bug fix to the decision flow only needs to
# land in one place.  Each endpoint is still responsible for fetching its own
# assignment row (legacy by ``(sow_id, user_id)``, new by assignment id with
# auth) and any endpoint-specific guard rails before delegating here.


def _validate_decision_payload(payload: ReviewSubmitPayload) -> None:
    """Shape-check a submitted review decision.  Raises HTTPException on bad input."""
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


async def _apply_review_decision(
    conn,
    *,
    assignment: dict,
    payload: ReviewSubmitPayload,
    current_user,
) -> None:
    """Persist a submitted review decision against ``assignment``.

    Caller is responsible for:
      - opening a transaction on ``conn``
      - having validated the payload via ``_validate_decision_payload``
      - having authorized ``current_user`` to act on this assignment

    Performs (in order, all on the caller's transaction):
      1. SoW lookup + reviewable-stage check (resolves the effective stage
         when the SoW is sitting on a parallel gateway).
      2. Required-checklist completeness check (only for approving decisions).
      3. ``UPDATE review_assignments SET status='completed', ...``
      4. ``INSERT review_results`` audit row.
      5. ``insert_history`` audit row.
      6. Rejection branch — parallel-aware sibling cancellation +
         ``execute_transition`` to the ``on_reject`` target.
      7. Auto-create rows in ``conditions_of_approval`` for
         ``approved-with-conditions`` decisions.

    Auto-advance is intentionally NOT performed here — it must run in a
    fresh transaction so callers can release write locks first.  Use
    ``_post_decision_auto_advance`` after this returns.
    """
    # Lazy-imported to avoid a circular dependency between this router and
    # ``services.workflow_engine``.
    from services.workflow_engine import (
        execute_transition,
        resolve_effective_review_stage,
        resolve_transition,
    )

    sow_id = assignment["sow_id"]
    sow = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
    if not sow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")

    # Verify the SoW is in a reviewable stage.  When the SoW is sitting on a
    # parallel gateway, ``sow.status`` is the gateway key (NOT a review or
    # approval type), but the reviewer is legitimately acting on one of the
    # active branches; resolve the branch stage via the assignment's
    # ``stage`` field so the type-check passes.
    effective_stage_key, current_stage_cfg = await resolve_effective_review_stage(
        conn, sow_id, assignment["stage"], sow["status"]
    )
    reviewable_types = ("review", "approval")
    if not current_stage_cfg or current_stage_cfg.get("stage_type") not in reviewable_types:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"SoW is in '{sow['status']}' status — cannot submit a review "
                f"(assignment stage '{assignment['stage']}' does not map to an "
                "active reviewable branch)."
            ),
        )

    # For approving decisions: every required checklist item must be checked.
    # Source the required-item set from the same workflow-snapshot-aware
    # config the reviewer's checklist UI uses (``_get_role_checklist_config``).
    # The static ``_load_checklist`` returns ``items: []`` for any role not in
    # ``review-checklists.json`` (e.g. Microsoft Default Workflow roles like
    # ``responsible-ai-lead``), which would silently pass the gate.
    if payload.decision in ("approved", "approved-with-conditions"):
        role_cfg = await _get_role_checklist_config(conn, assignment)
        configured_mode = (role_cfg or {}).get("checklist_mode")
        required_ids: set[str] = set()

        if configured_mode == "manual":
            # Manual mode: every author-curated item is required.
            seed_items = (role_cfg or {}).get("checklist_items") or []
            required_ids = {
                str(item.get("id"))
                for item in seed_items
                if item.get("id") is not None and (item.get("text") or "").strip()
            }
        elif configured_mode == "ai":
            # AI mode: the per-assignment cache holds the exact items the
            # reviewer was shown. Every cached item is required.
            cache_row = await conn.fetchrow(
                "SELECT items FROM reviewer_checklist_cache WHERE assignment_id = $1",
                assignment["id"],
            )
            if cache_row is not None:
                raw_items = cache_row["items"]
                if isinstance(raw_items, str):
                    raw_items = json.loads(raw_items)
                if isinstance(raw_items, list):
                    required_ids = {
                        str(item.get("id")) for item in raw_items if item.get("id") is not None
                    }

        if not required_ids:
            # Legacy SoW with no workflow snapshot, or AI mode with no cache
            # yet. Fall back to the hardcoded checklist's `required` flag.
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

    # Audit trail row in review_results.  ``reviewer_user_id`` records the
    # actor; for system-admins acting on someone else's assignment this is
    # the admin (not the assigned user).
    await record_review_result(
        conn,
        sow_id=sow_id,
        reviewer_email=current_user.email,
        reviewer_user_id=current_user.id,
        review_stage=assignment["stage"],
        decision=payload.decision,
        comments=payload.comments,
        checklist_responses=payload.checklist_responses,
        conditions=payload.conditions,
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
            "assignment_id": assignment["id"],
        },
    )

    # Rejection: route to the on_reject target and cancel sibling
    # assignments.  When the SoW is on a parallel gateway, reject
    # semantically terminates the *whole* parallel group (not just the
    # current branch), so:
    #   - resolve on_reject from the effective branch stage (the reviewer's
    #     real stage), not the gateway.
    #   - cancel pending assignments across ALL active branches so sibling
    #     reviewers can't keep working on a rejected SoW.
    #   - clear sow_workflow.parallel_branches so the next transition
    #     doesn't try to join a dead group.
    if payload.decision == "rejected":
        target = await resolve_transition(conn, sow_id, effective_stage_key, "on_reject")
        target_key = target["stage_key"] if target else "draft"

        is_parallel = effective_stage_key != sow["status"]
        if is_parallel:
            await conn.execute(
                """
                UPDATE review_assignments
                SET    status = 'canceled'
                WHERE  sow_id  = $1
                  AND  id     != $2
                  AND  status IN ('pending', 'in_progress')
                """,
                sow_id,
                assignment["id"],
            )
            await conn.execute(
                """
                UPDATE sow_workflow
                SET    parallel_branches = NULL, updated_at = NOW()
                WHERE  sow_id = $1
                """,
                sow_id,
            )
        else:
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
        await execute_transition(conn, sow_id, target_key, current_user.id, esap, payload.comments)

    # Auto-create COA rows for approved-with-conditions decisions.  The
    # JSONB in review_assignments.conditions is preserved for backward
    # compatibility; COA rows give structured tracking.
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


async def _post_decision_auto_advance(sow_id: int, current_user_id: int) -> dict:
    """Run the post-decision auto-advance recheck in a fresh transaction.

    Returns a dict with ``auto_advanced`` / ``parallel_branch_completed``
    keys to merge into the route response.  An empty dict means nothing
    changed (gating still unsatisfied or auto_advance opted out).

    Runs in a fresh connection so the caller's submit-decision transaction
    has been committed and released its write locks before
    ``recheck_and_maybe_advance`` re-evaluates gating.
    """
    from services.workflow_engine import recheck_and_maybe_advance

    extra: dict = {}
    async with database.pg_pool.acquire() as conn, conn.transaction():
        advance = await recheck_and_maybe_advance(conn, sow_id, current_user_id)

    if advance["advanced"]:
        extra["auto_advanced"] = True
        extra["new_status"] = advance["new_status"]
        extra["assigned_roles"] = advance["assigned_roles"]
    elif advance["parallel_branch_completed"]:
        extra["parallel_branch_completed"] = True
        extra["branch_stage"] = advance["branch_stage"]

    return extra


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
    - SoW status returns to ``draft`` (or the configured ``on_reject`` target).
    - Other pending/in-progress assignments at this stage are canceled.

    Legacy SoW-id-scoped endpoint.  Resolves the user's most relevant
    assignment (pending → in_progress → other) and delegates to
    ``_apply_review_decision`` for the actual persistence.  Prefer the
    assignment-id-scoped ``/assignment/{id}/submit`` for new clients.
    """
    _validate_decision_payload(payload)

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

        await _apply_review_decision(
            conn,
            assignment=dict(assignment),
            payload=payload,
            current_user=current_user,
        )

    result: dict = {"decision": payload.decision, "sow_id": sow_id}
    if payload.decision in ("approved", "approved-with-conditions"):
        result.update(await _post_decision_auto_advance(sow_id, current_user.id))
    return result


# ── Assignment-id-scoped review endpoints ───────────────────────────────────
#
# These endpoints key off ``review_assignments.id`` instead of
# ``(sow_id, user_id)`` so that a user holding multiple roles on the same SoW
# can open and submit each assignment independently.  The legacy
# ``/{sow_id}/...`` endpoints above remain for backward compatibility.


async def _load_authorized_assignment(conn, assignment_id: int, current_user) -> dict:
    """Fetch an assignment row and verify the caller is allowed to act on it.

    Authorization: the assignment must belong to the current user OR the
    current user must hold the ``system-admin`` role.  Raises 404 (not 403)
    so unauthorized callers can't probe for assignment ids.
    """
    assignment = await conn.fetchrow(
        "SELECT * FROM review_assignments WHERE id = $1",
        assignment_id,
    )
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    is_admin = (current_user.role or "").lower() == "system-admin"
    if assignment["user_id"] != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    return dict(assignment)


@router.get(
    "/assignment/{assignment_id}/checklist",
    response_model=AssignmentChecklistResponse,
    summary="Get the role-specific checklist for a specific assignment",
)
async def get_assignment_checklist(
    assignment_id: int,
    current_user: CurrentUser,
) -> AssignmentChecklistResponse:
    """Return the checklist + saved responses for one assignment id.

    Three sources, in priority order:

    1. ``reviewer_checklist_cache`` row matching this assignment — used as-is
       when the cached mode still matches the workflow config.
    2. The workflow snapshot's role config: ``manual`` → return the author's
       items verbatim; ``ai`` → call the ML service, persist to cache, return.
    3. Legacy ``review-checklists.json`` fallback when no workflow config is
       attached (used by SoWs created before checklist authoring shipped, or
       when AI is configured but seed items aren't enough and ML is offline).

    Each reviewer's cached row is independent — parallel reviewers on the
    same role get their own AI-generated lists, and a manual list is shared
    by-id so checked state survives author edits to the seed items.
    """
    from utils.sow_text import hash_sow_content

    async with database.pg_pool.acquire() as conn:
        assignment = await _load_authorized_assignment(conn, assignment_id, current_user)

        role = assignment["reviewer_role"]
        role_display = _ROLE_DISPLAY_NAMES.get(role, role)
        role_cfg = await _get_role_checklist_config(conn, assignment)
        sow = await _fetch_sow_for_checklist(conn, assignment["sow_id"])
        current_hash = hash_sow_content(sow["content"])

        cache_row = await conn.fetchrow(
            "SELECT mode, items, sow_content_hash, generated_at "
            "FROM reviewer_checklist_cache WHERE assignment_id = $1",
            assignment_id,
        )

        configured_mode = (role_cfg or {}).get("checklist_mode")
        seed_items = (role_cfg or {}).get("checklist_items") or []

        cached_items: list[dict] | None = None
        cached_mode: str | None = None
        cached_hash: str | None = None
        cached_gen_at = None
        if cache_row is not None:
            cached_mode = cache_row["mode"]
            raw_items = cache_row["items"]
            if isinstance(raw_items, str):
                raw_items = json.loads(raw_items)
            cached_items = raw_items if isinstance(raw_items, list) else []
            cached_hash = cache_row["sow_content_hash"]
            cached_gen_at = cache_row["generated_at"]

        # Decide what to serve.
        items: list[dict] = []
        mode: str = "legacy"
        focus_areas: list[str] = []
        category_label = "Review"
        generated_at = cached_gen_at

        # Cache hit when the stored mode still matches the configured mode.
        cache_valid = (
            cached_items is not None
            and configured_mode is not None
            and cached_mode == configured_mode
        )

        if cache_valid:
            items = cached_items or []
            mode = cached_mode or "ai"
        elif configured_mode == "manual":
            mode = "manual"
            if seed_items:
                items = [
                    {"id": str(it.get("id")), "text": str(it.get("text") or "")}
                    for it in seed_items
                    if (it.get("text") or "").strip()
                ]
            else:
                # Empty manual list — fall back to legacy hardcoded items so
                # the reviewer is never stranded with a blank screen while
                # the author iterates on their list.
                legacy = _load_checklist(role)
                items = [
                    {"id": item["id"], "text": item["text"]} for item in legacy.get("items", [])
                ]
                focus_areas = legacy.get("focusAreas", []) or []
                role_display = legacy.get("displayName", role_display)
                mode = "legacy"
            await _upsert_checklist_cache(
                conn,
                assignment_id=assignment_id,
                role_key=role,
                mode=mode,
                items=items,
                content_hash=current_hash,
            )
        elif configured_mode == "ai":
            try:
                items = await _generate_ai_checklist_items(
                    sow=sow,
                    role_key=role,
                    role_display=role_display,
                    seed_items=seed_items,
                    current_user=current_user,
                )
                mode = "ai"
                await _upsert_checklist_cache(
                    conn,
                    assignment_id=assignment_id,
                    role_key=role,
                    mode=mode,
                    items=items,
                    content_hash=current_hash,
                )
                generated_at = datetime.now(UTC)
            except HTTPException:
                # ML offline — degrade to seeds (if any) or legacy hardcoded
                # so the reviewer can still work. We deliberately do NOT
                # cache this fallback; the next load will retry the LLM.
                if seed_items:
                    items = [
                        {"id": str(it.get("id")), "text": str(it.get("text") or "")}
                        for it in seed_items
                        if (it.get("text") or "").strip()
                    ]
                    mode = "manual"
                else:
                    legacy = _load_checklist(role)
                    items = [
                        {"id": item["id"], "text": item["text"]} for item in legacy.get("items", [])
                    ]
                    focus_areas = legacy.get("focusAreas", []) or []
                    role_display = legacy.get("displayName", role_display)
                    mode = "legacy"
        else:
            # No workflow snapshot found at all — use the hardcoded fallback.
            legacy = _load_checklist(role)
            items = [{"id": item["id"], "text": item["text"]} for item in legacy.get("items", [])]
            focus_areas = legacy.get("focusAreas", []) or []
            role_display = legacy.get("displayName", role_display)
            mode = "legacy"

        saved = assignment["checklist_responses"]
        if isinstance(saved, str):
            saved = json.loads(saved)

        sow_changed = bool(cached_hash and cached_hash != current_hash and cache_valid)

    return AssignmentChecklistResponse(
        reviewer_role=role,
        display_name=role_display,
        focus_areas=focus_areas,
        items=_items_for_response(items, category_label),
        saved_responses=saved,
        comments=assignment["comments"],
        assignment_id=assignment["id"],
        sow_id=assignment["sow_id"],
        user_id=assignment["user_id"],
        stage=assignment["stage"],
        assignment_status=assignment["status"],
        decision=assignment["decision"],
        mode=mode,
        sow_changed=sow_changed,
        generated_at=generated_at,
    )


async def _upsert_checklist_cache(
    conn,
    *,
    assignment_id: int,
    role_key: str,
    mode: str,
    items: list[dict],
    content_hash: str,
) -> None:
    """Insert-or-update the per-assignment checklist cache row."""
    await conn.execute(
        """
        INSERT INTO reviewer_checklist_cache
            (assignment_id, role_key, mode, items, sow_content_hash, generated_at)
        VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
        ON CONFLICT (assignment_id) DO UPDATE
        SET role_key         = EXCLUDED.role_key,
            mode             = EXCLUDED.mode,
            items            = EXCLUDED.items,
            sow_content_hash = EXCLUDED.sow_content_hash,
            generated_at     = EXCLUDED.generated_at
        """,
        assignment_id,
        role_key,
        mode,
        json.dumps(items),
        content_hash,
    )


@router.post(
    "/assignment/{assignment_id}/checklist/regenerate",
    response_model=AssignmentChecklistResponse,
    summary="Regenerate the AI checklist for a specific assignment",
)
async def regenerate_assignment_checklist(
    assignment_id: int,
    current_user: CurrentUser,
) -> AssignmentChecklistResponse:
    """Force a fresh AI generation, overwriting the cache row.

    Only valid when the workflow role is configured for ``ai`` mode. Manual
    roles return 409 because there is nothing to regenerate — the items are
    authored upstream in the workflow editor.
    """
    from utils.sow_text import hash_sow_content

    async with database.pg_pool.acquire() as conn:
        assignment = await _load_authorized_assignment(conn, assignment_id, current_user)
        role = assignment["reviewer_role"]
        role_display = _ROLE_DISPLAY_NAMES.get(role, role)
        role_cfg = await _get_role_checklist_config(conn, assignment)
        configured_mode = (role_cfg or {}).get("checklist_mode") or "ai"
        if configured_mode != "ai":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This role is configured with a manual checklist; nothing to regenerate.",
            )
        seed_items = (role_cfg or {}).get("checklist_items") or []
        sow = await _fetch_sow_for_checklist(conn, assignment["sow_id"])
        current_hash = hash_sow_content(sow["content"])

        items = await _generate_ai_checklist_items(
            sow=sow,
            role_key=role,
            role_display=role_display,
            seed_items=seed_items,
            current_user=current_user,
        )
        await _upsert_checklist_cache(
            conn,
            assignment_id=assignment_id,
            role_key=role,
            mode="ai",
            items=items,
            content_hash=current_hash,
        )

        saved = assignment["checklist_responses"]
        if isinstance(saved, str):
            saved = json.loads(saved)

    return AssignmentChecklistResponse(
        reviewer_role=role,
        display_name=role_display,
        focus_areas=[],
        items=_items_for_response(items, "Review"),
        saved_responses=saved,
        comments=assignment["comments"],
        assignment_id=assignment["id"],
        sow_id=assignment["sow_id"],
        user_id=assignment["user_id"],
        stage=assignment["stage"],
        assignment_status=assignment["status"],
        decision=assignment["decision"],
        mode="ai",
        sow_changed=False,
        generated_at=datetime.now(UTC),
    )


@router.post(
    "/assignment/{assignment_id}/save-progress",
    summary="Save partial checklist progress for a specific assignment",
)
async def save_assignment_progress(
    assignment_id: int,
    payload: ReviewProgressPayload,
    current_user: CurrentUser,
) -> dict:
    """Persist checklist + comments without finalizing.  Pending → in_progress."""
    async with database.pg_pool.acquire() as conn:
        assignment = await _load_authorized_assignment(conn, assignment_id, current_user)
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
            assignment_id,
        )
    return {"saved": True}


@router.post(
    "/assignment/{assignment_id}/submit",
    summary="Submit a final review decision for a specific assignment",
)
async def submit_assignment_review(
    assignment_id: int,
    payload: ReviewSubmitPayload,
    current_user: CurrentUser,
) -> dict:
    """Submit a decision (``approved``, ``rejected``, ``approved-with-conditions``)
    for one assignment.  Mirrors the legacy ``/{sow_id}/submit`` flow but
    keys off the assignment id, so each role's review can be submitted
    independently even when one user holds multiple roles on the same SoW.

    Unlike the legacy endpoint, this rejects re-submission of an already
    completed/canceled assignment with 409.  All other persistence,
    rejection routing, and COA logic is shared via ``_apply_review_decision``.
    """
    _validate_decision_payload(payload)

    async with database.pg_pool.acquire() as conn, conn.transaction():
        assignment = await _load_authorized_assignment(conn, assignment_id, current_user)

        if assignment["status"] == "completed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This assignment has already been submitted",
            )
        if assignment["status"] == "canceled":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This assignment was canceled and cannot be submitted",
            )

        await _apply_review_decision(
            conn,
            assignment=assignment,
            payload=payload,
            current_user=current_user,
        )

    sow_id = assignment["sow_id"]
    result: dict = {"decision": payload.decision, "sow_id": sow_id, "assignment_id": assignment_id}
    if payload.decision in ("approved", "approved-with-conditions"):
        result.update(await _post_decision_auto_advance(sow_id, current_user.id))
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

    Parallel gateways
    -----------------
    When the SoW sits on a ``parallel_gateway``, gating is aggregated across
    every still-active branch:

    * ``gating_rules_met`` is ``True`` iff **every** active branch has met
      its own gating rules (conservative "all_required" semantics — the
      actual join decision happens on the next submit/advance call which
      can honor non-default ``join_mode`` via :func:`check_join_requirements`).
    * ``outstanding_requirements`` is the union of outstanding roles across
      every active branch so the UI can list them all at once.
    """
    from services.workflow_engine import (
        _find_stage,
        _load_parallel_branches,
        _load_workflow_data,
        check_gating_rules,
    )

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

        wd = await _load_workflow_data(conn, sow_id)
        current_cfg = _find_stage(wd, current_stage)
        is_gateway = bool(current_cfg and current_cfg.get("stage_type") == "parallel_gateway")

        if is_gateway:
            # Aggregate gating across every still-active branch. The gateway
            # itself has no roles, so calling check_gating_rules on it would
            # trivially return (True, []) and mislead the UI into thinking
            # the SoW is ready to advance when branches are still waiting.
            parallel_branches = await _load_parallel_branches(conn, sow_id)
            if not parallel_branches:
                met, outstanding_roles = False, []
            else:
                active_branches = [k for k, v in parallel_branches.items() if v != "completed"]
                all_met = True
                agg_outstanding: list[str] = []
                for branch_key in active_branches:
                    branch_cfg = _find_stage(wd, branch_key)
                    if not branch_cfg:
                        continue
                    if branch_cfg.get("stage_type") not in ("review", "approval"):
                        continue
                    branch_met, branch_outstanding = await check_gating_rules(
                        conn, sow_id, branch_key, esap
                    )
                    if not branch_met:
                        all_met = False
                        for r in branch_outstanding:
                            if r not in agg_outstanding:
                                agg_outstanding.append(r)
                met = all_met
                outstanding_roles = agg_outstanding
        else:
            # Use the dynamic gating rules engine (reads from the per-SoW
            # workflow snapshot) so custom stages work correctly.
            met, outstanding_roles = await check_gating_rules(conn, sow_id, current_stage, esap)

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

    outstanding = [
        f"{_ROLE_DISPLAY_NAMES.get(role, role)} approval pending" for role in outstanding_roles
    ]

    return ReviewStatus(
        sow_id=sow_id,
        current_stage=current_stage,
        esap_level=esap,
        assignments=assignments,
        gating_rules_met=met,
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

    Parallel gateways
    -----------------
    When the SoW is sitting on a ``parallel_gateway`` stage (i.e.
    ``sow_documents.status`` is the gateway key, not a branch key), this
    endpoint walks every *still-active* branch, verifies its gating, and
    calls :func:`complete_parallel_branch` for each one that's ready. The
    first branch whose completion triggers the join transition returns the
    resulting status; any other ready branches stay waiting until another
    advance/submit tick picks them up.

    Raises **409** if gating rules are not satisfied or no advance transition
    is defined for the current stage.
    """
    from services.workflow_engine import (
        _find_stage,
        _load_parallel_branches,
        _load_workflow_data,
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
        wd = await _load_workflow_data(conn, sow_id)
        current_cfg = _find_stage(wd, current_stage)
        is_gateway = bool(current_cfg and current_cfg.get("stage_type") == "parallel_gateway")

        # ── Parallel gateway: advance one (or more) ready branches ───────────
        if is_gateway:
            parallel_branches = await _load_parallel_branches(conn, sow_id)
            if not parallel_branches:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"SoW is at parallel gateway '{current_stage}' but no "
                        "parallel_branches tracking exists — workflow state is "
                        "inconsistent."
                    ),
                )

            active_branches = [
                k for k, v in parallel_branches.items() if v not in ("completed", "skipped")
            ]

            # Aggregate outstanding roles across every active branch so the
            # caller gets a single 409 listing everything that's still pending.
            aggregated_outstanding: list[str] = []
            any_ready = False
            for branch_key in active_branches:
                branch_cfg = _find_stage(wd, branch_key)
                if not branch_cfg:
                    continue
                if branch_cfg.get("stage_type") not in ("review", "approval"):
                    # Non-reviewable branch — treat as ready so the join picks
                    # it up. (Shouldn't really happen for parallel branches.)
                    any_ready = True
                    continue
                branch_met, branch_outstanding = await check_gating_rules(
                    conn, sow_id, branch_key, esap
                )
                if not branch_met:
                    aggregated_outstanding.extend(branch_outstanding)
                    continue
                any_ready = True

            if not any_ready:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Gating rules not met on any active parallel branch. "
                        "Pending approvals from: "
                        + ", ".join(_ROLE_DISPLAY_NAMES.get(r, r) for r in aggregated_outstanding)
                    ),
                )

            # Try to complete every ready branch; first one that triggers the
            # join returns the transition result.
            final_result: dict | None = None
            for branch_key in active_branches:
                branch_cfg = _find_stage(wd, branch_key)
                if not branch_cfg:
                    continue
                if branch_cfg.get("stage_type") in ("review", "approval"):
                    branch_met, _ = await check_gating_rules(conn, sow_id, branch_key, esap)
                    if not branch_met:
                        continue
                join_result = await complete_parallel_branch(
                    conn, sow_id, branch_key, current_user.id, esap
                )
                if join_result:
                    return join_result
                # Branch marked complete but join still waiting.
                final_result = {
                    "advanced": False,
                    "sow_id": sow_id,
                    "parallel_branch_completed": True,
                    "branch_stage": branch_key,
                    "detail": "Branch completed. Waiting for other parallel branches.",
                }

            if final_result is not None:
                return final_result

            # Shouldn't reach here — any_ready was True but nothing happened.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No advance transition defined from parallel gateway "
                    f"'{current_stage}' — workflow routing is incomplete."
                ),
            )

        # ── Single-stage advance ─────────────────────────────────────────────
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
    content = safe_json(sow["content"]) or {}

    # ── Build internal review summary ────────────────────────────────────────
    internal_summary: dict[str, Any] = {}
    for r in internal_rows:
        reviewer_role = r["reviewer_role"] or "unknown"
        key = reviewer_role.replace("-", "_")
        if key not in internal_summary:
            conditions = safe_json(r["conditions"])
            findings = safe_json(r["findings"]) or {}
            internal_summary[key] = {
                "decision": r["decision"],
                "comments": findings.get("comments"),
                "conditions": conditions,
            }

    # ── AI insights ──────────────────────────────────────────────────────────
    ai_insights: dict[str, Any] | None = None
    if ai_row:
        validation_rec = safe_json(ai_row["validation_recommendation"]) or {}
        risks_data = safe_json(ai_row["risks"]) or []
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

    Parallel gateways
    -----------------
    When the SoW sits on a ``parallel_gateway``, the caller's assignment
    identifies which branch they're actually reviewing from. Valid send-back
    targets are resolved from that **branch** stage (not the gateway), and
    every pending assignment across every active branch is canceled so
    sibling reviewers don't see a dangling task after the send-back. The
    ``parallel_branches`` tracking state is cleared too.
    """
    from services.workflow_engine import (
        execute_transition,
        get_valid_send_back_targets,
        resolve_effective_review_stage,
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

        # Find the reviewer's assignment first — we need it to resolve the
        # effective stage when the SoW is at a parallel gateway.
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

        # Resolve the effective stage (branch key if at a parallel gateway).
        effective_stage_key, _ = await resolve_effective_review_stage(
            conn, sow_id, assignment["stage"], sow["status"]
        )
        is_parallel = effective_stage_key != sow["status"]

        # Validate target_stage against workflow-defined send-back targets
        # of the **effective** stage (branch for parallel, current stage
        # otherwise). Gateways don't have on_send_back transitions — those
        # live on the individual branches.
        valid_targets = await get_valid_send_back_targets(conn, sow_id, effective_stage_key)
        valid_keys = {t["stage_key"] for t in valid_targets}
        if payload.target_stage not in valid_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid target_stage '{payload.target_stage}'. Valid targets: {sorted(valid_keys)}",
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

        if is_parallel:
            # At a parallel gateway: cancel every active assignment across
            # every branch and wipe the parallel_branches tracking so a
            # subsequent re-submission fan-out starts fresh.
            await conn.execute(
                """
                UPDATE review_assignments
                SET    status = 'canceled'
                WHERE  sow_id   = $1
                  AND  id      != $2
                  AND  status  IN ('pending', 'in_progress')
                """,
                sow_id,
                assignment["id"],
            )
            await conn.execute(
                """
                UPDATE sow_workflow
                SET    parallel_branches = NULL, updated_at = NOW()
                WHERE  sow_id = $1
                """,
                sow_id,
            )
        else:
            # Single-stage send-back: only cancel siblings at the same stage.
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

        # Audit entry — send-back is recorded as a "rejected" decision with the
        # reviewer's action_items folded into the findings JSONB column.
        await record_review_result(
            conn,
            sow_id=sow_id,
            reviewer_email=current_user.email,
            reviewer_user_id=current_user.id,
            review_stage=assignment["stage"],
            decision="rejected",
            comments=payload.comments,
            action_items=payload.action_items,
        )

        # Execute the transition to the target stage (handles status update,
        # assignment creation for review/approval targets, and history).
        esap = sow["esap_level"] or "type-3"
        await execute_transition(
            conn, sow_id, payload.target_stage, current_user.id, esap, payload.comments
        )

    return {"sent_back": True, "sow_id": sow_id, "target_stage": payload.target_stage}
