"""
AI Service Layer — typed interfaces + mock implementations.

This module provides a clean swap-in pattern: when Azure AI integration is
ready, only the function bodies change — not the API endpoints or frontend.

TODO: Replace mock implementations with Azure OpenAI calls.
Integration point: POST to AZURE_AI_ENDPOINT with sow_content payload.
"""

from __future__ import annotations

from models import (
    AIAnalysisResult,
    ApprovalRouting,
    ChecklistSuggestion,
    RiskResult,
    SectionSuggestion,
    ViolationResult,
)


async def analyze_sow(sow_content: dict, methodology: str) -> AIAnalysisResult:
    """Analyze a SoW document and return recommendations.

    TODO: Replace with Azure OpenAI call using GPT-4 with system prompt
    containing banned-phrases.json, methodology-alignment.json, and
    required-elements.json rules.
    """
    return AIAnalysisResult(
        violations=[
            ViolationResult(
                rule="Missing SLA terms",
                severity="high",
                message="No Service Level Agreement defined in the scope section. "
                "MCEM requires explicit SLA commitments for all delivery engagements.",
                section="Scope",
            ),
            ViolationResult(
                rule="Unbounded scope language",
                severity="high",
                message='Phrase "best effort" detected in section 3.2. SDMPlus '
                "prohibits vague commitment language — replace with measurable deliverables.",
                section="Scope",
            ),
            ViolationResult(
                rule="Missing support transition plan",
                severity="medium",
                message="No support handoff or hypercare period defined. "
                "Required for all methodologies per MCEM guidelines.",
                section="Support Transition",
            ),
            ViolationResult(
                rule="Incomplete risk register",
                severity="medium",
                message="Two identified risks lack mitigation strategies. "
                "All risks must include severity, probability, and mitigation plan.",
                section="Risks",
            ),
            ViolationResult(
                rule="Customer responsibilities unclear",
                severity="low",
                message="Customer resource commitments listed but no RACI matrix provided. "
                "Recommended for engagements over $500K.",
                section="Assumptions",
            ),
        ],
        risks=[
            RiskResult(
                category="Staffing",
                level="high",
                description="No backup resource identified for lead Solution Architect role. "
                "Single point of failure on critical path.",
            ),
            RiskResult(
                category="Timeline",
                level="medium",
                description="Sprint 4 delivery overlaps with customer holiday freeze "
                "(Dec 20 – Jan 5). Milestone dates may need adjustment.",
            ),
            RiskResult(
                category="Budget",
                level="low",
                description="Travel & expenses estimated at 3% of engagement value, "
                "which is below the typical 5-8% range for on-site delivery.",
            ),
        ],
        approval=ApprovalRouting(
            level="Yellow",
            esap_type="Type-2",
            reason="Deal value $2.4M exceeds $1M threshold with estimated margin at 14% (below 15%).",
            chain=[
                "Solution Architect",
                "SQA Reviewer",
                "Customer Practice Lead",
                "Customer Delivery Partner",
            ],
        ),
        checklist=[
            ChecklistSuggestion(
                id="chk-001",
                text="Verify pricing against approved rate card",
                category="pricing",
                required=True,
            ),
            ChecklistSuggestion(
                id="chk-002",
                text="Confirm scope aligns with selected methodology",
                category="scope",
                required=True,
            ),
            ChecklistSuggestion(
                id="chk-003",
                text="Validate deliverable acceptance criteria are measurable",
                category="deliverables",
                required=True,
            ),
            ChecklistSuggestion(
                id="chk-004",
                text="Review risk register for completeness (severity + mitigation)",
                category="risk",
                required=True,
            ),
            ChecklistSuggestion(
                id="chk-005",
                text="Ensure customer responsibilities are explicitly stated",
                category="scope",
                required=True,
            ),
            ChecklistSuggestion(
                id="chk-006",
                text="Check change management process is documented",
                category="governance",
                required=False,
            ),
            ChecklistSuggestion(
                id="chk-007",
                text="Verify billing milestones match delivery schedule",
                category="pricing",
                required=False,
            ),
            ChecklistSuggestion(
                id="chk-008",
                text="Confirm support transition plan covers hypercare period",
                category="support",
                required=True,
            ),
        ],
        suggestions=[
            SectionSuggestion(
                section="Scope",
                current_text="We will provide best effort support during the transition period.",
                suggested_text="Microsoft will provide Severity-1 incident response within "
                "4 business hours during the 30-day hypercare period.",
                rationale='Replace vague "best effort" commitment with measurable SLA terms '
                "per MCEM guidelines.",
            ),
            SectionSuggestion(
                section="Deliverables",
                current_text="Architecture design document.",
                suggested_text="Architecture design document — includes deployment topology, "
                "data flow diagrams, security boundary mapping, and disaster recovery plan. "
                "Acceptance criteria: approved by customer technical lead within 5 business days.",
                rationale="Deliverable lacks acceptance criteria. SDMPlus requires measurable "
                "AC for every deliverable.",
            ),
            SectionSuggestion(
                section="Assumptions",
                current_text="Customer will provide necessary access and resources.",
                suggested_text="Customer will provision VPN access for 5 named Microsoft "
                "consultants within 10 business days of SOW signature. Customer will assign "
                "a dedicated technical POC available 4 hours/week.",
                rationale="Assumption is too vague — specify quantity, timeline, and commitment level.",
            ),
            SectionSuggestion(
                section="Risks",
                current_text="Data migration may encounter unexpected schema differences.",
                suggested_text="Data migration may encounter unexpected schema differences. "
                "Mitigation: allocate 2-week discovery sprint for schema analysis before "
                "migration begins. Contingency: 15% buffer on migration timeline. "
                "Severity: Medium. Probability: High.",
                rationale="Risk identified but missing mitigation strategy, severity rating, "
                "and probability assessment.",
            ),
            SectionSuggestion(
                section="Pricing",
                current_text="Total engagement value: $2,400,000 (Fixed Fee).",
                suggested_text="Total engagement value: $2,400,000 (Fixed Fee). Includes 8% "
                "risk reserve ($192,000) per ESAP Type-2 requirements. Change orders billed "
                "at T&M rates per approved rate card.",
                rationale="Fixed-fee engagements over $1M require explicit risk reserve "
                "allocation and change order terms.",
            ),
            SectionSuggestion(
                section="Support Transition",
                current_text="",
                suggested_text="Post-delivery support transition plan: 30-day hypercare period "
                "with dedicated L2 engineer. Knowledge transfer sessions (3x per week) for "
                "customer ops team. Runbook handoff with incident escalation matrix. "
                "RACI: Microsoft leads hypercare; customer assumes ownership on Day 31.",
                rationale="Support transition plan is entirely missing. Required for all "
                "delivery methodologies per MCEM.",
            ),
        ],
        overall_score=72.0,
        summary="SoW has 2 high-severity issues requiring attention before review.",
    )


