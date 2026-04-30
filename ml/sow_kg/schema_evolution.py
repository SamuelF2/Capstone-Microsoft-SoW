from __future__ import annotations

import re
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from neo4j import Driver

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.80
PROMOTION_SCORE_MIN  = 0.65

KNOWN_LABELS = {
    "SOW", "Section", "Deliverable", "Risk", "Rule", "ClauseType",
    "BannedPhrase", "Methodology", "Party", "Milestone", "Assumption",
    "Term", "Persona", "ApprovalStage", "EsapLevel", "ChecklistItem",
    "Requirement", "SchemaProposal", "Technology", "Location", "Person",
    "DealContext", "Customer", "Industry", "StaffingRole", "StatusSnapshot",
}


def _safe_label(label: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", label.strip())


def _stable_id(*parts: str) -> str:
    return hashlib.md5(":".join(parts).encode()).hexdigest()[:12]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Composite promotion score ─────────────────────────────────────────────────

def compute_promotion_score(driver: Driver, proposal_id: str) -> dict:
    with driver.session() as session:
        prop = session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})
            RETURN p.label AS label, p.confidence AS confidence,
                   p.usage_count AS usage_count
            """,
            pid=proposal_id,
        ).single()

        total_sows = session.run(
            "MATCH (s:SOW) RETURN count(s) AS c"
        ).single()["c"]

        linked = session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})-[:PROPOSED_FROM]->(sec:Section)
            RETURN count(sec) AS c
            """,
            pid=proposal_id,
        ).single()["c"]

        overlap = session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})
            MATCH (ct:ClauseType)
            WHERE toLower(ct.display_name) CONTAINS toLower(p.label)
               OR toLower(p.label) CONTAINS toLower(ct.display_name)
            RETURN count(ct) AS c
            """,
            pid=proposal_id,
        ).single()["c"]

    if not prop:
        return {"score": 0.0, "breakdown": {}}

    usage      = prop["usage_count"] or 0
    confidence = float(prop["confidence"] or 0)

    prevalence             = min(usage / max(total_sows, 1), 1.0)
    structural_consistency = min(linked / max(usage, 1), 1.0)
    domain_novelty         = 1.0 - min(overlap / 3.0, 1.0)

    score = (
        0.30 * prevalence +
        0.25 * confidence +
        0.25 * structural_consistency +
        0.20 * domain_novelty
    )

    return {
        "score": round(score, 4),
        "breakdown": {
            "prevalence":             round(prevalence, 4),
            "llm_confidence":         round(confidence, 4),
            "structural_consistency": round(structural_consistency, 4),
            "domain_novelty":         round(domain_novelty, 4),
        },
    }


# ── Record and process proposals ──────────────────────────────────────────────

def record_proposal(
    driver:            Driver,
    kind:              str,
    label:             str,
    description:       str,
    confidence:        float,
    source_doc:        str,
    source_section_id: Optional[str] = None,
) -> dict:
    accepted = confidence >= CONFIDENCE_THRESHOLD
    prop_id  = _stable_id(kind, label)
    ts       = _now()

    with driver.session() as session:
        session.run(
            """
            MERGE (p:SchemaProposal {proposal_id: $prop_id})
            SET p.kind        = $kind,
                p.label       = $label,
                p.description = $description,
                p.confidence  = $confidence,
                p.source_doc  = $source_doc,
                p.accepted    = $accepted,
                p.promoted    = coalesce(p.promoted, false),
                p.rejected    = coalesce(p.rejected, false),
                p.proposed_at = $ts,
                p.usage_count = coalesce(p.usage_count, 0) + 1
            """,
            prop_id=prop_id, kind=kind, label=label, description=description,
            confidence=confidence, source_doc=source_doc, accepted=accepted, ts=ts,
        )

        if source_section_id:
            session.run(
                """
                MATCH (p:SchemaProposal {proposal_id: $prop_id})
                MATCH (sec:Section {id: $sec_id})
                MERGE (p)-[:PROPOSED_FROM]->(sec)
                """,
                prop_id=prop_id, sec_id=source_section_id,
            )

    if accepted:
        logger.info(f"Schema proposal auto-accepted: {kind} '{label}' (conf={confidence:.2f})")
    else:
        logger.debug(f"Schema proposal pending: '{label}' (conf={confidence:.2f})")

    return {
        "proposal_id": prop_id,
        "kind":        kind,
        "label":       label,
        "accepted":    accepted,
        "confidence":  confidence,
    }


def process_proposals(
    driver:            Driver,
    proposals:         list[dict],
    source_doc:        str,
    source_section_id: Optional[str] = None,
) -> list[dict]:
    accepted = []
    for p in proposals:
        kind        = p.get("kind", "node")
        label       = p.get("label", "").strip()
        description = p.get("description", "")
        confidence  = float(p.get("confidence", 0.0))

        if not label:
            continue

        result = record_proposal(
            driver, kind, label, description, confidence,
            source_doc, source_section_id,
        )
        if result["accepted"]:
            accepted.append(result)

    return accepted


# ── Promotion pipeline ────────────────────────────────────────────────────────

def promote_proposal(driver: Driver, proposal_id: str) -> dict:
    with driver.session() as session:
        prop = session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})
            WHERE p.accepted = true
              AND p.promoted = false
              AND coalesce(p.rejected, false) = false
            RETURN p.label AS label, p.kind AS kind, p.description AS description
            """,
            pid=proposal_id,
        ).single()

    if not prop:
        return {"promoted": False, "reason": "not found, not accepted, already promoted, or rejected"}

    kind  = prop["kind"]
    label = _safe_label(prop["label"])
    desc  = prop["description"] or ""
    ts    = _now()

    if kind == "node":
        result = _promote_node(driver, proposal_id, label, desc, ts)
    elif kind == "edge":
        result = _promote_edge(driver, proposal_id, label, ts)
    else:
        result = {"nodes_written": 0, "edges_written": 0}

    with driver.session() as session:
        session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})
            SET p.promoted       = true,
                p.promoted_at    = $ts,
                p.promoted_nodes = $nodes,
                p.promoted_edges = $edges
            """,
            pid=proposal_id, ts=ts,
            nodes=result.get("nodes_written", 0),
            edges=result.get("edges_written", 0),
        )

    logger.info(
        f"Promoted '{label}' ({kind}): "
        f"{result.get('nodes_written', 0)} nodes, {result.get('edges_written', 0)} edges"
    )
    return {"promoted": True, "label": label, "kind": kind, **result}


def _promote_node(driver: Driver, proposal_id: str, label: str, description: str, ts: str) -> dict:
    with driver.session() as session:
        sections = session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})-[:PROPOSED_FROM]->(sec:Section)
            RETURN sec.id AS sec_id, sec.heading AS heading,
                   sec.section_type AS section_type
            """,
            pid=proposal_id,
        ).data()

    if not sections:
        return {
            "nodes_written": 0,
            "edges_written": 0,
            "note": "no PROPOSED_FROM edges — re-ingest with updated ingest.py to build back-edges",
        }

    nodes_written = 0
    edges_written = 0

    for sec in sections:
        node_id = _stable_id(label, sec["sec_id"])

        with driver.session() as session:
            session.run(
                f"""
                MERGE (n:{label} {{promoted_id: $node_id}})
                SET n.source_section = $sec_id,
                    n.source_heading = $heading,
                    n.description    = $description,
                    n.section_type   = $section_type,
                    n.promoted_from  = $proposal_id,
                    n.promoted_at    = $ts
                WITH n
                MATCH (sec:Section {{id: $sec_id}})
                MERGE (sec)-[:`HAS_{label.upper()}`]->(n)
                WITH n
                MATCH (p:SchemaProposal {{proposal_id: $proposal_id}})
                MERGE (n)-[:PROMOTED_FROM]->(p)
                """,
                node_id=node_id, sec_id=sec["sec_id"],
                heading=(sec["heading"] or "")[:200],
                description=description[:500],
                section_type=sec["section_type"] or "",
                proposal_id=proposal_id, ts=ts,
            )
        nodes_written += 1
        edges_written += 2

    return {"nodes_written": nodes_written, "edges_written": edges_written}


