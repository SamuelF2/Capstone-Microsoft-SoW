"""
Azure OpenAI client for generating free-text fields.
Falls back to template-based text when Azure credentials are not set.
"""

import json
import random
import time

from config import (
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_DEPLOYMENT,
    AZURE_OPENAI_ENDPOINT,
    USE_LLM,
)

if USE_LLM:
    from openai import AzureOpenAI

    client = AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION,
    )


def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
    """Call Azure OpenAI with retry logic."""
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=AZURE_OPENAI_DEPLOYMENT,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_completion_tokens=max_tokens,
            )
            content = resp.choices[0].message.content
            if content:
                return content.strip()
            if attempt < 2:
                time.sleep(2**attempt)
                continue
            return ""
        except Exception as e:
            if attempt < 2:
                time.sleep(2**attempt)
            else:
                print(f"  [WARN] Azure OpenAI call failed after 3 attempts: {e}")
                return ""


SYSTEM_STATUS_REPORT = """You are generating realistic Microsoft consulting project status report content.
Write concise, professional project management language. 2-4 bullet points per field.
Return ONLY a JSON object with keys: accomplishments, plans, risks, issues, changes.
Each value should be a string with bullet points separated by newlines.
No markdown fences. Just raw JSON."""

SYSTEM_CLOSEOUT = """You are generating a realistic Microsoft consulting project closeout report.
Write professional, reflective content. Return ONLY a JSON object with keys: project_outcomes, lessons_learned.
Each value should be 3-5 sentences. No markdown fences. Just raw JSON."""


def generate_status_report_text(project_context: dict) -> dict:
    """Generate status report free-text fields for one reporting period."""
    if not USE_LLM:
        return _template_status_report(project_context)

    prompt = f"""Generate status report content for this consulting project period:

Project: {project_context["project_name"]} ({project_context["project_type"]})
Customer: {project_context["customer_name"]} ({project_context["industry"]})
Deal Type: {project_context["deal_terms"]}
Period Ending: {project_context["period_date"]}
Project Phase: {project_context["phase"]} (period {project_context["period_num"]} of {project_context["total_periods"]})
Scope Status: {project_context["scope_status"]}
Financial Status: {project_context["financial_status"]}
Resourcing Status: {project_context["resourcing_status"]}
Timeline Status: {project_context["timeline_status"]}
Budget Variance: {project_context["budget_variance_pct"]:.1%}
Hours Variance: {project_context["hours_variance_pct"]:.1%}

Generate realistic accomplishments, plans, risks, issues, and changes for this period.
If statuses are Red/Yellow, the content should reflect real problems.
If this is an early period, focus on setup/onboarding. If late, focus on delivery/transition."""

    raw = _call_llm(SYSTEM_STATUS_REPORT, prompt, max_tokens=600)
    if not raw:
        return _template_status_report(project_context)

    parsed = _extract_json(raw)
    if parsed:
        return parsed
    return _template_status_report(project_context)


def _extract_json(raw: str) -> dict:
    """Try hard to extract a JSON object from LLM output."""
    raw = raw.strip()
    # Strip markdown fences (```json ... ``` or ``` ... ```)
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    # Try direct parse first
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Find the first { ... } substring (LLM sometimes adds preamble/postamble)
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            pass
    return {}


def generate_closeout_text(project_context: dict) -> dict:
    """Generate project closeout free-text fields."""
    if not USE_LLM:
        return _template_closeout(project_context)

    prompt = f"""Generate project closeout content for this consulting engagement:

Project: {project_context["project_name"]} ({project_context["project_type"]})
Customer: {project_context["customer_name"]} ({project_context["industry"]})
Deal Type: {project_context["deal_terms"]} / {project_context["deal_type"]}
Duration: {project_context["start_date"]} to {project_context["end_date"]}
Final Budget Variance: {project_context["final_budget_variance_pct"]:.1%}
Final Hours Variance: {project_context["final_hours_variance_pct"]:.1%}
Customer Satisfaction: {project_context["csat"]:.1f}/5.0
Overall Health: {project_context["overall_health"]}

Generate realistic project outcomes and lessons learned."""

    raw = _call_llm(SYSTEM_CLOSEOUT, prompt, max_tokens=500)
    if not raw:
        return _template_closeout(project_context)

    parsed = _extract_json(raw)
    if parsed:
        return parsed
    return _template_closeout(project_context)


# ── Template fallbacks ──────────────────────────────────────────────────────

_ACCOMPLISHMENT_TEMPLATES = [
    "Completed {phase} milestone deliverables on schedule",
    "Onboarded {n} team members and established project governance",
    "Delivered architecture design document and received customer sign-off",
    "Migrated {n} workloads to target environment successfully",
    "Completed sprint {n} with all acceptance criteria met",
    "Finalized data migration strategy and validated with stakeholders",
    "Achieved {n}% completion of core deliverables",
    "Resolved {n} critical defects identified during testing phase",
    "Conducted stakeholder review and obtained approval to proceed",
    "Established CI/CD pipeline and automated deployment workflows",
]

