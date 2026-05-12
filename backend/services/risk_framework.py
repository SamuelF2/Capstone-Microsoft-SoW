"""Risk assessment framework reference — categories, priority matrix, mitigation playbooks.

Source: Data/RISK_ASSESSMENT_AND_MITIGATION_FRAMEWORK.md §2, §4, §5.

Kept in code (not under Data/rules/) because Data/rules/ is reserved for ingestion
sources. The constants below are the single source of truth, imported by both the
scoring service (services.ai) and the public framework endpoint (routers.rules).
"""

from __future__ import annotations

from typing import Any

# Iteration order = tie-break order for the keyword classifier in services.ai.
RISK_CATEGORIES: list[dict[str, Any]] = [
    {
        "id": "Financial",
        "name": "Financial",
        "description": "Margin, revenue, payment, currency, pricing, ECIF exposure.",
        "color_token": "--color-accent-blue",
        "icon": "currency-dollar",
        "risk_ids": ["FIN-001", "FIN-002", "FIN-003", "FIN-004", "FIN-005", "FIN-006"],
        "keywords": [
            "margin",
            "burn",
            "revenue",
            "invoice",
            "payment",
            "fx",
            "currency",
            "price",
            "pricing",
            "ecif",
            "cost",
        ],
    },
    {
        "id": "Delivery",
        "name": "Delivery",
        "description": "Schedule, scope, resourcing, customer dependencies, quality, governance.",
        "color_token": "--color-accent-purple",
        "icon": "truck",
        "risk_ids": [
            "DEL-001",
            "DEL-002",
            "DEL-003",
            "DEL-004",
            "DEL-005",
            "DEL-006",
            "DEL-007",
            "DEL-008",
        ],
        "keywords": [
            "schedule",
            "slippage",
            "scope creep",
            "scope",
            "resource",
            "blocker",
            "velocity",
            "governance",
            "acceptance",
            "milestone",
            "delivery",
            "timeline",
        ],
    },
    {
        "id": "Technical",
        "name": "Technical",
        "description": "Architecture, integration, performance, scalability, security, data, ISV.",
        "color_token": "--color-accent-teal",
        "icon": "cpu-chip",
        "risk_ids": [
            "TEC-001",
            "TEC-002",
            "TEC-003",
            "TEC-004",
            "TEC-005",
            "TEC-006",
            "TEC-007",
            "TEC-008",
        ],
        "keywords": [
            "architecture",
            "integration",
            "performance",
            "scalability",
            "non-ga",
            "preview",
            "security",
            "data migration",
            "isv",
            "api",
            "nfr",
            "load test",
        ],
    },
    {
        "id": "Compliance",
        "name": "Compliance",
        "description": "Regulatory, contractual, IP, responsible AI, privacy, subcontractor, export.",
        "color_token": "--color-warning",
        "icon": "shield-check",
        "risk_ids": [
            "COM-001",
            "COM-002",
            "COM-003",
            "COM-004",
            "COM-005",
            "COM-006",
            "COM-007",
            "COM-008",
        ],
        "keywords": [
            "gdpr",
            "hipaa",
            "regulatory",
            "regulation",
            "sla",
            "ip ",
            "responsible ai",
            "rai",
            "privacy",
            "subcontractor",
            "export",
            "compliance",
            "audit",
        ],
    },
    {
        "id": "Reputational",
        "name": "Reputational",
        "description": "CSAT/NPS, references, public failure, partner relationships, employee morale.",
        "color_token": "--color-accent-pink",
        "icon": "megaphone",
        "risk_ids": ["REP-001", "REP-002", "REP-003", "REP-004", "REP-005"],
        "keywords": [
            "csat",
            "nps",
            "reference",
            "media",
            "partner",
            "attrition",
            "morale",
            "reputation",
        ],
    },
    {
        "id": "Strategic",
        "name": "Strategic",
        "description": "Account relationship, consumption, competitive position, market alignment.",
        "color_token": "--color-accent-orange",
        "icon": "chart-bar",
        "risk_ids": ["STR-001", "STR-002", "STR-003", "STR-004", "STR-005"],
        "keywords": [
            "account",
            "consumption",
            "competitive",
            "competitor",
            "strategic alignment",
            "market",
            "acr",
            "mau",
        ],
    },
]


