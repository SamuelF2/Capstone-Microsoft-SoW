from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

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


# ── Reviewer checklist generation ────────────────────────────────────────────


class ChecklistAssistRequest(BaseModel):
    sow_id: int | str | None = None
    sow_title: str | None = None
    sow_content: (
        str  # plain-text body produced by flatten_sow_content (Python) or flattenSowContent (JS)
    )
    role_key: str
    role_display: str | None = None
    seed_items: list[dict] = []


class ChecklistAssistItem(BaseModel):
    id: str
    text: str


class ChecklistAssistResponse(BaseModel):
    items: list[ChecklistAssistItem]


_CHECKLIST_SYSTEM = """\
You are generating a focused review checklist for a Microsoft Statement of Work
(SOW) reviewer. Each item must be a single yes/no question the reviewer can
answer by reading the SOW. Items should be specific to the document and the
reviewer's role — not generic policy language.

Rules:
* Generate 5 to 10 items. Fewer is better than padding.
* Each item is one sentence, ideally under 25 words, phrased so checking it
  off implies the SOW passes that check.
* If "Author seeds" are provided, treat them as guidance: cover the same
  intent, but you may rephrase or merge with related document-specific items.
* Do NOT invent facts not present in the SOW content. Reference concrete
  items (deliverables, risks, sections) when relevant.
* Output strict JSON: {"items": [{"id": str, "text": str}]}
  Use a short stable id like "ai-1", "ai-2", ...
"""


@app.post("/assist/checklist", response_model=ChecklistAssistResponse)
def post_assist_checklist(req: ChecklistAssistRequest):
    """Generate a per-role review checklist grounded in the SoW body.

    Called by ``backend/routers/review.py`` when a reviewer opens an
    assignment whose role is configured for AI-suggested mode. The first
    call for an assignment writes through to ``reviewer_checklist_cache``
    on the backend so subsequent reloads serve the same items.
    """
    from sow_kg.llm_client import llm_json

    if not req.sow_content.strip():
        raise HTTPException(status_code=400, detail="sow_content must not be empty")

    role_label = req.role_display or req.role_key
    seed_block = ""
    if req.seed_items:
        seed_lines = [
            f"- {(s.get('text') or '').strip()}"
            for s in req.seed_items
            if (s.get("text") or "").strip()
        ]
        if seed_lines:
            seed_block = "\n\nAuthor seeds:\n" + "\n".join(seed_lines)

    user = (
        f"Reviewer role: {role_label}\n"
        f"SOW title: {req.sow_title or '(untitled)'}\n"
        f"---\n"
        f"SOW body:\n{req.sow_content[:12000]}"
        f"{seed_block}"
    )

    raw = llm_json(
        system=_CHECKLIST_SYSTEM,
        user=user,
        fallback={"items": []},
    )
    items_in = raw.get("items", []) if isinstance(raw, dict) else []
    items_out: list[ChecklistAssistItem] = []
    for idx, it in enumerate(items_in):
        if not isinstance(it, dict):
            continue
        text = (it.get("text") or "").strip()
        if not text:
            continue
        item_id = (it.get("id") or "").strip() or f"ai-{idx + 1}"
        items_out.append(ChecklistAssistItem(id=item_id, text=text))
        if len(items_out) >= 10:
            break
    return ChecklistAssistResponse(items=items_out)


# ── SoW field extraction (document → structured sections) ───────────────────


class ExtractFieldsRequest(BaseModel):
    """Request payload for ``POST /extract/sow-fields``.

    The backend (``backend/routers/sow_extraction.py``) handles file
    parsing and ships plain text + the section schemas it owns. The ML
    service is stateless here — it does not see the original file, only
    the extracted text and the schemas.
    """

    document_text: str
    methodology: str | None = None
    target_sections: list[str]
    section_schemas: dict[str, dict[str, Any]]
    sow_title: str | None = None


class ExtractedSection(BaseModel):
    """One section's extraction result.

    ``value`` is ``None`` when the LLM had no confidence to extract that
    section — the modal renders ``rationale`` in that case so the author
    knows *why* it stayed blank.
    """

    value: Any | None = None
    confidence: float = 0.0
    rationale: str | None = None


class ExtractFieldsResponse(BaseModel):
    extracted: dict[str, ExtractedSection]
    notes: str = ""
    model_version: str = ""


_EXTRACT_SYSTEM = """\
You are extracting structured Statement of Work (SOW) data from a source
document (e.g., proposal, deal sheet, staffing plan, existing SOW).

For each requested section, return a JSON object that conforms to the
section's schema. Schemas use these type markers:
  "string"  -> a string
  "number"  -> a number
  [...]     -> array of objects matching the inner shape
  {...}     -> object with the named keys

Rules:
* Only extract values supported by text in the document.
* If you cannot confidently extract a section, return value=null with a
  one-sentence rationale explaining what was missing.
* Do NOT invent project names, deliverables, dates, prices, or people.
* Confidence is your honest estimate (0.0 = wild guess, 1.0 = explicitly
  stated). Use 0.0 when value is null.
* Keep extracted text faithful to the source — preserve numbers, names,
  and dates verbatim.
* Output a single JSON object with this shape:
  {
    "extracted": {
      "<sectionKey>": {
        "value": <schema-conforming-or-null>,
        "confidence": <0.0-1.0>,
        "rationale": "<short-string-or-null>"
      },
      ...
    },
    "notes": "<1-2 sentences summarizing what was extracted>"
  }
"""


