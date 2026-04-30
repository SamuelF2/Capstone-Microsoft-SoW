"""
SoW Comments router  —  /api/sow/{sow_id}/comments

Highlight-anchored review comments and suggested edits. Reviewers select a
span of text in the SoW viewer and start a thread; replies and resolution
let multiple reviewers collaborate on a single point. Threads carry across
review rounds: when the author edits the SoW, the anchor text may no longer
match what's in the document — those threads are flagged ``is_stale`` but
kept readable.

Threads have a ``kind``: ``"comment"`` for plain discussion or
``"suggestion"`` when the reviewer also proposes a replacement string. The
SoW author and reviewers with the ``suggest`` permission tier can apply or
reject pending suggestions; applying mutates ``sow_documents.content``.

Endpoints
---------
  GET    /api/sow/{sow_id}/comments                  List threads + caller's tier
  POST   /api/sow/{sow_id}/comments                  Create thread (comment or suggestion)
  POST   /api/sow/{sow_id}/comments/{tid}/replies    Append a reply
  POST   /api/sow/{sow_id}/comments/{tid}/resolve    Mark thread resolved
  POST   /api/sow/{sow_id}/comments/{tid}/reopen     Re-open a resolved thread
  POST   /api/sow/{sow_id}/comments/{tid}/apply      Apply a pending suggestion
  POST   /api/sow/{sow_id}/comments/{tid}/reject     Reject a pending suggestion
  DELETE /api/sow/{sow_id}/comments/{tid}            Delete (author or SoW author)
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import database
from auth import CurrentUser
from fastapi import APIRouter, HTTPException, status
from models import (
    SowCommentMessage,
    SowCommentReplyCreate,
    SowCommentsListResponse,
    SowCommentThread,
    SowCommentThreadCreate,
)
from services.workflow_engine import _stage_key_from_assignment_stage
from utils.db_helpers import insert_history, require_collaborator
from utils.sow_text import (
    SuggestionApplyError,
    apply_suggestion_to_content,
    flatten_section_text,
)

router = APIRouter(prefix="/api/sow/{sow_id}/comments", tags=["sow-comments"])

_TIER_RANK = {"view": 0, "comment": 1, "suggest": 2}


# ── Authorization ────────────────────────────────────────────────────────────


async def _require_comment_actor(conn, sow_id: int, user_id: int) -> None:
    """Caller must be a collaborator on this SoW (author, designated reviewer,
    or any user assigned a review on it). ``require_collaborator`` already
    matches that audience for the AI analysis endpoint, so reuse it."""
    await require_collaborator(conn, sow_id=sow_id, user_id=user_id)


async def _is_sow_author(conn, *, sow_id: int, user_id: int) -> bool:
    """The SoW author is whoever was seeded into ``collaboration`` with
    role='author' when the SoW was created."""
    row = await conn.fetchval(
        """SELECT 1 FROM collaboration
           WHERE sow_id = $1 AND user_id = $2 AND role = 'author'
           LIMIT 1""",
        sow_id,
        user_id,
    )
    return bool(row)


async def _can_resolve(conn, *, sow_id: int, thread_author_id: int, user_id: int) -> bool:
    """Thread author, SoW author, or any reviewer on this SoW may resolve."""
    if user_id == thread_author_id:
        return True
    if await _is_sow_author(conn, sow_id=sow_id, user_id=user_id):
        return True
    has_assignment = await conn.fetchval(
        "SELECT 1 FROM review_assignments WHERE sow_id = $1 AND user_id = $2 LIMIT 1",
        sow_id,
        user_id,
    )
    return bool(has_assignment)


async def _can_delete(conn, *, sow_id: int, thread_author_id: int, user_id: int) -> bool:
    if user_id == thread_author_id:
        return True
    return await _is_sow_author(conn, sow_id=sow_id, user_id=user_id)


async def _resolve_user_tier(conn, *, sow_id: int, user_id: int) -> str:
    """Return the caller's effective permission tier on this SoW.

    Tiers (low → high): ``view`` < ``comment`` < ``suggest``.

    * SoW authors always get ``suggest`` (they own the document).
    * Otherwise, walk the user's ``review_assignments`` rows on this SoW
      and pick the highest tier their assigned roles grant in the workflow
      snapshot. Multi-role users (rare but valid in parallel stages) get
      the union of permissions, not an arbitrary single-role tier.
    * Falls back to ``view`` for collaborators with no assigned role
      (e.g. designated-but-not-yet-active reviewers).
    """
    if await _is_sow_author(conn, sow_id=sow_id, user_id=user_id):
        return "suggest"

    assignments = await conn.fetch(
        "SELECT reviewer_role, stage FROM review_assignments WHERE sow_id = $1 AND user_id = $2",
        sow_id,
        user_id,
    )
    if not assignments:
        return "view"

    wf = await conn.fetchrow("SELECT workflow_data FROM sow_workflow WHERE sow_id = $1", sow_id)
    if not wf:
        # No workflow snapshot recorded — assume the legacy default
        # (suggest) so reviewers aren't blocked by missing config.
        return "suggest"
    raw = wf["workflow_data"]
    wd = raw if isinstance(raw, dict) else json.loads(raw)

    best = "view"
    for asg in assignments:
        stage_key = _stage_key_from_assignment_stage(wd, asg["stage"]) or asg["stage"]
        for stage in wd.get("stages", []):
            if stage.get("stage_key") != stage_key:
                continue
            for role in stage.get("roles", []):
                if role.get("role_key") != asg["reviewer_role"]:
                    continue
                tier = role.get("permission_tier") or "suggest"
                if _TIER_RANK.get(tier, 0) > _TIER_RANK.get(best, 0):
                    best = tier
    return best


def _require_tier(actual: str, *, needed: str) -> None:
    if _TIER_RANK.get(actual, 0) < _TIER_RANK.get(needed, 0):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This action requires '{needed}' permission on the SoW; "
                f"your role grants '{actual}'."
            ),
        )


# ── Helpers ──────────────────────────────────────────────────────────────────


def _section_text(content: dict, section_key: str) -> str:
    if not isinstance(content, dict):
        return ""
    return flatten_section_text(content.get(section_key))


def _extract_content(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _build_thread_dto(
    *,
    thread_row,
    msg_rows,
    content: dict,
    viewer_tier: str = "view",
) -> SowCommentThread:
    section_text = _section_text(content, thread_row["section_key"])
    span = (
        section_text[thread_row["offset_start"] : thread_row["offset_end"]] if section_text else ""
    )
    is_stale = (span or "") != (thread_row["anchor_text"] or "")
    messages = [
        SowCommentMessage(
            id=m["id"],
            thread_id=m["thread_id"],
            author_id=m["author_id"],
            author_name=m["author_name"],
            author_email=m["author_email"],
            body=m["body"],
            created_at=m["created_at"],
        )
        for m in msg_rows
    ]
    kind = thread_row.get("kind") or "comment"
    applied_at = thread_row.get("applied_at")
    rejected_at = thread_row.get("rejected_at")
    can_apply = (
        kind == "suggestion"
        and applied_at is None
        and rejected_at is None
        and _TIER_RANK.get(viewer_tier, 0) >= _TIER_RANK["suggest"]
    )
    apply_blocked_reason = None
    if kind == "suggestion" and applied_at is None and rejected_at is None and not can_apply:
        apply_blocked_reason = (
            "Only the SoW author or a reviewer with 'suggest' permission can apply edits."
        )
    return SowCommentThread(
        id=thread_row["id"],
        sow_id=thread_row["sow_id"],
        author_id=thread_row["author_id"],
        author_name=thread_row.get("author_name"),
        author_email=thread_row.get("author_email"),
        section_key=thread_row["section_key"],
        offset_start=thread_row["offset_start"],
        offset_end=thread_row["offset_end"],
        anchor_text=thread_row["anchor_text"],
        is_stale=is_stale,
        resolved_at=thread_row["resolved_at"],
        resolved_by=thread_row["resolved_by"],
        created_at=thread_row["created_at"],
        updated_at=thread_row["updated_at"],
        messages=messages,
        kind=kind,
        replacement_text=thread_row.get("replacement_text"),
        applied_at=applied_at,
        applied_by=thread_row.get("applied_by"),
        rejected_at=rejected_at,
        rejected_by=thread_row.get("rejected_by"),
        can_apply=can_apply,
        apply_blocked_reason=apply_blocked_reason,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=SowCommentsListResponse,
    summary="List comment threads on a SoW with caller's permission tier",
)
async def list_threads(sow_id: int, current_user: CurrentUser) -> SowCommentsListResponse:
    """Return every thread on this SoW plus the caller's effective tier.

    The frontend needs the tier to decide which composer to show
    (``view`` hides it entirely, ``comment`` shows comment-only,
    ``suggest`` enables the Suggest-edit toggle) and which Accept/Reject
    affordances to render on suggestion threads.
    """
    async with database.pg_pool.acquire() as conn:
        await _require_comment_actor(conn, sow_id, current_user.id)
        tier = await _resolve_user_tier(conn, sow_id=sow_id, user_id=current_user.id)

        sow = await conn.fetchrow("SELECT content FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
        content = _extract_content(sow["content"])

        thread_rows = await conn.fetch(
            """
            SELECT t.*, u.full_name AS author_name, u.email AS author_email
            FROM   sow_comment_threads t
            JOIN   users u ON u.id = t.author_id
            WHERE  t.sow_id = $1
            ORDER  BY t.created_at ASC
            """,
            sow_id,
        )
        if not thread_rows:
            return SowCommentsListResponse(tier=tier, threads=[])
        thread_ids = [t["id"] for t in thread_rows]
        msg_rows = await conn.fetch(
            """
            SELECT m.*, u.full_name AS author_name, u.email AS author_email
            FROM   sow_comment_messages m
            JOIN   users u ON u.id = m.author_id
            WHERE  m.thread_id = ANY($1::int[])
            ORDER  BY m.created_at ASC
            """,
            thread_ids,
        )
        msgs_by_thread: dict[int, list[dict]] = {}
        for m in msg_rows:
            msgs_by_thread.setdefault(m["thread_id"], []).append(dict(m))

    threads = [
        _build_thread_dto(
            thread_row=dict(t),
            msg_rows=msgs_by_thread.get(t["id"], []),
            content=content,
            viewer_tier=tier,
        )
        for t in thread_rows
    ]
    return SowCommentsListResponse(tier=tier, threads=threads)


@router.post(
    "",
    response_model=SowCommentThread,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new comment thread anchored to a text span",
)
async def create_thread(
    sow_id: int,
    payload: SowCommentThreadCreate,
    current_user: CurrentUser,
) -> SowCommentThread:
    if payload.offset_end <= payload.offset_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="offset_end must be greater than offset_start",
        )
    if not payload.anchor_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="anchor_text must not be empty",
        )
    if payload.kind == "suggestion":
        if payload.replacement_text is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Suggestions require a replacement_text",
            )
    elif payload.replacement_text:
        # Plain comments must not carry replacement text.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="replacement_text is only valid for kind='suggestion'",
        )

    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_comment_actor(conn, sow_id, current_user.id)
        tier = await _resolve_user_tier(conn, sow_id=sow_id, user_id=current_user.id)
        # Plain comments need 'comment' tier; suggestions need 'suggest'.
        _require_tier(tier, needed="suggest" if payload.kind == "suggestion" else "comment")

        sow = await conn.fetchrow("SELECT content FROM sow_documents WHERE id = $1", sow_id)
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
        content = _extract_content(sow["content"])

        thread_row = await conn.fetchrow(
            """
            INSERT INTO sow_comment_threads
                (sow_id, author_id, section_key, offset_start, offset_end, anchor_text,
                 kind, replacement_text)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            sow_id,
            current_user.id,
            payload.section_key,
            payload.offset_start,
            payload.offset_end,
            payload.anchor_text,
            payload.kind,
            payload.replacement_text,
        )
        msg_row = await conn.fetchrow(
            """
            INSERT INTO sow_comment_messages (thread_id, author_id, body)
            VALUES ($1, $2, $3)
            RETURNING *
            """,
            thread_row["id"],
            current_user.id,
            payload.body,
        )
        author = await conn.fetchrow(
            "SELECT full_name, email FROM users WHERE id = $1", current_user.id
        )

    thread_dict = dict(thread_row)
    thread_dict["author_name"] = author["full_name"] if author else None
    thread_dict["author_email"] = author["email"] if author else None
    msg_dict = dict(msg_row)
    msg_dict["author_name"] = author["full_name"] if author else None
    msg_dict["author_email"] = author["email"] if author else None
    return _build_thread_dto(
        thread_row=thread_dict,
        msg_rows=[msg_dict],
        content=content,
        viewer_tier=tier,
    )


