"""
Rules router  —  /api/rules

Read-only endpoints serving:
  - the combined business rules (banned phrases, required elements, ESAP workflow,
    methodology alignment) from the JSON configuration files in ``Data/rules/``;
  - the risk-assessment framework reference (categories, priority matrix,
    mitigation playbooks) from the in-code ``services.risk_framework`` module;
  - a portfolio-level risk summary aggregated from the ``ai_suggestion`` table.

The JSON-config payload is loaded once and cached in memory since the files
don't change at runtime.
"""

from __future__ import annotations

import json
import os
from typing import Any

import database
from auth import CurrentUser
from config import RULES_DIR
from fastapi import APIRouter
from services.ai import _deserialize_risks
from services.risk_framework import get_framework

router = APIRouter(prefix="/api/rules", tags=["rules"])

_rules_cache: dict[str, Any] | None = None


def _load_rules() -> dict[str, Any]:
    global _rules_cache
    if _rules_cache is not None:
        return _rules_cache

    def _read(rel_path: str) -> dict:
        full = os.path.join(RULES_DIR, rel_path)
        if os.path.isfile(full):
            with open(full) as f:
                return json.load(f)
        return {}

    _rules_cache = {
        "bannedPhrases": _read("compliance/banned-phrases.json"),
        "requiredElements": _read("compliance/required-elements.json"),
        "esapWorkflow": _read("workflow/esap-workflow.json"),
        "methodologyAlignment": _read("methodology/methodology-alignment.json"),
    }
    return _rules_cache


@router.get(
    "",
    summary="Get all business rules",
)
async def get_rules(current_user: CurrentUser) -> dict[str, Any]:
    """Return the combined business-logic rules that drive quality checking,
    ESAP workflow, and methodology alignment.  Cached after first load.
    """
    return _load_rules()


@router.get(
    "/risk-framework",
    summary="Risk assessment framework reference",
)
async def get_risk_framework(current_user: CurrentUser) -> dict[str, Any]:
    """Return the risk framework reference (categories, priority matrix,
    mitigation playbooks). Consumed by the Business Logic > Risk Assessment tab.
    Source: ``services.risk_framework``.
    """
    return get_framework()


@router.get(
    "/risk-summary",
    summary="Portfolio-level risk summary across SoWs",
)
async def get_risk_summary(current_user: CurrentUser) -> dict[str, Any]:
    """Aggregate KPIs across SoWs the caller can see, plus a list of recent
    high-risk SoWs. Powers the Business Logic > Risk Assessment dashboard.

    Caps at the 200 most recent analysed SoWs to keep the query cheap.
    """
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT
                   s.id            AS sow_id,
                   s.title         AS title,
                   s.customer_name AS customer_name,
                   s.updated_at    AS updated_at,
                   a.risks         AS risks,
                   a.flag          AS esap_flag,
                   a.generated_at  AS generated_at
            FROM   sow_documents s
            JOIN   collaboration c ON c.sow_id = s.id
            JOIN   ai_suggestion a ON a.id = s.ai_suggestion_id
            WHERE  c.user_id = $1
            ORDER  BY a.generated_at DESC NULLS LAST
            LIMIT  200
            """,
            current_user.id,
        )

    total_risks = 0
    band_counts: dict[str, int] = {}
    cat_counts: dict[str, int] = {}
    high_risk_sows: list[dict[str, Any]] = []
    coverage_total = 0.0
    coverage_n = 0

    for r in rows:
        raw = r["risks"]
        if isinstance(raw, str):
            raw = json.loads(raw)
        assessment = _deserialize_risks(raw)

        total_risks += len(assessment.risks)
        band_counts[assessment.risk_band] = band_counts.get(assessment.risk_band, 0) + 1
        for cat, n in assessment.category_breakdown.items():
            cat_counts[cat] = cat_counts.get(cat, 0) + n
        if assessment.risks:
            coverage_total += assessment.has_mitigation_coverage
            coverage_n += 1

        if assessment.risk_band in ("High", "Very High"):
            high_risk_sows.append(
                {
                    "sow_id": r["sow_id"],
                    "title": r["title"],
                    "customer_name": r["customer_name"],
                    "risk_band": assessment.risk_band,
                    "overall_risk_score": assessment.overall_risk_score,
                    "esap_flag": r["esap_flag"],
                    "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
                }
            )

    avg_coverage = (coverage_total / coverage_n) if coverage_n else 0.0

    return {
        "total_sows_analysed": len(rows),
        "total_risks": total_risks,
        "band_breakdown": band_counts,
        "category_breakdown": cat_counts,
        "avg_mitigation_coverage": round(avg_coverage, 3),
        "high_risk_sows": high_risk_sows[:20],
    }
