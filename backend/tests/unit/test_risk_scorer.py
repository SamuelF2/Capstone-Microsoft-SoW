"""Unit tests for the risk-assessment scoring layer in services/ai.py.

All pure functions, no I/O — exercises the real risk-framework constants from
services/risk_framework.py to catch drift between the framework module and the
scorer.
"""

from __future__ import annotations

import pytest
from services.ai import (
    _assess_risks,
    _classify_category,
    _deserialize_risks,
    _infer_probability,
    _map_risks,
    _map_triggered,
    _score_to_band,
    _severity_to_impact,
)

# ── _classify_category ──────────────────────────────────────────────────────


class TestClassifyCategory:
    def test_financial_keyword_hit(self):
        assert _classify_category("Burn rate exceeded 110% of plan") == "Financial"

    def test_technical_keyword_hit(self):
        assert _classify_category("ISV integration risk for production rollout") == "Technical"

    def test_compliance_keyword_hit(self):
        assert _classify_category("GDPR review pending") == "Compliance"

    def test_delivery_keyword_hit(self):
        assert _classify_category("Schedule slippage of 3 weeks") == "Delivery"

    def test_reputational_keyword_hit(self):
        assert _classify_category("CSAT score trending down") == "Reputational"

    def test_strategic_keyword_hit(self):
        assert _classify_category("Competitor RFP in flight") == "Strategic"

    def test_fallback_to_delivery(self):
        assert _classify_category("random unrelated description") == "Delivery"

    def test_empty_string_falls_back(self):
        assert _classify_category("") == "Delivery"

    def test_none_falls_back(self):
        assert _classify_category(None) == "Delivery"

    def test_case_insensitive(self):
        assert _classify_category("MARGIN under pressure") == "Financial"


# ── _severity_to_impact ─────────────────────────────────────────────────────


class TestSeverityToImpact:
    @pytest.mark.parametrize(
        "severity,expected",
        [
            ("critical", 5),
            ("high", 4),
            ("medium", 3),
            ("low", 2),
            ("unknown", 3),
            ("", 3),
            (None, 3),
        ],
    )
    def test_mapping(self, severity, expected):
        assert _severity_to_impact(severity) == expected


# ── _infer_probability ──────────────────────────────────────────────────────


class TestInferProbability:
    def test_high_no_mitigation(self):
        assert _infer_probability("high", has_mitigation=False) == 4

    def test_high_with_mitigation(self):
        assert _infer_probability("high", has_mitigation=True) == 3

    def test_critical_no_mitigation(self):
        assert _infer_probability("critical", has_mitigation=False) == 4

    def test_medium(self):
        assert _infer_probability("medium", has_mitigation=False) == 3

    def test_low(self):
        assert _infer_probability("low", has_mitigation=False) == 2

    def test_unknown_defaults_to_medium(self):
        assert _infer_probability("nonsense", has_mitigation=False) == 2


# ── _score_to_band ──────────────────────────────────────────────────────────


class TestScoreToBand:
    @pytest.mark.parametrize(
        "score,band",
        [
            (1, "Very Low"),
            (2, "Very Low"),
            (3, "Low"),
            (5, "Low"),
            (6, "Medium"),
            (11, "Medium"),
            (12, "High"),
            (15, "High"),
            (16, "Very High"),
            (25, "Very High"),
        ],
    )
    def test_boundaries(self, score, band):
        assert _score_to_band(score) == band

    def test_zero_falls_back_to_very_low(self):
        assert _score_to_band(0) == "Very Low"


# ── _map_risks ──────────────────────────────────────────────────────────────


class TestMapRisks:
    def test_populates_all_new_fields(self):
        payload = {
            "risks": [
                {
                    "description": "Burn rate exceeded plan",
                    "severity": "high",
                    "has_mitigation": False,
                }
            ]
        }
        risks = _map_risks(payload)
        assert len(risks) == 1
        r = risks[0]
        assert r.category == "Financial"
        assert r.level == "high"
        assert r.probability == 4  # high + no mit
        assert r.impact == 4  # high
        assert r.priority_score == 16
        assert r.priority_band == "Very High"
        assert r.has_mitigation is False
        assert r.mitigation is None

    def test_uses_ml_supplied_probability_and_impact(self):
        payload = {
            "risks": [
                {
                    "description": "Schedule slippage",
                    "severity": "low",
                    "probability": 5,
                    "impact": 3,
                }
            ]
        }
        risks = _map_risks(payload)
        r = risks[0]
        assert r.probability == 5
        assert r.impact == 3
        assert r.priority_score == 15
        assert r.priority_band == "High"

    def test_clamps_out_of_range_values(self):
        payload = {
            "risks": [
                {
                    "description": "x",
                    "severity": "medium",
                    "probability": 99,
                    "impact": -5,
                }
            ]
        }
        r = _map_risks(payload)[0]
        assert r.probability == 5
        assert r.impact == 1

    def test_mitigation_text_implies_has_mitigation(self):
        payload = {
            "risks": [
                {
                    "description": "x",
                    "severity": "medium",
                    "mitigation": "Weekly check-ins",
                }
            ]
        }
        r = _map_risks(payload)[0]
        assert r.has_mitigation is True
        assert r.mitigation == "Weekly check-ins"

    def test_ignores_triggered_array(self):
        payload = {
            "risks": [],
            "triggered": [{"section": "Scope", "trigger": "guarantee", "severity": "high"}],
        }
        assert _map_risks(payload) == []


