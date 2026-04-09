"""
Workflow routing engine — resolves transitions, checks gating rules,
and executes stage changes based on the per-SoW workflow snapshot.

Replaces the hardcoded advance/reject/send-back logic that was previously
inline in ``routers/review.py``.  All functions expect an already-acquired
``asyncpg`` connection so they can participate in the caller's transaction.
"""

from __future__ import annotations

import json
from typing import Any

from utils.db_helpers import (
    create_assignment_with_prior,
    insert_history,
    seed_collaboration,
)

# ── Snapshot loading ────────────────────────────────────────────────────────


async def _load_workflow_data(conn, sow_id: int) -> dict:
    """Load the JSONB workflow snapshot for a SoW."""
    row = await conn.fetchrow(
        "SELECT workflow_data FROM sow_workflow WHERE sow_id = $1",
        sow_id,
    )
    if not row:
        return {"stages": [], "transitions": []}
    wd = row["workflow_data"]
    if isinstance(wd, str):
        return json.loads(wd)
    return wd if isinstance(wd, dict) else {}


def _find_stage(workflow_data: dict, stage_key: str) -> dict | None:
    """Look up a stage config from the workflow snapshot by key."""
    for s in workflow_data.get("stages", []):
        if s.get("stage_key") == stage_key:
            return s
    return None


# ── Transition resolution ──────────────────────────────────────────────────


async def resolve_transition(
    conn,
    sow_id: int,
    current_stage: str,
    condition: str,
) -> dict | None:
    """Find the target stage for a transition from *current_stage* with the
    given *condition*.

    Reads from the per-SoW ``sow_workflow.workflow_data`` JSONB snapshot (NOT
    the template), so in-flight SoWs are unaffected by template edits.

    Returns the target stage config dict, or ``None`` if no matching
    transition exists.
    """
    wd = await _load_workflow_data(conn, sow_id)
    transitions = wd.get("transitions", [])

    # Find transitions matching (current_stage, condition)
    for t in transitions:
        if t.get("from_stage") == current_stage and t.get("condition") == condition:
            target = _find_stage(wd, t["to_stage"])
            if target:
                return target

    return None


async def resolve_transition_target_key(
    conn,
    sow_id: int,
    current_stage: str,
    condition: str,
) -> str | None:
    """Like :func:`resolve_transition` but returns just the target stage_key."""
    target = await resolve_transition(conn, sow_id, current_stage, condition)
    return target["stage_key"] if target else None


async def get_valid_send_back_targets(
    conn,
    sow_id: int,
    current_stage: str,
) -> list[dict]:
    """Return all stages reachable via ``on_send_back`` transitions from *current_stage*.

    Always includes ``draft`` as a safety fallback.
    """
    wd = await _load_workflow_data(conn, sow_id)
    transitions = wd.get("transitions", [])

    targets: list[dict] = []
    seen: set[str] = set()
    for t in transitions:
        if (
            t.get("from_stage") == current_stage
            and t.get("condition") == "on_send_back"
            and t.get("to_stage") not in seen
        ):
            stage = _find_stage(wd, t["to_stage"])
            if stage:
                targets.append(
                    {
                        "stage_key": stage["stage_key"],
                        "display_name": stage.get("display_name", stage["stage_key"]),
                    }
                )
                seen.add(stage["stage_key"])

    # Fallback: resolve from stage config.send_back_target if no explicit
    # on_send_back transitions exist in the data.
    if not targets:
        stage = _find_stage(wd, current_stage)
        if stage:
            sbt = (stage.get("config") or {}).get("send_back_target", "draft")
            if sbt == "previous":
                ordered = sorted(
                    [s for s in wd.get("stages", []) if s.get("stage_key") != "rejected"],
                    key=lambda s: s.get("stage_order", 0),
                )
                idx = next(
                    (i for i, s in enumerate(ordered) if s["stage_key"] == current_stage),
                    -1,
                )
                sbt = ordered[idx - 1]["stage_key"] if idx > 0 else "draft"
            target_stage = _find_stage(wd, sbt)
            if target_stage and sbt not in seen:
                targets.append(
                    {
                        "stage_key": sbt,
                        "display_name": target_stage.get("display_name", sbt),
                    }
                )
                seen.add(sbt)

    # Always include draft as a fallback
    if "draft" not in seen:
        targets.append({"stage_key": "draft", "display_name": "Draft"})

    return targets


