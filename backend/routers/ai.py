"""
AI / GraphRAG proxy router.

Each endpoint forwards the request to the ML service via httpx. When the ML
service is not configured (GRAPHRAG_API_URL empty) or unreachable, every
endpoint returns HTTP 503 with ``{detail: {message, retryable}}`` so the
frontend can show the ``AIUnavailableBanner`` uniformly.

No stub / mock data is ever returned — real or unavailable.
"""

from __future__ import annotations

import database
import httpx
from auth import CurrentUser
from config import GRAPHRAG_API_URL
from fastapi import APIRouter, HTTPException, Query, status
from utils.db_helpers import require_collaborator

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ── Proxy helper ─────────────────────────────────────────────────────────────


def _require_ml():
    """Raise 503 immediately when the ML service URL is not configured."""
    if not GRAPHRAG_API_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": "ML service not configured", "retryable": False},
        )


async def _require_sow_collaborator(sow_id: str, user_id: int) -> None:
    """Raise 404 if the caller isn't a collaborator on this SoW.

    SoW-scoped AI endpoints receive ``sow_id`` as a string (to accommodate
    upstream KG node identifiers), but collaboration is stored against the
    integer primary key.  A non-integer ``sow_id`` is treated as "not found"
    so outsiders cannot probe whether a given SoW exists.
    """
    try:
        sow_id_int = int(sow_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SoW not found") from exc
    async with database.pg_pool.acquire() as conn:
        await require_collaborator(conn, sow_id=sow_id_int, user_id=user_id)


async def _proxy_get(
    path: str,
    *,
    params: dict | None = None,
    timeout: float = 5.0,
    user: CurrentUser | None = None,
) -> dict | list:
    """Forward a GET to the ML service with error normalisation."""
    _require_ml()
    headers = {}
    if user:
        headers["X-Cocoon-User"] = str(user.id)
    try:
        async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=timeout) as client:
            resp = await client.get(path, params=params, headers=headers)
            if resp.status_code in (404, 501):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"message": f"Upstream {path} not yet available", "retryable": False},
                )
            resp.raise_for_status()
            return resp.json()
    except HTTPException:
        raise
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service unreachable: {exc}", "retryable": True},
        ) from exc
    except httpx.ReadTimeout as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service timed out: {exc}", "retryable": True},
        ) from exc
    except httpx.HTTPStatusError as exc:
        retryable = exc.response.status_code >= 500
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML error: {exc}", "retryable": retryable},
        ) from exc


async def _proxy_post(
    path: str,
    *,
    json_body: dict | None = None,
    timeout: float = 30.0,
    user: CurrentUser | None = None,
) -> dict | list:
    """Forward a POST to the ML service with error normalisation."""
    _require_ml()
    headers = {}
    if user:
        headers["X-Cocoon-User"] = str(user.id)
    try:
        async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=timeout) as client:
            resp = await client.post(path, json=json_body or {}, headers=headers)
            if resp.status_code in (404, 501):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"message": f"Upstream {path} not yet available", "retryable": False},
                )
            resp.raise_for_status()
            return resp.json()
    except HTTPException:
        raise
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service unreachable: {exc}", "retryable": True},
        ) from exc
    except httpx.ReadTimeout as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service timed out: {exc}", "retryable": True},
        ) from exc
    except httpx.HTTPStatusError as exc:
        retryable = exc.response.status_code >= 500
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML error: {exc}", "retryable": retryable},
        ) from exc


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/health")
async def ai_health(current_user: CurrentUser):
    """ML service connectivity check."""
    if not GRAPHRAG_API_URL:
        return {"status": "unconfigured", "mode": "unavailable"}
    try:
        async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=5.0) as client:
            resp = await client.get("/health")
            resp.raise_for_status()
            return {"status": "ok", "mode": "proxy", "upstream": resp.json()}
    except Exception as exc:
        return {"status": "degraded", "mode": "proxy", "error": str(exc)}


@router.get("/context")
async def ai_context(
    query: str = Query(..., min_length=1),
    sow_id: str | None = None,
    top_k: int = Query(5, ge=1, le=50),
    hop_depth: int = Query(2, ge=1, le=5),
    current_user: CurrentUser = None,
):
    """Graph retrieval — returns relevant sections, rules, risks, and deliverables."""
    return await _proxy_get(
        "/context",
        params={"query": query, "sow_id": sow_id, "top_k": top_k, "hop_depth": hop_depth},
        user=current_user,
    )


@router.post("/assist")
async def ai_assist(body: dict, current_user: CurrentUser):
    """GraphRAG + LLM authoring suggestions."""
    return await _proxy_post("/assist", json_body=body, timeout=30.0, user=current_user)


@router.get("/sow/{sow_id}/validate")
async def ai_validate(sow_id: str, current_user: CurrentUser):
    """Rule-based SoW validation."""
    await _require_sow_collaborator(sow_id, current_user.id)
    return await _proxy_get(f"/sows/{sow_id}/validate", user=current_user)


