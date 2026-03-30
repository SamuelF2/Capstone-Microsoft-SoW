from __future__ import annotations

import logging

from neo4j import Driver

from .graph_rag import RetrievedContext, retrieve

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert Microsoft SOW (Statement of Work) authoring assistant with deep knowledge of Microsoft's SDMPlus/MCEM compliance standards, ESAP approval requirements, and SOW best practices.

You help authors write, review, and improve SOW documents. You have access to retrieved context from a knowledge graph containing real SOW sections, validation rules, banned phrases, risks, and deliverables from similar engagements.

Your responses must:
- Be grounded in the retrieved context — cite specific rules, sections, or examples when relevant
- Flag compliance issues proactively (banned phrases, missing required elements, vague acceptance criteria)
- Suggest concrete, specific language rather than generic advice
- Reference the methodology (Agile/Waterfall/Sure Step/Cloud Adoption) when giving advice about structure
- Be concise and actionable — authors are working professionals, not students

When the context contains banned phrases or validation rules, always surface them before providing suggestions."""


def build_messages(
    query: str, ctx: RetrievedContext, history: list[dict] | None = None
) -> list[dict]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if history:
        messages.extend(history[-6:])

    context_block = ctx.to_prompt_context()
    user_content = f"<context>\n{context_block}\n</context>\n\n{query}" if context_block else query

    messages.append({"role": "user", "content": user_content})
    return messages


def assist(
    driver: Driver,
    model,
    query: str,
    sow_id: str | None = None,
    history: list[dict] | None = None,
    top_k: int = 5,
    hop_depth: int = 2,
    max_tokens: int = 2048,
) -> dict:
    ctx = retrieve(driver, model, query, sow_id=sow_id, top_k=top_k, hop_depth=hop_depth)
    messages = build_messages(query, ctx, history)

    from .llm_client import get_client, get_model

    client = get_client()
    response = client.chat.completions.create(
        model=get_model(),
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.3,
    )

    answer = response.choices[0].message.content or ""

    return {
        "answer": answer,
        "context": {
            "sections_used": len(ctx.sections),
            "rules_applied": len(ctx.rules),
            "banned_phrases_found": len(ctx.banned_phrases),
            "risks_surfaced": len(ctx.risks),
            "similar_sections": len(ctx.similar_sections),
            "methodology": ctx.methodology,
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