async def generate_document_prose(sow_content: dict) -> str:
    """Generate polished prose from structured SoW data for final document.

    TODO: Replace with Azure OpenAI call for executive-quality document generation.
    """
    return "# Executive Summary\n\n[Generated prose would appear here]\n\n..."


async def generate_drm_insights(sow_content: dict, reviewer_role: str) -> dict:
    """Generate role-specific AI insights for DRM reviewers.

    TODO: Replace with Azure OpenAI call tailored to reviewer persona.
    """
    insights = {
        "cpl": {
            "summary": "Margin at 14% is below practice target of 18%. "
            "Deal value of $2.4M puts this in Type-2 ESAP category. "
            "Recommend finance review before final approval.",
            "flags": [
                "Margin 4% below target",
                "Fixed-fee structure with limited risk reserve",
            ],
        },
        "cdp": {
            "summary": "Account alignment verified. Consumption goals on track. "
            "Customer has active EA with room for services growth.",
            "flags": [
                "Customer has 2 active engagements",
                "Strategic account — consider long-term relationship impact",
            ],
        },
        "delivery-manager": {
            "summary": "Resource plan has single point of failure on SA role. "
            "Timeline is aggressive for the scope. Consider adding buffer sprint.",
            "flags": [
                "No backup SA identified",
                "Holiday freeze overlaps Sprint 4",
                "QA resource not allocated",
            ],
        },
    }
    return insights.get(reviewer_role, {"summary": "No specific insights.", "flags": []})