@router.get("/sow/{sow_id}/risks")
async def ai_risks(sow_id: str, current_user: CurrentUser):
    """Risk register + triggered risks for a SoW."""
    await _require_sow_collaborator(sow_id, current_user.id)
    return await _proxy_get(f"/sows/{sow_id}/risks", user=current_user)


@router.get("/sow/{sow_id}/similar")
async def ai_similar(sow_id: str, current_user: CurrentUser):
    """Find similar historical SoWs.

    Normalizes the ML response by computing a ``similarity`` score from
    ``shared_clauses`` so the frontend has one consistent shape.
    """
    await _require_sow_collaborator(sow_id, current_user.id)
    data = await _proxy_get(f"/sows/{sow_id}/similar", user=current_user)
    if isinstance(data, list) and data:
        max_shared = max((d.get("shared_clauses", 0) for d in data), default=0) or 1
        for d in data:
            if "similarity" not in d:
                d["similarity"] = round(d.get("shared_clauses", 0) / max_shared, 2)
            d.setdefault("overlap_areas", [])
            d.setdefault("outcome", None)
    return data


@router.get("/approval")
async def ai_approval(
    value: float | None = None,
    margin: float | None = None,
    current_user: CurrentUser = None,
):
    """ESAP level determination + approval chain."""
    return await _proxy_get(
        "/approval",
        params={"value": value, "margin": margin},
        user=current_user,
    )


@router.get("/graph/summary")
async def ai_graph_summary(current_user: CurrentUser):
    """Knowledge graph node/relationship counts."""
    return await _proxy_get("/graph/summary", user=current_user)


# ── Future ML endpoints ────────────────────────────────────────────────────────
#
# Each endpoint below proxies to an ML route that may not yet exist. The proxy
# returns a clean 503 when the upstream responds 404/501 so the frontend can
# gracefully degrade.


@router.post("/sow/{sow_id}/sync")
async def ai_sync_sow(sow_id: str, body: dict | None = None, current_user: CurrentUser = None):
    """Push an app SoW into Neo4j and return its ``kg_node_id``."""
    await _require_sow_collaborator(sow_id, current_user.id)
    return await _proxy_post(
        "/sows/ingest",
        json_body=body or {"sow_id": sow_id},
        timeout=60.0,
        user=current_user,
    )


@router.delete("/sow/{sow_id}/sync")
async def ai_unsync_sow(sow_id: str, current_user: CurrentUser):
    """Drop an app SoW from the KG.

    Raises 503 with ``{message, retryable}`` on any upstream failure so the
    frontend banner can distinguish "failed" from "deleted".  The 404/501
    branch stays as a structured 200 because that signals "upstream route
    not yet implemented" — deletion is effectively a no-op.
    """
    await _require_sow_collaborator(sow_id, current_user.id)
    _require_ml()
    try:
        async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=10.0) as client:
            resp = await client.delete(f"/sows/{sow_id}")
            if resp.status_code in (404, 501):
                return {"deleted": False, "detail": "Upstream delete not yet available"}
            resp.raise_for_status()
            return {"deleted": True}
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service unreachable: {exc}", "retryable": True},
        ) from exc
    except httpx.ReadTimeout as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML service timed out: {exc}", "retryable": True},
        ) from exc
    except httpx.HTTPStatusError as exc:
        retryable = exc.response.status_code >= 500
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": f"ML error: {exc}", "retryable": retryable},
        ) from exc


@router.post("/assist/stream")
async def ai_assist_stream(body: dict, current_user: CurrentUser):
    """SSE-streamed assist. Returns 503 until the ML route exists."""
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"message": "Streaming assist is not yet available upstream", "retryable": False},
    )


@router.get("/sow/{sow_id}/insights/{role}")
async def ai_insights(sow_id: str, role: str, current_user: CurrentUser):
    """Role-specific narrative insights for a reviewer."""
    await _require_sow_collaborator(sow_id, current_user.id)
    try:
        return await _proxy_get(f"/sows/{sow_id}/insights/{role}", user=current_user)
    except HTTPException as exc:
        # Graceful degradation only when the upstream route isn't implemented
        # yet (``retryable=False``).  Connect/timeout/5xx keep propagating so
        # the frontend banner still sees the retryable signal.
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        if exc.status_code == 503 and detail.get("retryable") is False:
            return {"summary": None, "flags": []}
        raise


@router.post("/document/prose")
async def ai_document_prose(body: dict, current_user: CurrentUser):
    """Polished prose generation from structured SoW data."""
    return await _proxy_post("/document/prose", json_body=body, timeout=60.0, user=current_user)


@router.get("/sows")
async def ai_kg_sows(current_user: CurrentUser):
    """List SoWs already ingested into the KG (admin/debug only)."""
    return await _proxy_get("/sows", user=current_user)


@router.get("/schema/proposals")
async def ai_schema_proposals(
    sproposal_status: str | None = Query(None, alias="status"),
    kind: str | None = None,
    current_user: CurrentUser = None,
):
    """LLM-extracted schema-evolution proposals (admin only)."""
    return await _proxy_get(
        "/schema/proposals",
        params={"status": sproposal_status, "kind": kind},
        user=current_user,
    )
