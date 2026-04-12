"""
AI / GraphRAG proxy router.

Each endpoint checks GRAPHRAG_API_URL. If set, it forwards the request to
the ML service via httpx. If not set (the default), it returns realistic stub
data so the frontend can be wired up before the ML service is deployed.

Endpoints marked "future" are stubs for ML routes that don't exist yet —
the frontend wires against them today and they'll start returning live data
once the ML service ships the matching routes.
"""

from __future__ import annotations

import httpx
from auth import CurrentUser
from config import GRAPHRAG_API_URL
from fastapi import APIRouter, HTTPException, Query, status

router = APIRouter(prefix="/api/ai", tags=["ai"])

# ── Stub data ─────────────────────────────────────────────────────────────────

STUB_CONTEXT = {
    "query": "",
    "sow_id": None,
    "methodology": None,
    "deal_value": None,
    "sections": [
        {
            "type": "SOWSection",
            "title": "Executive Summary",
            "content": "Sample executive summary content...",
            "score": 0.92,
        },
        {
            "type": "SOWSection",
            "title": "Scope of Work",
            "content": "Sample scope content...",
            "score": 0.87,
        },
    ],
    "rules": [
        {
            "type": "Rule",
            "name": "SLA Required",
            "description": "All engagements must include SLA terms",
            "category": "compliance",
        },
        {
            "type": "Rule",
            "name": "Data Privacy Clause",
            "description": "GDPR/CCPA compliance language required",
            "category": "compliance",
        },
    ],
    "banned_phrases": [
        {"phrase": "best effort", "reason": "Implies no guaranteed outcome", "severity": "high"},
        {"phrase": "unlimited", "reason": "Creates open-ended liability", "severity": "medium"},
    ],
    "risks": [
        {
            "category": "Staffing",
            "level": "medium",
            "description": "Key resource dependency on single SME",
        },
        {
            "category": "Timeline",
            "level": "low",
            "description": "Holiday period overlap with Phase 2",
        },
    ],
    "deliverables": [
        {"name": "Solution Design Document", "phase": "Discovery", "required": True},
        {"name": "Test Plan", "phase": "Implementation", "required": True},
    ],
    "similar_sections": [
        {
            "sow_id": "contoso-ccaas-platform",
            "section": "Executive Summary",
            "similarity": 0.85,
        },
    ],
    "empty": False,
}

STUB_ASSIST = {
    "answer": (
        "Based on the knowledge graph analysis, this SoW section should include specific SLA "
        "metrics (99.9% uptime), a detailed escalation matrix, and reference to the customer's "
        "existing support agreements. Consider adding a RACI matrix for the delivery team "
        "responsibilities."
    ),
    "context": {
        "methodology": "Agile Sprint Delivery",
        "deal_value": 2500000,
        "rules_applied": 3,
        "sections_referenced": 2,
    },
    "retrieved": {
        "nodes": 12,
        "relationships": 18,
        "hops": 2,
    },
}

STUB_VALIDATE = {
    "sow_id": "",
    "overall_score": 72,
    "summary": (
        "SoW meets most requirements but has gaps in SLA definition and risk mitigation sections."
    ),
    "violations": [
        {
            "rule": "Missing SLA terms",
            "severity": "high",
            "section": "Support & Transition",
            "message": (
                "No specific SLA metrics defined for uptime, response time, or resolution time"
            ),
        },
        {
            "rule": "Banned phrase detected",
            "severity": "medium",
            "section": "Executive Summary",
            "message": ("Contains 'best effort' language — replace with specific commitments"),
        },
        {
            "rule": "Missing data privacy clause",
            "severity": "high",
            "section": "Compliance",
            "message": "No GDPR/CCPA compliance language found",
        },
    ],
    "checklist": [
        {"item": "Executive Summary", "status": "pass", "notes": "Adequate coverage"},
        {"item": "Scope Definition", "status": "pass", "notes": "Clear in/out scope"},
        {"item": "SLA Terms", "status": "fail", "notes": "Not defined"},
        {
            "item": "Risk Register",
            "status": "warning",
            "notes": "Only 2 risks identified — typical engagements have 5-8",
        },
        {"item": "Pricing Breakdown", "status": "pass", "notes": "Detailed breakdown provided"},
    ],
    "approval": {
        "esap_type": "Type-2",
        "level": "Yellow",
        "required_reviewers": ["solution-architect", "sqa-reviewer", "cpl", "cdp"],
    },
    "suggestions": [
        {
            "section": "Support & Transition",
            "suggestion": (
                "Add specific uptime SLA (e.g., 99.9%) and response time targets "
                "for P1-P4 incidents"
            ),
        },
        {
            "section": "Assumptions & Risks",
            "suggestion": (
                "Add risks for: data migration complexity, third-party integration delays, "
                "customer resource availability"
            ),
        },
    ],
}