def _build_extract_user_prompt(req: ExtractFieldsRequest) -> str:
    parts: list[str] = []
    if req.sow_title:
        parts.append(f"SOW title: {req.sow_title}")
    if req.methodology:
        parts.append(f"Methodology: {req.methodology}")
    parts.append("Sections to extract (each with its schema):")
    for key in req.target_sections:
        sch = req.section_schemas.get(key)
        if not sch:
            continue
        description = sch.get("description", "")
        shape = json.dumps(sch.get("schema"), indent=2)
        parts.append(f"\n## {key}\n{description}\nSchema:\n{shape}")
    parts.append(f"\n---\nDocument text (truncated to 12k chars):\n{req.document_text[:12000]}")
    return "\n".join(parts)


@app.post("/extract/sow-fields", response_model=ExtractFieldsResponse)
def post_extract_sow_fields(req: ExtractFieldsRequest):
    """Extract SoW section content from a parsed document.

    Called by ``backend/routers/sow_extraction.py`` after the backend has
    extracted plain text from the source file. Returns one entry per
    requested section, with ``value=null`` when extraction was not
    confident — never guesses.
    """
    from sow_kg.llm_client import llm_json

    if not req.document_text.strip():
        raise HTTPException(status_code=400, detail="document_text must not be empty")
    if not req.target_sections:
        raise HTTPException(status_code=400, detail="target_sections must not be empty")

    raw = llm_json(
        system=_EXTRACT_SYSTEM,
        user=_build_extract_user_prompt(req),
        fallback={
            "extracted": {},
            "notes": "AI extraction failed; no fields populated.",
        },
    )

    raw_extracted = raw.get("extracted", {}) if isinstance(raw, dict) else {}
    extracted: dict[str, ExtractedSection] = {}
    for key in req.target_sections:
        item = raw_extracted.get(key) or {}
        if not isinstance(item, dict):
            item = {}
        try:
            confidence = float(item.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        extracted[key] = ExtractedSection(
            value=item.get("value"),
            confidence=confidence if item.get("value") is not None else 0.0,
            rationale=(item.get("rationale") or None),
        )

    notes = str(raw.get("notes", "")) if isinstance(raw, dict) else ""
    return ExtractFieldsResponse(
        extracted=extracted,
        notes=notes,
        model_version=os.getenv("AZURE_OPENAI_DEPLOYMENT", "Kimi-K2.5"),
    )


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


# ── Schema proposals (LLM-discovered node/edge/section types) ────────────────


class ProposalReviewRequest(BaseModel):
    """Body for single-proposal approve/reject endpoints.

    ``reviewed_by`` is overwritten by the backend proxy (``routers/ai.py``)
    with the caller's email so the client cannot spoof identity. Tags and
    note are optional reviewer annotations mirrored from the CLI's
    ``review-proposal`` command.
    """

    reviewed_by: str = "human"
    tags: list[str] | None = None
    note: str | None = None


class BulkProposalReviewRequest(BaseModel):
    """Body for ``POST /schema/proposals/bulk-review``.

    A single ``note`` and ``tags`` payload is applied to every proposal in
    ``ids``. The Cypher runs inside a single ``execute_write`` transaction
    so a missing id rolls back the whole batch.
    """

    ids: list[str]
    action: str  # "approve" | "reject"
    reviewed_by: str = "human"
    tags: list[str] | None = None
    note: str | None = None


_PROPOSAL_RETURN_CLAUSE = """
RETURN p.proposal_id AS id,
       p.kind AS kind,
       p.label AS label,
       p.description AS description,
       p.confidence AS confidence,
       p.accepted AS accepted,
       coalesce(p.rejected, false) AS rejected,
       coalesce(p.tags, []) AS tags,
       p.usage_count AS uses,
       p.source_doc AS source,
       p.source_section AS source_section,
       p.note AS note,
       p.proposed_at AS proposed_at,
       p.reviewed_at AS reviewed_at,
       p.reviewed_by AS reviewed_by
"""


def _proposal_order_clause(sort: str | None) -> str:
    """Translate a UI sort key into a Cypher ORDER BY clause.

    Accepted values: ``confidence-desc`` (default), ``confidence-asc``,
    ``date-desc``, ``date-asc``, ``uses-desc``. Anything unrecognised
    falls back to the default — frontend already enumerates the options
    so we don't bother with a 400.
    """
    mapping = {
        "confidence-desc": "p.confidence DESC, p.usage_count DESC",
        "confidence-asc": "p.confidence ASC, p.usage_count DESC",
        "date-desc": "p.proposed_at DESC",
        "date-asc": "p.proposed_at ASC",
        "uses-desc": "p.usage_count DESC, p.confidence DESC",
    }
    return f"ORDER BY {mapping.get(sort or '', mapping['confidence-desc'])}"


@app.get("/schema/proposals")
def get_schema_proposals(
    status: str | None = Query(None, regex="^(pending|accepted|rejected)$"),
    kind: str | None = Query(None, regex="^(node|edge|section_type)$"),
    sort: str | None = Query(None),
):
    """List schema evolution proposals generated during ingestion.

    Filtering happens in Cypher; sorting is honoured server-side so the
    dashboard can refetch on every filter change without re-sorting in JS.
    """
    filters = []
    if status == "pending":
        filters.append("p.accepted = false AND coalesce(p.rejected, false) = false")
    elif status == "accepted":
        filters.append("p.accepted = true")
    elif status == "rejected":
        filters.append("coalesce(p.rejected, false) = true")
    if kind:
        filters.append(f"p.kind = '{kind}'")

    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    order = _proposal_order_clause(sort)

    with _driver.session() as session:
        return session.run(
            f"MATCH (p:SchemaProposal) {where} {_PROPOSAL_RETURN_CLAUSE} {order}"
        ).data()


def _apply_review_tx(
    tx,
    *,
    ids: list[str],
    action: str,
    reviewed_by: str,
    tags: list[str] | None,
    note: str | None,
    ts: str,
):
    """Cypher write helper for both single and bulk review endpoints.

    Uses ``UNWIND`` so a one-element ``ids`` list and a multi-element
    list go through the same code path. Optional ``tags`` and ``note``
    are only SET when supplied so a re-review doesn't clobber a prior
    annotation with ``null``.
    """
    accepted_val = action == "approve"
    rejected_val = action == "reject"
    set_parts = [
        "p.accepted = $accepted",
        "p.rejected = $rejected",
        "p.reviewed_by = $reviewed_by",
        "p.reviewed_at = $ts",
    ]
    params: dict[str, Any] = {
        "ids": ids,
        "accepted": accepted_val,
        "rejected": rejected_val,
        "reviewed_by": reviewed_by,
        "ts": ts,
    }
    if tags is not None:
        set_parts.append("p.tags = $tags")
        params["tags"] = list(tags)
    if note is not None:
        set_parts.append("p.note = $note")
        params["note"] = note

    tx.run(
        f"""
        UNWIND $ids AS pid
        MATCH (p:SchemaProposal {{proposal_id: pid}})
        SET {", ".join(set_parts)}
        """,
        **params,
    )


def _fetch_proposal(session, proposal_id: str) -> dict | None:
    row = session.run(
        f"MATCH (p:SchemaProposal {{proposal_id: $pid}}) {_PROPOSAL_RETURN_CLAUSE}",
        pid=proposal_id,
    ).single()
    return dict(row) if row else None


@app.post("/schema/proposals/{proposal_id}/approve")
def approve_schema_proposal(proposal_id: str, body: ProposalReviewRequest):
    """Mark a single SchemaProposal as accepted. Returns the refreshed row."""
    ts = datetime.now(UTC).isoformat()
    with _driver.session() as session:
        if not _fetch_proposal(session, proposal_id):
            raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")
        session.execute_write(
            _apply_review_tx,
            ids=[proposal_id],
            action="approve",
            reviewed_by=body.reviewed_by,
            tags=body.tags,
            note=body.note,
            ts=ts,
        )
        return _fetch_proposal(session, proposal_id)


@app.post("/schema/proposals/{proposal_id}/reject")
def reject_schema_proposal(proposal_id: str, body: ProposalReviewRequest):
    """Mark a single SchemaProposal as rejected. Returns the refreshed row."""
    ts = datetime.now(UTC).isoformat()
    with _driver.session() as session:
        if not _fetch_proposal(session, proposal_id):
            raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")
        session.execute_write(
            _apply_review_tx,
            ids=[proposal_id],
            action="reject",
            reviewed_by=body.reviewed_by,
            tags=body.tags,
            note=body.note,
            ts=ts,
        )
        return _fetch_proposal(session, proposal_id)


@app.post("/schema/proposals/bulk-review")
def bulk_review_schema_proposals(body: BulkProposalReviewRequest):
    """Approve or reject many proposals in one Cypher transaction.

    Missing ids cause the whole batch to roll back so partial failures
    don't leave the queue in an inconsistent state.
    """
    from datetime import UTC, datetime

    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    if not body.ids:
        return {"updated": 0, "ids": [], "action": body.action}

    ts = datetime.now(UTC).isoformat()
    with _driver.session() as session:
        # Verify all ids exist before mutating so the transaction can roll
        # back cleanly. UNWIND alone would silently no-op missing ids.
        result = session.run(
            "MATCH (p:SchemaProposal) WHERE p.proposal_id IN $ids RETURN p.proposal_id AS id",
            ids=body.ids,
        ).data()
        found = {r["id"] for r in result}
        missing = [i for i in body.ids if i not in found]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Proposals not found: {missing}",
            )

        session.execute_write(
            _apply_review_tx,
            ids=body.ids,
            action=body.action,
            reviewed_by=body.reviewed_by,
            tags=body.tags,
            note=body.note,
            ts=ts,
        )
    return {"updated": len(body.ids), "ids": body.ids, "action": body.action}


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
