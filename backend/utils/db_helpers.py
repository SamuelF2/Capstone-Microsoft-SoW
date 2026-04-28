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
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status

_MISSING = object()


def safe_json(value: Any, default: Any = _MISSING) -> Any:
    """Parse a value that may already be a dict/list or a JSON string.

    Returns ``None`` if ``value`` is ``None`` and no ``default`` is provided.
    If ``default`` is supplied, it is returned for both ``None`` and unparseable
    inputs (instead of falling through to the raw value). This consolidates the
    three subtly different ``_safe_json`` implementations that previously lived
    in ``sow.py``, ``review.py``, and ``finalize.py``.
    """
    if value is None:
        return default if default is not _MISSING else None
    if isinstance(value, dict | list):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default if default is not _MISSING else value


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
        WHERE  sow_id = $1 AND user_id = $2 AND role IN ('author', 'sow-manager')
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


# ── Higher-level helpers ──────────────────────────────────────────────────


async def load_sow_with_auth(
    conn,
    sow_id: int,
    current_user,
    *,
    action: str = "read",
    columns: str = "*",
    for_update: bool = False,
):
    """Load a SoW row and verify the caller may act on it.

    The pattern ``SELECT ... FROM sow_documents WHERE id = $1`` → ``404 if
    missing`` → collaborator/author check repeats 18+ times across the SoW
    routers.  This helper collapses those three steps into a single call.

    Parameters
    ----------
    action: ``"read"`` and ``"approve"`` use ``require_collaborator`` (any
        collaborator may read or approve via the review pipeline).  ``"write"``
        uses ``require_author`` (only the SoW author or an admin may directly
        edit the document).  Unknown actions fall through to ``read`` semantics.
    columns: Column projection to fetch.  Defaults to ``*``; callers that only
        need a few fields can pass ``"id, status"`` etc.
    for_update: When ``True``, appends ``FOR UPDATE`` to the SELECT so the row
        is row-locked for the duration of the caller's transaction.  Use this
        when reading state that you intend to write back to (e.g. status
        transitions, finalize lock) to prevent TOCTOU races.

    Returns the asyncpg ``Record`` for the SoW row.  Raises 404 if the SoW
    does not exist or the caller is not authorized (collaborator check uses
    404 to avoid leaking SoW existence).
    """
    if action == "write":
        await require_author(conn, sow_id=sow_id, user_id=current_user.id)
    else:
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

    query = f"SELECT {columns} FROM sow_documents WHERE id = $1"  # noqa: S608
    if for_update:
        query += " FOR UPDATE"
    row = await conn.fetchrow(query, sow_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
    return row


# ── Audit history ─────────────────────────────────────────────────────────


def build_diff(
    before: dict | None, after: dict | None, changed_keys: list[str] | None = None
) -> dict:
    """Build the canonical history diff shape ``{before, after, changed_keys}``.

    Previously the codebase wrote at least six different diff shapes — some
    nested ``{old, new}`` per field, some flat dictionaries with arbitrary keys.
    Frontends had to handle every variant.  New writes should always go
    through this helper so the audit history has a consistent structure.
    """
    if changed_keys is None:
        before_keys = set((before or {}).keys())
        after_keys = set((after or {}).keys())
        all_keys = before_keys | after_keys
        changed_keys = sorted(k for k in all_keys if (before or {}).get(k) != (after or {}).get(k))
    return {
        "before": before or {},
        "after": after or {},
        "changed_keys": changed_keys,
    }


async def record_history(
    conn,
    sow_id: int,
    user_id: int,
    change_type: str,
    *,
    before: dict | None = None,
    after: dict | None = None,
    changed_keys: list[str] | None = None,
) -> None:
    """Record an audit history entry using the canonical diff shape.

    Thin wrapper over ``insert_history`` that funnels every write through
    ``build_diff`` so callers can't accidentally invent new diff shapes.
    """
    await insert_history(
        conn,
        sow_id,
        user_id,
        change_type,
        build_diff(before, after, changed_keys),
    )


# ── Review results ────────────────────────────────────────────────────────


async def record_review_result(
    conn,
    *,
    sow_id: int,
    reviewer_email: str,
    reviewer_user_id: int,
    review_stage: str,
    decision: str,
    comments: str | None = None,
    action_items: list | None = None,
    checklist_responses: list | None = None,
    conditions: list | None = None,
    score: float | None = None,
) -> None:
    """Insert an audit row into ``review_results``.

    Consolidates the two near-identical ``INSERT INTO review_results`` calls
    that previously lived in ``review.py`` (one for normal decisions, one for
    send-back).  ``action_items`` is folded into the ``findings`` payload
    alongside ``comments`` so the historical column shape is preserved.
    """
    findings: dict[str, Any] = {}
    if comments is not None:
        findings["comments"] = comments
    if action_items is not None:
        findings["action_items"] = action_items

    await conn.execute(
        """
        INSERT INTO review_results
            (sow_id, reviewer, score, findings, reviewed_at,
             reviewer_user_id, review_stage, checklist_responses, decision, conditions)
        VALUES
            ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10::jsonb)
        """,
        sow_id,
        reviewer_email,
        score,
        json.dumps(findings),
        datetime.now(UTC),
        reviewer_user_id,
        review_stage,
        json.dumps(checklist_responses if checklist_responses is not None else []),
        decision,
        json.dumps(conditions) if conditions else None,
    )

# ── Roles and permissions ────────────────────────────────────────────────────────

async def require_permission(conn, user_id: int, permission: str) -> None:
    """Raise 403 if the user's role doesn't have the given permission.

    Checks role_definitions.permissions JSONB array.
    A wildcard permission '*' grants everything (system-admin).
    """
    row = await conn.fetchrow(
        """
        SELECT rd.permissions
        FROM   users u
        JOIN   role_definitions rd ON rd.role_key = u.role
        WHERE  u.id = $1
        """,
        user_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User has no role assigned",
        )

    permissions = row["permissions"]
    if isinstance(permissions, str):
        import json
        permissions = json.loads(permissions)

    if "*" in permissions or permission in permissions:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Permission '{permission}' required",
    )

