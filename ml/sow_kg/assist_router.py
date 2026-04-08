from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["assist"])

_driver = None
_model = None


def _init():
    global _driver, _model
    if _driver and _model:
        return _driver, _model

    from neo4j import GraphDatabase
    from sentence_transformers import SentenceTransformer

    _driver = GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password")),
    )
    _model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _driver, _model


class AssistRequest(BaseModel):
    query: str
    sow_id: str | None = None
    history: list[dict] | None = None
    top_k: int = 5
    hop_depth: int = 2


class AssistResponse(BaseModel):
    answer: str
    context: dict
    retrieved: dict


@router.post("/assist", response_model=AssistResponse)
async def assist_endpoint(req: AssistRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty")
    try:
        driver, model = _init()
        from sow_kg.assist import assist

        result = assist(
            driver=driver,
            model=model,
            query=req.query,
            sow_id=req.sow_id,
            history=req.history,
            top_k=req.top_k,
            hop_depth=req.hop_depth,
        )
        return AssistResponse(**result)
    except Exception as e:
        logger.exception("assist endpoint error")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/assist/context")
async def context_endpoint(
    query: str,
    sow_id: str | None = None,
    top_k: int = 5,
    hop_depth: int = 2,
):
    if not query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty")
    try:
        driver, model = _init()
        from sow_kg.graphrag import retrieve

        ctx = retrieve(driver, model, query, sow_id=sow_id, top_k=top_k, hop_depth=hop_depth)
        return {
            "query": query,
            "sow_id": sow_id,
            "methodology": ctx.deal_context.methodology,
            "deal_value": ctx.deal_context.deal_value,
            "sections": ctx.sections,
            "rules": ctx.rules,
            "banned_phrases": ctx.banned_phrases,
            "risks": ctx.risks,
            "deliverables": ctx.deliverables,
            "similar_sections": ctx.similar_sections,
            "empty": ctx.is_empty(),
        }
    except Exception as e:
        logger.exception("context endpoint error")
        raise HTTPException(status_code=500, detail=str(e)) from e
