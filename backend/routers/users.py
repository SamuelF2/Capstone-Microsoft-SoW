"""
Users router  —  /api/users/...

Read-only listing of active users for picker dropdowns (e.g. designating
reviewers on a SoW).  This is *not* a user-management endpoint — user
records are created on first sign-in via Entra ID in ``backend/auth.py``.

Endpoints
---------
  GET /api/users                List active users (optionally filtered by role)

Self-inclusion behavior
-----------------------
When a ``role`` filter is supplied the listing default-includes the calling
user even if their stored role does not match (controlled by the
``include_self`` query param, defaults to ``True``).  This is what lets a
SoW author self-designate in any reviewer slot regardless of their own
``users.role`` — see PHASE-1 §1.2.  Pass ``include_self=false`` if you
need a strict role list (e.g. an admin tool that wants to count members
of a role).
"""

from __future__ import annotations

import database
from auth import CurrentUser
from fastapi import APIRouter, Query
from models import UserListEntry

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get(
    "",
    response_model=list[UserListEntry],
    summary="List active users (optionally filtered by role)",
)
async def list_users(
    current_user: CurrentUser,
    role: str | None = Query(
        default=None,
        description="Filter by exact role key (e.g. 'solution-architect')",
    ),
    include_self: bool = Query(
        default=True,
        description=(
            "When True (default) and a role filter is supplied, the current "
            "user is always listed first even if their users.role does not "
            "match, so authors can self-designate in any reviewer dropdown."
        ),
    ),
) -> list[UserListEntry]:
    """Return active users for the reviewer-picker dropdown.

    Authentication is required to prevent enumeration by anonymous callers,
    but any logged-in user can list — the role list is not sensitive.

    When ``role`` is provided and ``include_self`` is ``True`` (the default),
    the current user is **always** returned — and pinned to position 0 — even
    if their stored ``users.role`` does not match the filter. This is what
    backs the "I am the author and want to assign myself to every slot"
    flow on the reviewer panel: the same call (e.g. ``?role=cpl``) returns
    every CPL plus the caller, regardless of the caller's actual role. Pass
    ``include_self=false`` for a strict role-membership listing.
    """
    async with database.pg_pool.acquire() as conn:
        if role:
            rows = await conn.fetch(
                """
                SELECT id, email, full_name, role
                FROM   users
                WHERE  is_active = TRUE AND role = $1
                ORDER  BY full_name NULLS LAST, email
                """,
                role,
            )
            entries = [UserListEntry(**dict(r)) for r in rows]

            if include_self:
                idx = next(
                    (i for i, e in enumerate(entries) if e.id == current_user.id),
                    -1,
                )
                if idx == -1:
                    self_row = await conn.fetchrow(
                        "SELECT id, email, full_name, role FROM users WHERE id = $1",
                        current_user.id,
                    )
                    if self_row is not None:
                        entries.insert(0, UserListEntry(**dict(self_row)))
                elif idx != 0:
                    entries.insert(0, entries.pop(idx))

            return entries

        rows = await conn.fetch(
            """
            SELECT id, email, full_name, role
            FROM   users
            WHERE  is_active = TRUE
            ORDER  BY full_name NULLS LAST, email
            """
        )
        return [UserListEntry(**dict(r)) for r in rows]
