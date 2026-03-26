"""
Configuration for KG synthetic data generation.
Scale NUM_PROJECTS up/down as needed — everything else adjusts proportionally.
"""

import os
from datetime import date

# ── Scale knob ──────────────────────────────────────────────────────────────
NUM_PROJECTS = 20
SEED = 42

# ── Azure OpenAI ────────────────────────────────────────────────────────────
# Set these 3 env vars to enable LLM text generation.
# Find them in Azure AI Foundry → your deployment → Endpoint + Keys.
AZURE_OPENAI_ENDPOINT = os.environ.get(
    "AZURE_OPENAI_ENDPOINT", ""
)  # e.g. "https://your-resource.openai.azure.com"
AZURE_OPENAI_API_KEY = os.environ.get("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "")  # e.g. "gpt-4o-mini"
AZURE_OPENAI_API_VERSION = "2024-12-01-preview"
USE_LLM = bool(AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT)

# ── Timeline ────────────────────────────────────────────────────────────────
PROJECT_DATE_RANGE_START = date(2023, 1, 1)
PROJECT_DATE_RANGE_END = date(2025, 6, 30)
STATUS_REPORT_FREQ_WEEKS = 4  # monthly-ish cadence

# ── Customers ───────────────────────────────────────────────────────────────
CUSTOMERS = [
    {
        "id": "CUST-001",
        "name": "Contoso Financial Group",
        "industry": "Financial Services",
        "location": "New York, NY",
    },
    {
        "id": "CUST-002",
        "name": "Northwind Health Systems",
        "industry": "Healthcare",
        "location": "Boston, MA",
    },
    {
        "id": "CUST-003",
        "name": "Adventure Works Retail",
        "industry": "Retail / E-Commerce",
        "location": "Seattle, WA",
    },
    {
        "id": "CUST-004",
        "name": "Fabrikam Manufacturing",
        "industry": "Manufacturing",
        "location": "Detroit, MI",
    },
    {
        "id": "CUST-005",
        "name": "Woodgrove Energy",
        "industry": "Energy / Utilities",
        "location": "Houston, TX",
    },
    {
        "id": "CUST-006",
        "name": "Trey Research Labs",
        "industry": "Technology",
        "location": "San Francisco, CA",
    },
    {
        "id": "CUST-007",
        "name": "Litware Telecom",
        "industry": "Telecommunications",
        "location": "Dallas, TX",
    },
    {
        "id": "CUST-008",
        "name": "Proseware Government Solutions",
        "industry": "Government",
        "location": "Washington, DC",
    },
    {
        "id": "CUST-009",
        "name": "Alpine Ski House Hospitality",
        "industry": "Hospitality",
        "location": "Denver, CO",
    },
    {
        "id": "CUST-010",
        "name": "Bellows College",
        "industry": "Education",
        "location": "Chicago, IL",
    },
    {
        "id": "CUST-011",
        "name": "Margie's Travel Corp",
        "industry": "Transportation",
        "location": "Atlanta, GA",
    },
    {
        "id": "CUST-012",
        "name": "Relecloud Insurance",
        "industry": "Financial Services",
        "location": "Charlotte, NC",
    },
    {
        "id": "CUST-013",
        "name": "VanArsdel Pharma",
        "industry": "Healthcare",
        "location": "Philadelphia, PA",
    },
    {
        "id": "CUST-014",
        "name": "Wide World Importers",
        "industry": "Retail / E-Commerce",
        "location": "Portland, OR",
    },
]

# ── Project archetypes ──────────────────────────────────────────────────────
# Each archetype defines typical team shape, duration, and size bucket
PROJECT_ARCHETYPES = [
    {
        "type": "Cloud Migration",
        "roles_template": "infra_heavy",
        "duration_months": (6, 18),
        "size": "large",
    },
    {
        "type": "AI/ML Platform",
        "roles_template": "data_heavy",
        "duration_months": (4, 12),
        "size": "medium",
    },
    {
        "type": "ERP Modernization",
        "roles_template": "full_stack",
        "duration_months": (9, 24),
        "size": "large",
    },
    {
        "type": "Security Transformation",
        "roles_template": "security_focused",
        "duration_months": (3, 9),
        "size": "medium",
    },
    {
        "type": "Data Platform Build",
        "roles_template": "data_heavy",
        "duration_months": (4, 12),
        "size": "medium",
    },
    {
        "type": "Digital Transformation Advisory",
        "roles_template": "advisory",
        "duration_months": (2, 6),
        "size": "small",
    },
    {
        "type": "DevOps & Infrastructure Automation",
        "roles_template": "infra_heavy",
        "duration_months": (3, 9),
        "size": "medium",
    },
    {
        "type": "Application Modernization",
        "roles_template": "full_stack",
        "duration_months": (4, 12),
        "size": "medium",
    },
]

# ── Role catalog ────────────────────────────────────────────────────────────
# (role_title, role_description, bill_rate_range, cost_pct_of_bill, is_offshore)
ROLE_CATALOG = {
    "Program Director": ("", (350, 450), 0.45, False),
    "Sr. Program Manager": ("", (300, 375), 0.48, False),
    "Program Manager": ("", (250, 325), 0.50, False),
    "Sr. Project Manager": ("", (225, 300), 0.50, False),
    "Project Manager": ("", (200, 275), 0.52, False),
    "Sr. Solution Architect": (
        "Program Architect, Infrastructure Architect, Security Architect, "
        "Application Architect, Data Architect, AI Architect, QA Architect",
        (325, 400),
        0.45,
        False,
    ),
    "Solution Architect": (
        "Infrastructure Architect, App Architect, Data Architect, AI Architect",
        (275, 350),
        0.48,
        False,
    ),
    "Sr. Data Scientist": ("", (300, 375), 0.47, False),
    "Data Scientist": ("", (250, 325), 0.50, False),
    "Sr. Product Manager": ("", (275, 350), 0.48, False),
    "Product Manager": ("", (225, 300), 0.52, False),
    "Sr. Consultant": (
        "Technical Lead, Functional Lead, AI Lead, Data Lead, QA Lead, UX Designer, Security Lead",
        (250, 325),
        0.50,
        False,
    ),
    "Consultant": (
        "Infrastructure Engineer, Security Engineer, Application Engineer, "
        "Data Engineer, AI Engineer, QA Engineer, UX Engineer, DevOps Engineer",
        (200, 275),
        0.52,
        False,
    ),
    "Offshore Project Manager": ("", (125, 175), 0.55, True),
    "Offshore Solution Architect": (
        "Infrastructure Architect, App Architect, Data Architect, AI Architect",
        (150, 200),
        0.50,
        True,
    ),
    "Offshore Senior Consultant": (
        "Technical Lead, Functional Lead, AI Lead, Data Lead, QA Lead, UX Designer, Security Lead",
        (125, 175),
        0.55,
        True,
    ),
    "Offshore Consultant": (
        "Infrastructure Engineer, Security Engineer, Application Engineer, "
        "Data Engineer, AI Engineer, QA Engineer, UX Engineer, DevOps Engineer",
        (75, 150),
        0.58,
        True,
    ),
}

# ── Team composition templates ──────────────────────────────────────────────
# Maps archetype role_template → list of (role, count, weekly_hours_range)
# "small" / "medium" / "large" modifiers scale the counts
TEAM_TEMPLATES = {
    "advisory": {
        "small": [
            ("Sr. Project Manager", 1, (8, 16)),
            ("Sr. Solution Architect", 1, (16, 32)),
            ("Sr. Consultant", 1, (24, 40)),
        ],
        "medium": [
            ("Program Manager", 1, (8, 16)),
            ("Sr. Solution Architect", 1, (20, 40)),
            ("Sr. Consultant", 2, (30, 40)),
            ("Consultant", 1, (20, 40)),
        ],
        "large": [
            ("Sr. Program Manager", 1, (8, 16)),
            ("Sr. Solution Architect", 2, (20, 40)),
            ("Sr. Consultant", 2, (30, 40)),
            ("Consultant", 2, (30, 40)),
        ],
    },
    "infra_heavy": {
        "small": [
            ("Project Manager", 1, (10, 20)),
            ("Solution Architect", 1, (20, 40)),
            ("Sr. Consultant", 1, (30, 40)),
            ("Consultant", 2, (30, 40)),
        ],
        "medium": [
            ("Sr. Project Manager", 1, (10, 20)),
            ("Sr. Solution Architect", 1, (20, 40)),
            ("Sr. Consultant", 2, (30, 40)),
            ("Consultant", 3, (30, 40)),
            ("Offshore Consultant", 2, (30, 40)),
        ],
        "large": [
            ("Program Director", 1, (4, 8)),
            ("Program Manager", 1, (16, 32)),
            ("Sr. Solution Architect", 2, (20, 40)),
            ("Solution Architect", 1, (20, 40)),
            ("Sr. Consultant", 3, (30, 40)),
            ("Consultant", 4, (30, 40)),
            ("Offshore Solution Architect", 1, (30, 40)),
            ("Offshore Senior Consultant", 2, (30, 40)),
            ("Offshore Consultant", 4, (30, 40)),
        ],
    },
    "data_heavy": {
        "small": [
            ("Project Manager", 1, (10, 20)),
            ("Solution Architect", 1, (20, 32)),
            ("Sr. Data Scientist", 1, (30, 40)),
            ("Data Scientist", 1, (30, 40)),
        ],
        "medium": [
            ("Sr. Project Manager", 1, (10, 20)),
            ("Sr. Solution Architect", 1, (16, 32)),
            ("Sr. Data Scientist", 1, (30, 40)),
            ("Data Scientist", 2, (30, 40)),
            ("Sr. Consultant", 1, (30, 40)),
            ("Consultant", 2, (30, 40)),
        ],
        "large": [
            ("Program Manager", 1, (12, 24)),
            ("Sr. Solution Architect", 1, (20, 40)),
            ("Solution Architect", 1, (16, 32)),
            ("Sr. Data Scientist", 2, (30, 40)),
            ("Data Scientist", 3, (30, 40)),
            ("Sr. Consultant", 2, (30, 40)),
            ("Consultant", 3, (30, 40)),
            ("Offshore Senior Consultant", 2, (30, 40)),
            ("Offshore Consultant", 3, (30, 40)),
        ],
    },
    "full_stack": {
        "small": [
            ("Project Manager", 1, (10, 20)),
            ("Solution Architect", 1, (20, 40)),
            ("Sr. Consultant", 1, (30, 40)),
            ("Consultant", 2, (30, 40)),
        ],
        "medium": [
            ("Sr. Project Manager", 1, (10, 20)),
            ("Sr. Solution Architect", 1, (20, 40)),
            ("Sr. Product Manager", 1, (16, 32)),
            ("Sr. Consultant", 2, (30, 40)),
            ("Consultant", 3, (30, 40)),
            ("Offshore Consultant", 2, (30, 40)),
        ],
        "large": [
            ("Program Director", 1, (4, 8)),
            ("Sr. Program Manager", 1, (12, 24)),
            ("Sr. Solution Architect", 2, (20, 40)),
            ("Sr. Product Manager", 1, (16, 32)),
            ("Sr. Consultant", 3, (30, 40)),
            ("Consultant", 5, (30, 40)),
            ("Offshore Solution Architect", 1, (30, 40)),
            ("Offshore Senior Consultant", 3, (30, 40)),
            ("Offshore Consultant", 5, (30, 40)),
        ],
    },
    "security_focused": {
        "small": [
            ("Project Manager", 1, (10, 20)),
            ("Sr. Solution Architect", 1, (20, 40)),
            ("Sr. Consultant", 2, (30, 40)),
        ],
        "medium": [
            ("Sr. Project Manager", 1, (10, 20)),
            ("Sr. Solution Architect", 1, (20, 40)),
            ("Sr. Consultant", 2, (30, 40)),
            ("Consultant", 2, (30, 40)),
        ],
        "large": [
            ("Program Manager", 1, (12, 24)),
            ("Sr. Solution Architect", 2, (20, 40)),
            ("Sr. Consultant", 3, (30, 40)),
            ("Consultant", 3, (30, 40)),
            ("Offshore Senior Consultant", 2, (30, 40)),
            ("Offshore Consultant", 3, (30, 40)),
        ],
    },
}

# ── Budget parameters ───────────────────────────────────────────────────────
EXPENSE_PCT_OF_REVENUE = (0.02, 0.08)  # travel expenses as % of fees revenue
RISK_RESERVE_PCT = (0.05, 0.12)  # only for Fixed Fee deals

# ── Actuals variance ────────────────────────────────────────────────────────
HOURS_VARIANCE_PCT = (-0.20, 0.25)  # actuals deviate from plan by this %
RATE_VARIANCE_PCT = (-0.05, 0.05)  # small rate adjustments in execution

# ── Satisfaction scores ─────────────────────────────────────────────────────
CSAT_RANGE = (3.0, 5.0)  # 1-5 scale
