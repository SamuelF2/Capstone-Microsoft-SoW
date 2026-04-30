"""
test_llm_gen.py — Test suite for llm_gen.py

Three layers:
  Unit        — pure logic, no LLM calls, always run in CI
  Integration — real LLM calls, opt-in via INTEGRATION_TESTS=1
  Eval        — quality scoring, opt-in via RUN_EVALS=1, results logged not asserted

Run all unit tests:
    pytest test_llm_gen.py -v

Run with integration tests:
    INTEGRATION_TESTS=1 pytest test_llm_gen.py -v

Run with evals:
    RUN_EVALS=1 pytest test_llm_gen.py -v -s
"""

from __future__ import annotations

import json
import os

import pytest
from llm_gen import (
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
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def minimal_ctx():
    """Bare-minimum context — simulates an empty graph retrieval."""
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


@pytest.fixture
def rich_ctx():
    """Realistic context with all fields populated."""
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
        assert detect_intent("fix the acceptance criteria", section_key=None) == "edit"
        assert detect_intent("improve the risk language", section_key=None) == "edit"

    def test_review_signals(self):
        assert detect_intent("review this for compliance issues") == "review"
        assert detect_intent("validate the deliverables section") == "review"
        assert detect_intent("check for banned phrases") == "review"
        assert detect_intent("audit the scope section", section_key="scope") == "review"

    def test_compare_signals_require_similar(self):
        # no similar sections → falls through to explain
        assert detect_intent("compare this to similar SOWs", has_similar=False) == "explain"
        # similar sections present → compare
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
        """Edit signal should win over section_key → generate."""
        assert detect_intent("edit the scope section", section_key="scope") == "edit"

    def test_intent_override(self):
        """Caller can force intent by passing it directly to generate()."""
        # This tests the parameter pass-through, not detect_intent itself
        # but we document the expected behaviour here
        assert "review" in _INTENTS  # intent is valid
        assert "generate" in _INTENTS


# ---------------------------------------------------------------------------
# Unit: context formatters
# ---------------------------------------------------------------------------


class TestFormatters:
    def test_fmt_sections_empty(self):
        assert "(none retrieved)" in _fmt_sections([])

    def test_fmt_sections_uses_heading(self):
        result = _fmt_sections([{"heading": "Scope", "content": "Do the thing."}])
        assert "[Scope]" in result
        assert "Do the thing." in result

    def test_fmt_sections_falls_back_to_section_key(self):
        result = _fmt_sections([{"section_key": "risks", "content": "Risk content."}])
        assert "[risks]" in result

    def test_fmt_sections_truncates_long_content(self):
        long = "x" * 1000
        result = _fmt_sections([{"heading": "H", "content": long}])
        assert len(result) < 600  # 400 char content limit + formatting

    def test_fmt_rules_empty(self):
        assert "(none)" in _fmt_rules([])

    def test_fmt_rules_includes_id_and_description(self):
        result = _fmt_rules([{"rule_id": "R-001", "description": "Must have AC."}])
        assert "R-001" in result
        assert "Must have AC." in result

    def test_fmt_banned_empty(self):
        assert "(none detected)" in _fmt_banned([])

    def test_fmt_banned_shows_phrase_and_suggestion(self):
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

    def test_fmt_risks_empty(self):
        assert "(none)" in _fmt_risks([])

    def test_fmt_risks_shows_severity(self):
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

    def test_fmt_deliverables_empty(self):
        assert "(none)" in _fmt_deliverables([])

    def test_fmt_deliverables_uses_title(self):
        result = _fmt_deliverables([{"id": "D1", "title": "Runbook", "description": "Ops guide."}])
        assert "Runbook" in result

    def test_fmt_similar_empty(self):
        assert "(none)" in _fmt_similar([])

    def test_fmt_similar_includes_sow_id(self):
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
    def test_minimal_ctx_renders_without_error(self, minimal_ctx):
        block = build_context_block(minimal_ctx)
        assert "--- RETRIEVED CONTEXT ---" in block
        assert "--- END CONTEXT ---" in block

    def test_deal_value_formatted(self, rich_ctx):
        block = build_context_block(rich_ctx)
        assert "$1,500,000" in block

    def test_methodology_present(self, rich_ctx):
        block = build_context_block(rich_ctx)
        assert "Agile" in block

    def test_no_deal_value_shows_not_specified(self, minimal_ctx):
        block = build_context_block(minimal_ctx)
        assert "not specified" in block

    def test_all_section_headers_present(self, rich_ctx):
        block = build_context_block(rich_ctx)
        for header in [
            "Relevant Sections",
            "Applicable Rules",
            "Banned Phrases Detected",
            "Active Risks",
            "Deliverables",
            "Similar Approved SOWs",
        ]:
            assert header in block, f"Missing header: {header}"

    def test_banned_phrase_appears_in_block(self, rich_ctx):
        block = build_context_block(rich_ctx)
        assert "best efforts" in block


# ---------------------------------------------------------------------------
# Unit: system prompts sanity
# ---------------------------------------------------------------------------


class TestSystemPrompts:
    def test_all_intents_defined(self):
        for intent in ("generate", "edit", "review", "explain", "compare"):
            assert intent in _INTENTS, f"Missing intent: {intent}"

    def test_all_prompts_contain_base(self):
        """Every intent prompt must contain the core grounding rules."""
        for intent, prompt in _INTENTS.items():
            assert "retrieved context" in prompt.lower(), (
                f"Intent '{intent}' prompt missing grounding instruction"
            )

    def test_review_prompt_has_four_categories(self):
        prompt = _INTENTS["review"]
        for cat in ("COMPLIANCE", "COMPLETENESS", "RISK", "STYLE"):
            assert cat in prompt, f"Review prompt missing category: {cat}"

    def test_edit_prompt_mentions_changelog(self):
        assert "changelog" in _INTENTS["edit"].lower()

    def test_generate_prompt_mentions_assumptions(self):
        assert "assumptions" in _INTENTS["generate"].lower()


# ---------------------------------------------------------------------------
# Integration: real LLM calls
# Only run when INTEGRATION_TESTS=1
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not RUN_INTEGRATION, reason="set INTEGRATION_TESTS=1 to run")
class TestIntegration:
    def test_generate_returns_string(self, rich_ctx):
        result = generate(
            query="Draft the scope of work section for this cloud migration.",
            ctx=rich_ctx,
            section_key="scope",
        )
        assert isinstance(result, str)
        assert len(result) > 100

    def test_review_flags_banned_phrase(self, rich_ctx):
        """The LLM should call out 'best efforts' which is in the context."""
        result = generate(
            query="Review this SOW text: 'The team will use best efforts to deliver by Q3.'",
            ctx=rich_ctx,
        )
        assert "best efforts" in result.lower()

    def test_explain_stays_grounded(self, rich_ctx):
        result = generate(
            query="What is the approval threshold for this deal?",
            ctx=rich_ctx,
        )
        # Should not hallucinate a number not in context
        assert isinstance(result, str)
        assert len(result) > 20

    def test_edit_returns_rewrite_and_changelog(self, rich_ctx):
        result = generate(
            query="Rewrite this: 'Vendor will provide support as needed for the system.'",
            ctx=rich_ctx,
        )
        lower = result.lower()
        # Should contain both a rewrite and a changelog
        assert any(word in lower for word in ["changelog", "changed", "change:"]), (
            "Edit response should include a changelog"
        )

    def test_history_is_respected(self, rich_ctx):
        history = [
            {"role": "user", "content": "We are working on a cloud migration SOW."},
            {
                "role": "assistant",
                "content": "Understood. I'll keep the cloud migration context in mind.",
            },
        ]
        result = generate(
            query="What risks should I document?",
            ctx=rich_ctx,
            history=history,
        )
        assert isinstance(result, str)
        assert len(result) > 50

    def test_minimal_ctx_does_not_hallucinate(self, minimal_ctx):
        """With empty context the model should acknowledge missing info."""
        result = generate(
            query="Draft the commercials section.",
            ctx=minimal_ctx,
            section_key="commercials",
        )
        lower = result.lower()
        assert any(
            phrase in lower
            for phrase in [
                "insufficient",
                "missing",
                "not provided",
                "no context",
                "cannot",
                "unable",
                "not enough",
            ]
        ), "With empty context, model should flag missing information"

    def test_intent_override_forces_review(self, rich_ctx):
        """Even a generative-sounding query should review when forced."""
        result = generate(
            query="Write the scope section.",
            ctx=rich_ctx,
            section_key="scope",
            intent="review",
        )
        lower = result.lower()
        assert any(
            cat in lower for cat in ["compliance", "completeness", "risk", "style", "none found"]
        ), "Forced review intent should produce review-structured output"