def _promote_edge(driver: Driver, proposal_id: str, rel_type: str, ts: str) -> dict:
    rel_clean = re.sub(r"[^A-Z0-9_]", "_", rel_type.upper().replace(" ", "_"))

    with driver.session() as session:
        sections = session.run(
            """
            MATCH (p:SchemaProposal {proposal_id: $pid})-[:PROPOSED_FROM]->(sec:Section)
            RETURN sec.id AS sec_id
            """,
            pid=proposal_id,
        ).data()

    if not sections:
        return {"nodes_written": 0, "edges_written": 0, "note": "no linked sections"}

    edges_written = 0
    for sec in sections:
        try:
            with driver.session() as session:
                session.run(
                    f"""
                    MATCH (sec:Section {{id: $sec_id}})-[:CONTAINS_ENTITY]->(a)
                    MATCH (sec)-[:CONTAINS_ENTITY]->(b)
                    WHERE id(a) < id(b)
                    MERGE (a)-[r:{rel_clean}]->(b)
                    SET r.promoted_from = $proposal_id, r.promoted_at = $ts
                    """,
                    sec_id=sec["sec_id"], proposal_id=proposal_id, ts=ts,
                )
            edges_written += 1
        except Exception as e:
            logger.debug(f"Edge promotion failed for section {sec['sec_id']}: {e}")

    return {"nodes_written": 0, "edges_written": edges_written}