# ── Gating rules ───────────────────────────────────────────────────────────


async def check_gating_rules(
    conn,
    sow_id: int,
    stage_key: str,
    esap_level: str,
) -> tuple[bool, list[str]]:
    """Check whether approval gating rules are satisfied for *stage_key*.

    Returns ``(all_met, outstanding_roles)`` where *outstanding_roles* is a
    list of role display names still pending.

    Reads ``config.approval_mode`` from the stage:

    - ``all_must_approve`` (default) — every required role must approve
    - ``any_can_approve`` — at least one required role has approved
    - ``majority`` — more than half of required roles have approved
    - ``threshold`` — at least ``config.approval_threshold`` have approved
    """
    wd = await _load_workflow_data(conn, sow_id)
    stage = _find_stage(wd, stage_key)
    if not stage:
        return True, []

    # Determine which roles are required for this ESAP level
    required_roles: list[str] = []
    for role in stage.get("roles", []):
        if not role.get("is_required", True):
            continue
        esap_filter = role.get("esap_levels")
        if esap_filter and esap_level not in esap_filter:
            continue
        required_roles.append(role["role_key"])

    if not required_roles:
        return True, []

    # Determine assignment stage key(s) for querying review_assignments
    config = stage.get("config") or {}
    assignment_stage_keys = config.get("assignment_stage_keys", [])
    if not assignment_stage_keys:
        # Derive from stage_key: replace underscores with hyphens
        assignment_stage_keys = [stage_key.replace("_", "-")]

    # Query the latest assignment per (user, role) — ignore stale cycles
    placeholders = ", ".join(f"${i + 2}" for i in range(len(assignment_stage_keys)))
    rows = await conn.fetch(
        f"""
        SELECT DISTINCT ON (user_id, reviewer_role) *
        FROM   review_assignments
        WHERE  sow_id = $1 AND stage IN ({placeholders})
        ORDER  BY user_id, reviewer_role, assigned_at DESC
        """,
        sow_id,
        *assignment_stage_keys,
    )

    approved_roles: set[str] = set()
    for r in rows:
        if r["status"] == "completed" and r["decision"] in (
            "approved",
            "approved-with-conditions",
        ):
            approved_roles.add(r["reviewer_role"])

    approval_mode = config.get("approval_mode", "all_must_approve")
    approved_count = len(approved_roles & set(required_roles))
    total_required = len(required_roles)

    if approval_mode == "any_can_approve":
        met = approved_count >= 1
    elif approval_mode == "majority":
        met = approved_count > total_required / 2
    elif approval_mode == "threshold":
        threshold = config.get("approval_threshold", total_required)
        met = approved_count >= threshold
    else:  # all_must_approve (default)
        met = approved_count == total_required

    outstanding = [r for r in required_roles if r not in approved_roles]
    return met, outstanding


# ── Stage assignment creation ──────────────────────────────────────────────


_ROLE_DISPLAY_NAMES = {
    "solution-architect": "Solution Architect",
    "sqa-reviewer": "SQA Reviewer",
    "cpl": "Customer Practice Lead",
    "cdp": "Customer Delivery Partner",
    "delivery-manager": "Delivery Manager",
}


