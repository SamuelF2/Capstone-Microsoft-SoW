"""Shared database helpers used across SoW routers.

These functions were previously duplicated as private underscore-prefixed
helpers in ``routers/sow.py``, ``routers/review.py``, ``routers/finalize.py``
and ``routers/attachments.py``.  Consolidated here to keep a single source
of truth.

All helpers must be called with an already-acquired connection so they can
share a transaction with the caller's query.
"""

from __future__ import annotations

import json

from fastapi import HTTPException, status


async def require_collaborator(conn, sow_id: int, user_id: int) -> None:
    """Raise 404 if the user is not a collaborator on this SoW.

    Uses 404 rather than 403 so outsiders cannot confirm whether a SoW with
    a given ID exists at all.
    """
    row = await conn.fetchrow(
        "SELECT 1 FROM collaboration WHERE sow_id = $1 AND user_id = $2 LIMIT 1",
        sow_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")


async def seed_collaboration(conn, sow_id: int, user_id: int, role: str = "author") -> None:
    """Insert a user as a collaborator on the SoW.

    Called inside the same transaction as the SoW insert so the row is
    always present — a SoW can never exist without at least one collaborator.

    Uses INSERT ... ON CONFLICT DO NOTHING so re-entrant calls are safe
    (e.g. if the endpoint is retried after a partial failure).
    """
    await conn.execute(
        """
        INSERT INTO collaboration (sow_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        """,
        sow_id,
        user_id,
        role,
    )


async def insert_history(
    conn, sow_id: int, user_id: int, change_type: str, diff: dict | None = None
) -> None:
    """Record an audit-trail entry in the ``history`` table.

    Called inside the same transaction as the mutation so the history row
    is always consistent with the change it describes.
    """
    await conn.execute(
        "INSERT INTO history (sow_id, changed_by, change_type, diff) VALUES ($1, $2, $3, $4::jsonb)",
        sow_id,
        user_id,
        change_type,
        json.dumps(diff) if diff else None,
    )


async def create_assignment_with_prior(
    conn, *, sow_id: int, user_id: int, reviewer_role: str, stage: str
) -> None:
    """Create a review assignment, carrying over checklist_responses and comments
    from the most recent prior assignment for the same sow/role/stage (if any).

    This lets reviewers see and edit their previous responses when a SoW is
    resubmitted after rejection.  Skips creation if the user already has a
    pending/in-progress assignment for this sow + role + stage.
    """
    existing = await conn.fetchval(
        """
        SELECT 1 FROM review_assignments
        WHERE sow_id = $1 AND user_id = $2 AND reviewer_role = $3
          AND stage = $4 AND status IN ('pending', 'in_progress')
        """,
        sow_id,
        user_id,
        reviewer_role,
        stage,
    )
    if existing:
        return  # already has an active assignment for this role

    prior = await conn.fetchrow(
        """
        SELECT checklist_responses, comments FROM review_assignments
        WHERE sow_id = $1 AND user_id = $2 AND reviewer_role = $3 AND stage = $4
          AND status IN ('completed', 'canceled')
        ORDER BY COALESCE(completed_at, assigned_at) DESC
        LIMIT 1
        """,
        sow_id,
        user_id,
        reviewer_role,
        stage,
    )
    await conn.execute(
        """
        INSERT INTO review_assignments
            (sow_id, user_id, reviewer_role, stage, checklist_responses, comments)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        sow_id,
        user_id,
        reviewer_role,
        stage,
        prior["checklist_responses"] if prior else None,
        prior["comments"] if prior else None,
    )
