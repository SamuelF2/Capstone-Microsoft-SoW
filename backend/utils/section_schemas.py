"""Python mirror of ``frontend/lib/sectionSchemas.js`` SCHEMAS.

Source-of-truth for the AI-driven document → SoW extraction pipeline.
The backend ships these schemas to the ML service as part of the
``/extract/sow-fields`` payload so the LLM knows what shape to return.

The frontend keeps its own copy of the same schemas (used for inline
"Improve this section" rewrites and modal rendering). When you change a
section's shape on either side, update this file in lockstep —
``backend/tests/utils/test_section_schemas.py`` compares the keys here
against a checked-in golden list to catch drift.

Type markers are deliberately *prompt sketches* rather than JSON Schema:

* ``"string"`` / ``"number"`` — primitive
* ``[ {...} ]``               — array of objects matching the inner shape
* ``{ ... }``                 — object with the named keys

The LLM treats these as guidance, not validation. Keep them small and
unambiguous.
"""

from __future__ import annotations

from typing import Any

# Source: frontend/lib/sectionSchemas.js — SCHEMAS dict (lines 15-90).
# Keep keys, descriptions, and shapes in lockstep with the JS copy.
SECTION_SCHEMAS: dict[str, dict[str, Any]] = {
    "executiveSummary": {
        "description": "Executive summary with a single content string.",
        "schema": {
            "content": "string",
        },
    },
    "projectScope": {
        "description": (
            'Project scope with in-scope and out-of-scope item lists. Each item has a "text" field.'
        ),
        "schema": {
            "inScope": [{"text": "string"}],
            "outOfScope": [{"text": "string"}],
        },
    },
    "deliverables": {
        "description": (
            "Array of deliverables. Each has name, description, "
            "acceptanceCriteria, milestonePhase, and dueDate "
            "(YYYY-MM-DD or empty string)."
        ),
        "schema": [
            {
                "name": "string",
                "description": "string",
                "acceptanceCriteria": "string",
                "milestonePhase": "string",
                "dueDate": "string",
            }
        ],
    },
    "teamStructure": {
        "description": (
            "Team structure with a members array and a "
            "supportTransitionPlan string. Each member has role, "
            "assignedPerson, onshore (number of days), offshore "
            "(number of days)."
        ),
        "schema": {
            "members": [
                {
                    "role": "string",
                    "assignedPerson": "string",
                    "onshore": "number",
                    "offshore": "number",
                }
            ],
            "supportTransitionPlan": "string",
        },
    },
    "assumptionsRisks": {
        "description": (
            "Assumptions, customer responsibilities, and risks. Each "
            "assumption has text and label (one of: Assumption, "
            "Technical, Customer Responsibility, Other). Each "
            "responsibility has text. Each risk has description, "
            "severity (Low/Medium/High/Critical), owner, mitigation."
        ),
        "schema": {
            "assumptions": [{"text": "string", "label": "string"}],
            "customerResponsibilities": [{"text": "string"}],
            "risks": [
                {
                    "description": "string",
                    "severity": "string",
                    "owner": "string",
                    "mitigation": "string",
                }
            ],
        },
    },
    "agileApproach": {
        "description": (
            "Agile delivery approach with sprint planning. Each sprint "
            'has name, goal, duration (one of: "1 week", "2 weeks", '
            '"3 weeks", "4 weeks"), and stories (multi-line text of '
            "key user stories or features). Also includes "
            "deliveryApproach and supportTransitionPlan text fields."
        ),
        "schema": {
            "deliveryApproach": "string",
            "supportTransitionPlan": "string",
            "sprints": [
                {
                    "name": "string",
                    "goal": "string",
                    "duration": "string",
                    "stories": "string",
                }
            ],
        },
    },
}


def all_section_keys() -> list[str]:
    """Every section key the AI knows how to extract."""
    return list(SECTION_SCHEMAS.keys())


def get_schema(key: str) -> dict[str, Any] | None:
    return SECTION_SCHEMAS.get(key)


# Methodologies that don't use sprints — agileApproach is mostly noise
# for these and just clutters the preview modal with null rationales.
_NON_AGILE_METHODOLOGIES = frozenset({"Sure Step 365", "Waterfall", "Cloud Adoption"})


def default_target_sections(methodology: str | None = None) -> list[str]:
    """Pick the default section set to extract for a methodology.

    Drops ``agileApproach`` for non-agile methodologies so the LLM
    doesn't waste tokens trying to invent sprints from a Waterfall
    proposal.
    """
    keys = all_section_keys()
    if methodology in _NON_AGILE_METHODOLOGIES:
        keys = [k for k in keys if k != "agileApproach"]
    return keys
