# KG Synthetic Data Generator

Generates internally-consistent Microsoft consulting project data for Neo4j knowledge graph ingestion.

## Entity Dependency Chain

```
Deal Overview (root)
├── Staffing Plan (team composition per project)
│   ├── Budget (aggregated from staffing + expenses + risk reserve)
│   ├── Staffing Actuals+Fcst (period-level execution with variance)
│   │   └── Budget Actuals+Fcst (aggregated from staffing actuals)
│   └── Status Reports (periodic RAG statuses + narrative text)
└── Project Closeout (synthesized from all execution data)
```

## Quick Start

```bash
# Template mode (no API key needed, deterministic text):
python run.py

# With Azure OpenAI for realistic narrative text:
# Auth uses DefaultAzureCredential — run `az login` first.
# Your user principal needs `Azure AI Developer` on the Foundry resource.
pip install openai azure-identity
export AZURE_OPENAI_ENDPOINT="https://sow-foundry.cognitiveservices.azure.com"
export AZURE_OPENAI_DEPLOYMENT="gpt-5-mini"
* on Powershell use $env:VARNAME="name"
python run.py

# Scale to 100 projects:
NUM_PROJECTS=100 python run.py
```

## Output

CSVs land in `output/`, one per entity:

| File | Description | ~Rows (20 projects) |
|------|-------------|---------------------|
| `deal_overview.csv` | Root project records | 20 |
| `staffing_plan.csv` | Planned team composition | 384 |
| `budget.csv` | Annual budget by component | 396 |
| `status_report.csv` | Periodic status with RAG + text | 166 |
| `staffing_actuals_fcst.csv` | Period-level staffing execution | 2,238 |
| `budget_actuals_fcst.csv` | Period-level budget execution | 1,992 |
| `project_closeout.csv` | Closeout with outcomes + CSAT | 20 |

**Total: ~5,200 records from 20 projects. Scales linearly.**

## Internal Consistency Guarantees

- Budget Fees Revenue/Cost/Margin = exact aggregation of Staffing Plan
- Staffing Actuals = Staffing Plan ± realistic variance (±20% hours, ±5% rates)
- Budget Actuals = aggregation of Staffing Actuals + proportioned expenses/risk
- RAG statuses in Status Reports correlate with actual budget/hours variance
- CSAT in Closeouts correlates with proportion of Red statuses
- Risk Reserve only appears on Fixed Fee deals
- Change Orders only created for customers who already have a New deal
- All foreign keys (project_id) are referentially consistent

## Configuration

Edit `config.py` to tune:

- `NUM_PROJECTS` — number of projects to generate
- `CUSTOMERS` — customer catalog (add/remove companies)
- `PROJECT_ARCHETYPES` — project types with team templates
- `ROLE_CATALOG` — roles with bill/cost rate ranges
- `TEAM_TEMPLATES` — team compositions by archetype and size
- `HOURS_VARIANCE_PCT` — how much actuals deviate from plan
- `AZURE_OPENAI_DEPLOYMENT` — which Azure OpenAI model deployment to use

## Neo4j Ingestion

These CSVs are designed to map directly to KG nodes and relationships:

**Nodes:** Project, Customer, Resource, BudgetComponent, StatusReport, Closeout
**Relationships:** BELONGS_TO_CUSTOMER, HAS_STAFFING, HAS_BUDGET, HAS_STATUS_REPORT, HAS_CLOSEOUT, WORKED_ON (Resource → Project)