@router.post(
    "/{thread_id}/replies",
    response_model=SowCommentMessage,
    status_code=status.HTTP_201_CREATED,
    summary="Append a reply to a comment thread",
)
async def create_reply(
    sow_id: int,
    thread_id: int,
    payload: SowCommentReplyCreate,
    current_user: CurrentUser,
) -> SowCommentMessage:
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_comment_actor(conn, sow_id, current_user.id)
        tier = await _resolve_user_tier(conn, sow_id=sow_id, user_id=current_user.id)
        _require_tier(tier, needed="comment")
        thread = await conn.fetchrow(
            "SELECT id FROM sow_comment_threads WHERE id = $1 AND sow_id = $2",
            thread_id,
            sow_id,
        )
        if not thread:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
        msg_row = await conn.fetchrow(
            """
            INSERT INTO sow_comment_messages (thread_id, author_id, body)
            VALUES ($1, $2, $3)
            RETURNING *
            """,
            thread_id,
            current_user.id,
            payload.body,
        )
        await conn.execute(
            "UPDATE sow_comment_threads SET updated_at = NOW() WHERE id = $1",
            thread_id,
        )
        author = await conn.fetchrow(
            "SELECT full_name, email FROM users WHERE id = $1", current_user.id
        )
    return SowCommentMessage(
        id=msg_row["id"],
        thread_id=msg_row["thread_id"],
        author_id=msg_row["author_id"],
        author_name=author["full_name"] if author else None,
        author_email=author["email"] if author else None,
        body=msg_row["body"],
        created_at=msg_row["created_at"],
    )