_PLAN_TEMPLATES = [
    "Begin {phase} phase activities next period",
    "Complete remaining integration testing for module {n}",
    "Conduct user acceptance testing with customer team",
    "Finalize deployment runbook and cutover plan",
    "Onboard additional offshore resources for scaling",
    "Submit deliverables for customer review and approval",
    "Begin knowledge transfer sessions with customer operations team",
    "Execute performance testing and capacity planning",
]

_RISK_TEMPLATES = [
    "Customer resource availability may impact UAT timeline",
    "Third-party vendor dependency for API integration not yet confirmed",
    "Scope creep risk due to evolving customer requirements",
    "Key SME availability constrained in upcoming period",
    "Data quality issues in source systems may delay migration",
    "Regulatory compliance review pending — could affect timeline",
    "Infrastructure provisioning delays in customer environment",
]

_ISSUE_TEMPLATES = [
    "No critical issues this period",
    "Customer environment access delays impacting development velocity",
    "Resource gap: {role} position unfilled for {n} weeks",
    "Integration testing blocked by downstream system outage",
    "Budget pressure due to unplanned rework on module {n}",
    "Change request under review — scope impact TBD",
]

_CHANGE_TEMPLATES = [
    "No changes this period",
    "CR-{n} submitted: Additional reporting module requested by customer",
    "Timeline adjusted by {n} weeks per customer request",
    "Resource substitution: replaced {role} due to availability conflict",
    "Scope refinement: deferred Phase 2 items to Change Order",
]


def _template_status_report(ctx: dict) -> dict:
    rng = random.Random(hash(f"{ctx['project_name']}{ctx['period_num']}"))
    phase_label = ctx.get("phase", "execution")
    return {
        "accomplishments": "\n".join(
            rng.sample(_ACCOMPLISHMENT_TEMPLATES, min(3, len(_ACCOMPLISHMENT_TEMPLATES)))
        ).format(phase=phase_label, n=rng.randint(2, 8)),
        "plans": "\n".join(rng.sample(_PLAN_TEMPLATES, min(3, len(_PLAN_TEMPLATES)))).format(
            phase=phase_label, n=rng.randint(1, 5)
        ),
        "risks": "\n".join(rng.sample(_RISK_TEMPLATES, min(2, len(_RISK_TEMPLATES)))).format(
            n=rng.randint(1, 4)
        ),
        "issues": "\n".join(rng.sample(_ISSUE_TEMPLATES, min(2, len(_ISSUE_TEMPLATES)))).format(
            role="Consultant", n=rng.randint(1, 4)
        ),
        "changes": "\n".join(rng.sample(_CHANGE_TEMPLATES, min(1, len(_CHANGE_TEMPLATES)))).format(
            role="Sr. Consultant", n=rng.randint(1, 4)
        ),
    }


_LESSONS_LEARNED_POOL = [
    "Early stakeholder alignment proved critical for maintaining scope discipline.",
    "Offshore/onshore coordination required more structured handoff processes than initially planned.",
    "Investing in automated testing earlier in the lifecycle would have reduced late-stage rework.",
    "Establishing a shared definition of done with {customer_name} up front would have prevented late-stage scope debates.",
    "Cross-functional workshops during discovery accelerated requirement validation for {project_type_lower}.",
    "More frequent demo cadences with {customer_name} leadership improved acceptance rates in later phases.",
    "Environment provisioning delays underscored the need for infrastructure-as-code adoption from day one.",
    "Knowledge transfer should begin mid-project rather than at closeout to ensure operational readiness.",
    "Dedicated change-management resources earlier in the engagement would have smoothed end-user adoption.",
    "Embedding a {industry_lower}-domain SME on the delivery team reduced requirement ambiguity significantly.",
    "Tighter integration between the PM and technical lead roles improved risk visibility throughout execution.",
    "Prototyping key integrations before full build-out helped surface technical constraints early.",
    "Standardizing status reporting templates across workstreams improved executive communication cadence.",
    "Leveraging reusable accelerators from prior {project_type_lower} engagements shortened the ramp-up phase.",
    "Proactive budget forecasting at the workstream level enabled earlier intervention on cost variances.",
    "Conducting a formal lessons-learned session at each phase gate kept continuous improvement on track.",
]


def _template_closeout(ctx: dict) -> dict:
    variance = ctx.get("final_budget_variance_pct", 0)
    health = (
        "on track" if abs(variance) < 0.10 else ("over budget" if variance > 0 else "under budget")
    )
    rng = random.Random(hash(ctx.get("project_name", "") + "closeout"))
    fmt = {
        "customer_name": ctx.get("customer_name", "the customer"),
        "project_type_lower": ctx.get("project_type", "engagement").lower(),
        "industry_lower": ctx.get("industry", "industry").lower(),
    }
    sentences = [s.format(**fmt) for s in rng.sample(_LESSONS_LEARNED_POOL, 3)]
    return {
        "project_outcomes": (
            f"Project completed {health} with a final budget variance of {variance:.1%}. "
            f"All core deliverables were accepted by {ctx['customer_name']}. "
            f"The engagement achieved its primary objectives for {ctx['project_type'].lower()} "
            f"within the {ctx['industry'].lower()} domain."
        ),
        "lessons_learned": " ".join(sentences),
    }
