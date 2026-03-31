"""
Access-control helpers shared across review-stage endpoints.

These functions are extracted from the router logic so they can be reused
without duplicating the database queries in multiple places.
"""

from __future__ import annotations

import database
from fastapi import HTTPException, status


async def require_review_access(sow_id: int, user_id: int) -> dict:
    """Check that the user has a review assignment for this SoW.

    Returns the assignment row dict on success.
    Raises **403** if no assignment is found.
    """
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM review_assignments WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            user_id,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No review assignment for this SoW",
        )
    return dict(row)


async def require_sow_status(sow_id: int, allowed_statuses: set[str]) -> dict:
    """Check that the SoW exists and is in one of the expected statuses.

    Returns the full SoW row dict on success.
    Raises **404** if the SoW is not found.
    Raises **409** if the SoW status is not in *allowed_statuses*.
    """
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
    if row["status"] not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(f"SoW status is '{row['status']}', expected one of {sorted(allowed_statuses)}"),
        )
    return dict(row)
