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

from fastapi import HTTPException, status
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


def _stage_key_from_assignment_stage(workflow_data: dict, assignment_stage: str) -> str | None:
    """Reverse-lookup: given a ``review_assignments.stage`` value, find the
    workflow stage whose assignments use that key.

    Handles both the explicit ``config.assignment_stage_keys`` list and
    the default ``stage_key.replace("_", "-")`` mapping used by
    :func:`create_stage_assignments`. Needed to resolve the *effective*
    review stage when a SoW is sitting on a parallel gateway — the
    assignment's stage points at a branch, not the gateway.
    """
    if not assignment_stage:
        return None
    for s in workflow_data.get("stages", []):
        skey = s.get("stage_key", "")
        cfg = s.get("config") or {}
        explicit = cfg.get("assignment_stage_keys") or []
        if assignment_stage in explicit:
            return skey
        if not explicit and skey.replace("_", "-") == assignment_stage:
            return skey
    return None


async def _load_parallel_branches(conn, sow_id: int) -> dict | None:
    """Fetch the ``sow_workflow.parallel_branches`` JSONB for a SoW.

    Returns the decoded dict (e.g. ``{"engineering_review": "active", ...}``)
    or ``None`` when the SoW is not currently in a parallel group.
    """
    row = await conn.fetchrow(
        "SELECT parallel_branches FROM sow_workflow WHERE sow_id = $1",
        sow_id,
    )
    raw = row["parallel_branches"] if row and row["parallel_branches"] else None
    if isinstance(raw, str):
        raw = json.loads(raw)
    return raw if isinstance(raw, dict) and raw else None


async def resolve_effective_review_stage(
    conn,
    sow_id: int,
    assignment_stage: str,
    sow_status: str,
) -> tuple[str, dict | None]:
    """Return the workflow stage_key and config that a reviewer is actually
    reviewing at for an assignment on the given SoW.

    * If the SoW is sitting on a ``parallel_gateway`` and the assignment's
      stage maps to one of the active branches, return the **branch**
      stage_key (the reviewable one), not the gateway.
    * Otherwise return ``sow_status`` as-is.

    Callers use this to decide whether a review submission is allowed at
    the *correct* stage (the branch) rather than at the parent gateway
    (which is a parallel_gateway, not a review/approval stage).
    """
    wd = await _load_workflow_data(conn, sow_id)
    sow_cfg = _find_stage(wd, sow_status)
    if sow_cfg and sow_cfg.get("stage_type") == "parallel_gateway":
        branches = await _load_parallel_branches(conn, sow_id)
        if branches:
            branch_key = _stage_key_from_assignment_stage(wd, assignment_stage)
            if branch_key and branch_key in branches:
                return branch_key, _find_stage(wd, branch_key)
    return sow_status, sow_cfg


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
                # Resolve "previous" by stage_order comparison rather than
                # list-index arithmetic. A naive `ordered[idx - 1]` after
                # filtering out "rejected" would silently shift indices when
                # a custom workflow places "rejected" at a middle
                # stage_order position, sending the SoW back to the wrong
                # stage. Instead, pick the non-rejected stage with the
                # greatest stage_order strictly less than the current one.
                current_order = stage.get("stage_order", 0)
                candidates = [
                    s
                    for s in wd.get("stages", [])
                    if s.get("stage_key") not in ("rejected", current_stage)
                    and s.get("stage_order", 0) < current_order
                ]
                if candidates:
                    prev = max(candidates, key=lambda s: s.get("stage_order", 0))
                    sbt = prev["stage_key"]
                else:
                    sbt = "draft"
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


