"""
Unit tests for ml/sow_kg/llm_gen.py pure functions.
No LLM calls required for unit tests.

Integration tests: INTEGRATION_TESTS=1 python test_llm_gen.py
Evals:             RUN_EVALS=1 python test_llm_gen.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from ml.llm_gen import (
    _INTENTS,
    _fmt_banned,
    _fmt_deliverables,
    _fmt_risks,
    _fmt_rules,
    _fmt_sections,
    _fmt_similar,
    build_context_block,
    detect_intent,
    generate,
)

RUN_INTEGRATION = os.getenv("INTEGRATION_TESTS", "0") == "1"
RUN_EVALS = os.getenv("RUN_EVALS", "0") == "1"

# ---------------------------------------------------------------------------
# Shared context helpers (replaces fixtures)
# ---------------------------------------------------------------------------


def _minimal_ctx():
    return {
        "methodology": None,
        "deal_value": None,
        "sections": [],
        "rules": [],
        "banned_phrases": [],
        "risks": [],
        "deliverables": [],
        "similar_sections": [],
    }


def _rich_ctx():
    return {
        "methodology": "Agile",
        "deal_value": 1_500_000,
        "sections": [
            {
                "section_key": "scope",
                "heading": "Scope of Work",
                "content": "Deliver a cloud migration for the client's ERP system across 3 sprints.",
            },
            {
                "section_key": "deliverables",
                "heading": "Deliverables",
                "content": "D1: Migrated ERP environment. D2: Runbook. D3: Training sessions.",
            },
        ],
        "rules": [
            {
                "rule_id": "R-001",
                "description": "All deliverables must include measurable acceptance criteria.",
            },
            {
                "rule_id": "R-042",
                "description": "Fixed-price engagements require a change order clause.",
            },
        ],
        "banned_phrases": [
            {
                "phrase": "best efforts",
                "suggestion": "shall complete by [date]",
                "severity": "high",
            },
            {
                "phrase": "as needed",
                "suggestion": "as defined in Section 3.2",
                "severity": "medium",
            },
        ],
        "risks": [
            {
                "severity": "high",
                "description": "Client environment access may be delayed.",
                "mitigation": "Access SLA clause added; 5-day grace period before timeline shifts.",
            }
        ],
        "deliverables": [
            {
                "id": "D1",
                "title": "Migrated ERP Environment",
                "description": "Production-ready ERP environment on AWS, passing smoke tests.",
            }
        ],
        "similar_sections": [
            {
                "sow_id": "SOW-2023-041",
                "section_key": "scope",
                "content": "Cloud migration for SAP ERP, 4 sprints, dedicated DBA resource.",
            }
        ],
    }


# ---------------------------------------------------------------------------
# Unit: detect_intent
# ---------------------------------------------------------------------------


class TestDetectIntent:
    def test_edit_signals_take_priority(self):
        assert detect_intent("please rewrite this section", section_key="scope") == "edit"
        assert detect_intent("fix the acceptance criteria") == "edit"
        assert detect_intent("improve the risk language") == "edit"

    def test_review_signals(self):
        assert detect_intent("review this for compliance issues") == "review"
        assert detect_intent("validate the deliverables section") == "review"
        assert detect_intent("check for banned phrases") == "review"
        assert detect_intent("audit the scope section", section_key="scope") == "review"

    def test_compare_requires_similar_sections(self):
        assert detect_intent("compare this to similar SOWs", has_similar=False) == "explain"
        assert detect_intent("compare this to similar SOWs", has_similar=True) == "compare"

    def test_generate_when_section_key_set(self):
        assert (
            detect_intent("write the executive summary", section_key="executive_summary")
            == "generate"
        )
        assert detect_intent("draft this section", section_key="scope") == "generate"

    def test_explain_is_default(self):
        assert detect_intent("what is the approval threshold?") == "explain"
        assert detect_intent("why does this need a change order clause?") == "explain"
        assert detect_intent("tell me about the risks") == "explain"

    def test_edit_overrides_section_key(self):
        assert detect_intent("edit the scope section", section_key="scope") == "edit"


# ---------------------------------------------------------------------------
# Unit: formatters
# ---------------------------------------------------------------------------


class TestFmtSections:
    def test_empty_returns_fallback(self):
        assert "(none retrieved)" in _fmt_sections([])

    def test_uses_heading_field(self):
        result = _fmt_sections([{"heading": "Scope", "content": "Do the thing."}])
        assert "[Scope]" in result
        assert "Do the thing." in result

    def test_falls_back_to_section_key(self):
        result = _fmt_sections([{"section_key": "risks", "content": "Risk content."}])
        assert "[risks]" in result

    def test_truncates_long_content(self):
        result = _fmt_sections([{"heading": "H", "content": "x" * 1000}])
        assert len(result) < 600


class TestFmtRules:
    def test_empty_returns_fallback(self):
        assert "(none)" in _fmt_rules([])

    def test_includes_rule_id_and_description(self):
        result = _fmt_rules([{"rule_id": "R-001", "description": "Must have AC."}])
        assert "R-001" in result
        assert "Must have AC." in result


class TestFmtBanned:
    def test_empty_returns_fallback(self):
        assert "(none detected)" in _fmt_banned([])

    def test_shows_phrase_suggestion_and_severity(self):
        result = _fmt_banned(
            [
                {
                    "phrase": "best efforts",
                    "suggestion": "shall complete by date",
                    "severity": "high",
                }
            ]
        )
        assert "best efforts" in result
        assert "shall complete by date" in result
        assert "high" in result


class TestFmtRisks:
    def test_empty_returns_fallback(self):
        assert "(none)" in _fmt_risks([])

    def test_uppercases_severity(self):
        result = _fmt_risks(
            [
                {
                    "severity": "high",
                    "description": "Access delay risk.",
                    "mitigation": "Grace period clause.",
                }
            ]
        )
        assert "HIGH" in result
        assert "Access delay risk." in result


class TestFmtDeliverables:
    def test_empty_returns_fallback(self):
        assert "(none)" in _fmt_deliverables([])

    def test_uses_title_field(self):
        result = _fmt_deliverables([{"id": "D1", "title": "Runbook", "description": "Ops guide."}])
        assert "Runbook" in result


class TestFmtSimilar:
    def test_empty_returns_fallback(self):
        assert "(none)" in _fmt_similar([])

    def test_includes_sow_id(self):
        result = _fmt_similar(
            [
                {
                    "sow_id": "SOW-2023-041",
                    "section_key": "scope",
                    "content": "Cloud migration scope.",
                }
            ]
        )
        assert "SOW-2023-041" in result


# ---------------------------------------------------------------------------
# Unit: build_context_block
# ---------------------------------------------------------------------------


class TestBuildContextBlock:
    def test_renders_without_error_on_minimal(self):
        block = build_context_block(_minimal_ctx())
        assert "--- RETRIEVED CONTEXT ---" in block
        assert "--- END CONTEXT ---" in block

    def test_formats_deal_value(self):
        block = build_context_block(_rich_ctx())
        assert "$1,500,000" in block

    def test_methodology_present(self):
        block = build_context_block(_rich_ctx())
        assert "Agile" in block

    def test_missing_deal_value_shows_not_specified(self):
        block = build_context_block(_minimal_ctx())
        assert "not specified" in block

    def test_all_section_headers_present(self):
        block = build_context_block(_rich_ctx())
        for header in [
            "Relevant Sections",
            "Applicable Rules",
            "Banned Phrases Detected",
            "Active Risks",
            "Deliverables",
            "Similar Approved SOWs",
        ]:
            assert header in block

    def test_banned_phrase_in_block(self):
        block = build_context_block(_rich_ctx())
        assert "best efforts" in block


# ---------------------------------------------------------------------------
# Unit: system prompts
# ---------------------------------------------------------------------------


class TestSystemPrompts:
    def test_all_five_intents_defined(self):
        for intent in ("generate", "edit", "review", "explain", "compare"):
            assert intent in _INTENTS

    def test_all_prompts_contain_grounding_instruction(self):
        for _intent, prompt in _INTENTS.items():
            assert "retrieved context" in prompt.lower()

    def test_review_has_four_categories(self):
        prompt = _INTENTS["review"]
        for cat in ("COMPLIANCE", "COMPLETENESS", "RISK", "STYLE"):
            assert cat in prompt

    def test_edit_mentions_changelog(self):
        assert "changelog" in _INTENTS["edit"].lower()

    def test_generate_mentions_assumptions(self):
        assert "assumptions" in _INTENTS["generate"].lower()


# ---------------------------------------------------------------------------
# Integration tests — real LLM calls
# Skipped unless INTEGRATION_TESTS=1
# ---------------------------------------------------------------------------


class TestIntegration:
    def test_generate_returns_non_empty_string(self):
        if not RUN_INTEGRATION:
            return
        result = generate(
            query="Draft the scope of work section for this cloud migration.",
            ctx=_rich_ctx(),
            section_key="scope",
        )
        assert isinstance(result, str)
        assert len(result) > 100

    def test_review_flags_banned_phrase(self):
        if not RUN_INTEGRATION:
            return
        result = generate(
            query="Review this SOW text: 'The team will use best efforts to deliver by Q3.'",
            ctx=_rich_ctx(),
        )
        assert "best efforts" in result.lower()

    def test_edit_returns_rewrite_and_changelog(self):
        if not RUN_INTEGRATION:
            return
        result = generate(
            query="Rewrite this: 'Vendor will provide support as needed for the system.'",
            ctx=_rich_ctx(),
        )
        assert any(w in result.lower() for w in ["changelog", "changed", "change:"])

    def test_minimal_ctx_does_not_hallucinate(self):
        if not RUN_INTEGRATION:
            return
        result = generate(
            query="Draft the commercials section.",
            ctx=_minimal_ctx(),
            section_key="commercials",
        )
        assert any(
            p in result.lower()
            for p in [
                "insufficient",
                "missing",
                "not provided",
                "no context",
                "cannot",
                "unable",
                "not enough",
            ]
        )

    def test_intent_override_forces_review(self):
        if not RUN_INTEGRATION:
            return
        result = generate(
            query="Write the scope section.",
            ctx=_rich_ctx(),
            section_key="scope",
            intent="review",
        )
        assert any(
            c in result.lower()
            for c in ["compliance", "completeness", "risk", "style", "none found"]
        )

    def test_history_is_passed_through(self):
        if not RUN_INTEGRATION:
            return
        history = [
            {"role": "user", "content": "We are working on a cloud migration SOW."},
            {"role": "assistant", "content": "Understood. I'll keep that context in mind."},
        ]
        result = generate(
            query="What risks should I document?",
            ctx=_rich_ctx(),
            history=history,
        )
        assert isinstance(result, str)
        assert len(result) > 50


# ---------------------------------------------------------------------------
# Evals — LLM-as-judge quality scoring
# Skipped unless RUN_EVALS=1
# Results are printed, never asserted
# ---------------------------------------------------------------------------

_JUDGE_PROMPT = """
You are evaluating the quality of an AI-generated SOW (Statement of Work) response.

