"""
Schema evolution engine.

Tracks LLM-proposed node types and edge types.
High-confidence proposals (>= CONFIDENCE_THRESHOLD) are written as real
schema elements. Lower-confidence proposals are stored as SchemaProposal
nodes for human review.

The graph learns its own schema over time.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from neo4j import Driver

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.80  # proposals above this are auto-accepted

def record_proposal(
    driver: Driver,
    kind: str,           # "node" or "edge"
    label: str,          # proposed label / relationship type
    description: str,
    confidence: float,
    source_doc: str,
    source_section: Optional[str] = None,
) -> dict:
    """
    Write a SchemaProposal node to the graph.
    Returns the proposal dict with accepted=True/False.
    """
    accepted  = confidence >= CONFIDENCE_THRESHOLD
    prop_id   = hashlib.md5(f"{kind}:{label}".encode()).hexdigest()[:12]
    ts        = datetime.now(timezone.utc).isoformat()

    with driver.session() as session:
        session.run("""
            MERGE (p:SchemaProposal {proposal_id: $prop_id})
            SET p.kind          = $kind,
                p.label         = $label,
                p.description   = $description,
                p.confidence    = $confidence,
                p.source_doc    = $source_doc,
                p.source_section = $source_section,
                p.accepted      = $accepted,
                p.proposed_at   = $ts,
                p.usage_count   = coalesce(p.usage_count, 0) + 1
        """,
            prop_id=prop_id, kind=kind, label=label,
            description=description, confidence=confidence,
            source_doc=source_doc, source_section=source_section,
            accepted=accepted, ts=ts,
        )

    if accepted:
        logger.info(f"Schema evolution: accepted new {kind} '{label}' (conf={confidence:.2f})")
    else:
        logger.debug(f"Schema proposal: pending '{label}' (conf={confidence:.2f})")

    return {
        "proposal_id": prop_id,
        "kind":        kind,
        "label":       label,
        "accepted":    accepted,
        "confidence":  confidence,
    }


def process_proposals(
    driver: Driver,
    proposals: list[dict],
    source_doc: str,
    source_section: Optional[str] = None,
) -> list[dict]:
    """
    Process a list of schema proposals from LLM extraction.
    Returns list of accepted proposals.
    """
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
            source_doc, source_section,
        )
        if result["accepted"]:
            accepted.append(result)

    return accepted

def write_dynamic_node(
    driver: Driver,
    label: str,
    name: str,
    properties: dict,
    source_doc: str,
    confidence: float = 1.0,
) -> Optional[str]:
    """
    Write a node with a dynamically determined label.
    Only writes if label is in known schema OR has been accepted as a proposal.
    Returns node id if written, None if skipped.
    """
    KNOWN_LABELS = {
        "SOW", "Section", "Deliverable", "Risk", "Rule", "ClauseType",
        "BannedPhrase", "Methodology", "Party", "Milestone", "Assumption",
        "Term", "Persona", "ApprovalStage", "EsapLevel", "ChecklistItem",
        "Requirement", "SchemaProposal", "Technology", "Location", "Person",
    }

    # Check if accepted proposal exists for unknown labels
    if label not in KNOWN_LABELS:
        with driver.session() as session:
            row = session.run("""
                MATCH (p:SchemaProposal {label: $label, kind: 'node', accepted: true})
                RETURN p.proposal_id AS id LIMIT 1
            """, label=label).single()
        if not row:
            logger.debug(f"Skipping node with unaccepted label: {label}")
            return None

    import hashlib
    node_id = hashlib.md5(f"{label}:{name}:{source_doc}".encode()).hexdigest()[:12]

    props = {k: str(v)[:500] for k, v in properties.items() if v is not None}
    props["name"]       = str(name)[:200]
    props["source_doc"] = source_doc
    props["confidence"] = confidence

    with driver.session() as session:
        session.run(f"""
            MERGE (n:{label} {{dynamic_id: $node_id}})
            SET n += $props
        """, node_id=node_id, props=props)

    return node_id


def write_dynamic_relationship(
    driver: Driver,
    from_label: str,
    from_id: str,
    rel_type: str,
    to_label: str,
    to_id: str,
    properties: dict,
    source_doc: str,
) -> bool:
    """
    Write a dynamically typed relationship between two nodes.
    Relationship type must be a valid Neo4j identifier.
    """
    # Sanitize rel_type — uppercase, underscores only
    rel_clean = re.sub(r"[^A-Z0-9_]", "_", rel_type.upper().replace(" ", "_"))
    if not rel_clean:
        return False

    props = {k: str(v)[:200] for k, v in properties.items() if v is not None}
    props["source_doc"] = source_doc

    try:
        with driver.session() as session:
            session.run(f"""
                MATCH (a:{from_label} {{dynamic_id: $from_id}})
                MATCH (b:{to_label} {{dynamic_id: $to_id}})
                MERGE (a)-[r:{rel_clean}]->(b)
                SET r += $props
            """, from_id=from_id, to_id=to_id, props=props)
        return True
    except Exception as e:
        logger.debug(f"Dynamic relationship write failed: {e}")
        return False


import re  # needed for write_dynamic_relationship
