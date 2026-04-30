"""
Proposal evaluation framework for the schema evolution system.

Evaluates schema proposals across four dimensions:
  1. Coherence       — is the proposed label semantically coherent and well-defined?
  2. Novelty         — does it genuinely extend the schema vs duplicate existing types?
  3. Groundedness    — is it supported by actual content in the source sections?
  4. Utility         — would this node type enable useful new queries?

Each dimension is scored 0.0–1.0 by the LLM acting as a judge.
Results are written back to the SchemaProposal node and used to refine
the composite promotion score.

Usage:
    from sow_kg.proposal_eval import evaluate_proposal, evaluate_batch

    result = evaluate_proposal(driver, proposal_id)
    results = evaluate_batch(driver, min_confidence=0.7)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from neo4j import Driver

logger = logging.getLogger(__name__)

EVAL_SYSTEM_PROMPT = """\
You are evaluating a proposed schema extension for a Microsoft SOW (Statement of Work) \
knowledge graph. The graph currently models SOW documents with nodes for: SOW, Section, \
Deliverable, Risk, Rule, ClauseType, BannedPhrase, Methodology, Party, Milestone, \
Assumption, Term, Persona, ApprovalStage, EsapLevel, ChecklistItem, Requirement.

Evaluate the proposal across four dimensions. Return ONLY valid JSON:

{
  "coherence": {
    "score": 0.0-1.0,
    "reasoning": "Is the label name clear, unambiguous, and domain-appropriate for SOW documents?"
  },
  "novelty": {
    "score": 0.0-1.0,
    "reasoning": "Does this genuinely extend the schema or does it duplicate an existing node type?"
  },
  "groundedness": {
    "score": 0.0-1.0,
    "reasoning": "Is this proposal supported by concrete patterns in the source section content?"
  },
  "utility": {
    "score": 0.0-1.0,
    "reasoning": "Would this node type enable useful graph queries that are not currently possible?"
  },
  "recommendation": "promote|review|reject",
  "reasoning": "One sentence overall assessment"
}\
"""


def _build_eval_prompt(
    label:       str,
    kind:        str,
    description: str,
    usage_count: int,
    sections:    list[dict],
) -> str:
    section_previews = "\n".join(
        f"- [{s.get('heading', '')}] ({s.get('section_type', '')}): "
        f"{(s.get('content') or '')[:200]}"
        for s in sections[:5]
    )
    return (
        f"Proposed {kind}: \"{label}\"\n"
        f"Description: {description}\n"
        f"Triggered by {usage_count} section(s)\n\n"
        f"Source sections:\n{section_previews}"
    )


def evaluate_proposal(driver: Driver, proposal_id: str) -> dict:
    with driver.session() as session:
        prop = session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})
            RETURN p.label AS label, p.kind AS kind, p.description AS description,
                   p.usage_count AS usage_count, p.confidence AS confidence
            """,
            pid=proposal_id,
        ).single()

        sections = session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})-[:PROPOSED_FROM]->(sec:Section)
            RETURN sec.heading AS heading, sec.section_type AS section_type,
                   sec.content AS content
            LIMIT 5
            """,
            pid=proposal_id,
        ).data()

    if not prop:
        return {"error": f"Proposal {proposal_id} not found"}

    from .llm_client import llm_json
    result = llm_json(
        system=EVAL_SYSTEM_PROMPT,
        user=_build_eval_prompt(
            label=prop["label"] or "",
            kind=prop["kind"] or "node",
            description=prop["description"] or "",
            usage_count=prop["usage_count"] or 0,
            sections=sections,
        ),
        fallback={
            "coherence":      {"score": 0.5, "reasoning": "parse error"},
            "novelty":        {"score": 0.5, "reasoning": "parse error"},
            "groundedness":   {"score": 0.5, "reasoning": "parse error"},
            "utility":        {"score": 0.5, "reasoning": "parse error"},
            "recommendation": "review",
            "reasoning":      "parse error",
        },
    )

    coherence    = float(result.get("coherence",    {}).get("score", 0.5))
    novelty      = float(result.get("novelty",      {}).get("score", 0.5))
    groundedness = float(result.get("groundedness", {}).get("score", 0.5))
    utility      = float(result.get("utility",      {}).get("score", 0.5))
    recommendation = result.get("recommendation", "review")

    eval_score = round(
        0.25 * coherence +
        0.25 * novelty +
        0.25 * groundedness +
        0.25 * utility,
        4,
    )

    ts = datetime.now(timezone.utc).isoformat()

    with driver.session() as session:
        session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})
            SET p.eval_score          = $eval_score,
                p.eval_coherence      = $coherence,
                p.eval_novelty        = $novelty,
                p.eval_groundedness   = $groundedness,
                p.eval_utility        = $utility,
                p.eval_recommendation = $recommendation,
                p.eval_reasoning      = $reasoning,
                p.evaluated_at        = $ts
            """,
            pid=proposal_id,
            eval_score=eval_score,
            coherence=coherence,
            novelty=novelty,
            groundedness=groundedness,
            utility=utility,
            recommendation=recommendation,
            reasoning=result.get("reasoning", "")[:500],
            ts=ts,
        )

        if recommendation == "promote":
            session.run(
                "MATCH (p:SchemaProposal {proposal_id: $pid}) SET p.accepted = true",
                pid=proposal_id,
            )
        elif recommendation == "reject":
            session.run(
                "MATCH (p:SchemaProposal {proposal_id: $pid}) SET p.rejected = true",
                pid=proposal_id,
            )

    return {
        "proposal_id":    proposal_id,
        "label":          prop["label"],
        "kind":           prop["kind"],
        "eval_score":     eval_score,
        "recommendation": recommendation,
        "breakdown": {
            "coherence":    coherence,
            "novelty":      novelty,
            "groundedness": groundedness,
            "utility":      utility,
        },
        "reasoning": result.get("reasoning", ""),
        "dimension_reasoning": {
            "coherence":    result.get("coherence",    {}).get("reasoning", ""),
            "novelty":      result.get("novelty",      {}).get("reasoning", ""),
            "groundedness": result.get("groundedness", {}).get("reasoning", ""),
            "utility":      result.get("utility",      {}).get("reasoning", ""),
        },
    }


