"""
Seed for the Microsoft Default Workflow template.

Idempotent: skips when a template with the same name already exists. Called
from ``main.py`` lifespan after the ESAP seed. Defines:

  Draft → AI Review → Solution Review → [parallel:
                                          Responsible AI Review,
                                          Global Dev Review,
                                          Shared Services Review]
                                       → Deal Review → Approved → Finalized

Skip-conditions on the parallel branches read from
``sow_documents.metadata.microsoft_workflow``:

  has_sensitive_ai (bool)            — drives the Responsible AI branch
  has_global_dev_staffing (bool)     — drives the Global Dev branch
  shared_services_groups (list[str]) — drives the Shared Services branch
                                       and its conditional sub-roles
"""

from __future__ import annotations

import json

TEMPLATE_NAME = "Microsoft Default Workflow"
TEMPLATE_DESCRIPTION = (
    "Microsoft default approval workflow: Solution Review, parallel "
    "Responsible AI / Global Dev / Shared Services reviews (each conditional), "
    "Deal Review, then Finalize."
)


# (stage_key, display_name, stage_order, stage_type, config)
STAGE_DEFS: list[tuple[str, str, int, str, dict]] = [
    ("draft", "Draft", 1, "draft", {}),
    ("ai_review", "AI Review", 2, "ai_analysis", {}),
    (
        "solution_review",
        "Solution Review",
        3,
        "review",
        {"assignment_stage_keys": ["solution-review"]},
    ),
    (
        "microsoft_parallel_branches",
        "Microsoft Parallel Branches",
        4,
        "parallel_gateway",
        {},
    ),
    (
        "responsible_ai_review",
        "Responsible AI Review",
        5,
        "review",
        {"assignment_stage_keys": ["responsible-ai-review"]},
    ),
    (
        "global_dev_review",
        "Global Dev Review",
        6,
        "review",
        {"assignment_stage_keys": ["global-dev-review"]},
    ),
    (
        "shared_services_review",
        "Shared Services Review",
        7,
        "review",
        {"assignment_stage_keys": ["shared-services-review"]},
    ),
    (
        "deal_review",
        "Deal Review",
        8,
        "approval",
        {"assignment_stage_keys": ["deal-review"], "join_mode": "all_required"},
    ),
    ("approved", "Approved", 9, "terminal", {}),
    ("finalized", "Finalized", 10, "terminal", {}),
    ("rejected", "Rejected", 0, "terminal", {"is_failure": True}),
]


# (stage_key, role_key, esap_levels, required_if)
ROLE_DEFS: list[tuple[str, str, list[str] | None, dict | None]] = [
    ("solution_review", "solution-reviewer", None, None),
    ("responsible_ai_review", "responsible-ai-lead", None, None),
    ("global_dev_review", "global-dev-lead", None, None),
    ("shared_services_review", "shared-services-lead", None, None),
    (
        "shared_services_review",
        "ux-services-lead",
        None,
        {"field": "shared_services_groups", "op": "contains", "value": "UX"},
    ),
    (
        "shared_services_review",
        "acm-services-lead",
        None,
        {"field": "shared_services_groups", "op": "contains", "value": "ACM"},
    ),
    (
        "shared_services_review",
        "data-ai-services-lead",
        None,
        {"field": "shared_services_groups", "op": "contains", "value": "Data & AI"},
    ),
    (
        "shared_services_review",
        "industry-solutions-lead",
        None,
        {
            "field": "shared_services_groups",
            "op": "contains",
            "value": "Industry Solutions Delivery",
        },
    ),
    ("deal_review", "cpl", None, None),
    ("deal_review", "cdp", None, None),
    ("deal_review", "delivery-manager", None, None),
]


# (from_stage, to_stage, condition, skip_condition)
TRANSITION_DEFS: list[tuple[str, str, str, dict | None]] = [
    # Forward path
    ("draft", "ai_review", "default", None),
    ("ai_review", "solution_review", "on_approve", None),
    ("solution_review", "microsoft_parallel_branches", "on_approve", None),
    # Fan-out (skip conditions read from metadata.microsoft_workflow)
    (
        "microsoft_parallel_branches",
        "responsible_ai_review",
        "default",
        {"field": "has_sensitive_ai", "op": "eq", "value": False},
    ),
    (
        "microsoft_parallel_branches",
        "global_dev_review",
        "default",
        {"field": "has_global_dev_staffing", "op": "eq", "value": False},
    ),
    (
        "microsoft_parallel_branches",
        "shared_services_review",
        "default",
        {"field": "shared_services_groups", "op": "is_empty"},
    ),
    # Join — branches converge on deal_review
    ("responsible_ai_review", "deal_review", "on_approve", None),
    ("global_dev_review", "deal_review", "on_approve", None),
    ("shared_services_review", "deal_review", "on_approve", None),
    # Approval terminal path
    ("deal_review", "approved", "on_approve", None),
    ("approved", "finalized", "default", None),
    # Send-back edges
    ("ai_review", "draft", "on_send_back", None),
    ("solution_review", "draft", "on_send_back", None),
    ("responsible_ai_review", "solution_review", "on_send_back", None),
    ("global_dev_review", "solution_review", "on_send_back", None),
    ("shared_services_review", "solution_review", "on_send_back", None),
    ("deal_review", "solution_review", "on_send_back", None),
    # Reject edges
    ("solution_review", "rejected", "on_reject", None),
    ("responsible_ai_review", "rejected", "on_reject", None),
    ("global_dev_review", "rejected", "on_reject", None),
    ("shared_services_review", "rejected", "on_reject", None),
    ("deal_review", "rejected", "on_reject", None),
    # Rework path
    ("rejected", "draft", "default", None),
]


async def seed_microsoft_default_workflow(conn) -> int | None:
    """Insert the Microsoft Default Workflow template if it does not exist.

    Returns the template id (existing or newly created), or None on failure.
    Idempotent on the template name — re-running on a populated DB is a no-op.
    """
    existing = await conn.fetchval(
        "SELECT id FROM workflow_templates WHERE name = $1", TEMPLATE_NAME
    )
    if existing:
        return existing

    template_id = await conn.fetchval(
        """
        INSERT INTO workflow_templates (name, description, is_system)
        VALUES ($1, $2, TRUE)
        RETURNING id
        """,
        TEMPLATE_NAME,
        TEMPLATE_DESCRIPTION,
    )

    stage_ids: dict[str, int] = {}
    for key, name, order, stype, cfg in STAGE_DEFS:
        sid = await conn.fetchval(
            """
            INSERT INTO workflow_template_stages
                (template_id, stage_key, display_name, stage_order, stage_type, config)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING id
            """,
            template_id,
            key,
            name,
            order,
            stype,
            json.dumps(cfg),
        )
        stage_ids[key] = sid

    for stage_key, role_key, esap_levels, required_if in ROLE_DEFS:
        await conn.execute(
            """
            INSERT INTO workflow_template_stage_roles
                (stage_id, role_key, is_required, esap_levels, required_if)
            VALUES ($1, $2, TRUE, $3, $4::jsonb)
            """,
            stage_ids[stage_key],
            role_key,
            esap_levels,
            json.dumps(required_if) if required_if else None,
        )

    for from_key, to_key, condition, skip_condition in TRANSITION_DEFS:
        await conn.execute(
            """
            INSERT INTO workflow_template_transitions
                (template_id, from_stage_key, to_stage_key, condition, skip_condition)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            """,
            template_id,
            from_key,
            to_key,
            condition,
            json.dumps(skip_condition) if skip_condition else None,
        )

    print(f"Seeded Microsoft Default Workflow template (id={template_id})")
    return template_id