PROBABILITY_SCALE: list[dict[str, Any]] = [
    {"level": 1, "name": "Rare", "frequency": "<5%"},
    {"level": 2, "name": "Unlikely", "frequency": "5-15%"},
    {"level": 3, "name": "Possible", "frequency": "15-40%"},
    {"level": 4, "name": "Likely", "frequency": "40-70%"},
    {"level": 5, "name": "Almost Certain", "frequency": ">70%"},
]


IMPACT_SCALE: list[dict[str, Any]] = [
    {
        "level": 1,
        "name": "Negligible",
        "financial": "<$10K",
        "schedule": "<1 week",
        "reputation": "None",
    },
    {
        "level": 2,
        "name": "Minor",
        "financial": "$10K-$50K",
        "schedule": "1-2 weeks",
        "reputation": "Team",
    },
    {
        "level": 3,
        "name": "Moderate",
        "financial": "$50K-$200K",
        "schedule": "2-4 weeks",
        "reputation": "Customer",
    },
    {
        "level": 4,
        "name": "Major",
        "financial": "$200K-$1M",
        "schedule": "1-3 months",
        "reputation": "Account",
    },
    {
        "level": 5,
        "name": "Severe",
        "financial": ">$1M",
        "schedule": ">3 months",
        "reputation": "Public",
    },
]


# Bands are ordered ascending by score; first bucket containing the score wins.
PRIORITY_BANDS: list[dict[str, Any]] = [
    {
        "id": "Very Low",
        "min": 1,
        "max": 2,
        "color": "#9ca3af",
        "action": "Accept, minimal monitoring",
    },
    {
        "id": "Low",
        "min": 3,
        "max": 5,
        "color": "#4ade80",
        "action": "Monitor, accept with documentation",
    },
    {
        "id": "Medium",
        "min": 6,
        "max": 11,
        "color": "#fbbf24",
        "action": "Active management, regular monitoring",
    },
    {
        "id": "High",
        "min": 12,
        "max": 15,
        "color": "#f97316",
        "action": "Mitigation plan mandatory, DRC visibility",
    },
    {
        "id": "Very High",
        "min": 16,
        "max": 25,
        "color": "#ef4444",
        "action": "Immediate escalation and mitigation required",
    },
]