STUB_RISKS = {
    "risks": [
        {
            "category": "Staffing",
            "level": "high",
            "description": "Single point of failure on lead architect",
            "mitigation": "Identify backup resource during kickoff",
        },
        {
            "category": "Technical",
            "level": "medium",
            "description": "Legacy system integration complexity",
            "mitigation": "Conduct technical spike in Sprint 1",
        },
        {
            "category": "Commercial",
            "level": "low",
            "description": "Currency fluctuation on multi-region deal",
            "mitigation": "Lock exchange rate in contract terms",
        },
    ],
    "triggered": [
        {
            "rule": "High-value deal risk",
            "trigger": "deal_value > $2M",
            "recommendation": "Require senior delivery oversight",
        },
        {
            "rule": "Timeline risk",
            "trigger": "duration > 6 months",
            "recommendation": "Add quarterly checkpoint reviews",
        },
    ],
}

STUB_SIMILAR = [
    {
        "sow_id": "contoso-ccaas-platform",
        "title": "Contoso CCaaS Platform Migration",
        "similarity": 0.87,
        "shared_clauses": 12,
        "methodology": "Cloud Adoption",
        "overlap_areas": ["infrastructure", "migration", "support"],
        "outcome": "delivered",
    },
    {
        "sow_id": "contoso-data-analytics-platform",
        "title": "Contoso Data Analytics Platform",
        "similarity": 0.72,
        "shared_clauses": 9,
        "methodology": "Agile Sprint Delivery",
        "overlap_areas": ["data", "analytics", "dashboard"],
        "outcome": "delivered",
    },
    {
        "sow_id": "contoso-data-estate-modern",
        "title": "Contoso Data Estate Modernization",
        "similarity": 0.65,
        "shared_clauses": 7,
        "methodology": "Cloud Adoption",
        "overlap_areas": ["modernization", "cloud", "migration"],
        "outcome": "in-progress",
    },
]

STUB_ASSIST_RESPONSE = {
    "answer": (
        "Based on the historical SoW corpus, this section should include explicit "
        "acceptance criteria, a measurable SLA target, and a reference to the "
        "customer's existing support agreement. Consider adding a sentence on "
        "knowledge transfer responsibilities for the hypercare period."
    ),
    "context": {
        "rules_applied": 3,
        "sections_referenced": 4,
    },
    "retrieved": {
        "sections": [
            {"title": "Support Transition", "sow": "contoso-ccaas-platform", "score": 0.91},
            {"title": "Hypercare", "sow": "contoso-data-estate-modern", "score": 0.83},
        ],
        "rules": [
            {"name": "SLA Required", "category": "compliance"},
            {"name": "Hypercare Defined", "category": "delivery"},
        ],
    },
}

STUB_INSIGHTS = {
    "cpl": {
        "summary": (
            "Margin trends below practice target. Deal value places this in Type-2 ESAP. "
            "Recommend a finance review before final approval."
        ),
        "flags": [
            "Margin 4% below target",
            "Fixed-fee structure with limited risk reserve",
        ],
    },
    "cdp": {
        "summary": (
            "Account alignment verified. Customer has an active EA with room for "
            "services growth across the next two quarters."
        ),
        "flags": [
            "Customer has 2 active engagements",
            "Strategic account — long-term relationship impact",
        ],
    },
    "delivery-manager": {
        "summary": (
            "Resource plan has a single point of failure on the SA role. "
            "Timeline is aggressive for the scope; consider a buffer sprint."
        ),
        "flags": [
            "No backup SA identified",
            "Holiday freeze overlaps Sprint 4",
            "QA resource not allocated",
        ],
    },
}

STUB_SYNC = {
    "kg_node_id": None,
    "synced_at": None,
    "status": "pending",
    "detail": "Knowledge-graph ingest is not yet available — falling back to corpus mode.",
}

STUB_DOCUMENT_PROSE = {
    "available": False,
    "detail": "Document polish is not yet available from the ML service.",
}