async def create_stage_assignments(
    conn,
    sow_id: int,
    target_stage: dict,
    esap_level: str,
    actor_user_id: int,
) -> list[str]:
    """Create review assignments for *target_stage* based on its roles config.

    For each required role on the target stage:
      1. Look up the pre-designated user from ``sow_reviewer_assignments``
         (the author's selection on the SoW page) and create their assignment.
      2. If no pre-designation exists, fall back to the first active user
         with the matching ``users.role`` value (defensive — the
         ``submit-for-review`` validator should prevent this for any stage
         flagged ``requires_designated_reviewer``).

    After the per-role loop, the SoW's author (looked up from collaboration)
    and every active ``system-admin`` user are also assigned to every required
    role for this stage.  This guarantees:

    - The author always sees their own SoW in /my-reviews so they can track
      progress and (in dev/test environments lacking real reviewers) walk it
      through the pipeline themselves.
    - Admins can simulate the full review pipeline solo.

    ``create_assignment_with_prior`` deduplicates, so a user who appears in
    multiple roles (e.g. an admin who is also the designated reviewer or the
    SoW author) still only gets one row per (sow, role, stage).

    Returns a list of role keys for which at least one assignment was created.
    """
    stage_key = target_stage["stage_key"]
    config = target_stage.get("config") or {}
    assignment_stage_keys = config.get("assignment_stage_keys", [])
    if not assignment_stage_keys:
        assignment_stage_keys = [stage_key.replace("_", "-")]
    assignment_stage = assignment_stage_keys[0]

    # Pull every system-admin user once — they get assigned to every role.
    admin_rows = await conn.fetch(
        "SELECT id FROM users WHERE role = 'system-admin' AND is_active = TRUE",
    )
    admin_ids = [r["id"] for r in admin_rows]

    # Look up the SoW author(s) from collaboration so we can guarantee them
    # a row in /my-reviews on every required role. Authors need visibility
    # into their own SoW's review progress, and in dev/test environments
    # where no real reviewers are seeded they often need to walk the SoW
    # through review themselves. SoWs may have more than one author row in
    # ``collaboration`` (no UNIQUE constraint) — we assign every distinct
    # active author so co-authors don't get hidden from the review list.
    author_rows = await conn.fetch(
        """
        SELECT DISTINCT u.id
        FROM   collaboration c
        JOIN   users u ON u.id = c.user_id
        WHERE  c.sow_id = $1 AND c.role = 'author' AND u.is_active = TRUE
        """,
        sow_id,
    )
    author_ids = [r["id"] for r in author_rows]

    # Pre-flight: figure out which roles we'll actually process so we can
    # batch the per-role lookups and avoid an N+1.  Filter out non-required
    # roles and ESAP-excluded roles up front.
    role_specs: list[dict] = []
    for role in target_stage.get("roles", []):
        if not role.get("is_required", True):
            continue
        esap_filter = role.get("esap_levels")
        if esap_filter and esap_level not in esap_filter:
            continue
        role_specs.append(role)
    role_keys = [r["role_key"] for r in role_specs]

    # Batch the designated-reviewer lookup: one round trip for the whole
    # stage instead of one per role.  Returns ``role_key → user_id``.
    designated_by_role: dict[str, int] = {}
    if role_keys:
        designated_rows = await conn.fetch(
            """
            SELECT sra.role_key, u.id AS user_id
            FROM   sow_reviewer_assignments sra
            JOIN   users u ON u.id = sra.user_id
            WHERE  sra.sow_id = $1
              AND  sra.stage_key = $2
              AND  sra.role_key = ANY($3::text[])
              AND  u.is_active = TRUE
            """,
            sow_id,
            stage_key,
            role_keys,
        )
        designated_by_role = {r["role_key"]: r["user_id"] for r in designated_rows}

    # Batch the defensive-fallback lookup: only for the role keys that did
    # NOT get a designated reviewer above.  DISTINCT ON (role) keeps a single
    # candidate per role to mirror the original ``LIMIT 1`` behaviour.
    fallback_role_keys = [rk for rk in role_keys if rk not in designated_by_role]
    fallback_by_role: dict[str, int] = {}
    if fallback_role_keys:
        fallback_rows = await conn.fetch(
            """
            SELECT DISTINCT ON (role) role, id
            FROM   users
            WHERE  role = ANY($1::text[]) AND is_active = TRUE
            ORDER  BY role, id
            """,
            fallback_role_keys,
        )
        fallback_by_role = {r["role"]: r["id"] for r in fallback_rows}

    assigned: list[str] = []
    for role in role_specs:
        role_key = role["role_key"]
        slot_assigned = False

        # 1. Pre-designated reviewer (author's choice on the SoW page)
        designated_user_id = designated_by_role.get(role_key)
        if designated_user_id is not None:
            await create_assignment_with_prior(
                conn,
                sow_id=sow_id,
                user_id=designated_user_id,
                reviewer_role=role_key,
                stage=assignment_stage,
            )
            await seed_collaboration(conn, sow_id, designated_user_id, "approver")
            slot_assigned = True
        else:
            # 2. Defensive fallback: first active user with matching role.
            fallback_user_id = fallback_by_role.get(role_key)
            if fallback_user_id is not None:
                await create_assignment_with_prior(
                    conn,
                    sow_id=sow_id,
                    user_id=fallback_user_id,
                    reviewer_role=role_key,
                    stage=assignment_stage,
                )
                await seed_collaboration(conn, sow_id, fallback_user_id, "approver")
                slot_assigned = True

        # 3. Always assign every SoW author so they see their own SoW in
        # /my-reviews and can walk it through review when no real reviewers
        # are configured. Production deployments can replace the author with
        # an explicit reviewer via the live-edit reviewer panel.
        for author_id in author_ids:
            await create_assignment_with_prior(
                conn,
                sow_id=sow_id,
                user_id=author_id,
                reviewer_role=role_key,
                stage=assignment_stage,
            )
            slot_assigned = True

        # 4. Always also assign every system-admin user.  Replaces the prior
        # "assign the actor to every role" testing hack — admins explicitly
        # opt into review duties by holding the system-admin role.
        for admin_id in admin_ids:
            await create_assignment_with_prior(
                conn,
                sow_id=sow_id,
                user_id=admin_id,
                reviewer_role=role_key,
                stage=assignment_stage,
            )
            await seed_collaboration(conn, sow_id, admin_id, "approver")
            slot_assigned = True

        if slot_assigned:
            assigned.append(role_key)

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


