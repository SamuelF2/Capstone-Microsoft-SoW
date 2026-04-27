"""Drift detector for utils.section_schemas.

The frontend keeps the source-of-truth at ``frontend/lib/sectionSchemas.js``
SCHEMAS dict; the backend mirrors it for the AI-extraction endpoint. If a
new section is added on either side without updating the other, the
extraction modal silently drops it. This test fails loudly so that
divergence is caught at CI time.

The golden list lives below. Update both files (JS + Python) and this
list together when adding a section.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from utils.section_schemas import (  # noqa: E402
    SECTION_SCHEMAS,
    all_section_keys,
    default_target_sections,
    get_schema,
)

# Mirror of frontend/lib/sectionSchemas.js SCHEMAS keys.
GOLDEN_KEYS = {
    "executiveSummary",
    "projectScope",
    "deliverables",
    "teamStructure",
    "assumptionsRisks",
    "agileApproach",
}


class TestSchemaKeysMatchGolden:
    def test_keys_match_golden(self):
        assert set(all_section_keys()) == GOLDEN_KEYS

    def test_each_schema_has_description_and_shape(self):
        for key, entry in SECTION_SCHEMAS.items():
            assert "description" in entry, f"{key} missing description"
            assert "schema" in entry, f"{key} missing schema"


class TestGetSchema:
    def test_known_key_returns_entry(self):
        entry = get_schema("executiveSummary")
        assert entry is not None
        assert "schema" in entry

    def test_unknown_key_returns_none(self):
        assert get_schema("notARealSection") is None


class TestDefaultTargetSections:
    def test_agile_methodology_includes_agile_approach(self):
        out = default_target_sections("Agile Sprint Delivery")
        assert "agileApproach" in out

    def test_no_methodology_returns_all_keys(self):
        assert set(default_target_sections(None)) == GOLDEN_KEYS

    @pytest.mark.parametrize("methodology", ["Sure Step 365", "Waterfall", "Cloud Adoption"])
    def test_non_agile_methodologies_drop_agile_approach(self, methodology):
        out = default_target_sections(methodology)
        assert "agileApproach" not in out
        # All other sections still present.
        assert set(out) == GOLDEN_KEYS - {"agileApproach"}