async def create_stage_assignments(
    conn,
    sow_id: int,
    target_stage: dict,
    esap_level: str,
    actor_user_id: int,
) -> list[str]:
    """Create review assignments for *target_stage* based on its roles config.

    Returns a list of role keys for which assignments were created.
    """
    config = target_stage.get("config") or {}
    assignment_stage_keys = config.get("assignment_stage_keys", [])
    if not assignment_stage_keys:
        assignment_stage_keys = [target_stage["stage_key"].replace("_", "-")]
    assignment_stage = assignment_stage_keys[0]

    assigned: list[str] = []
    for role in target_stage.get("roles", []):
        if not role.get("is_required", True):
            continue
        esap_filter = role.get("esap_levels")
        if esap_filter and esap_level not in esap_filter:
            continue

        role_key = role["role_key"]

        # Find a user with this role
        reviewer = await conn.fetchrow(
            "SELECT id FROM users WHERE role = $1 AND is_active = TRUE LIMIT 1",
            role_key,
        )
        if reviewer:
            await create_assignment_with_prior(
                conn,
                sow_id=sow_id,
                user_id=reviewer["id"],
                reviewer_role=role_key,
                stage=assignment_stage,
            )
            await seed_collaboration(conn, sow_id, reviewer["id"], "approver")
            assigned.append(role_key)

        # TESTING: Also assign the actor so they can walk through the full
        # pipeline solo.  Remove once proper role-based assignment is live.
        await create_assignment_with_prior(
            conn,
            sow_id=sow_id,
            user_id=actor_user_id,
            reviewer_role=role_key,
            stage=assignment_stage,
        )

    return assigned


# ── Transition execution ───────────────────────────────────────────────────


async def execute_transition(
    conn,
    sow_id: int,
    target_stage_key: str,
    actor_user_id: int,
    esap_level: str,
    reason: str | None = None,
) -> dict:
    """Execute a stage transition for the SoW.

    1. Cancel pending assignments at the current stage.
    2. Update ``sow_documents.status`` and ``sow_workflow.current_stage``.
    3. If the target is a review/approval stage, create assignments.
    4. Record an audit-trail history entry.

    Returns a result dict with ``advanced``, ``sow_id``, ``new_status``,
    and ``assigned_roles``.
    """
    # Read current stage
    sow = await conn.fetchrow("SELECT status FROM sow_documents WHERE id = $1", sow_id)
    old_stage = sow["status"] if sow else "unknown"

    # Cancel pending assignments at the current stage
    wd = await _load_workflow_data(conn, sow_id)
    current_stage_cfg = _find_stage(wd, old_stage)
    if current_stage_cfg:
        config = current_stage_cfg.get("config") or {}
        cancel_keys = config.get("assignment_stage_keys", [old_stage.replace("_", "-")])
        for key in cancel_keys:
            await conn.execute(
                """
                UPDATE review_assignments
                SET    status = 'canceled'
                WHERE  sow_id = $1
                  AND  stage  = $2
                  AND  status IN ('pending', 'in_progress')
                """,
                sow_id,
                key,
            )

    # Update SoW status and workflow current_stage
    await conn.execute(
        "UPDATE sow_documents SET status = $1, updated_at = NOW() WHERE id = $2",
        target_stage_key,
        sow_id,
    )
    await conn.execute(
        "UPDATE sow_workflow SET current_stage = $1, updated_at = NOW() WHERE sow_id = $2",
        target_stage_key,
        sow_id,
    )

    # Create assignments if the target is a review/approval stage
    assigned_roles: list[str] = []
    target_stage = _find_stage(wd, target_stage_key)
    if target_stage and target_stage.get("stage_type") in ("review", "approval"):
        assigned_roles = await create_stage_assignments(
            conn, sow_id, target_stage, esap_level, actor_user_id
        )

    # Audit trail
    diff: dict[str, Any] = {
        "old_stage": old_stage,
        "new_stage": target_stage_key,
    }
    if reason:
        diff["reason"] = reason
    if assigned_roles:
        diff["assigned_roles"] = assigned_roles

    await insert_history(
        conn,
        sow_id,
        actor_user_id,
        "stage_transition",
        diff,
    )

    # ── Parallel gateway auto-fan-out ─────────────────────────────────────
    # If the target is a parallel_gateway, immediately activate ALL of its
    # outgoing stages.  The gateway itself is transient — the SoW doesn't
    # "sit" on the gateway; it fans out to the children in the same tx.
    if target_stage and target_stage.get("stage_type") == "parallel_gateway":
        fan_out_result = await _execute_parallel_fan_out(
            conn, sow_id, target_stage_key, actor_user_id, esap_level, wd
        )
        if fan_out_result:
            return fan_out_result

    return {
        "advanced": True,
        "sow_id": sow_id,
        "new_status": target_stage_key,
        "assigned_roles": assigned_roles,
    }


