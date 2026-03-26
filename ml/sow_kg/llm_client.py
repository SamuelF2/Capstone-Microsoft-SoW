from __future__ import annotations
import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")
logger = logging.getLogger(__name__)
_client = None


def get_client():
    global _client
    if _client is not None:
        return _client
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    if not endpoint or not api_key:
        raise RuntimeError("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set in .env")
    from openai import OpenAI
    _client = OpenAI(base_url=endpoint, api_key=api_key)
    return _client


def get_model() -> str:
    return os.getenv("AZURE_OPENAI_DEPLOYMENT", "Kimi-K2.5")


def llm_call(system: str, user: str, temperature: float = 0.1) -> str:
    response = get_client().chat.completions.create(
        model=get_model(),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def llm_json(
    system: str,
    user: str,
    temperature: float = 0.1,
    fallback: dict | list | None = None,
) -> dict | list:
    raw = llm_call(
        system=system + "\n\nRespond with valid JSON only. No markdown fences, no explanation, no preamble.",
        user=user,
        temperature=temperature,
    )
    try:
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        return json.loads(clean.strip())
    except (json.JSONDecodeError, IndexError) as e:
        logger.warning(f"LLM JSON parse error: {e}\nRaw: {raw[:200]}")
        return fallback if fallback is not None else {}


SECTION_CLASSIFICATION_SYSTEM = """\
You are a Microsoft SOW (Statement of Work) document analyst.
Classify the given section heading and content preview into ONE section type.

Known types: scope, outOfScope, deliverables, approach, customerResponsibilities,
assumptions, risks, supportTransitionPlan, staffing, executiveSummary,
introduction, changeManagement, governance, milestones, billing, other

If the section fits none of the known types, return type="other" and set new_type
to a snake_case name that better describes it.

Return JSON: {"type": str, "confidence": float, "new_type": str|null, "reasoning": str}\
"""


def classify_section(heading: str, preview: str) -> dict:
    result = llm_json(
        system=SECTION_CLASSIFICATION_SYSTEM,
        user=f"Heading: {heading}\nContent preview: {preview[:300]}",
        fallback={"type": "other", "confidence": 0.0, "new_type": None, "reasoning": "parse error"},
    )
    return {
        "type": result.get("type", "other"),
        "confidence": float(result.get("confidence", 0.5)),
        "new_type": result.get("new_type"),
        "reasoning": result.get("reasoning", ""),
    }


ENTITY_EXTRACTION_SYSTEM = """\
Extract structured entities and relationships from a Microsoft SOW section.

Return JSON with this structure:
{
  "entities": [{"label": "Party|Milestone|Deliverable|Risk|Assumption|Term|Person|Technology|Location", "name": str, "properties": {}, "confidence": float}],
  "relationships": [{"from_name": str, "from_label": str, "to_name": str, "to_label": str, "type": str, "confidence": float}],
  "proposed_schema": [{"kind": "node|edge", "label": str, "description": str, "confidence": float}]
}

Extract all visible entities. For relationships look for ownership, responsibility,
dependency, temporal ordering, risk causation, and implicit relationships
("customer will provide" → PROVIDES). Only propose schema extensions with confidence > 0.7.

Known labels: SOW, Section, Deliverable, Risk, Rule, ClauseType, BannedPhrase,
Methodology, Party, Milestone, Assumption, Term, Persona, ApprovalStage,
EsapLevel, ChecklistItem, Requirement, SchemaProposal\
"""


def extract_entities(section_heading: str, section_content: str) -> dict:
    result = llm_json(
        system=ENTITY_EXTRACTION_SYSTEM,
        user=f"Section: {section_heading}\n\nContent:\n{section_content[:1500]}",
        fallback={"entities": [], "relationships": [], "proposed_schema": []},
    )
    return {
        "entities": result.get("entities", []),
        "relationships": result.get("relationships", []),
        "proposed_schema": result.get("proposed_schema", []),
    }


RISK_EXTRACTION_SYSTEM = """\
Extract actual risks from a Microsoft SOW section.

Return JSON:
{
  "risks": [{"description": str, "severity": "low|medium|high|critical", "mitigation": str, "category": "Financial|Delivery|Technical|Compliance|Reputational|Strategic", "has_mitigation": bool, "confidence": float}]
}

Only extract potential future negative events. Not process steps or risk management procedures.\
"""


def extract_risks_llm(section_content: str) -> list[dict]:
    result = llm_json(
        system=RISK_EXTRACTION_SYSTEM,
        user=section_content[:2000],
        fallback={"risks": []},
    )
    return result.get("risks", [])


DELIVERABLE_EXTRACTION_SYSTEM = """\
Extract deliverables from a Microsoft SOW section.

Return JSON:
{
  "deliverables": [{"title": str, "description": str, "acceptance_criteria": str, "has_ac": bool, "confidence": float}]
}

Only extract concrete work products or documents. Not activities or processes.\
"""


def extract_deliverables_llm(section_content: str) -> list[dict]:
    result = llm_json(
        system=DELIVERABLE_EXTRACTION_SYSTEM,
        user=section_content[:2000],
        fallback={"deliverables": []},
    )
    return result.get("deliverables", [])