@router.post(
    "/{thread_id}/resolve",
    response_model=SowCommentThread,
    summary="Mark a comment thread resolved",
)
async def resolve_thread(
    sow_id: int,
    thread_id: int,
    current_user: CurrentUser,
) -> SowCommentThread:
    return await _set_resolved(sow_id, thread_id, current_user, resolved=True)


@router.post(
    "/{thread_id}/reopen",
    response_model=SowCommentThread,
    summary="Re-open a resolved comment thread",
)
async def reopen_thread(
    sow_id: int,
    thread_id: int,
    current_user: CurrentUser,
) -> SowCommentThread:
    return await _set_resolved(sow_id, thread_id, current_user, resolved=False)


async def _set_resolved(
    sow_id: int, thread_id: int, current_user: CurrentUser, *, resolved: bool
) -> SowCommentThread:
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_comment_actor(conn, sow_id, current_user.id)
        tier = await _resolve_user_tier(conn, sow_id=sow_id, user_id=current_user.id)
        thread = await conn.fetchrow(
            "SELECT * FROM sow_comment_threads WHERE id = $1 AND sow_id = $2",
            thread_id,
            sow_id,
        )
        if not thread:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
        if not await _can_resolve(
            conn,
            sow_id=sow_id,
            thread_author_id=thread["author_id"],
            user_id=current_user.id,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the thread author or a reviewer can change resolved state",
            )
        if resolved:
            new_resolved_at = datetime.now(UTC)
            await conn.execute(
                """
                UPDATE sow_comment_threads
                SET    resolved_at = $1, resolved_by = $2, updated_at = NOW()
                WHERE  id = $3
                """,
                new_resolved_at,
                current_user.id,
                thread_id,
            )
        else:
            await conn.execute(
                """
                UPDATE sow_comment_threads
                SET    resolved_at = NULL, resolved_by = NULL, updated_at = NOW()
                WHERE  id = $1
                """,
                thread_id,
            )

        thread_row = await conn.fetchrow(
            """
            SELECT t.*, u.full_name AS author_name, u.email AS author_email
            FROM   sow_comment_threads t
            JOIN   users u ON u.id = t.author_id
            WHERE  t.id = $1
            """,
            thread_id,
        )
        msg_rows = await conn.fetch(
            """
            SELECT m.*, u.full_name AS author_name, u.email AS author_email
            FROM   sow_comment_messages m
            JOIN   users u ON u.id = m.author_id
            WHERE  m.thread_id = $1
            ORDER  BY m.created_at ASC
            """,
            thread_id,
        )
        sow = await conn.fetchrow("SELECT content FROM sow_documents WHERE id = $1", sow_id)
        content = _extract_content(sow["content"]) if sow else {}

    return _build_thread_dto(
        thread_row=dict(thread_row),
        msg_rows=[dict(m) for m in msg_rows],
        content=content,
        viewer_tier=tier,
    )