# ── Parallel gateway: fan-out ─────────────────────────────────────────────


async def _execute_parallel_fan_out(
    conn,
    sow_id: int,
    gateway_key: str,
    actor_user_id: int,
    esap_level: str,
    workflow_data: dict,
) -> dict | None:
    """Fan out from a parallel gateway to all its outgoing stages.

    The gateway is a pass-through node:
      1. Identify all outgoing transitions from the gateway.
      2. For each target that is a review/approval stage, create assignments.
      3. Store the parallel branch state in ``sow_workflow.parallel_branches``
         (JSONB) so the join check can track completion.
      4. The SoW status stays at the gateway key while branches execute.

    Returns a result dict, or ``None`` if there are no outgoing targets.
    """
    transitions = workflow_data.get("transitions", [])
    outgoing = [t for t in transitions if t.get("from_stage") == gateway_key]
    if not outgoing:
        return None

    target_keys = [t["to_stage"] for t in outgoing]
    all_assigned: list[str] = []

    for tkey in target_keys:
        target_stage = _find_stage(workflow_data, tkey)
        if not target_stage:
            continue
        if target_stage.get("stage_type") in ("review", "approval"):
            roles = await create_stage_assignments(
                conn, sow_id, target_stage, esap_level, actor_user_id
            )
            all_assigned.extend(roles)

    # Store parallel branch tracking in sow_workflow
    # Each branch records its target stage_key and a status of "active"
    branches = {tkey: "active" for tkey in target_keys}
    await conn.execute(
        """
        UPDATE sow_workflow
        SET    parallel_branches = $1::jsonb,
               updated_at = NOW()
        WHERE  sow_id = $2
        """,
        json.dumps(branches),
        sow_id,
    )

    await insert_history(
        conn,
        sow_id,
        actor_user_id,
        "parallel_fan_out",
        {"gateway": gateway_key, "branches": target_keys},
    )

    return {
        "advanced": True,
        "sow_id": sow_id,
        "new_status": gateway_key,
        "parallel_branches": target_keys,
        "assigned_roles": all_assigned,
    }


# ── Parallel join checking ────────────────────────────────────────────────


