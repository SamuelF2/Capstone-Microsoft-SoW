"""
AI / GraphRAG proxy router.

Each endpoint checks GRAPHRAG_API_URL. If set, it forwards the request to
the ML service via httpx. If not set (the default), it returns realistic stub
data so the frontend can be wired up before the ML service is deployed.
"""

from __future__ import annotations

import httpx
from auth import CurrentUser
from config import GRAPHRAG_API_URL
from fastapi import APIRouter, Query

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
        "methodology": "Cloud Adoption",
        "overlap_areas": ["infrastructure", "migration", "support"],
    },
    {
        "sow_id": "contoso-data-analytics-platform",
        "title": "Contoso Data Analytics Platform",
        "similarity": 0.72,
        "methodology": "Agile Sprint Delivery",
        "overlap_areas": ["data", "analytics", "dashboard"],
    },
    {
        "sow_id": "contoso-data-estate-modern",
        "title": "Contoso Data Estate Modernization",
        "similarity": 0.65,
        "methodology": "Cloud Adoption",
        "overlap_areas": ["modernization", "cloud", "migration"],
    },
]

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
    """Find similar historical SoWs."""
    return await _proxy_or_stub("GET", f"/sows/{sow_id}/similar", STUB_SIMILAR)


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