Score the response on a scale of 1–5:
  5 — Grounded in context, precise language, correct format, no hallucination
  4 — Mostly grounded, minor gaps or format issues
  3 — Partially grounded, some speculative content, acceptable structure
  2 — Significant hallucination or wrong format for the task
  1 — Completely off-task, fabricated content, or harmful output

Respond ONLY with a JSON object — no preamble, no markdown:
{"score": <1-5>, "reason": "<one sentence>"}
""".strip()


def _judge(task: str, context_summary: str, response: str) -> dict:
    from sow_kg.llm_gen import MODEL, client

    result = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _JUDGE_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Task: {task}\n\n"
                    f"Context summary: {context_summary}\n\n"
                    f"Response to evaluate:\n{response}"
                ),
            },
        ],
        temperature=0,
        max_tokens=200,
    )
    raw = result.choices[0].message.content.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"score": 0, "reason": f"Judge parse error: {raw}"}


def _run_eval(name: str, query: str, ctx: dict, **kwargs) -> None:
    response = generate(query=query, ctx=ctx, **kwargs)
    judgement = _judge(
        task=f"{kwargs.get('intent') or 'auto'} — {name}",
        context_summary=(
            f"Methodology: {ctx.get('methodology')}, "
            f"Deal: ${ctx.get('deal_value') or 0:,.0f}, "
            f"Sections: {len(ctx.get('sections', []))}, "
            f"Rules: {len(ctx.get('rules', []))}"
        ),
        response=response,
    )
    score = judgement.get("score", 0)
    reason = judgement.get("reason", "")
    status = "✅" if score >= 4 else ("⚠️" if score == 3 else "❌")
    print(f"\n{status} [{score}/5] {name}")
    print(f"   {reason}")
    print(f"   Response preview: {response[:200].replace(chr(10), ' ')}...")


class TestEvals:
    def test_eval_generate_scope(self):
        if not RUN_EVALS:
            return
        _run_eval(
            name="Generate scope section",
            query="Draft the scope of work for this cloud migration engagement.",
            ctx=_rich_ctx(),
            section_key="scope",
        )

    def test_eval_review_banned_phrase(self):
        if not RUN_EVALS:
            return
        _run_eval(
            name="Review with banned phrase",
            query=(
                "Review this: 'The vendor will use best efforts to deliver the "
                "migrated ERP environment as needed by the client.'"
            ),
            ctx=_rich_ctx(),
        )

    def test_eval_edit_vague_language(self):
        if not RUN_EVALS:
            return
        _run_eval(
            name="Edit vague scope language",
            query=(
                "Improve this: 'The team will handle any issues that come up "
                "during the migration in a timely manner.'"
            ),
            ctx=_rich_ctx(),
        )

    def test_eval_explain_rule(self):
        if not RUN_EVALS:
            return
        _run_eval(
            name="Explain a compliance rule",
            query="Why does this SOW need a change order clause?",
            ctx=_rich_ctx(),
        )

    def test_eval_no_hallucination_empty_ctx(self):
        if not RUN_EVALS:
            return
        _run_eval(
            name="No hallucination on empty context",
            query="Draft the commercials section including payment terms.",
            ctx=_minimal_ctx(),
            section_key="commercials",
        )

    def test_eval_compare_similar_sows(self):
        if not RUN_EVALS:
            return
        _run_eval(
            name="Compare against similar SOWs",
            query="How does this scope compare to similar past SOWs?",
            ctx=_rich_ctx(),
        )