# ── Suggestion apply / reject ────────────────────────────────────────────────


@router.post(
    "/{thread_id}/apply",
    response_model=SowCommentThread,
    summary="Apply a pending suggested edit to the SoW",
)
async def apply_suggestion(
    sow_id: int,
    thread_id: int,
    current_user: CurrentUser,
) -> SowCommentThread:
    """Apply the suggestion's ``replacement_text`` to ``sow.content``.

    Permission: SoW author OR any reviewer with ``suggest`` tier on this
    SoW. The thread must be ``kind='suggestion'`` and not yet applied or
    rejected. Mutates ``sow_documents.content`` and records an audit row;
    the suggestion thread itself is left in place (with ``applied_at``
    set) so reviewers can still discuss the change post-hoc.
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_comment_actor(conn, sow_id, current_user.id)
        tier = await _resolve_user_tier(conn, sow_id=sow_id, user_id=current_user.id)
        _require_tier(tier, needed="suggest")

        thread = await conn.fetchrow(
            "SELECT * FROM sow_comment_threads WHERE id = $1 AND sow_id = $2",
            thread_id,
            sow_id,
        )
        if not thread:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
        if thread["kind"] != "suggestion":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only suggestion threads can be applied",
            )
        if thread["applied_at"] is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This suggestion was already applied",
            )
        if thread["rejected_at"] is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This suggestion was rejected; reopen it before applying",
            )
        if thread["replacement_text"] is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Suggestion has no replacement_text — cannot apply",
            )

        sow = await conn.fetchrow(
            "SELECT id, status, content FROM sow_documents WHERE id = $1", sow_id
        )
        if not sow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found")
        if sow["status"] in ("finalized", "rejected"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot edit a {sow['status']} SoW",
            )

        content = _extract_content(sow["content"])
        try:
            new_content = apply_suggestion_to_content(
                content,
                section_key=thread["section_key"],
                anchor_text=thread["anchor_text"],
                replacement_text=thread["replacement_text"],
            )
        except SuggestionApplyError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": exc.code, "message": exc.message},
            ) from exc

        await conn.execute(
            "UPDATE sow_documents SET content = $1::jsonb, updated_at = NOW() WHERE id = $2",
            json.dumps(new_content),
            sow_id,
        )
        await conn.execute(
            """
            UPDATE sow_comment_threads
            SET    applied_at = NOW(),
                   applied_by = $1,
                   resolved_at = COALESCE(resolved_at, NOW()),
                   resolved_by = COALESCE(resolved_by, $1),
                   updated_at = NOW()
            WHERE  id = $2
            """,
            current_user.id,
            thread_id,
        )
        await insert_history(
            conn,
            sow_id=sow_id,
            user_id=current_user.id,
            change_type="suggestion_applied",
            diff={
                "thread_id": thread_id,
                "section_key": thread["section_key"],
                "before": thread["anchor_text"],
                "after": thread["replacement_text"],
            },
        )

        thread_row = await conn.fetchrow(
            """
            SELECT t.*, u.full_name AS author_name, u.email AS author_email
            FROM   sow_comment_threads t
            JOIN   users u ON u.id = t.author_id
            WHERE  t.id = $1
            """,
            thread_id,
        )
        msg_rows = await conn.fetch(
            """
            SELECT m.*, u.full_name AS author_name, u.email AS author_email
            FROM   sow_comment_messages m
            JOIN   users u ON u.id = m.author_id
            WHERE  m.thread_id = $1
            ORDER  BY m.created_at ASC
            """,
            thread_id,
        )

    return _build_thread_dto(
        thread_row=dict(thread_row),
        msg_rows=[dict(m) for m in msg_rows],
        content=new_content,
        viewer_tier=tier,
    )


@router.post(
    "/{thread_id}/reject",
    response_model=SowCommentThread,
    summary="Reject a pending suggested edit without changing the SoW",
)
async def reject_suggestion(
    sow_id: int,
    thread_id: int,
    current_user: CurrentUser,
) -> SowCommentThread:
    """Mark a suggestion as rejected. Requires ``suggest`` tier. The thread
    stays open for discussion; reviewers can ``reopen`` it later by clearing
    the rejection (handled implicitly by re-creating a fresh suggestion).
    """
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_comment_actor(conn, sow_id, current_user.id)
        tier = await _resolve_user_tier(conn, sow_id=sow_id, user_id=current_user.id)
        _require_tier(tier, needed="suggest")

        thread = await conn.fetchrow(
            "SELECT * FROM sow_comment_threads WHERE id = $1 AND sow_id = $2",
            thread_id,
            sow_id,
        )
        if not thread:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
        if thread["kind"] != "suggestion":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only suggestion threads can be rejected",
            )
        if thread["applied_at"] is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This suggestion was already applied",
            )

        await conn.execute(
            """
            UPDATE sow_comment_threads
            SET    rejected_at = NOW(),
                   rejected_by = $1,
                   updated_at = NOW()
            WHERE  id = $2
            """,
            current_user.id,
            thread_id,
        )

        thread_row = await conn.fetchrow(
            """
            SELECT t.*, u.full_name AS author_name, u.email AS author_email
            FROM   sow_comment_threads t
            JOIN   users u ON u.id = t.author_id
            WHERE  t.id = $1
            """,
            thread_id,
        )
        msg_rows = await conn.fetch(
            """
            SELECT m.*, u.full_name AS author_name, u.email AS author_email
            FROM   sow_comment_messages m
            JOIN   users u ON u.id = m.author_id
            WHERE  m.thread_id = $1
            ORDER  BY m.created_at ASC
            """,
            thread_id,
        )
        sow = await conn.fetchrow("SELECT content FROM sow_documents WHERE id = $1", sow_id)
        content = _extract_content(sow["content"]) if sow else {}

    return _build_thread_dto(
        thread_row=dict(thread_row),
        msg_rows=[dict(m) for m in msg_rows],
        content=content,
        viewer_tier=tier,
    )


@router.delete(
    "/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment thread",
)
async def delete_thread(
    sow_id: int,
    thread_id: int,
    current_user: CurrentUser,
):
    async with database.pg_pool.acquire() as conn, conn.transaction():
        await _require_comment_actor(conn, sow_id, current_user.id)
        thread = await conn.fetchrow(
            "SELECT author_id FROM sow_comment_threads WHERE id = $1 AND sow_id = $2",
            thread_id,
            sow_id,
        )
        if not thread:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
        if not await _can_delete(
            conn,
            sow_id=sow_id,
            thread_author_id=thread["author_id"],
            user_id=current_user.id,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the thread author or SoW author can delete this thread",
            )
        await conn.execute("DELETE FROM sow_comment_threads WHERE id = $1", thread_id)
    return None