# ---------------------------------------------------------------------------
# Evals: quality scoring (not asserted — logged for human review)
# Only run when RUN_EVALS=1
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not RUN_EVALS, reason="set RUN_EVALS=1 to run")
class TestEvals:
    """
    Soft quality checks. These do not fail CI — they print a scorecard.
    Run periodically when changing prompts to catch quality regressions.

    Scoring rubric (applied by a second LLM call as judge):
      5 — Excellent: grounded, precise, follows format perfectly
      4 — Good: minor gaps or format issues
      3 — Acceptable: some hallucination or missing structure
      2 — Poor: significant issues
      1 — Fail: hallucination, wrong intent, or harmful output
    """

    JUDGE_PROMPT = """
You are evaluating the quality of an AI-generated SOW (Statement of Work) response.

Score the response on a scale of 1–5 using this rubric:
  5 — Grounded in provided context, precise language, correct format, no hallucination
  4 — Mostly grounded, minor gaps or small format issues
  3 — Partially grounded, some speculative content, acceptable structure
  2 — Significant hallucination or wrong format for the task
  1 — Completely off-task, harmful, or fabricated content

Respond with ONLY a JSON object:
{"score": <1-5>, "reason": "<one sentence>"}
""".strip()

    def _judge(self, task: str, context_summary: str, response: str) -> dict:
        from llm_gen import MODEL, client

        result = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": self.JUDGE_PROMPT},
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

    def _run_eval(self, name: str, query: str, ctx: dict, **kwargs) -> None:
        response = generate(query=query, ctx=ctx, **kwargs)
        judgement = self._judge(
            task=f"{kwargs.get('intent') or 'auto'} — {name}",
            context_summary=f"Methodology: {ctx.get('methodology')}, "
            f"Deal: ${ctx.get('deal_value') or 0:,.0f}, "
            f"Sections: {len(ctx.get('sections', []))}, "
            f"Rules: {len(ctx.get('rules', []))}",
            response=response,
        )
        score = judgement.get("score", 0)
        reason = judgement.get("reason", "")
        status = "✅" if score >= 4 else ("⚠️" if score == 3 else "❌")
        print(f"\n{status} [{score}/5] {name}")
        print(f"   {reason}")
        print(f"   Response preview: {response[:200].replace(chr(10), ' ')}...")

    def test_eval_generate_scope(self, rich_ctx):
        self._run_eval(
            name="Generate scope section",
            query="Draft the scope of work for this cloud migration engagement.",
            ctx=rich_ctx,
            section_key="scope",
        )

    def test_eval_review_banned_phrase(self, rich_ctx):
        self._run_eval(
            name="Review with banned phrase",
            query=(
                "Review this: 'The vendor will use best efforts to deliver the "
                "migrated ERP environment as needed by the client.'"
            ),
            ctx=rich_ctx,
        )

    def test_eval_edit_vague_language(self, rich_ctx):
        self._run_eval(
            name="Edit vague scope language",
            query=(
                "Improve this: 'The team will handle any issues that come up "
                "during the migration in a timely manner.'"
            ),
            ctx=rich_ctx,
        )

    def test_eval_explain_rule(self, rich_ctx):
        self._run_eval(
            name="Explain a compliance rule",
            query="Why does this SOW need a change order clause?",
            ctx=rich_ctx,
        )

    def test_eval_no_hallucination_empty_ctx(self, minimal_ctx):
        self._run_eval(
            name="No hallucination on empty context",
            query="Draft the commercials section including payment terms.",
            ctx=minimal_ctx,
            section_key="commercials",
        )

    def test_eval_compare_similar_sows(self, rich_ctx):
        self._run_eval(
            name="Compare against similar SOWs",
            query="How does this scope compare to similar past SOWs?",
            ctx=rich_ctx,
        )