STUB_APPROVAL = {
    "esap_type": "Type-2",
    "esap_level": "Yellow",
    "approval_chain": [
        {"role": "solution-architect", "stage": "internal_review", "required": True},
        {"role": "sqa-reviewer", "stage": "internal_review", "required": True},
        {"role": "cpl", "stage": "drm_review", "required": True},
        {"role": "cdp", "stage": "drm_review", "required": True},
    ],
    "thresholds": {
        "type_1": {"min_value": 5000000, "max_margin": 0.10},
        "type_2": {"min_value": 1000000, "max_margin": 0.15},
        "type_3": {"min_value": 0, "max_margin": 1.0},
    },
}

STUB_GRAPH_SUMMARY = {
    "nodes": [
        {"label": "SOW", "count": 7},
        {"label": "SOWSection", "count": 84},
        {"label": "Rule", "count": 23},
        {"label": "Risk", "count": 31},
        {"label": "Deliverable", "count": 45},
        {"label": "Methodology", "count": 4},
        {"label": "BannedPhrase", "count": 12},
    ],
    "relationships": [
        {"type": "HAS_SECTION", "count": 84},
        {"type": "USES_METHODOLOGY", "count": 7},
        {"type": "HAS_RISK", "count": 31},
        {"type": "HAS_DELIVERABLE", "count": 45},
        {"type": "SIMILAR_TO", "count": 18},
        {"type": "VIOLATES_RULE", "count": 9},
    ],
}


# ── Proxy helper ─────────────────────────────────────────────────────────────


async def _proxy_or_stub(method: str, path: str, stub_data: dict | list, **kwargs) -> dict | list:
    """Forward to GraphRAG API if configured, otherwise return stub data."""
    if GRAPHRAG_API_URL:
        async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=30.0) as client:
            if method == "GET":
                resp = await client.get(path, params=kwargs.get("params"))
            else:
                resp = await client.post(path, json=kwargs.get("json"))
            resp.raise_for_status()
            return resp.json()
    return stub_data


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/health")
async def ai_health(_: CurrentUser = None):
    """ML service connectivity check."""
    mode = "proxy" if GRAPHRAG_API_URL else "stub"
    if GRAPHRAG_API_URL:
        try:
            async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=5.0) as client:
                resp = await client.get("/health")
                resp.raise_for_status()
                return {"status": "ok", "mode": mode, "upstream": resp.json()}
        except Exception as exc:
            return {"status": "degraded", "mode": mode, "error": str(exc)}
    return {"status": "ok", "mode": mode}


@router.get("/context")
async def ai_context(
    query: str = Query(..., min_length=1),
    sow_id: str | None = None,
    top_k: int = Query(5, ge=1, le=50),
    hop_depth: int = Query(2, ge=1, le=5),
    _: CurrentUser = None,
):
    """Graph retrieval — returns relevant sections, rules, risks, and deliverables."""
    stub = dict(STUB_CONTEXT)
    stub["query"] = query
    stub["sow_id"] = sow_id
    return await _proxy_or_stub(
        "GET",
        "/context",
        stub,
        params={"query": query, "sow_id": sow_id, "top_k": top_k, "hop_depth": hop_depth},
    )


@router.post("/assist")
async def ai_assist(
    body: dict,
    _: CurrentUser = None,
):
    """GraphRAG + LLM authoring suggestions."""
    return await _proxy_or_stub("POST", "/assist", STUB_ASSIST, json=body)


@router.get("/sow/{sow_id}/validate")
async def ai_validate(sow_id: str, _: CurrentUser = None):
    """Rule-based SoW validation."""
    stub = dict(STUB_VALIDATE)
    stub["sow_id"] = sow_id
    return await _proxy_or_stub("GET", f"/sows/{sow_id}/validate", stub)


@router.get("/sow/{sow_id}/risks")
async def ai_risks(sow_id: str, _: CurrentUser = None):
    """Risk register + triggered risks for a SoW."""
    return await _proxy_or_stub("GET", f"/sows/{sow_id}/risks", STUB_RISKS)


@router.get("/sow/{sow_id}/similar")
async def ai_similar(sow_id: str, _: CurrentUser = None):
    """Find similar historical SoWs.

    Real ML returns ``shared_clauses`` per match. The proxy normalizes by
    deriving a ``similarity`` score (shared_clauses / max in set) so the
    frontend has one consistent shape.
    """
    data = await _proxy_or_stub("GET", f"/sows/{sow_id}/similar", STUB_SIMILAR)
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
    _: CurrentUser = None,
):
    """ESAP level determination + approval chain."""
    return await _proxy_or_stub(
        "GET", "/approval", STUB_APPROVAL, params={"value": value, "margin": margin}
    )