# Distilled from framework §5.2.1–5.2.4. Reputational and Strategic categories have no
# enumerated patterns in the framework — they ship empty with an explanatory note.
MITIGATION_PLAYBOOKS: list[dict[str, Any]] = [
    {
        "category": "Financial",
        "patterns": [
            {
                "risk": "Margin Erosion",
                "risk_id": "FIN-001",
                "mitigations": [
                    "Weekly burn rate monitoring",
                    "Early warning at 105% of plan",
                    "Escalation at 110%",
                    "Scope/resource adjustment",
                ],
            },
            {
                "risk": "Revenue Leakage",
                "risk_id": "FIN-002",
                "mitigations": [
                    "Monthly CCCV utilization review",
                    "Proactive customer engagement",
                    "Capacity redeployment",
                ],
            },
            {
                "risk": "Payment Risk",
                "risk_id": "FIN-003",
                "mitigations": [
                    "Milestone-based invoicing",
                    "Customer credit check",
                    "Payment terms enforcement",
                ],
            },
            {
                "risk": "Pricing Risk",
                "risk_id": "FIN-005",
                "mitigations": [
                    "Estimation peer review",
                    "Contingency buffer (10-20%)",
                    "Fixed-price ceiling provisions",
                ],
            },
        ],
    },
    {
        "category": "Delivery",
        "patterns": [
            {
                "risk": "Schedule Slippage",
                "risk_id": "DEL-001",
                "mitigations": [
                    "Buffer in timeline (15-20%)",
                    "Critical path monitoring",
                    "Acceleration options identified",
                ],
            },
            {
                "risk": "Scope Creep",
                "risk_id": "DEL-002",
                "mitigations": [
                    "Formal change control process",
                    "Scope freeze periods",
                    "CR pricing defined in SoW",
                ],
            },
            {
                "risk": "Resource Availability",
                "risk_id": "DEL-003",
                "mitigations": [
                    "Backup resources identified",
                    "Cross-training",
                    "Early recruitment for specialized skills",
                ],
            },
            {
                "risk": "Customer Dependency",
                "risk_id": "DEL-004",
                "mitigations": [
                    "Dependencies in SoW with dates",
                    "Weekly tracking",
                    "Escalation path defined",
                    "CR for delays",
                ],
            },
            {
                "risk": "Quality Defects",
                "risk_id": "DEL-005",
                "mitigations": [
                    "Definition of Done",
                    "Testing gates",
                    "Acceptance criteria per deliverable",
                ],
            },
        ],
    },
    {
        "category": "Technical",
        "patterns": [
            {
                "risk": "Solution Viability",
                "risk_id": "TEC-001",
                "mitigations": [
                    "Architecture review (TQA)",
                    "POC for unproven approaches",
                    "Design spikes",
                ],
            },
            {
                "risk": "Integration Complexity",
                "risk_id": "TEC-002",
                "mitigations": [
                    "Interface contracts early",
                    "Integration testing environment",
                    "Stub/mock services",
                ],
            },
            {
                "risk": "Performance Limits",
                "risk_id": "TEC-003",
                "mitigations": [
                    "NFR validation in requirements",
                    "Load testing in scope",
                    "Performance budget",
                ],
            },
            {
                "risk": "Technology Maturity",
                "risk_id": "TEC-004",
                "mitigations": [
                    "Avoid non-GA in production scope",
                    "PG engagement",
                    "Fallback architecture",
                ],
            },
            {
                "risk": "ISV Dependency",
                "risk_id": "TEC-007",
                "mitigations": [
                    "ISV vetting checklist",
                    "SLA from ISV",
                    "Plan B documented",
                    "RACI clarity",
                ],
            },
        ],
    },
    {
        "category": "Compliance",
        "patterns": [
            {
                "risk": "Regulatory Non-compliance",
                "risk_id": "COM-001",
                "mitigations": [
                    "Compliance requirements in scope",
                    "Specialized resources",
                    "Audit checkpoints",
                ],
            },
            {
                "risk": "Responsible AI",
                "risk_id": "COM-004",
                "mitigations": [
                    "RAI assessment via ISD RAI Champ",
                    "Content filtering",
                    "Red team testing",
                    "Monitoring",
                ],
            },
            {
                "risk": "Privacy Violation",
                "risk_id": "COM-005",
                "mitigations": [
                    "Data classification",
                    "Encryption",
                    "Access controls",
                    "DPA in place",
                    "ISRA completed",
                ],
            },
            {
                "risk": "Subcontractor Risk",
                "risk_id": "COM-006",
                "mitigations": [
                    "Vendor vetting",
                    "Flowdown clauses",
                    "Audit rights",
                    "Performance monitoring",
                ],
            },
        ],
    },
    {
        "category": "Reputational",
        "note": "No framework playbook patterns enumerated.",
        "patterns": [],
    },
    {
        "category": "Strategic",
        "note": "No framework playbook patterns enumerated.",
        "patterns": [],
    },
]


def get_framework() -> dict[str, Any]:
    """Single dict consumed by /api/rules/risk-framework. Stable JSON shape."""
    return {
        "categories": RISK_CATEGORIES,
        "priorityMatrix": {
            "probabilityScale": PROBABILITY_SCALE,
            "impactScale": IMPACT_SCALE,
            "bands": PRIORITY_BANDS,
        },
        "playbooks": MITIGATION_PLAYBOOKS,
    }
