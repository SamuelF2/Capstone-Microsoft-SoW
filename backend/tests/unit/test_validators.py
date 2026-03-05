"""Unit tests for validators.py — all pure functions, zero mocking."""

import pytest
from fastapi import HTTPException
from validators import (
    build_health_status,
    format_graph_stats,
    format_knowledge_result,
    validate_knowledge_payload,
    validate_neo4j_label,
    validate_neo4j_relationship_type,
    validate_sow_payload,
)

# ── validate_sow_payload ────────────────────────────────


class TestValidateSowPayload:
    def test_valid_title(self):
        assert validate_sow_payload({"title": "My SoW"}) == "My SoW"

    def test_strips_whitespace(self):
        assert validate_sow_payload({"title": "  padded  "}) == "padded"

    def test_missing_title_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            validate_sow_payload({})
        assert exc.value.status_code == 400

    def test_empty_string_raises_400(self):
        with pytest.raises(HTTPException):
            validate_sow_payload({"title": ""})

    def test_whitespace_only_raises_400(self):
        with pytest.raises(HTTPException):
            validate_sow_payload({"title": "   "})

    def test_none_title_raises_400(self):
        with pytest.raises(HTTPException):
            validate_sow_payload({"title": None})

    def test_title_with_special_chars(self):
        assert validate_sow_payload({"title": "SoW — Phase 1 (draft)"}) == "SoW — Phase 1 (draft)"


# ── validate_neo4j_label ─────────────────────────────────


class TestValidateNeo4jLabel:
    def test_simple_label(self):
        assert validate_neo4j_label("Deliverable") == "Deliverable"

    def test_underscore_label(self):
        assert validate_neo4j_label("SoW_Section") == "SoW_Section"

    def test_starts_with_underscore(self):
        assert validate_neo4j_label("_Internal") == "_Internal"

    def test_rejects_spaces(self):
        with pytest.raises(HTTPException) as exc:
            validate_neo4j_label("Bad Label")
        assert exc.value.status_code == 400

    def test_rejects_cypher_injection(self):
        with pytest.raises(HTTPException):
            validate_neo4j_label("Foo}) DETACH DELETE n //")

    def test_rejects_leading_digit(self):
        with pytest.raises(HTTPException):
            validate_neo4j_label("1BadLabel")

    def test_rejects_empty(self):
        with pytest.raises(HTTPException):
            validate_neo4j_label("")

    def test_rejects_special_chars(self):
        with pytest.raises(HTTPException):
            validate_neo4j_label("Node;DROP")


# ── validate_neo4j_relationship_type ─────────────────────


class TestValidateNeo4jRelationshipType:
    def test_valid_type(self):
        assert validate_neo4j_relationship_type("PART_OF") == "PART_OF"

    def test_single_word(self):
        assert validate_neo4j_relationship_type("CONTAINS") == "CONTAINS"

    def test_rejects_lowercase(self):
        with pytest.raises(HTTPException):
            validate_neo4j_relationship_type("part_of")

    def test_rejects_mixed_case(self):
        with pytest.raises(HTTPException):
            validate_neo4j_relationship_type("Part_Of")

    def test_rejects_injection(self):
        with pytest.raises(HTTPException):
            validate_neo4j_relationship_type("PART_OF]->(b) DETACH DELETE b //")

    def test_rejects_empty(self):
        with pytest.raises(HTTPException):
            validate_neo4j_relationship_type("")


# ── validate_knowledge_payload ───────────────────────────


class TestValidateKnowledgePayload:
    def test_valid_full_payload(self):
        payload = {
            "sow_id": 1,
            "entities": [{"label": "Deliverable", "name": "Doc"}],
            "relationships": [{"from": "A", "to": "B", "type": "PART_OF"}],
        }
        sow_id, entities, rels = validate_knowledge_payload(payload)
        assert sow_id == 1
        assert len(entities) == 1
        assert len(rels) == 1

    def test_empty_payload_defaults(self):
        sow_id, entities, rels = validate_knowledge_payload({})
        assert sow_id is None
        assert entities == []
        assert rels == []

    def test_entity_missing_label_raises(self):
        with pytest.raises(HTTPException) as exc:
            validate_knowledge_payload({"entities": [{"name": "X"}]})
        assert exc.value.status_code == 400

    def test_entity_missing_name_raises(self):
        with pytest.raises(HTTPException):
            validate_knowledge_payload({"entities": [{"label": "Deliverable"}]})

    def test_entity_with_invalid_label_raises(self):
        with pytest.raises(HTTPException):
            validate_knowledge_payload({"entities": [{"label": "Bad Label", "name": "X"}]})

    def test_relationship_missing_type_raises(self):
        with pytest.raises(HTTPException):
            validate_knowledge_payload({"relationships": [{"from": "A", "to": "B"}]})

    def test_relationship_missing_from_raises(self):
        with pytest.raises(HTTPException):
            validate_knowledge_payload({"relationships": [{"to": "B", "type": "HAS"}]})

    def test_relationship_with_invalid_type_raises(self):
        with pytest.raises(HTTPException):
            validate_knowledge_payload(
                {"relationships": [{"from": "A", "to": "B", "type": "bad_type"}]}
            )


# ── build_health_status ──────────────────────────────────


class TestBuildHealthStatus:
    def test_both_healthy(self):
        result = build_health_status(True, None, True, None)
        assert result["status"] == "healthy"
        assert result["neo4j"] == "connected"
        assert result["postgres"] == "connected"

    def test_neo4j_down(self):
        result = build_health_status(False, "Connection refused", True, None)
        assert result["status"] == "degraded"
        assert "Connection refused" in result["neo4j"]
        assert result["postgres"] == "connected"

    def test_postgres_down(self):
        result = build_health_status(True, None, False, "timeout")
        assert result["status"] == "degraded"
        assert result["neo4j"] == "connected"
        assert "timeout" in result["postgres"]

    def test_both_down(self):
        result = build_health_status(False, "err1", False, "err2")
        assert result["status"] == "degraded"
        assert "err1" in result["neo4j"]
        assert "err2" in result["postgres"]


# ── format helpers ───────────────────────────────────────


class TestFormatGraphStats:
    def test_formats_correctly(self):
        result = format_graph_stats(42, 10, ["SOW", "Section"])
        assert result == {"nodes": 42, "relationships": 10, "labels": ["SOW", "Section"]}

    def test_empty_labels(self):
        result = format_graph_stats(0, 0, [])
        assert result == {"nodes": 0, "relationships": 0, "labels": []}


class TestFormatKnowledgeResult:
    def test_formats_correctly(self):
        result = format_knowledge_result(3, 2)
        assert result == {"status": "ok", "entities_added": 3, "relationships_added": 2}

    def test_zeros(self):
        result = format_knowledge_result(0, 0)
        assert result == {"status": "ok", "entities_added": 0, "relationships_added": 0}
