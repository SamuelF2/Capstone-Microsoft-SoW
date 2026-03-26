"""
Unit tests for ml/sow_kg/ingest_markdown.py pure functions.
These tests require no Neo4j connection or ML models.
"""

import os
import sys

# Add ml/ to path so we can import the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from sow_kg.ingest_markdown import (
    _check_banned_phrases,
    _detect_methodology,
    _extract_deliverables,
    _extract_risks,
    _extract_sections,
    _stable_id,
)

# ─── _stable_id ──────────────────────────────────────────────────────────────


class TestStableId:
    def test_deterministic(self):
        assert _stable_id("hello") == _stable_id("hello")

    def test_prefix(self):
        result = _stable_id("hello", prefix="sow")
        assert result.startswith("sow_")

    def test_no_prefix(self):
        result = _stable_id("hello")
        assert "_" not in result  # raw hash, no prefix separator

    def test_different_inputs_different_ids(self):
        assert _stable_id("doc_a") != _stable_id("doc_b")


# ─── _detect_methodology ─────────────────────────────────────────────────────


class TestDetectMethodology:
    def test_agile(self):
        text = "We will use sprint planning and maintain a backlog with scrum ceremonies."
        assert _detect_methodology(text) == "agile"

    def test_waterfall(self):
        text = "The project follows a phase gate approach with a requirements phase and UAT."
        assert _detect_methodology(text) == "waterfall"

    def test_sure_step(self):
        text = (
            "Using Sure Step methodology with fit-gap analysis and diagnostic phase for Dynamics."
        )
        assert _detect_methodology(text) == "sure-step-365"

    def test_cloud_adoption(self):
        text = "We will establish a landing zone and run migration waves following Azure CAF."
        assert _detect_methodology(text) == "cloud-adoption"

    def test_unknown_fallback(self):
        text = "This document describes general consulting services."
        assert _detect_methodology(text) == "unknown"

    def test_highest_score_wins(self):
        # Agile keywords outnumber waterfall
        text = "sprint backlog scrum iteration product owner. Also includes a phase gate."
        assert _detect_methodology(text) == "agile"

    def test_case_insensitive(self):
        text = "SPRINT planning with BACKLOG management and SCRUM master."
        assert _detect_methodology(text) == "agile"


# ─── _extract_sections ───────────────────────────────────────────────────────


class TestExtractSections:
    def test_basic_h2_sections(self):
        md = """## Introduction
Some intro text here.

## Project Scope
Scope details go here.

## Deliverables
- Item A
- Item B
"""
        sections = _extract_sections(md)
        assert len(sections) == 3
        headings = [s["heading"] for s in sections]
        assert "Introduction" in headings
        assert "Project Scope" in headings
        assert "Deliverables" in headings

    def test_section_type_mapping_scope(self):
        md = """## Project Scope
This section covers scope."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "scope"

    def test_section_type_mapping_deliverables(self):
        md = """## Project Deliverables
List of deliverables."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "deliverables"

    def test_section_type_mapping_risks(self):
        md = """## Risk and Issue Management
Risk details."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "risks"

    def test_section_type_mapping_assumptions(self):
        md = """## Engagement Assumptions
We assume the following."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "assumptions"

    def test_section_type_mapping_customer_responsibilities(self):
        md = """## Customer Responsibilities
The customer shall provide..."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "customerResponsibilities"

    def test_section_type_other_fallback(self):
        md = """## Appendix Z Random Stuff
Some miscellaneous content."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "other"

    def test_out_of_scope(self):
        md = """## Out of Scope
These items are excluded."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "outOfScope"

    def test_h1_headings_included(self):
        md = """# Top Level Heading
Content under H1.

## Sub Heading
Content under H2.
"""
        sections = _extract_sections(md)
        assert len(sections) == 2

    def test_h3_headings_included(self):
        md = """### Detailed Sub-section
Content here."""
        sections = _extract_sections(md)
        assert len(sections) == 1
        assert sections[0]["level"] == 3

    def test_empty_sections_skipped(self):
        md = """## Non-empty Section
Has content.

## Empty Section
## Another Section
Also has content."""
        sections = _extract_sections(md)
        # "Empty Section" has no body content between it and the next heading
        headings = [s["heading"] for s in sections]
        assert "Empty Section" not in headings

    def test_char_count(self):
        md = """## Test Section
Hello world."""
        sections = _extract_sections(md)
        assert sections[0]["char_count"] == len("Hello world.")

    def test_trailing_period_stripped_for_matching(self):
        md = """## Customer responsibilities.
The customer will do things."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "customerResponsibilities"

    def test_governance_mapping(self):
        md = """## Governance
Governance framework details."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "governance"

    def test_staffing_mapping(self):
        md = """## Engagement Staffing
Team composition details."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "staffing"

    def test_billing_mapping(self):
        md = """## Payment Schedule
Monthly billing terms."""
        sections = _extract_sections(md)
        assert sections[0]["section_type"] == "billing"


# ─── _extract_risks ──────────────────────────────────────────────────────────


