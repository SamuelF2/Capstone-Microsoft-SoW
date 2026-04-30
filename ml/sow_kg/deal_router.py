from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/deals", tags=["deals"])


def _driver():
    from api import _driver as d
    if d is None:
        raise HTTPException(status_code=503, detail="Neo4j driver not initialized")
    return d


class LinkRequest(BaseModel):
    sow_id:     str
    project_id: str


@router.get("/summary")
def deals_summary():
    """
    Aggregate analytics across all DealContext nodes.
    Returns totals, breakdown by outcome, breakdown by industry,
    and compliance risk patterns from at-risk/amended deals.
    """
    try:
        from sow_kg.deal_queries import get_deals_summary
        return get_deals_summary(_driver())
    except Exception as e:
        logger.exception("deals summary error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}")
def get_deal(project_id: str):
    """Get full DealContext for a project including customer and industry."""
    try:
        from sow_kg.deal_queries import get_deal_context
        result = get_deal_context(_driver(), project_id)
        if not result:
            raise HTTPException(status_code=404, detail=f"Deal {project_id} not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get deal error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/similar")
def get_similar(
    project_id: str,
    limit: int = Query(5, ge=1, le=20),
):
    """Find deals in the same industry with similar revenue and deal terms."""
    try:
        from sow_kg.deal_queries import get_similar_deals
        return get_similar_deals(_driver(), project_id, limit=limit)
    except Exception as e:
        logger.exception("similar deals error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/risk-profile")
def get_risk_profile(project_id: str):
    """
    Full risk profile for a deal — banned phrases, missing sections,
    status history, and computed risk score (0.0–1.0).
    """
    try:
        from sow_kg.deal_queries import get_deal_risk_profile
        return get_deal_risk_profile(_driver(), project_id)
    except Exception as e:
        logger.exception("risk profile error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/compliance/patterns")
def compliance_patterns(
    industry: Optional[str] = Query(None),
):
    """
    What sections are most commonly missing across deals?
    Optionally filter by industry.
    Returns frequency-ranked missing section patterns with outcome correlation.
    """
    try:
        from sow_kg.deal_queries import get_compliance_patterns
        return get_compliance_patterns(_driver(), industry=industry)
    except Exception as e:
        logger.exception("compliance patterns error")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/link")
def link_sow_to_deal(req: LinkRequest):
    """
    Link an existing SOW node to a DealContext node.
    Writes (SOW)-[:HAS_CONTEXT]->(DealContext) and copies
    deal_value, industry, outcome onto the SOW node.
    """
    try:
        from sow_kg.deal_queries import link_sow_to_deal_context
        link_sow_to_deal_context(_driver(), req.sow_id, req.project_id)
        return {"linked": True, "sow_id": req.sow_id, "project_id": req.project_id}
    except Exception as e:
        logger.exception("link sow error")
        raise HTTPException(status_code=500, detail=str(e))
