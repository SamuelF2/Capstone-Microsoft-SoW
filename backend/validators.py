"""Pure validation and formatting functions for the Cocoon API."""

import re

from fastapi import HTTPException


def validate_sow_payload(payload: dict) -> str:
    """Validate a SoW creation payload and return the cleaned title.

    Raises HTTPException(400) if title is missing, empty, or whitespace-only.
    """
    title = payload.get("title")
    if not title or (isinstance(title, str) and not title.strip()):
        raise HTTPException(status_code=400, detail="title is required")
    return title.strip()


def validate_neo4j_label(label: str) -> str:
    """Validate a Neo4j node label to prevent Cypher injection.

    Labels must start with a letter or underscore, followed by
    alphanumeric characters or underscores.
    """
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", label):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid label: '{label}'. Must be alphanumeric/underscores only.",
        )
    return label


def validate_neo4j_relationship_type(rel_type: str) -> str:
    """Validate a Neo4j relationship type to prevent Cypher injection.

    Relationship types must be UPPER_SNAKE_CASE.
    """
    if not re.match(r"^[A-Z_][A-Z0-9_]*$", rel_type):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid relationship type: '{rel_type}'. Must be UPPER_SNAKE_CASE.",
        )
    return rel_type


def validate_knowledge_payload(
    payload: dict,
) -> tuple[int | None, list[dict], list[dict]]:
    """Validate and extract fields from a sow-knowledge payload.

    Returns (sow_id, entities, relationships) with all labels/types validated.
    """
    sow_id = payload.get("sow_id")
    entities = payload.get("entities", [])
    relationships = payload.get("relationships", [])

    for entity in entities:
        if "label" not in entity or "name" not in entity:
            raise HTTPException(status_code=400, detail="Each entity must have 'label' and 'name'")
        validate_neo4j_label(entity["label"])

    for rel in relationships:
        if not all(k in rel for k in ("from", "to", "type")):
            raise HTTPException(
                status_code=400,
                detail="Each relationship must have 'from', 'to', and 'type'",
            )
        validate_neo4j_relationship_type(rel["type"])

    return sow_id, entities, relationships


def build_health_status(
    neo4j_ok: bool,
    neo4j_error: str | None,
    pg_ok: bool,
    pg_error: str | None,
) -> dict:
    """Build the /health response from individual DB probe results."""
    status = {"status": "healthy", "neo4j": "unknown", "postgres": "unknown"}

    if neo4j_ok:
        status["neo4j"] = "connected"
    else:
        status["neo4j"] = f"error: {neo4j_error}"
        status["status"] = "degraded"

    if pg_ok:
        status["postgres"] = "connected"
    else:
        status["postgres"] = f"error: {pg_error}"
        status["status"] = "degraded"

    return status


def format_graph_stats(node_count: int, rel_count: int, labels: list[str]) -> dict:
    """Build the /api/graph/stats response."""
    return {"nodes": node_count, "relationships": rel_count, "labels": labels}


def format_knowledge_result(entity_count: int, rel_count: int) -> dict:
    """Build the /api/graph/sow-knowledge response."""
    return {
        "status": "ok",
        "entities_added": entity_count,
        "relationships_added": rel_count,
    }