async def require_sow_manager(conn, sow_id: int, user_id: int) -> None:
    """Raise 403 unless the user is the SoW manager for this SoW or a system-admin.

    SoW manager is defined as having role 'sow-manager' in the collaboration
    table for this SoW.
    """
    # system-admin bypasses everything
    user_row = await conn.fetchrow("SELECT role FROM users WHERE id = $1", user_id)
    if user_row and (user_row["role"] or "").lower() == "system-admin":
        return

    row = await conn.fetchrow(
        """
        SELECT 1 FROM collaboration
        WHERE  sow_id = $1 AND user_id = $2 AND role = 'sow-manager'
        LIMIT  1
        """,
        sow_id,
        user_id,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the SoW manager can perform this action",
        )


async def require_sow_permission(conn, sow_id: int, user_id: int, permission: str) -> None:
    """Raise 403 if the user's SoW-scoped role doesn't have the given permission.

    Checks sow_role_definitions.permissions for the user's role on this SoW.
    system-admin and sow-manager (which has '*') always pass.
    """
    # system-admin bypasses everything
    user_row = await conn.fetchrow("SELECT role FROM users WHERE id = $1", user_id)
    if user_row and (user_row["role"] or "").lower() == "system-admin":
        return

    row = await conn.fetchrow(
        """
        SELECT srd.permissions
        FROM   collaboration c
        JOIN   sow_role_definitions srd
               ON srd.sow_id = c.sow_id AND srd.role_key = c.role
        WHERE  c.sow_id = $1 AND c.user_id = $2
        LIMIT  1
        """,
        sow_id,
        user_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission '{permission}' required",
        )

    permissions = row["permissions"]
    if isinstance(permissions, str):
        permissions = json.loads(permissions)

    if "*" in permissions or permission in permissions:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Permission '{permission}' required",
    )


async def seed_sow_roles(conn, sow_id: int, creator_user_id: int) -> None:
    """Seed default SoW-scoped roles and assign sow-manager to the creator.

    Called inside the same transaction as SoW creation so roles always
    exist for every SoW.
    """
    default_roles = [
        (
            "sow-manager",
            "SoW Manager",
            "Full control over this SoW",
            ["*"],
        ),
        (
            "reviewer",
            "Reviewer",
            "Can read the SoW and submit reviews",
            ["sow.read", "review.read", "review.submit"],
        ),
        (
            "viewer",
            "Viewer",
            "Read-only access to this SoW",
            ["sow.read"],
        ),
    ]

    for role_key, display_name, description, permissions in default_roles:
        await conn.execute(
            """
            INSERT INTO sow_role_definitions
                (sow_id, role_key, display_name, description, permissions, created_by)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            ON CONFLICT (sow_id, role_key) DO NOTHING
            """,
            sow_id,
            role_key,
            display_name,
            description,
            json.dumps(permissions),
            creator_user_id,
        )

    # Set the creator's collaboration role to sow-manager
    await conn.execute(
        """
        UPDATE collaboration
        SET    role = 'sow-manager'
        WHERE  sow_id = $1 AND user_id = $2
        """,
        sow_id,
        creator_user_id,
    )