async def check_join_requirements(
    conn,
    sow_id: int,
    target_stage_key: str,
    completed_branch_key: str,
) -> tuple[bool, list[str]]:
    """Check whether a join-stage is ready to activate.

    Called when a parallel branch completes. Reads the target stage's
    ``join_mode`` config and the ``sow_workflow.parallel_branches`` state
    to determine whether all (or enough) predecessors have completed.

    Returns ``(ready, outstanding_branches)`` — *ready* is True when the
    join can proceed; *outstanding_branches* lists the branch keys that
    haven't completed yet.
    """
    wd = await _load_workflow_data(conn, sow_id)
    target_stage = _find_stage(wd, target_stage_key)
    if not target_stage:
        return True, []

    config = target_stage.get("config") or {}
    join_mode = config.get("join_mode", "default")

    # Load parallel branch state
    row = await conn.fetchrow(
        "SELECT parallel_branches FROM sow_workflow WHERE sow_id = $1",
        sow_id,
    )
    branches_raw = row["parallel_branches"] if row and row["parallel_branches"] else {}
    if isinstance(branches_raw, str):
        branches_raw = json.loads(branches_raw)

    # Mark the completed branch
    if completed_branch_key in branches_raw:
        branches_raw[completed_branch_key] = "completed"
        await conn.execute(
            """
            UPDATE sow_workflow
            SET    parallel_branches = $1::jsonb, updated_at = NOW()
            WHERE  sow_id = $2
            """,
            json.dumps(branches_raw),
            sow_id,
        )

    # Identify which branches feed into this join stage
    transitions = wd.get("transitions", [])
    predecessor_keys = list(
        {t["from_stage"] for t in transitions if t.get("to_stage") == target_stage_key}
    )

    # Filter to only parallel branches (those tracked in parallel_branches)
    tracked_predecessors = [k for k in predecessor_keys if k in branches_raw]
    if not tracked_predecessors:
        # Not a parallel join — normal single-predecessor
        return True, []

    outstanding = [k for k in tracked_predecessors if branches_raw.get(k) != "completed"]

    if join_mode == "any_required":
        # OR-join: at least one predecessor is done
        ready = len(outstanding) < len(tracked_predecessors)
    elif join_mode == "custom":
        # Only the listed required_predecessors must be done
        required = set(config.get("required_predecessors", []))
        custom_outstanding = [k for k in required if branches_raw.get(k) != "completed"]
        ready = len(custom_outstanding) == 0
        outstanding = custom_outstanding
    else:
        # all_required / default: every predecessor must be done
        ready = len(outstanding) == 0

    return ready, outstanding


async def resolve_all_outgoing_transitions(
    conn,
    sow_id: int,
    current_stage: str,
    condition: str,
) -> list[dict]:
    """Like :func:`resolve_transition` but returns ALL matching transitions.

    Used by parallel gateways that need to activate multiple targets
    simultaneously. Regular stages still use :func:`resolve_transition`
    which returns only the first match.
    """
    wd = await _load_workflow_data(conn, sow_id)
    transitions = wd.get("transitions", [])
    targets = []

    for t in transitions:
        if t.get("from_stage") == current_stage and t.get("condition") == condition:
            stage = _find_stage(wd, t["to_stage"])
            if stage:
                targets.append(stage)

    return targets


async def complete_parallel_branch(
    conn,
    sow_id: int,
    branch_stage_key: str,
    actor_user_id: int,
    esap_level: str,
) -> dict | None:
    """Mark a parallel branch as completed and check if the join can proceed.

    Called when a review/approval stage that's part of a parallel group
    gets approved and its gating rules are met. This function:

    1. Marks the branch as completed in ``sow_workflow.parallel_branches``.
    2. For each outgoing ``on_approve``/``default`` transition target,
       checks :func:`check_join_requirements`.
    3. If the join is ready, executes the transition to the join stage.
    4. Clears ``parallel_branches`` after successful join.

    Returns the transition result if a join was executed, or ``None`` if
    the branch was marked complete but other branches are still outstanding.
    """
    wd = await _load_workflow_data(conn, sow_id)

    # Find the join target (next stage after this parallel branch)
    transitions = wd.get("transitions", [])
    join_targets = [
        t["to_stage"]
        for t in transitions
        if t.get("from_stage") == branch_stage_key
        and t.get("condition") in ("on_approve", "default")
    ]

    for join_key in join_targets:
        ready, outstanding = await check_join_requirements(conn, sow_id, join_key, branch_stage_key)
        if ready:
            # Clear parallel branches tracking
            await conn.execute(
                """
                UPDATE sow_workflow
                SET    parallel_branches = NULL, updated_at = NOW()
                WHERE  sow_id = $1
                """,
                sow_id,
            )

            # Execute the transition to the join stage
            result = await execute_transition(
                conn,
                sow_id,
                join_key,
                actor_user_id,
                esap_level,
                reason="Parallel join — all required branches completed",
            )
            return result

    return None
