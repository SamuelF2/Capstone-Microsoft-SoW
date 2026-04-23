"""
AI orchestration layer.

Fans out parallel calls to the ML GraphRAG service and assembles the union
into typed result objects the frontend already speaks.

If ML is unreachable, raises AIUnavailableError — never returns mock data.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import time
from datetime import UTC, datetime

import httpx
from config import GRAPHRAG_API_URL
from models import (
    AIAnalysisResult,
    ApprovalRouting,
    ChecklistSuggestion,
    RiskResult,
    SectionSuggestion,
    ViolationResult,
)

# ── Exceptions ───────────────────────────────────────────────────────────────


class AIUnavailableError(Exception):
    """Raised when the ML service is unreachable or a needed endpoint is missing."""

    def __init__(self, message: str, *, retryable: bool = True):
        self.retryable = retryable
        super().__init__(message)


# ── Severity mapping ─────────────────────────────────────────────────────────

SEVERITY_MAP = {
    "critical": "high",
    "high": "high",
    "medium": "medium",
    "low": "low",
}

# Scoring weights per severity
SEVERITY_WEIGHT = {"high": 15, "medium": 8, "low": 3}

# Timeouts by endpoint class
_FAST_TIMEOUT = 5.0
_LLM_TIMEOUT = 30.0
_SYNC_TIMEOUT = 60.0


# ── Internal HTTP helpers ────────────────────────────────────────────────────


def _base_url() -> str:
    return GRAPHRAG_API_URL


def _ml_available() -> bool:
    return bool(GRAPHRAG_API_URL)


async def _ml_get(
    path: str, *, params: dict | None = None, timeout: float = _FAST_TIMEOUT
) -> dict | list | None:
    """GET from the ML service. Returns None on 404/501 (endpoint not shipped yet)."""
    if not _ml_available():
        raise AIUnavailableError("ML service not configured (GRAPHRAG_API_URL is empty)")
    try:
        async with httpx.AsyncClient(base_url=_base_url(), timeout=timeout) as client:
            resp = await client.get(path, params=params)
            if resp.status_code in (404, 501):
                return None
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError as exc:
        raise AIUnavailableError(f"ML service unreachable: {exc}") from exc
    except httpx.ReadTimeout as exc:
        raise AIUnavailableError(f"ML service timed out: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code >= 500:
            raise AIUnavailableError(f"ML service error: {exc}", retryable=True) from exc
        raise AIUnavailableError(f"ML request failed: {exc}", retryable=False) from exc


async def _ml_post(
    path: str, *, json_body: dict | None = None, timeout: float = _LLM_TIMEOUT
) -> dict | list | None:
    """POST to the ML service. Returns None on 404/501."""
    if not _ml_available():
        raise AIUnavailableError("ML service not configured (GRAPHRAG_API_URL is empty)")
    try:
        async with httpx.AsyncClient(base_url=_base_url(), timeout=timeout) as client:
            resp = await client.post(path, json=json_body or {})
            if resp.status_code in (404, 501):
                return None
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError as exc:
        raise AIUnavailableError(f"ML service unreachable: {exc}") from exc
    except httpx.ReadTimeout as exc:
        raise AIUnavailableError(f"ML service timed out: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code >= 500:
            raise AIUnavailableError(f"ML service error: {exc}", retryable=True) from exc
        raise AIUnavailableError(f"ML request failed: {exc}", retryable=False) from exc


async def _ml_delete(path: str, *, timeout: float = _FAST_TIMEOUT) -> dict | None:
    """DELETE on the ML service. Best-effort, never raises."""
    if not _ml_available():
        return None
    try:
        async with httpx.AsyncClient(base_url=_base_url(), timeout=timeout) as client:
            resp = await client.delete(path)
            if resp.status_code in (404, 501):
                return None
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None


# ── Content hashing ──────────────────────────────────────────────────────────


def compute_content_hash(content: dict | None) -> str:
    """SHA-256 of the canonical JSON content for change detection."""
    blob = json.dumps(content or {}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


# ── KG sync ──────────────────────────────────────────────────────────────────


async def sync_sow_to_kg(conn, sow_row: dict) -> str | None:
    """Push the SoW into Neo4j; return the kg_node_id.

    If the ML ingest endpoint doesn't exist yet (404/501), returns None
    to signal corpus-only degraded mode. The caller should proceed with
    KG-independent endpoints only.
    """
    sow_id = sow_row["id"]
    content = sow_row.get("content") or {}
    if isinstance(content, str):
        content = json.loads(content)

    new_hash = compute_content_hash(content)
    existing_kg_id = sow_row.get("kg_node_id")
    existing_hash = sow_row.get("kg_content_hash")

    # Already synced and content unchanged — skip
    if existing_kg_id and existing_hash == new_hash:
        return existing_kg_id

    payload = {
        "sow_id": str(sow_id),
        "title": sow_row.get("title", ""),
        "methodology": sow_row.get("methodology", ""),
        "customer_name": sow_row.get("customer_name", ""),
        "deal_value": float(sow_row.get("deal_value") or 0),
        "content": content,
    }

    if existing_kg_id:
        # Re-ingest (content changed)
        result = await _ml_post(
            f"/sows/{existing_kg_id}/reingest", json_body=payload, timeout=_SYNC_TIMEOUT
        )
    else:
        # First ingest
        result = await _ml_post("/sows/ingest", json_body=payload, timeout=_SYNC_TIMEOUT)

    if result is None:
        # Ingest endpoint not available yet — degraded mode
        return None

    kg_node_id = result.get("kg_node_id") or result.get("id") or str(sow_id)

    # Persist the bridge
    await conn.execute(
        "UPDATE sow_documents SET kg_node_id = $1, kg_content_hash = $2 WHERE id = $3",
        kg_node_id,
        new_hash,
        sow_id,
    )

    return kg_node_id


# ── Response mapping helpers ─────────────────────────────────────────────────


def _map_validate_to_violations(data: dict) -> list[ViolationResult]:
    """Map ML /validate response to ViolationResult list."""
    violations: list[ViolationResult] = []

    for bp in data.get("banned_phrases", []):
        violations.append(
            ViolationResult(
                rule="Banned phrase",
                severity=SEVERITY_MAP.get(bp.get("severity", "medium"), "medium"),
                message=f'"{bp.get("phrase", "")}" — {bp.get("suggestion", "Remove this phrase")}',
                section=bp.get("section"),
            )
        )

    for ms in data.get("missing_sections", []):
        violations.append(
            ViolationResult(
                rule="Missing required section",
                severity="high",
                message=ms.get("error", f"Missing section: {ms.get('missing_section', 'unknown')}"),
                section=ms.get("missing_section"),
            )
        )

    for d in data.get("deliverables_missing_ac", []):
        violations.append(
            ViolationResult(
                rule="Missing acceptance criteria",
                severity="medium",
                message="Deliverable lacks measurable acceptance criteria",
                section=f"Deliverable: {d.get('deliverable', 'unknown')}",
            )
        )

    for r in data.get("risks_without_mitigation", []):
        violations.append(
            ViolationResult(
                rule="Risk without mitigation",
                severity=SEVERITY_MAP.get(r.get("severity", "medium"), "medium"),
                message=f"Risk has no mitigation strategy: {r.get('risk', '')}",
                section="Risks",
            )
        )

    for mk in data.get("missing_methodology_keywords", []):
        violations.append(
            ViolationResult(
                rule="Missing methodology keyword",
                severity="low",
                message=f'Missing keyword "{mk.get("missing_keyword", "")}" for methodology {mk.get("methodology", "")}',
                section=None,
            )
        )

    for abp in data.get("ac_banned_phrases", []):
        violations.append(
            ViolationResult(
                rule="Banned phrase in acceptance criteria",
                severity=SEVERITY_MAP.get(abp.get("severity", "medium"), "medium"),
                message=f'"{abp.get("phrase", "")}" in deliverable "{abp.get("deliverable", "")}" — {abp.get("suggestion", "")}',
                section="Deliverables",
            )
        )

    return violations


def _map_validate_to_suggestions(data: dict) -> list[SectionSuggestion]:
    """Extract text suggestions from validate response."""
    suggestions: list[SectionSuggestion] = []

    for bp in data.get("banned_phrases", []):
        if bp.get("suggestion"):
            suggestions.append(
                SectionSuggestion(
                    section=bp.get("section", ""),
                    current_text=bp.get("phrase", ""),
                    suggested_text=bp.get("suggestion", ""),
                    rationale=f"Banned phrase — {bp.get('reason', 'replace with compliant language')}",
                )
            )

    for d in data.get("deliverables_missing_ac", []):
        suggestions.append(
            SectionSuggestion(
                section=f"Deliverable: {d.get('deliverable', '')}",
                current_text="",
                suggested_text="Add measurable acceptance criteria with specific metrics, timeline, and approval process.",
                rationale="All deliverables require explicit acceptance criteria.",
            )
        )

    return suggestions


def _map_risks(data: dict) -> list[RiskResult]:
    """Map ML /risks response to RiskResult list."""
    risks: list[RiskResult] = []

    for r in data.get("risks", []):
        risks.append(
            RiskResult(
                category=r.get("category", "General"),
                level=SEVERITY_MAP.get(r.get("severity", "medium"), "medium"),
                description=r.get("description", ""),
            )
        )

    for t in data.get("triggered", []):
        risks.append(
            RiskResult(
                category="Triggered",
                level=SEVERITY_MAP.get(t.get("severity", "medium"), "medium"),
                description=f"{t.get('trigger', '')} — {t.get('reason', '')}",
            )
        )

    return risks


def _map_approval(data: dict) -> ApprovalRouting:
    """Map ML /approval response to ApprovalRouting."""
    level_map = {"type-1": "Red", "type-2": "Yellow", "type-3": "Green"}
    level_id = data.get("level_id", "type-3")
    approvers = data.get("approvers", [])
    return ApprovalRouting(
        level=level_map.get(level_id, "Yellow"),
        esap_type=level_id.replace("type-", "Type-"),
        reason=approvers[0].get("reason", "") if approvers else "",
        chain=[
            a.get("display_name", a.get("approver", "")) for a in approvers if a.get("required")
        ],
    )


def _compute_score(violations: list[ViolationResult]) -> float:
    """Weighted score from violation severities. Baseline 100."""
    penalty = sum(SEVERITY_WEIGHT.get(v.severity, 3) for v in violations)
    return max(0.0, min(100.0, 100.0 - penalty))


# ── Main orchestration ───────────────────────────────────────────────────────


async def analyze_sow(conn, sow_row: dict) -> AIAnalysisResult:
    """Full SoW analysis via parallel fan-out to ML endpoints.

    Steps:
      1. Sync SoW to KG (if needed / if ingest available)
      2. Fan out parallel calls to validate, risks, similar, approval
      3. Map each response into typed result pieces
      4. Compute score, build summary
      5. Return AIAnalysisResult (caller persists)
    """
    if not _ml_available():
        raise AIUnavailableError("ML service not configured (GRAPHRAG_API_URL is empty)")

    t0 = time.monotonic()
    endpoints_used: list[str] = []

    # 1. Sync to KG
    kg_node_id = None
    with contextlib.suppress(AIUnavailableError):
        kg_node_id = await sync_sow_to_kg(conn, sow_row)

    # 2. Fan out parallel calls
    # If we have a kg_node_id, use it for KG-scoped endpoints.
    # Otherwise, skip validate/risks (they need a KG SOW ID) and use
    # whatever corpus-based endpoints we can.
    tasks: dict[str, asyncio.Task] = {}

    async def _safe_call(name: str, coro):
        """Wrap a coroutine so it returns None on error instead of failing the gather."""
        try:
            result = await coro
            endpoints_used.append(name)
            return result
        except AIUnavailableError:
            return None
        except Exception:
            return None

    if kg_node_id:
        tasks["validate"] = asyncio.create_task(
            _safe_call("validate", _ml_get(f"/sows/{kg_node_id}/validate"))
        )
        tasks["risks"] = asyncio.create_task(
            _safe_call("risks", _ml_get(f"/sows/{kg_node_id}/risks"))
        )
        tasks["similar"] = asyncio.create_task(
            _safe_call("similar", _ml_get(f"/sows/{kg_node_id}/similar", params={"limit": "5"}))
        )

    # Approval uses deal_value / margin, not KG node
    deal_value = float(sow_row.get("deal_value") or 0)
    margin = float(sow_row.get("estimated_margin") or 0)
    if deal_value > 0:
        tasks["approval"] = asyncio.create_task(
            _safe_call(
                "approval",
                _ml_get(
                    "/approval",
                    params={"value": str(deal_value), "margin": str(margin)},
                ),
            )
        )

    # Context call (works without kg_node_id against historical corpus)
    content = sow_row.get("content") or {}
    if isinstance(content, str):
        content = json.loads(content)
    title = sow_row.get("title", "")
    context_query = title or next(iter(content.values()), "")[:500] if content else ""
    if context_query:
        tasks["context"] = asyncio.create_task(
            _safe_call(
                "context",
                _ml_get(
                    "/context",
                    params={"query": context_query[:500], "top_k": "5", "hop_depth": "2"},
                ),
            )
        )

    # Await all
    if tasks:
        await asyncio.gather(*tasks.values())

    results = {k: t.result() for k, t in tasks.items()}

    # 3. Map responses
    violations: list[ViolationResult] = []
    suggestions: list[SectionSuggestion] = []
    risks: list[RiskResult] = []

    if results.get("validate"):
        violations = _map_validate_to_violations(results["validate"])
        suggestions = _map_validate_to_suggestions(results["validate"])

    if results.get("risks"):
        risks = _map_risks(results["risks"])

    # Approval
    if results.get("approval"):
        approval = _map_approval(results["approval"])
    else:
        # Fallback: compute locally from deal_value/margin
        if deal_value >= 5_000_000 or margin <= 0.10:
            level, esap = "Red", "Type-1"
        elif deal_value >= 1_000_000 or margin <= 0.15:
            level, esap = "Yellow", "Type-2"
        else:
            level, esap = "Green", "Type-3"
        approval = ApprovalRouting(
            level=level,
            esap_type=esap,
            reason=f"Computed locally: deal_value={deal_value}, margin={margin}",
            chain=[],
        )

    # Checklist: static from backend JSON for now
    checklist = _load_static_checklist(sow_row.get("methodology"))

    # 4. Score + summary
    overall_score = _compute_score(violations)
    high_count = sum(1 for v in violations if v.severity == "high")
    summary = (
        f"SoW has {high_count} high-severity issue{'s' if high_count != 1 else ''} "
        f"requiring attention."
        if high_count > 0
        else "SoW passed AI analysis with no high-severity issues."
    )

    # Add note when running in degraded mode
    if not kg_node_id and (not results.get("validate")):
        summary += (
            " (Note: validation ran against historical corpus only — KG ingest not yet available.)"
        )

    latency_ms = round((time.monotonic() - t0) * 1000)

    return AIAnalysisResult(
        violations=violations,
        risks=risks,
        approval=approval,
        checklist=checklist,
        suggestions=suggestions,
        overall_score=overall_score,
        summary=summary,
        generated_at=datetime.now(UTC),
        generation_meta={
            "endpoints_used": endpoints_used,
            "latency_ms": latency_ms,
            "kg_node_id": kg_node_id,
            "model_version": "graphrag-v1",
        },
    )


def _load_static_checklist(methodology: str | None) -> list[ChecklistSuggestion]:
    """Load checklist from Data/rules/review-checklists.json."""
    import os

    from config import RULES_DIR

    path = os.path.join(RULES_DIR, "review-checklists.json")
    try:
        with open(path) as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

    # The file may have role-specific checklists or a flat list.
    # Try to find a methodology-specific or generic checklist.
    items: list[dict] = []
    if isinstance(data, dict):
        # Try methodology key, then "default", then first available
        for key_name in ["solution-architect", "sqa-reviewer"]:
            role_data = data.get(key_name)
            if isinstance(role_data, dict) and "items" in role_data:
                items.extend(role_data["items"])
                break
        if not items:
            # Flatten all role items
            for v in data.values():
                if isinstance(v, dict) and "items" in v:
                    items.extend(v["items"])
    elif isinstance(data, list):
        items = data

    seen_ids: set[str] = set()
    checklist: list[ChecklistSuggestion] = []
    for item in items:
        item_id = item.get("id", "")
        if item_id in seen_ids:
            continue
        seen_ids.add(item_id)
        checklist.append(
            ChecklistSuggestion(
                id=item_id,
                text=item.get("text", ""),
                category=item.get("category", "general"),
                required=item.get("required", False),
                auto_result=None,
            )
        )

    return checklist


# ── Cached analysis ──────────────────────────────────────────────────────────


async def get_cached_analysis(conn, sow_id: int) -> AIAnalysisResult | None:
    """Read the latest ai_suggestion row for this SoW without re-running."""
    row = await conn.fetchrow(
        """
        SELECT a.validation_recommendation, a.risks, a.generated_at, a.generation_meta
        FROM sow_documents s
        LEFT JOIN ai_suggestion a ON a.id = s.ai_suggestion_id
        WHERE s.id = $1
        """,
        sow_id,
    )
    if not row or row["validation_recommendation"] is None:
        return None

    rec = row["validation_recommendation"]
    risks = row["risks"]
    if isinstance(rec, str):
        rec = json.loads(rec)
    if isinstance(risks, str):
        risks = json.loads(risks)
    rec = rec or {}

    gen_meta = row.get("generation_meta")
    if isinstance(gen_meta, str):
        gen_meta = json.loads(gen_meta)

    return AIAnalysisResult(
        violations=rec.get("violations", []),
        risks=risks or [],
        approval=rec.get("approval")
        or {"level": "Yellow", "esap_type": "Type-2", "reason": "", "chain": []},
        checklist=rec.get("checklist", []),
        suggestions=rec.get("suggestions", []),
        overall_score=rec.get("overall_score"),
        summary=rec.get("summary"),
        generated_at=row.get("generated_at"),
        generation_meta=gen_meta,
    )


# ── Context / Assist wrappers ────────────────────────────────────────────────


async def retrieve_context(query: str, sow_id: int | None = None) -> dict:
    """Wrap ML /context for the live draft sidebar."""
    params: dict = {"query": query[:500], "top_k": "5", "hop_depth": "2"}
    if sow_id is not None:
        params["sow_id"] = str(sow_id)
    result = await _ml_get("/context", params=params)
    if result is None:
        raise AIUnavailableError("Context endpoint not available", retryable=True)
    return result


async def generate_assist_response(
    query: str,
    sow_id: int | None = None,
    history: list[dict] | None = None,
) -> dict:
    """Wrap ML /assist for the chat panel and per-section improve flow."""
    body: dict = {"query": query}
    if sow_id is not None:
        body["sow_id"] = str(sow_id)
    if history:
        body["history"] = history
    result = await _ml_post("/assist", json_body=body, timeout=_LLM_TIMEOUT)
    if result is None:
        raise AIUnavailableError("Assist endpoint not available", retryable=True)
    return result


async def get_role_insights(sow_id: int, role: str) -> dict:
    """Per-role narrative insights for the DRM PersonaDashboard."""
    result = await _ml_get(f"/sows/{sow_id}/insights/{role}")
    if result is None:
        return {"summary": None, "flags": []}
    return result


async def get_document_prose(sow_id: int) -> str:
    """Final document polish. Wraps /document/prose."""
    result = await _ml_post(
        "/document/prose", json_body={"sow_id": str(sow_id)}, timeout=_SYNC_TIMEOUT
    )
    if result is None:
        raise AIUnavailableError(
            "Document prose generation is not yet available",
            retryable=False,
        )
    return result.get("prose", result.get("text", ""))


async def delete_sow_from_kg(kg_node_id: str) -> None:
    """Best-effort delete of a SoW from the KG. Fire-and-forget."""
    await _ml_delete(f"/sows/{kg_node_id}")
