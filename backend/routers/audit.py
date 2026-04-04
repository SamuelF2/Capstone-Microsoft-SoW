"""
Audit trail router.

Aggregates events from history, review_assignments, conditions_of_approval,
and sow_attachments into a single unified timeline per SoW.
"""

from __future__ import annotations

import database
from auth import CurrentUser
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/sow/{sow_id}")
async def get_audit_trail(
    sow_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: CurrentUser = None,
):
    """
    Return a unified, time-ordered audit trail for a SoW.

    Aggregates events from:
    - history            (status changes, field edits)
    - review_assignments (review decisions)
    - conditions_of_approval (COA lifecycle events)
    - sow_attachments    (document uploads)
    """
    pool = database.pg_pool
    rows = await pool.fetch(
        """
        (
            SELECT h.id, 'status_change' AS event_type,
                   u.full_name AS actor_name, u.email AS actor_email,
                   h.change_type || CASE WHEN h.diff IS NOT NULL THEN '' ELSE '' END
                       AS description,
                   h.diff AS metadata, h.changed_at AS timestamp
            FROM history h
            LEFT JOIN users u ON u.id = h.changed_by
            WHERE h.sow_id = $1
        )
        UNION ALL
        (
            SELECT ra.id, 'review_submit' AS event_type,
                   u.full_name, u.email,
                   'Review submitted: ' || ra.decision AS description,
                   jsonb_build_object('role', ra.reviewer_role, 'stage', ra.stage) AS metadata,
                   ra.completed_at AS timestamp
            FROM review_assignments ra
            LEFT JOIN users u ON u.id = ra.user_id
            WHERE ra.sow_id = $1 AND ra.completed_at IS NOT NULL
        )
        UNION ALL
        (
            SELECT c.id, 'coa_update' AS event_type,
                   u.full_name, u.email,
                   'COA ' || c.status || ': ' || left(c.condition_text, 80) AS description,
                   jsonb_build_object('category', c.category, 'priority', c.priority) AS metadata,
                   c.updated_at AS timestamp
            FROM conditions_of_approval c
            LEFT JOIN users u ON u.id = COALESCE(c.resolved_by, c.created_by)
            WHERE c.sow_id = $1
        )
        UNION ALL
        (
            SELECT a.id, 'attachment_upload' AS event_type,
                   u.full_name, u.email,
                   'Uploaded: ' || a.original_name AS description,
                   jsonb_build_object(
                       'document_type', a.document_type,
                       'stage', a.stage_key
                   ) AS metadata,
                   a.uploaded_at AS timestamp
            FROM sow_attachments a
            LEFT JOIN users u ON u.id = a.uploaded_by
            WHERE a.sow_id = $1
        )
        ORDER BY timestamp DESC
        LIMIT $2 OFFSET $3
        """,
        sow_id,
        limit,
        offset,
    )
    return [dict(r) for r in rows]
