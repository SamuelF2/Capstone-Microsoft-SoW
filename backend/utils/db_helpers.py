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
    conn,
    *,
    sow_id: int,
    user_id: int,
    reviewer_role: str,
    stage: str,
    carry_prior: bool = True,
) -> None:
    """Create a review assignment, optionally carrying over checklist_responses
    and comments from the most recent prior assignment for the same
    sow/role/stage.

    When ``carry_prior=True`` (default), reviewers see and edit their previous
    responses when a SoW is resubmitted after rejection.  When
    ``carry_prior=False`` (Phase 2 reviewer-swap), the new row starts with
    NULL responses so the new reviewer has a clean slate.

    Skips creation if the user already has a pending/in-progress assignment
    for this sow + role + stage, regardless of ``carry_prior``.
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

    prior_checklist = None
    prior_comments = None
    if carry_prior:
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
        if prior:
            prior_checklist = prior["checklist_responses"]
            prior_comments = prior["comments"]

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
        prior_checklist,
        prior_comments,
    )


async def require_author(conn, sow_id: int, user_id: int) -> None:
    """Raise 403 unless the caller is the SoW's author or a system-admin.

    Used by live-edit endpoints that only the author (or an admin) may call.

    Note: ``collaboration`` has no UNIQUE(sow_id, user_id) constraint, so a
    user may have multiple rows. We filter on ``role = 'author'`` in SQL
    rather than fetching whatever row comes first.
    """
    row = await conn.fetchrow(
        """
        SELECT 1 FROM collaboration
        WHERE  sow_id = $1 AND user_id = $2 AND role = 'author'
        LIMIT  1
        """,
        sow_id,
        user_id,
    )
    if row is not None:
        return

    user_row = await conn.fetchrow("SELECT role FROM users WHERE id = $1", user_id)
    if user_row and (user_row["role"] or "").lower() == "system-admin":
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only the SoW author can perform this action",
    )
