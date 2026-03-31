"""
Review router — /api/reviews/...

All review_results operations against PostgreSQL.

Collaboration enforcement
-------------------------
Every endpoint that touches a specific SoW's reviews first calls
``_require_collaborator`` (imported from sow.py helpers) so that users
who are not listed in the ``collaboration`` table receive a 404 rather
than a 403, preventing ID enumeration.

Endpoints
---------
GET  /api/reviews/my-reviews       Active reviews for the current user's SoWs
GET  /api/reviews/history          Completed reviews for the current user's SoWs
GET  /api/reviews/{review_id}      Get a single review result by ID
POST /api/reviews/sow/{sow_id}     Create a review result for a SoW
PATCH /api/reviews/{review_id}     Update a review (e.g. mark complete)
DELETE /api/reviews/{review_id}    Delete a review result
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import database
from auth import CurrentUser
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/reviews", tags=["reviews"])

# ── Pydantic models ───────────────────────────────────────────────────────────


class ReviewCreate(BaseModel):
    reviewer: str | None = None
    score: float | None = None
    findings: dict | None = None


class ReviewUpdate(BaseModel):
    reviewer: str | None = None
    score: float | None = None
    findings: dict | None = None


class ReviewResponse(BaseModel):
    id: int
    sow_id: int
    reviewer: str | None
    score: float | None
    findings: dict | None
    reviewed_at: datetime
    # Joined from sow_documents for convenience
    sow_title: str | None = None
    sow_methodology: str | None = None

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────


def _row_to_review(row: dict) -> ReviewResponse:
    """Map a raw DB row (with optional joined sow fields) to ReviewResponse."""
    data = dict(row)
    findings = data.get("findings")
    if isinstance(findings, str):
        data["findings"] = json.loads(findings)
    return ReviewResponse(**data)


async def _require_collaborator(conn, sow_id: int, user_id: int) -> None:
    """Raise 404 if the user is not a collaborator on this SoW.

    Uses 404 rather than 403 so outsiders cannot confirm whether a SoW
    with a given ID exists at all.
    """
    row = await conn.fetchrow(
        """
        SELECT 1
        FROM collaboration
        WHERE sow_id = $1
          AND user_id = $2
        LIMIT 1
        """,
        sow_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")


async def _get_review_sow_id(conn, review_id: int) -> int:
    """Return the sow_id for a review_results row, or raise 404."""
    sow_id = await conn.fetchval("SELECT sow_id FROM review_results WHERE id = $1", review_id)
    if sow_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return sow_id


# ── Active reviews (non-completed) ───────────────────────────────────────────


@router.get(
    "/my-reviews",
    response_model=list[ReviewResponse],
    summary="List active reviews for the current user's SoWs",
)
async def my_reviews(current_user: CurrentUser) -> list[ReviewResponse]:
    """Return review_results rows that are not yet completed.

    Only returns reviews for SoWs where the authenticated user appears
    in the ``collaboration`` table.

    A review is considered active when ``findings->>'status'`` is not
    ``'Completed'`` (or when ``findings`` is NULL).
    """
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT rr.id, rr.sow_id, rr.reviewer, rr.score,
                   rr.findings, rr.reviewed_at,
                   s.title  AS sow_title,
                   s.methodology AS sow_methodology
            FROM review_results rr
            JOIN sow_documents  s  ON s.id  = rr.sow_id
            JOIN collaboration  c  ON c.sow_id = s.id
            WHERE c.user_id = $1
              AND (rr.findings IS NULL
                   OR rr.findings->>'status' IS DISTINCT FROM 'Completed')
            ORDER BY rr.reviewed_at DESC
            """,
            current_user.id,
        )
    return [_row_to_review(dict(r)) for r in rows]


# ── Review history (completed) ────────────────────────────────────────────────