# ── Re-evaluate and (maybe) auto-advance ──────────────────────────────────


async def recheck_and_maybe_advance(
    conn,
    sow_id: int,
    actor_user_id: int,
) -> dict:
    """Re-evaluate gating rules at the SoW's current stage and auto-advance
    if they're now satisfied.

    Single source of truth for "did this change unlock the next stage?" —
    called by every endpoint that mutates state which could affect gating
    outcomes:

    - ``POST /api/review/assignment/{id}/submit`` (after a review decision)
    - ``PUT  /api/sow/{id}/reviewers``           (after a reviewer swap)
    - ``PUT  /api/workflow/sow/{id}``            (after a workflow snapshot edit)

    The same code path used to be inlined in ``submit_assignment_review``;
    extracting it here ensures all three caller sites share identical
    gating + parallel-branch + auto_advance-opt-out semantics.

    Idempotent: a call with no eligible state change is a no-op. Calling it
    twice in a row only advances on the first call (if at all).

    Returns
    -------
    dict
        ``gating_met``                — Are required approvals in place at the
                                        SoW's current stage?
        ``advanced``                  — Did this call execute a transition?
        ``new_status``                — The new SoW status, if advanced.
        ``outstanding_roles``         — Roles still pending at the current stage.
        ``assigned_roles``            — Roles assigned at the new stage,
                                        if advanced.
        ``parallel_branch_completed`` — True when a parallel branch finished
                                        but the join is still waiting on
                                        sibling branches.
        ``branch_stage``              — The completed branch stage key, if
                                        applicable.
    """
    result: dict[str, Any] = {
        "gating_met": False,
        "advanced": False,
        "new_status": None,
        "outstanding_roles": [],
        "assigned_roles": [],
        "parallel_branch_completed": False,
        "branch_stage": None,
    }

    sow_row = await conn.fetchrow(
        "SELECT status, esap_level FROM sow_documents WHERE id = $1",
        sow_id,
    )
    if not sow_row:
        return result

    current = sow_row["status"]
    esap = sow_row["esap_level"] or "type-3"

    wd = await _load_workflow_data(conn, sow_id)
    stage_cfg = _find_stage(wd, current)
    if not stage_cfg:
        return result

    stage_type = stage_cfg.get("stage_type", "")

    # ── Parallel gateway branch: re-evaluate every active branch ───────────
    #
    # While branches are running concurrently, ``sow_documents.status``
    # stays pinned at the parent gateway (which is NOT a review/approval
    # stage), so the legacy "only review/approval stages can advance"
    # guard used to fire too early and skip the whole parallel subtree.
    # Instead, detect the gateway here, walk each still-active branch,
    # check its own gating, and call ``complete_parallel_branch`` for any
    # branch that just met its gate.  The first branch that triggers a
    # join wins and returns early; the rest stay "active" until their
    # own reviewers submit.
    if stage_type == "parallel_gateway":
        parallel_branches = await _load_parallel_branches(conn, sow_id)
        if not parallel_branches:
            return result

        active_branches = [k for k, v in parallel_branches.items() if v != "completed"]
        any_branch_met = False
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
                result["outstanding_roles"].extend(branch_outstanding)
                continue
            any_branch_met = True
            # Honor per-branch auto_advance opt-out.
            branch_config = branch_cfg.get("config") or {}
            if not branch_config.get("auto_advance", True):
                continue
            join_result = await complete_parallel_branch(
                conn, sow_id, branch_key, actor_user_id, esap
            )
            if join_result:
                result["advanced"] = True
                result["new_status"] = join_result["new_status"]
                result["assigned_roles"] = join_result.get("assigned_roles", [])
                result["gating_met"] = True
                return result
            # Branch was marked complete but the join is still waiting on
            # sibling branches — record it and keep scanning (sibling
            # branches might also be ready).
            result["parallel_branch_completed"] = True
            result["branch_stage"] = branch_key
        result["gating_met"] = any_branch_met
        return result

    # Only review/approval stages can auto-advance via gating rules.
    if stage_type not in ("review", "approval"):
        return result

    met, outstanding = await check_gating_rules(conn, sow_id, current, esap)
    result["gating_met"] = met
    result["outstanding_roles"] = outstanding
    if not met:
        return result

    # Honor explicit auto_advance opt-out (default: ON for review/approval).
    config = stage_cfg.get("config") or {}
    if not config.get("auto_advance", True):
        return result

    # Regular advance: prefer on_approve, fall back to default.
    target = await resolve_transition(conn, sow_id, current, "on_approve")
    if not target:
        target = await resolve_transition(conn, sow_id, current, "default")
    if not target:
        return result

    advance_result = await execute_transition(
        conn,
        sow_id,
        target["stage_key"],
        actor_user_id,
        esap,
    )
    result["advanced"] = True
    result["new_status"] = advance_result.get("new_status")
    result["assigned_roles"] = advance_result.get("assigned_roles", [])
    return result


