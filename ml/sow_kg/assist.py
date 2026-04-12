from __future__ import annotations

import json
import logging

from neo4j import Driver

from .graphrag import retrieve

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an expert Microsoft SOW (Statement of Work) authoring assistant with deep knowledge \
of Microsoft SDMPlus/MCEM compliance standards, ESAP approval requirements, and SOW best practices.

You have access to retrieved context from a knowledge graph containing real SOW sections, \
validation rules, banned phrases, risks, and deliverables from similar deals.

Rules:
- Ground every response in the retrieved context. Cite specific rules, sections, or examples.
- Flag compliance issues before providing suggestions.
- Suggest concrete language, not generic advice.
- Reference the deal methodology when relevant.
- Be concise. Authors are working professionals.\
"""

# ── Structured section schemas ───────────────────────────────────────────────
# When the caller provides a section_key that appears here, the LLM is asked
# to return JSON matching the schema instead of free-form prose.

SECTION_SCHEMAS: dict[str, dict] = {
    "executiveSummary": {
        "description": "Executive summary with a single content string.",
        "schema": {"content": "string"},
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
            "acceptanceCriteria, milestonePhase, and dueDate (YYYY-MM-DD or empty string)."
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
            "Team structure with a members array and a supportTransitionPlan string. "
            "Each member has role, assignedPerson, onshore (number of days), "
            "offshore (number of days)."
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
            "Assumptions, customer responsibilities, and risks. "
            "Each assumption has text and label (Assumption/Technical/"
            "Customer Responsibility/Other). Each responsibility has text. "
            "Each risk has description, severity (Low/Medium/High/Critical), "
            "owner, mitigation."
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
}


def assist(
    driver: Driver,
    model,
    query: str,
    sow_id: str | None = None,
    history: list[dict] | None = None,
    top_k: int = 5,
    hop_depth: int = 2,
    max_tokens: int = 2048,
    section_key: str | None = None,
) -> dict:
    ctx = retrieve(driver, model, query, sow_id=sow_id, top_k=top_k, hop_depth=hop_depth)

    # Determine if we should return structured JSON
    schema_entry = SECTION_SCHEMAS.get(section_key) if section_key else None

    system = SYSTEM_PROMPT
    if schema_entry:
        schema_json = json.dumps(schema_entry["schema"], indent=2)
        system += (
            f"\n\n{schema_entry['description']}\n"
            f"Return your rewrite as JSON matching this schema exactly:\n"
            f"{schema_json}\n\n"
            f"Return valid JSON only. No markdown fences, no explanation, no preamble."
        )

    messages = [{"role": "system", "content": system}]
    if history:
        messages.extend(history[-6:])

    context_block = ctx.to_prompt_context()
    user_content = f"<context>\n{context_block}\n</context>\n\n{query}" if context_block else query
    messages.append({"role": "user", "content": user_content})

    structured = None

    if schema_entry:
        # Use llm_json for structured output
        from .llm_client import llm_json as _llm_json

        structured = _llm_json(
            system=system,
            user=user_content,
            temperature=0.3,
            fallback=None,
        )
        # Generate a human-readable summary as the answer
        answer = f"[Structured rewrite for {section_key}]"
    else:
        from .llm_client import get_client, get_model

        response = get_client().chat.completions.create(
            model=get_model(),
            messages=messages,
            temperature=0.3,
        )
        answer = response.choices[0].message.content or ""

    result = {
        "answer": answer,
        "context": {
            "sections_used": len(ctx.sections),
            "rules_applied": len(ctx.rules),
            "banned_phrases_found": len(ctx.banned_phrases),
            "risks_surfaced": len(ctx.risks),
            "similar_sections": len(ctx.similar_sections),
            "methodology": ctx.deal_context.methodology,
            "deal_value": ctx.deal_context.deal_value,
            "sow_id": sow_id,
        },
        "retrieved": {
            "sections": [
                {"id": s.get("id"), "heading": s.get("heading"), "type": s.get("section_type")}
                for s in ctx.sections
            ],
            "rules": [
                {
                    "id": r.get("rule_id"),
                    "description": r.get("description"),
                    "severity": r.get("severity"),
                }
                for r in ctx.rules
            ],
            "banned_phrases": ctx.banned_phrases,
            "risks": [
                {
                    "id": r.get("id"),
                    "description": r.get("description"),
                    "severity": r.get("severity"),
                }
                for r in ctx.risks
            ],
        },
    }

    if structured is not None:
        result["structured"] = structured

    return result