# ── _map_triggered ──────────────────────────────────────────────────────────


class TestMapTriggered:
    def test_maps_triggered_array(self):
        payload = {
            "triggered": [
                {
                    "section": "Scope & Approach",
                    "trigger": "guarantee",
                    "reason": "creates unlimited liability",
                    "severity": "high",
                    "suggestion": "Use 'target' instead",
                }
            ]
        }
        out = _map_triggered(payload)
        assert len(out) == 1
        t = out[0]
        assert t.section == "Scope & Approach"
        assert t.trigger == "guarantee"
        assert t.severity == "high"
        assert t.suggestion == "Use 'target' instead"

    def test_empty_returns_empty_list(self):
        assert _map_triggered({}) == []


# ── _assess_risks ───────────────────────────────────────────────────────────


class TestAssessRisks:
    def test_overall_is_max_priority_score(self):
        payload = {
            "risks": [
                {"description": "margin slip", "severity": "low"},  # score = 2*2 = 4
                {"description": "guarantee in scope", "severity": "high"},  # score = 4*4 = 16
                {"description": "schedule risk", "severity": "medium"},  # score = 3*3 = 9
            ],
            "triggered": [],
        }
        a = _assess_risks(payload)
        assert a.overall_risk_score == 16
        assert a.risk_band == "Very High"
        assert len(a.risks) == 3

    def test_category_breakdown_aggregates(self):
        payload = {
            "risks": [
                {"description": "burn rate", "severity": "high"},  # Financial
                {"description": "pricing variance", "severity": "medium"},  # Financial
                {"description": "schedule slippage", "severity": "medium"},  # Delivery
            ]
        }
        a = _assess_risks(payload)
        assert a.category_breakdown == {"Financial": 2, "Delivery": 1}

    def test_band_breakdown_aggregates(self):
        payload = {
            "risks": [
                {"description": "x", "severity": "high"},  # 16 → Very High
                {"description": "x", "severity": "medium"},  # 9 → Medium
                {"description": "x", "severity": "low"},  # 4 → Low
            ]
        }
        a = _assess_risks(payload)
        assert a.band_breakdown.get("Very High") == 1
        assert a.band_breakdown.get("Medium") == 1
        assert a.band_breakdown.get("Low") == 1

    def test_mitigation_coverage_ratio(self):
        payload = {
            "risks": [
                {"description": "a", "severity": "medium", "mitigation": "yes"},
                {"description": "b", "severity": "medium"},
                {"description": "c", "severity": "medium", "mitigation": "yes"},
                {"description": "d", "severity": "medium"},
            ]
        }
        a = _assess_risks(payload)
        assert a.has_mitigation_coverage == 0.5

    def test_empty_risks_yields_zero_score(self):
        a = _assess_risks({"risks": [], "triggered": []})
        assert a.overall_risk_score == 0.0
        assert a.risk_band == "Very Low"
        assert a.has_mitigation_coverage == 0.0

    def test_triggered_passthrough(self):
        payload = {
            "risks": [],
            "triggered": [{"section": "S", "trigger": "t", "reason": "r", "severity": "high"}],
        }
        a = _assess_risks(payload)
        assert len(a.triggered) == 1
        assert a.triggered[0].trigger == "t"


# ── _deserialize_risks (legacy upgrade path) ────────────────────────────────


class TestDeserializeRisks:
    def test_none_returns_empty_assessment(self):
        a = _deserialize_risks(None)
        assert a.risks == []
        assert a.overall_risk_score == 0.0

    def test_legacy_list_is_rescored(self):
        legacy = [
            {"category": "Staffing", "level": "high", "description": "key person dependency"},
            {"category": "Triggered", "level": "high", "description": "guarantee — banned"},
        ]
        a = _deserialize_risks(legacy)
        # Rescored from severity → 4*4 = 16 each, so overall = 16
        assert a.overall_risk_score == 16
        assert a.risk_band == "Very High"
        assert len(a.risks) == 2

    def test_new_dict_shape_round_trips(self):
        payload = {
            "risks": [
                {
                    "category": "Financial",
                    "level": "high",
                    "description": "margin slip",
                    "probability": 4,
                    "impact": 4,
                    "priority_score": 16,
                    "priority_band": "Very High",
                }
            ],
            "triggered": [],
            "overall_risk_score": 16,
            "risk_band": "Very High",
            "category_breakdown": {"Financial": 1},
            "band_breakdown": {"Very High": 1},
            "has_mitigation_coverage": 0.0,
        }
        a = _deserialize_risks(payload)
        assert a.overall_risk_score == 16
        assert a.risk_band == "Very High"
        assert a.risks[0].category == "Financial"