class TestExtractRisks:
    def test_table_extraction(self):
        content = """
| Risk | Severity | Mitigation |
|------|----------|------------|
| Data loss during migration | High | Implement backup strategy |
| Vendor lock-in | Medium | Use open standards |
"""
        risks = _extract_risks(content)
        assert len(risks) == 2
        assert risks[0]["severity"] == "high"
        assert risks[0]["has_mitigation"] is True

    def test_severity_normalization(self):
        content = """
| Risk | Severity | Mitigation |
|------|----------|------------|
| Critical issue | CRITICAL | Fix it |
| Low priority item | Low Risk | Monitor |
"""
        risks = _extract_risks(content)
        severities = {r["severity"] for r in risks}
        assert "critical" in severities
        assert "low" in severities

    def test_bullet_with_severity(self):
        content = """- **High** - Server capacity may be insufficient for peak loads
- **Low** - Minor UI inconsistencies across browsers"""
        risks = _extract_risks(content)
        assert len(risks) == 2
        assert risks[0]["severity"] == "high"
        assert risks[1]["severity"] == "low"

    def test_no_duplicate_risks(self):
        content = """
| Risk | Severity |
|------|----------|
| Data loss | High |
| Data loss | High |
"""
        risks = _extract_risks(content)
        assert len(risks) == 1

    def test_skips_header_row_values(self):
        content = """
| Risk | Severity |
|------|----------|
| Actual risk here | High |
"""
        risks = _extract_risks(content)
        assert len(risks) == 1
        assert risks[0]["description"] == "Actual risk here"

    def test_empty_mitigation(self):
        content = """
| Risk | Severity | Mitigation |
|------|----------|------------|
| Some risk | High |  |
"""
        risks = _extract_risks(content)
        assert risks[0]["has_mitigation"] is False

    def test_default_severity_medium(self):
        content = """
| Risk | Severity |
|------|----------|
| Ambiguous risk | unknown-level |
"""
        risks = _extract_risks(content)
        assert risks[0]["severity"] == "medium"

    def test_prose_bullet_fallback(self):
        # Only triggers when no table or severity-prefixed bullets found
        content = """- The timeline may slip due to external dependencies and resource constraints
- Integration with legacy systems could introduce unexpected complexity"""
        risks = _extract_risks(content)
        assert len(risks) == 2
        assert all(r["severity"] == "medium" for r in risks)

    def test_process_prefixes_skipped_in_prose(self):
        content = """- Identify all stakeholders early in the process
- Analyze risk impact and probability
- The deployment window is too narrow for rollback"""
        risks = _extract_risks(content)
        descriptions = [r["description"] for r in risks]
        # "Identify" and "Analyze" should be skipped as process steps
        assert not any("Identify" in d for d in descriptions)
        assert not any("Analyze" in d for d in descriptions)


# ─── _extract_deliverables ───────────────────────────────────────────────────


class TestExtractDeliverables:
    def test_table_extraction(self):
        content = """
| Deliverable | Description | Acceptance Criteria |
|-------------|-------------|---------------------|
| Design Doc | System architecture document | Reviewed and approved by tech lead |
| Test Plan | Comprehensive test strategy | Covers all user stories |
"""
        deliverables = _extract_deliverables(content)
        assert len(deliverables) == 2
        assert deliverables[0]["title"] == "Design Doc"
        assert deliverables[0]["has_ac"] is True

    def test_no_duplicate_deliverables(self):
        content = """
| Name | Description |
|------|-------------|
| Report A | First report |
| Report A | Duplicate |
"""
        deliverables = _extract_deliverables(content)
        assert len(deliverables) == 1

    def test_skip_header_like_values(self):
        content = """
| Deliverable | Description |
|-------------|-------------|
| Sprint Report | Weekly status |
"""
        deliverables = _extract_deliverables(content)
        assert len(deliverables) == 1
        assert deliverables[0]["title"] == "Sprint Report"

    def test_bullet_fallback(self):
        content = """- Architecture Decision Record
- Migration Runbook
- Post-mortem Report"""
        deliverables = _extract_deliverables(content)
        assert len(deliverables) == 3
        assert deliverables[0]["has_ac"] is False

    def test_missing_acceptance_criteria(self):
        content = """
| Deliverable | Description |
|-------------|-------------|
| Status Report | Weekly updates |
"""
        deliverables = _extract_deliverables(content)
        assert deliverables[0]["has_ac"] is False
        assert deliverables[0]["acceptance_criteria"] == ""

    def test_short_ac_not_counted(self):
        content = """
| Name | Acceptance |
|------|------------|
| Doc A | Yes |
"""
        deliverables = _extract_deliverables(content)
        # "Yes" is < 10 chars, so has_ac should be False
        assert deliverables[0]["has_ac"] is False


# ─── _check_banned_phrases ───────────────────────────────────────────────────


class TestCheckBannedPhrases:
    def test_finds_banned_phrase(self):
        banned = [{"phrase": "best effort"}, {"phrase": "unlimited"}]
        content = "We will deliver on a best effort basis."
        found = _check_banned_phrases(content, banned)
        assert "best effort" in found

    def test_case_insensitive(self):
        banned = [{"phrase": "best effort"}]
        content = "This is BEST EFFORT work."
        found = _check_banned_phrases(content, banned)
        assert "best effort" in found

    def test_no_matches(self):
        banned = [{"phrase": "best effort"}, {"phrase": "unlimited"}]
        content = "We will deliver according to the defined scope."
        found = _check_banned_phrases(content, banned)
        assert found == []

    def test_multiple_matches(self):
        banned = [{"phrase": "best effort"}, {"phrase": "unlimited"}, {"phrase": "reasonable"}]
        content = "We provide unlimited support on a best effort basis with reasonable timelines."
        found = _check_banned_phrases(content, banned)
        assert len(found) == 3