@router.get("/graph/summary")
async def ai_graph_summary(_: CurrentUser = None):
    """Knowledge graph node/relationship counts."""
    return await _proxy_or_stub("GET", "/graph/summary", STUB_GRAPH_SUMMARY)


# ── Future ML endpoints (stubbed) ────────────────────────────────────────────
#
# Each endpoint below proxies to an ML route that does not yet exist. Until
# the ML team ships those routes, the proxy returns a graceful "not yet
# available" payload so the frontend can wire UI today and have it light up
# the moment ML adds them.


@router.post("/sow/{sow_id}/sync")
async def ai_sync_sow(sow_id: str, body: dict | None = None, _: CurrentUser = None):
    """Push an app SoW into Neo4j and return its ``kg_node_id``.

    Future ML route: ``POST /sows/ingest``. Returns a sentinel payload until
    that route exists so callers can detect the degraded mode.
    """
    if GRAPHRAG_API_URL:
        try:
            async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=60.0) as client:
                resp = await client.post("/sows/ingest", json=body or {"sow_id": sow_id})
                if resp.status_code in (404, 501):
                    return {**STUB_SYNC, "sow_id": sow_id}
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"message": f"ML sync failed: {exc}", "retryable": True},
            ) from exc
    return {**STUB_SYNC, "sow_id": sow_id}


@router.delete("/sow/{sow_id}/sync")
async def ai_unsync_sow(sow_id: str, _: CurrentUser = None):
    """Drop an app SoW from the KG. Future ML route: ``DELETE /sows/{id}``."""
    if GRAPHRAG_API_URL:
        try:
            async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=10.0) as client:
                resp = await client.delete(f"/sows/{sow_id}")
                if resp.status_code in (404, 501):
                    return {"deleted": False, "detail": "Upstream delete not yet available"}
                resp.raise_for_status()
                return {"deleted": True}
        except httpx.HTTPError:
            return {"deleted": False, "detail": "Upstream delete failed"}
    return {"deleted": False, "detail": "ML service not configured"}


@router.post("/assist/stream")
async def ai_assist_stream(body: dict, _: CurrentUser = None):
    """SSE-streamed assist. Future ML route: ``POST /assist/stream``.

    Until the streaming route exists, this returns 503 so the frontend
    falls back to the non-streaming ``/assist`` path with a typing indicator.
    """
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "message": "Streaming assist is not yet available upstream",
            "retryable": False,
        },
    )


@router.get("/sow/{sow_id}/insights/{role}")
async def ai_insights(sow_id: str, role: str, _: CurrentUser = None):
    """Role-specific narrative insights for a reviewer.

    Future ML route: ``GET /sows/{id}/insights/{role}``.
    """
    stub = STUB_INSIGHTS.get(role, {"summary": None, "flags": []})
    if GRAPHRAG_API_URL:
        try:
            async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=10.0) as client:
                resp = await client.get(f"/sows/{sow_id}/insights/{role}")
                if resp.status_code in (404, 501):
                    return stub
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError:
            return stub
    return stub


@router.post("/document/prose")
async def ai_document_prose(body: dict, _: CurrentUser = None):
    """Polished prose generation from structured SoW data.

    Future ML route: ``POST /document/prose``. Returns 503 with a clear
    "coming soon" payload until the upstream route exists.
    """
    if GRAPHRAG_API_URL:
        try:
            async with httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=60.0) as client:
                resp = await client.post("/document/prose", json=body)
                if resp.status_code in (404, 501):
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail={**STUB_DOCUMENT_PROSE, "retryable": False},
                    )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"message": f"Document prose failed: {exc}", "retryable": True},
            ) from exc
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={**STUB_DOCUMENT_PROSE, "retryable": False},
    )


@router.get("/sows")
async def ai_kg_sows(_: CurrentUser = None):
    """List SoWs already ingested into the KG (admin/debug only)."""
    return await _proxy_or_stub("GET", "/sows", [])


@router.get("/schema/proposals")
async def ai_schema_proposals(
    sproposal_status: str | None = Query(None, alias="status"),
    kind: str | None = None,
    _: CurrentUser = None,
):
    """LLM-extracted schema-evolution proposals (admin only)."""
    return await _proxy_or_stub(
        "GET",
        "/schema/proposals",
        [],
        params={"status": sproposal_status, "kind": kind},
    )
