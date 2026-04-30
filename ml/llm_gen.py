"""
llm_gen.py — LLM generation layer for SOW GraphRAG assistant.

Responsibilities:
  - Detect intent from query + context signals
  - Select and compose the appropriate system prompt
  - Serialize GraphRAG context into the user turn
  - Call the LLM and return the raw completion string

This module is stateless. All context is passed in per-call.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

client = OpenAI(
    base_url=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
)

MODEL = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

# ---------------------------------------------------------------------------
# System prompts — one per intent
# ---------------------------------------------------------------------------

_BASE = """
You are a SOW (Statement of Work) assistant embedded in a knowledge graph \
retrieval system. You receive retrieved context from a graph database that \
includes SOW sections, compliance rules, banned phrases, risks, deliverables, \
and similar approved documents.

Always:
- Ground your response strictly in the retrieved context provided.
- Never invent clauses, figures, commitments, or obligations.
- Replace any banned phrase with the approved alternative from context.
- Respect the methodology's language conventions:
    Agile   → sprints, ceremonies, definition of done, backlog
    Waterfall → phases, gates, sign-off, baseline
    Hybrid  → use whichever convention the section calls for.
- If the retrieved context is insufficient, say so explicitly and list
  what information is missing rather than filling gaps with assumptions.
""".strip()

_INTENTS: dict[str, str] = {
    "generate": _BASE
    + """

TASK — DRAFT
Your job is to write new SOW language for the requested section.
- Use retrieved sections and deliverables as your factual source.
- Be precise and bounded — avoid open-ended commitments.
- Structure output to match the section type (e.g. numbered list for
  scope items, table for risks, prose for executive summary).
- End with a short "Assumptions" note listing anything you needed to
  assume due to gaps in context.
""".rstrip(),
    "edit": _BASE
    + """

TASK — EDIT
The user has provided existing SOW text to be improved.
- Preserve original intent and factual content — do not add new scope.
- Remove or replace banned phrases using alternatives from context.
- Tighten vague or open-ended language into specific commitments.
- Do not soften liability or acceptance criteria language without flagging it.

Return two things:
  1. The rewritten passage.
  2. A concise changelog — bullet list of what changed and why,
     citing the rule or risk that motivated each change.
""".rstrip(),
    "review": _BASE
    + """

TASK — REVIEW
Your job is to identify problems in the provided SOW text against the
retrieved rules, banned phrases, and risk patterns.

For each finding provide:
  - What: the specific problem
  - Where: quote the offending phrase (≤ 15 words)
  - Why: cite the rule or risk from context
  - Fix: one concrete corrective action

Group findings under these four headers, omitting any header with no findings:
  COMPLIANCE   — banned phrases, rule violations
  COMPLETENESS — missing required sections, deliverables without AC,
                 risks without mitigation
  RISK         — language matching known risk trigger patterns
  STYLE        — vague or uncommitted language (advisory only)

If the text is clean in a category, write "None found." under that header.
Do not invent issues to appear thorough.
""".rstrip(),
    "explain": _BASE
    + """

TASK — EXPLAIN
Answer the user's question using only the retrieved context.
- If the answer is present, be direct and cite the section or rule.
- If the answer is not in the context, say so — do not speculate.
- Keep answers short unless the question explicitly requires detail.
""".rstrip(),
    "compare": _BASE
    + """

TASK — COMPARE
Analyze this SOW against the similar approved documents in the retrieved context.

Identify:
  - Clauses present in similar SOWs that appear to be missing here
  - Language in this SOW that deviates from the established pattern
  - Risk patterns that appeared in similar SOWs, and their recorded outcomes

