from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_driver = None
_model = None


def _get_driver():
    from neo4j import GraphDatabase

    return GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password")),
    )


def _get_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _driver, _model
    logger.info("Loading embedding model and Neo4j driver")
    _driver = _get_driver()
    _driver.verify_connectivity()
    _model = _get_model()
    logger.info("GraphRAG API ready")
    yield
    if _driver:
        _driver.close()


app = FastAPI(
    title="SOW GraphRAG API",
    description="Knowledge graph retrieval and LLM authoring assistant for SOW documents",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AssistRequest(BaseModel):
    query: str
    sow_id: str | None = None
    history: list[dict] | None = None
    top_k: int = 5
    hop_depth: int = 2
    section_key: str | None = None


class AssistResponse(BaseModel):
    answer: str
    context: dict
    retrieved: dict
    structured: dict | list | None = None


class ContextResponse(BaseModel):
    query: str
    sow_id: str | None
    methodology: str | None
    deal_value: float | None
    sections: list[dict]
    rules: list[dict]
    banned_phrases: list[dict]
    risks: list[dict]
    deliverables: list[dict]
    similar_sections: list[dict]
    empty: bool


@app.get("/health")
def health():
    try:
        _driver.verify_connectivity()
        neo4j_status = "connected"
    except Exception as e:
        neo4j_status = f"error: {e}"
    return {"status": "ok", "neo4j": neo4j_status, "model": "loaded"}


@app.get("/context", response_model=ContextResponse)
def get_context(
    query: str = Query(..., min_length=1),
    sow_id: str | None = Query(None),
    top_k: int = Query(5, ge=1, le=20),
    hop_depth: int = Query(2, ge=1, le=3),
):
    """
    Pure graph retrieval — no LLM call.

    Embeds the query locally, finds anchor nodes via ANN search,
    traverses the knowledge graph outward, and returns a structured
    subgraph scoped to the deal context.

    Use this endpoint for real-time compliance highlighting in the frontend.
    Latency is sub-second for typical queries.
    """
    try:
        from sow_kg.graphrag import retrieve

        ctx = retrieve(_driver, _model, query, sow_id=sow_id, top_k=top_k, hop_depth=hop_depth)
        return ContextResponse(
            query=query,
            sow_id=sow_id,
            methodology=ctx.deal_context.methodology,
            deal_value=ctx.deal_context.deal_value,
            sections=ctx.sections,
            rules=ctx.rules,
            banned_phrases=ctx.banned_phrases,
            risks=ctx.risks,
            deliverables=ctx.deliverables,
            similar_sections=ctx.similar_sections,
            empty=ctx.is_empty(),
        )
    except Exception as e:
        logger.exception("context retrieval error")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/assist", response_model=AssistResponse)
def post_assist(req: AssistRequest):
    """
    GraphRAG retrieval + LLM generation.

    Same retrieval as /context, then passes the assembled subgraph
    to Kimi-K2.5 to generate grounded authoring suggestions.

    Only call this endpoint when the user explicitly requests generated text.
    Do not call on every keystroke — use /context for passive compliance checking.
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty")
    try:
        from sow_kg.assist import assist

        result = assist(
            driver=_driver,
            model=_model,
            query=req.query,
            sow_id=req.sow_id,
            history=req.history,
            top_k=req.top_k,
            hop_depth=req.hop_depth,
            section_key=req.section_key,
        )
        return AssistResponse(**result)
    except Exception as e:
        logger.exception("assist error")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/sows")
def list_sows():
    """List all ingested SOWs with their IDs and metadata."""
    with _driver.session() as session:
        rows = session.run(
            """
            MATCH (s:SOW)
            OPTIONAL MATCH (s)-[:USES_METHODOLOGY]->(m:Methodology)
            RETURN s.id AS id, s.title AS title, s.filename AS filename,
                   s.methodology AS methodology, m.name AS methodology_name,
                   s.char_count AS char_count, s.format AS format
            ORDER BY s.title
            """
        ).data()
    return rows


@app.get("/sows/{sow_id}/validate")
def validate_sow(sow_id: str):
    """Run rule-based validation against a SOW. Returns structured findings."""
    from sow_kg.queries import validate_sow as _validate

    try:
        return _validate(_driver, sow_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/sows/{sow_id}/risks")
def get_risks(sow_id: str):
    """Return risk register and rule-triggered risks for a SOW."""
    from sow_kg.queries import get_risk_summary, get_rule_triggered_risks

    try:
        return {
            "risks": get_risk_summary(_driver, sow_id),
            "triggered": get_rule_triggered_risks(_driver, sow_id),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/sows/{sow_id}/similar")
def get_similar(sow_id: str, limit: int = Query(5, ge=1, le=20)):
    """Find SOWs with overlapping clause types."""
    from sow_kg.queries import find_similar_sows

    try:
        return find_similar_sows(_driver, sow_id, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/approval")
def get_approval(
    value: float = Query(..., gt=0),
    margin: float = Query(...),
):
    """Determine ESAP level and approval chain for a deal."""
    from sow_kg.queries import get_approval_chain

    try:
        return get_approval_chain(_driver, value, margin)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/schema/proposals")
def get_schema_proposals(
    status: str | None = Query(None, regex="^(pending|accepted|rejected)$"),
    kind: str | None = Query(None),
):
    """List schema evolution proposals generated during ingestion."""
    filters = []
    if status == "pending":
        filters.append("p.accepted = false AND coalesce(p.rejected, false) = false")
    elif status == "accepted":
        filters.append("p.accepted = true")
    elif status == "rejected":
        filters.append("p.rejected = true")
    if kind:
        filters.append(f"p.kind = '{kind}'")

    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    with _driver.session() as session:
        return session.run(
            f"""
            MATCH (p:SchemaProposal) {where}
            RETURN p.proposal_id AS id, p.kind AS kind, p.label AS label,
                   p.confidence AS confidence, p.accepted AS accepted,
                   p.rejected AS rejected, p.tags AS tags,
                   p.usage_count AS uses, p.source_doc AS source,
                   p.description AS description
            ORDER BY p.confidence DESC, p.usage_count DESC
            """
        ).data()


@app.get("/graph/summary")
def graph_summary():
    """Return node and relationship counts for the knowledge graph."""
    with _driver.session() as session:
        nodes = session.run(
            "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC"
        ).data()
        rels = session.run(
            "MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC LIMIT 20"
        ).data()
    return {"nodes": nodes, "relationships": rels}