# ── Snapshot validation & diff helpers (Phase 3 live workflow editing) ─────


def _validate_workflow_snapshot_change(
    existing: dict,
    new: dict,
    current_stage: str,
) -> None:
    """Raise 409 if the snapshot change would strand the in-flight SoW.

    Currently enforces:
      - The SoW's current stage must be present in ``new.stages``.

    The ``existing`` parameter is unused today but kept in the signature so
    future rules (e.g. "you can't remove a stage with active branches") can
    diff old vs new without changing callers.
    """
    stage_keys = {s.get("stage_key") for s in new.get("stages", [])}
    if current_stage not in stage_keys:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot remove stage '{current_stage}' — "
                "the SoW is currently sitting in this stage."
            ),
        )


def required_role_keys(stage: dict | None, esap_level: str) -> set[str]:
    """Return the set of role_keys required at *stage* for *esap_level*.

    Mirrors the filtering used by :func:`check_gating_rules` and
    :func:`create_stage_assignments`: a role counts only when it is marked
    required AND its ``esap_levels`` filter (if any) includes the SoW's
    ESAP level.
    """
    if not stage:
        return set()
    result: set[str] = set()
    for role in stage.get("roles", []):
        if not role.get("is_required", True):
            continue
        esap_filter = role.get("esap_levels")
        if esap_filter and esap_level not in esap_filter:
            continue
        key = role.get("role_key")
        if key:
            result.add(key)
    return result


def compute_workflow_diff(existing: dict, new: dict) -> dict:
    """Return a minimal diff describing the changes between two snapshots.

    Captures added/removed stages and transitions plus per-stage
    ``approval_mode`` changes — enough for the ``workflow_edited`` audit
    entry without dumping the full snapshot into the history table.
    """
    existing_stages = {s["stage_key"]: s for s in existing.get("stages", [])}
    new_stages = {s["stage_key"]: s for s in new.get("stages", [])}

    added_stages = sorted(set(new_stages) - set(existing_stages))
    removed_stages = sorted(set(existing_stages) - set(new_stages))

    def transition_key(t: dict) -> tuple[str, str, str]:
        return (
            t.get("from_stage", ""),
            t.get("to_stage", ""),
            t.get("condition", "default"),
        )

    existing_transitions = {transition_key(t) for t in existing.get("transitions", [])}
    new_transitions = {transition_key(t) for t in new.get("transitions", [])}

    added_transitions = [
        {"from_stage": k[0], "to_stage": k[1], "condition": k[2]}
        for k in sorted(new_transitions - existing_transitions)
    ]
    removed_transitions = [
        {"from_stage": k[0], "to_stage": k[1], "condition": k[2]}
        for k in sorted(existing_transitions - new_transitions)
    ]

    approval_mode_changes: list[dict] = []
    for stage_key in sorted(set(existing_stages) & set(new_stages)):
        old_mode = (existing_stages[stage_key].get("config") or {}).get("approval_mode")
        new_mode = (new_stages[stage_key].get("config") or {}).get("approval_mode")
        if old_mode != new_mode:
            approval_mode_changes.append({"stage_key": stage_key, "old": old_mode, "new": new_mode})

    diff: dict[str, Any] = {}
    if added_stages:
        diff["added_stages"] = added_stages
    if removed_stages:
        diff["removed_stages"] = removed_stages
    if added_transitions:
        diff["added_transitions"] = added_transitions
    if removed_transitions:
        diff["removed_transitions"] = removed_transitions
    if approval_mode_changes:
        diff["approval_mode_changes"] = approval_mode_changes

    return diff