@router.get(
    "/history",
    response_model=list[ReviewResponse],
    summary="List completed reviews for the current user's SoWs",
)
async def review_history(current_user: CurrentUser) -> list[ReviewResponse]:
    """Return review_results rows where ``findings->>'status' = 'Completed'``.

    Only returns reviews for SoWs where the authenticated user appears
    in the ``collaboration`` table.
    """
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT rr.id, rr.sow_id, rr.reviewer, rr.score,
                   rr.findings, rr.reviewed_at,
                   s.title  AS sow_title,
                   s.methodology AS sow_methodology
            FROM review_results rr
            JOIN sow_documents  s  ON s.id  = rr.sow_id
            JOIN collaboration  c  ON c.sow_id = s.id
            WHERE c.user_id = $1
              AND rr.findings->>'status' = 'Completed'
            ORDER BY rr.reviewed_at DESC
            """,
            current_user.id,
        )
    return [_row_to_review(dict(r)) for r in rows]


# ── Get single review ─────────────────────────────────────────────────────────


@router.get(
    "/{review_id}",
    response_model=ReviewResponse,
    summary="Get a single review result by ID",
)
async def get_review(review_id: int, current_user: CurrentUser) -> ReviewResponse:
    """Return a review result including joined SoW fields.

    Raises **404** if the review does not exist or the current user is
    not a collaborator on the associated SoW.
    """
    async with database.pg_pool.acquire() as conn:
        sow_id = await _get_review_sow_id(conn, review_id)
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        row = await conn.fetchrow(
            """
            SELECT rr.id, rr.sow_id, rr.reviewer, rr.score,
                   rr.findings, rr.reviewed_at,
                   s.title       AS sow_title,
                   s.methodology AS sow_methodology
            FROM review_results rr
            JOIN sow_documents s ON s.id = rr.sow_id
            WHERE rr.id = $1
            """,
            review_id,
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")

    return _row_to_review(dict(row))


# ── Create review ─────────────────────────────────────────────────────────────


@router.post(
    "/sow/{sow_id}",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a review result for a SoW",
)
async def create_review(
    sow_id: int, payload: ReviewCreate, current_user: CurrentUser
) -> ReviewResponse:
    """Insert a new review_results row for the given SoW.

    Raises **404** if the SoW does not exist or the current user is not
    a collaborator on it.
    """
    findings_json = json.dumps(payload.findings) if payload.findings else None

    async with database.pg_pool.acquire() as conn:
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        row = await conn.fetchrow(
            """
            INSERT INTO review_results (sow_id, reviewer, score, findings)
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING id, sow_id, reviewer, score, findings, reviewed_at
            """,
            sow_id,
            payload.reviewer,
            payload.score,
            findings_json,
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create review",
        )

    data = dict(row)
    data["sow_title"] = None
    data["sow_methodology"] = None
    return _row_to_review(data)


# ── Update review ─────────────────────────────────────────────────────────────


@router.patch(
    "/{review_id}",
    response_model=ReviewResponse,
    summary="Update a review result (e.g. set score, mark complete)",
)
async def update_review(
    review_id: int, payload: ReviewUpdate, current_user: CurrentUser
) -> ReviewResponse:
    """Partially update a review_results row.

    Only non-None fields are written. Pass ``findings: {"status": "Completed"}``
    to mark a review as done and move it to history.

    Raises **404** if the review does not exist or the current user is not
    a collaborator on the associated SoW.
    """
    updates: dict[str, Any] = {k: v for k, v in payload.model_dump().items() if v is not None}

    async with database.pg_pool.acquire() as conn:
        sow_id = await _get_review_sow_id(conn, review_id)
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        if not updates:
            # Nothing to update — just return the current state
            row = await conn.fetchrow(
                """
                SELECT rr.id, rr.sow_id, rr.reviewer, rr.score,
                       rr.findings, rr.reviewed_at,
                       s.title       AS sow_title,
                       s.methodology AS sow_methodology
                FROM review_results rr
                JOIN sow_documents s ON s.id = rr.sow_id
                WHERE rr.id = $1
                """,
                review_id,
            )
            return _row_to_review(dict(row))

        if "findings" in updates and updates["findings"] is not None:
            updates["findings"] = json.dumps(updates["findings"])

        params: list[Any] = list(updates.values()) + [review_id]
        set_clause = ", ".join(
            f"{col} = ${i + 1}" + ("::jsonb" if col == "findings" else "")
            for i, col in enumerate(updates)
        )

        row = await conn.fetchrow(
            f"UPDATE review_results SET {set_clause} WHERE id = ${len(params)} RETURNING *",
            *params,
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")

    data = dict(row)
    data["sow_title"] = None
    data["sow_methodology"] = None
    return _row_to_review(data)


# ── Delete review ─────────────────────────────────────────────────────────────


@router.delete(
    "/{review_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a review result",
)
async def delete_review(review_id: int, current_user: CurrentUser) -> dict:
    """Permanently delete a review_results row.

    Raises **404** if the review does not exist or the current user is not
    a collaborator on the associated SoW.
    """
    async with database.pg_pool.acquire() as conn:
        sow_id = await _get_review_sow_id(conn, review_id)
        await _require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)

        result = await conn.execute("DELETE FROM review_results WHERE id = $1", review_id)

    if result == "DELETE 0":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")

    return {"deleted": review_id}