def evaluate_batch(
    driver:         Driver,
    min_confidence: float = 0.60,
    status:         str   = "pending",
    limit:          int   = 50,
) -> list[dict]:
    status_filter = {
        "pending":  "p.accepted = false AND coalesce(p.rejected, false) = false AND p.eval_score IS NULL",
        "accepted": "p.accepted = true AND p.eval_score IS NULL",
        "all":      "p.eval_score IS NULL",
    }.get(status, "p.eval_score IS NULL")

    with driver.session() as session:
        candidates = session.run(
            f"""
            MATCH (p:SchemaProposal)
            WHERE {status_filter}
              AND p.confidence >= $min_conf
            RETURN p.proposal_id AS pid
            ORDER BY p.usage_count DESC, p.confidence DESC
            LIMIT $limit
            """,
            min_conf=min_confidence, limit=limit,
        ).data()

    results = []
    for c in candidates:
        try:
            result = evaluate_proposal(driver, c["pid"])
            results.append(result)
            logger.info(
                f"Evaluated '{result.get('label')}': "
                f"score={result.get('eval_score'):.2f} recommendation={result.get('recommendation')}"
            )
        except Exception as e:
            logger.warning(f"Evaluation failed for {c['pid']}: {e}")
            results.append({"proposal_id": c["pid"], "error": str(e)})

    return results


def get_eval_summary(driver: Driver) -> dict:
    with driver.session() as session:
        stats = session.run(
            """
            MATCH (p:SchemaProposal)
            WHERE p.eval_score IS NOT NULL
            RETURN
                count(p)                                          AS evaluated,
                avg(p.eval_score)                                 AS avg_score,
                avg(p.eval_coherence)                             AS avg_coherence,
                avg(p.eval_novelty)                               AS avg_novelty,
                avg(p.eval_groundedness)                          AS avg_groundedness,
                avg(p.eval_utility)                               AS avg_utility,
                sum(CASE WHEN p.eval_recommendation='promote' THEN 1 ELSE 0 END) AS n_promote,
                sum(CASE WHEN p.eval_recommendation='review'  THEN 1 ELSE 0 END) AS n_review,
                sum(CASE WHEN p.eval_recommendation='reject'  THEN 1 ELSE 0 END) AS n_reject
            """
        ).single()

        top = session.run(
            """
            MATCH (p:SchemaProposal)
            WHERE p.eval_score IS NOT NULL
            RETURN p.label AS label, p.kind AS kind,
                   p.eval_score AS score, p.eval_recommendation AS recommendation,
                   p.eval_reasoning AS reasoning
            ORDER BY p.eval_score DESC
            LIMIT 10
            """
        ).data()

    return {"stats": dict(stats), "top_proposals": top}