def promote_batch(
    driver:         Driver,
    min_evidence:   int   = 3,
    min_confidence: float = 0.75,
    dry_run:        bool  = False,
) -> list[dict]:
    with driver.session() as session:
        candidates = session.run(
            """
            MATCH (p:SchemaProposal)
            WHERE p.accepted = true
              AND p.promoted = false
              AND coalesce(p.rejected, false) = false
              AND p.usage_count >= $min_evidence
              AND p.confidence >= $min_conf
            RETURN p.proposal_id AS pid, p.label AS label,
                   p.kind AS kind, p.usage_count AS uses,
                   p.confidence AS confidence
            ORDER BY p.usage_count DESC, p.confidence DESC
            """,
            min_evidence=min_evidence, min_conf=min_confidence,
        ).data()

    results = []
    for c in candidates:
        scoring = compute_promotion_score(driver, c["pid"])

        if scoring["score"] < PROMOTION_SCORE_MIN:
            results.append({
                "label":    c["label"],
                "kind":     c["kind"],
                "score":    scoring["score"],
                "promoted": False,
                "reason":   f"composite score {scoring['score']:.2f} below threshold {PROMOTION_SCORE_MIN}",
            })
            continue

        if dry_run:
            results.append({
                "label":     c["label"],
                "kind":      c["kind"],
                "score":     scoring["score"],
                "promoted":  False,
                "dry_run":   True,
                "breakdown": scoring["breakdown"],
            })
            continue

        result = promote_proposal(driver, c["pid"])
        result["score"]     = scoring["score"]
        result["breakdown"] = scoring["breakdown"]
        results.append(result)

    return results


# ── Dynamic node / relationship writers ───────────────────────────────────────

def write_dynamic_node(
    driver:     Driver,
    label:      str,
    name:       str,
    properties: dict,
    source_doc: str,
    confidence: float = 1.0,
) -> Optional[str]:
    if label not in KNOWN_LABELS:
        with driver.session() as session:
            row = session.run(
                """
                MATCH (p:SchemaProposal {label: $label, kind: 'node', accepted: true})
                RETURN p.proposal_id AS id LIMIT 1
                """,
                label=label,
            ).single()
        if not row:
            logger.debug(f"Skipping node with unaccepted label: {label}")
            return None

    node_id = _stable_id(label, name, source_doc)
    props   = {k: str(v)[:500] for k, v in properties.items() if v is not None}
    props.update({"name": str(name)[:200], "source_doc": source_doc, "confidence": confidence})

    with driver.session() as session:
        session.run(
            f"MERGE (n:{label} {{dynamic_id: $node_id}}) SET n += $props",
            node_id=node_id, props=props,
        )
    return node_id


def write_dynamic_relationship(
    driver:     Driver,
    from_label: str,
    from_id:    str,
    rel_type:   str,
    to_label:   str,
    to_id:      str,
    properties: dict,
    source_doc: str,
) -> bool:
    rel_clean = re.sub(r"[^A-Z0-9_]", "_", rel_type.upper().replace(" ", "_"))
    if not rel_clean:
        return False

    props = {k: str(v)[:200] for k, v in properties.items() if v is not None}
    props["source_doc"] = source_doc

    try:
        with driver.session() as session:
            session.run(
                f"""
                MATCH (a:{from_label} {{dynamic_id: $from_id}})
                MATCH (b:{to_label} {{dynamic_id: $to_id}})
                MERGE (a)-[r:{rel_clean}]->(b)
                SET r += $props
                """,
                from_id=from_id, to_id=to_id, props=props,
            )
        return True
    except Exception as e:
        logger.debug(f"Dynamic relationship write failed: {e}")
        return False