Be specific — reference similar SOW sections directly from context.
Do not generalize beyond what the retrieved examples show.
""".rstrip(),
}

# ---------------------------------------------------------------------------
# Intent detection
# ---------------------------------------------------------------------------

_EDIT_SIGNALS = {"rewrite", "fix", "edit", "improve", "revise", "refine", "update", "amend"}
_REVIEW_SIGNALS = {"review", "check", "validate", "audit", "issues", "problems", "flag", "scan"}
_COMPARE_SIGNALS = {"compare", "similar", "other sows", "how do others", "benchmark", "versus"}


def detect_intent(
    query: str,
    section_key: str | None = None,
    has_similar: bool = False,
) -> str:
    """
    Derive the user's intent from query text and context signals.

    Priority order:
      edit > review > compare > generate (if section_key) > explain
    """
    tokens = set(query.lower().split())

    if tokens & _EDIT_SIGNALS:
        return "edit"

    if tokens & _REVIEW_SIGNALS:
        return "review"

    if has_similar and tokens & _COMPARE_SIGNALS:
        return "compare"

    if section_key:
        return "generate"

    return "explain"


# ---------------------------------------------------------------------------
# Context serialisation
# ---------------------------------------------------------------------------


def _fmt_sections(sections: list[dict]) -> str:
    if not sections:
        return "  (none retrieved)"
    lines = []
    for s in sections:
        heading = s.get("heading") or s.get("section_key") or s.get("id") or "—"
        content = (s.get("content") or s.get("text") or "")[:400]
        lines.append(f"  [{heading}]\n  {content}")
    return "\n\n".join(lines)


def _fmt_rules(rules: list[dict]) -> str:
    if not rules:
        return "  (none)"
    return "\n".join(f"  • [{r.get('rule_id', '?')}] {r.get('description', '')}" for r in rules)


def _fmt_banned(banned: list[dict]) -> str:
    if not banned:
        return "  (none detected)"
    return "\n".join(
        f'  • "{b.get("phrase")}" → use: "{b.get("suggestion", "see style guide")}"  '
        f"(severity: {b.get('severity', 'unknown')})"
        for b in banned
    )


def _fmt_risks(risks: list[dict]) -> str:
    if not risks:
        return "  (none)"
    return "\n".join(
        f"  • [{r.get('severity', '?').upper()}] {r.get('description', '')[:120]}"
        f"  → {r.get('mitigation', 'no mitigation recorded')[:100]}"
        for r in risks
    )


def _fmt_deliverables(deliverables: list[dict]) -> str:
    if not deliverables:
        return "  (none)"
    return "\n".join(
        f"  • {d.get('title') or d.get('id') or '?'}: "
        f"{(d.get('description') or d.get('content') or '')[:120]}"
        for d in deliverables
    )


def _fmt_similar(similar: list[dict]) -> str:
    if not similar:
        return "  (none)"
    return "\n".join(
        f"  • [{s.get('sow_id', '?')}] {s.get('heading') or s.get('section_key', '')}: "
        f"{(s.get('content') or s.get('text') or '')[:200]}"
        for s in similar
    )


def build_context_block(ctx: dict) -> str:
    methodology = ctx.get("methodology") or "not specified"
    deal_value = ctx.get("deal_value")
    deal_line = f"${deal_value:,.0f}" if deal_value else "not specified"

    return f"""\
--- RETRIEVED CONTEXT ---
Methodology : {methodology}
Deal Value  : {deal_line}

Relevant Sections:
{_fmt_sections(ctx.get("sections", []))}

Applicable Rules:
{_fmt_rules(ctx.get("rules", []))}

Banned Phrases Detected:
{_fmt_banned(ctx.get("banned_phrases", []))}

Active Risks:
{_fmt_risks(ctx.get("risks", []))}

Deliverables:
{_fmt_deliverables(ctx.get("deliverables", []))}

Similar Approved SOWs:
{_fmt_similar(ctx.get("similar_sections", []))}
--- END CONTEXT ---"""


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def generate(
    query: str,
    ctx: dict,
    *,
    section_key: str | None = None,
    history: list[dict] | None = None,
    intent: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 2048,
) -> str:
    """
    Generate a grounded LLM response for a SOW authoring query.

    Args:
        query:       The user's natural language request.
        ctx:         GraphRAG context dict (from retrieve()).
        section_key: Optional section being authored (drives intent detection).
        history:     Prior conversation turns as [{"role": ..., "content": ...}].
        intent:      Override intent detection (generate/edit/review/explain/compare).
        temperature: Sampling temperature — keep low (0.2–0.4) for contract language.
        max_tokens:  Max tokens in the completion.

    Returns:
        The assistant's response string.
    """
    has_similar = bool(ctx.get("similar_sections"))
    resolved_intent = intent or detect_intent(query, section_key, has_similar)
    system_prompt = _INTENTS[resolved_intent]

    logger.info("llm_gen | intent=%s section=%s", resolved_intent, section_key)

    context_block = build_context_block(ctx)
    user_content = f"{context_block}\n\nQuery: {query}"

    if section_key:
        user_content = f"Section: {section_key}\n\n{user_content}"

    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    if history:
        # Trim history to last 10 turns to stay within context budget
        messages.extend(history[-10:])

    messages.append({"role": "user", "content": user_content})

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    return response.choices[0].message.content
