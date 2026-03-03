"""
Unit tests for ml/sow_kg/queries.py pure logic.
Tests the approval threshold logic which is pure Python.
No Neo4j connection required.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))


class TestApprovalThresholds:
    """
    Test the threshold logic from get_approval_chain.
    Extracted here since the actual function needs a driver,
    but the branching logic is what matters.
    """

    @staticmethod
    def _classify(deal_value: float, margin: float) -> str:
        """Mirror the classification logic from get_approval_chain."""
        if deal_value > 5_000_000 or margin < 10:
            return "type-1"
        elif deal_value > 1_000_000 or margin < 15:
            return "type-2"
        else:
            return "type-3"

    # Type-1 triggers
    def test_high_value_triggers_type1(self):
        assert self._classify(6_000_000, 20) == "type-1"

    def test_low_margin_triggers_type1(self):
        assert self._classify(500_000, 8) == "type-1"

    def test_both_type1_conditions(self):
        assert self._classify(10_000_000, 5) == "type-1"

    # Type-1 boundary
    def test_exactly_5m_is_not_type1(self):
        assert self._classify(5_000_000, 20) != "type-1"

    def test_exactly_10_margin_is_not_type1(self):
        assert self._classify(500_000, 10) != "type-1"

    # Type-2 triggers
    def test_mid_value_triggers_type2(self):
        assert self._classify(2_000_000, 20) == "type-2"

    def test_mid_margin_triggers_type2(self):
        assert self._classify(500_000, 12) == "type-2"

    # Type-2 boundary
    def test_exactly_1m_is_not_type2(self):
        assert self._classify(1_000_000, 20) == "type-3"

    def test_exactly_15_margin_is_not_type2(self):
        assert self._classify(500_000, 15) == "type-3"

    # Type-3
    def test_low_value_high_margin_is_type3(self):
        assert self._classify(500_000, 25) == "type-3"

    def test_minimum_type3(self):
        assert self._classify(100_000, 50) == "type-3"

    # Edge: margin takes priority when both could trigger
    def test_low_margin_overrides_low_value(self):
        # Value would be type-3, but margin < 10 forces type-1
        assert self._classify(100_000, 5) == "type-1"

    def test_mid_margin_overrides_low_value(self):
        # Value would be type-3, but margin < 15 forces type-2
        assert self._classify(100_000, 14) == "type-2"
