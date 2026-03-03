"""
Unit tests for ml/sow_kg/ingest_json.py pure functions.
These tests require no Neo4j connection.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from sow_kg.ingest_json import _rule_id


class TestRuleId:
    def test_deterministic(self):
        assert _rule_id("bp", "some phrase") == _rule_id("bp", "some phrase")

    def test_prefix_included(self):
        result = _rule_id("bp", "test")
        assert result.startswith("bp_")

    def test_different_inputs_different_ids(self):
        a = _rule_id("bp", "phrase one")
        b = _rule_id("bp", "phrase two")
        assert a != b

    def test_different_prefixes_different_ids(self):
        a = _rule_id("bp", "same")
        b = _rule_id("esap_trigger", "same")
        assert a != b

    def test_multiple_parts(self):
        result = _rule_id("method_must", "agile", "sprint planning")
        assert result.startswith("method_must_")
        assert len(result) > len("method_must_")

    def test_special_characters_safe(self):
        # Should not crash on special chars
        result = _rule_id("bp", "deal_value > 5,000,000 && margin < 10%")
        assert result.startswith("bp_")

    def test_consistent_length(self):
        short = _rule_id("bp", "x")
        long = _rule_id("bp", "x" * 1000)
        # Both should have prefix + 10 char hash
        assert len(short.split("_", 1)[1]) == 10
        assert len(long.split("_", 1)[1]) == 10
