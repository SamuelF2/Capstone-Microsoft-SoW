# Cocoon — AI-Enabled SoW Authoring Platform for Microsoft Consulting Services

Statement of Work authoring and review platform with graph-augmented retrieval, role-based review routing, and audit-grade workflow templating. Built as a Baylor capstone project for Microsoft Consulting Services, handed off to Microsoft Consulting after the May 14 2026 demo.

This README is the handoff document. It assumes the reader is taking over a live deployment they did not write. Sections are ordered so the receiver can clone the repo, get it running, understand what is complete vs incomplete, deploy to Azure, and operate it.

---

## 1. Project state at handoff

**What the platform does.** A consultant authors a SoW through a Next.js front end. On submit, the FastAPI back end fans out four parallel calls to a Neo4j-backed Graph-RAG service for validation, risk extraction, similar-SoW retrieval, and approval routing. Findings are surfaced inline against the appropriate SoW section. The SoW advances through a configurable workflow (default: eleven stages including a parallel gateway) with role-scoped checklists for five reviewer roles. On approval the platform locks the SoW and generates a DOCX handoff package.

**Stack at one-sentence granularity.** Next.js 15 + React 19 + MSAL.js front end; Python 3.13 FastAPI back end with asyncpg and the official Neo4j driver; PostgreSQL 16 as system of record (28 tables, ~40 non-PK indexes, bootstrapped idempotently at startup); Neo4j 5 as the corpus knowledge graph (15 node labels, five vector indexes with 540 384-dim embeddings produced by `sentence-transformers/all-MiniLM-L6-v2`); Microsoft Entra ID via MSAL on both sides; Azure AI Foundry hosting `Kimi-K2.5` accessed through `DefaultAzureCredential`; Azure Container Apps + a Container Apps Job for one-shot Neo4j seeding; provisioned with Bicep and `azd`.

**What is complete and demonstrable.**
- End-to-end SoW lifecycle across four supported methodologies (Agile Sprint Delivery, Sure Step 365, Waterfall, Cloud Adoption).
- AI Recommendation Pipeline live (no mocking) against the deployed ML service.
- Operational risk-assessment framework: six categories (Financial, Delivery, Technical, Commercial, Compliance, Resource), 5×5 priority matrix with five severity bands, and mitigation playbooks, surfaced both per-SoW (AI Review tab) and portfolio-wide (Business Logic → Risk Assessment).
- Role-based review routing with JSON-driven checklists for the five reviewer roles.
- Configurable workflow templates with per-SoW JSONB snapshotting so template edits do not disturb in-flight SoWs.
- Conditions of Approval lifecycle with assignment and resolution.
- Audit timeline unified across history, review assignments, COA, and attachments.
- DOCX handoff package generated on finalization (renderer extracted to `backend/services/docx_renderer.py` in PR #39 and unit-tested at the byte level).
- Entra group picker on `/create-new` (populates from `/me/memberOf`).
- Deal-context analytics API and CLI (`/api/deals/*`, `python main.py deal-risk`, etc.).
- Cross-subscription managed identity from the ML service and the Ingestion Job to Foundry.

**What is intentionally disabled or incomplete.** See §13 (Known limitations) for the full list with rationale. Headlines:
- **Group auto-enrollment** is disabled because the Azure-for-Students demo tenant cannot grant the Graph admin consent it would require. Picker works; manual collaborator add is the supported path. Re-enable is a four-step checklist in `backend/routers/sow_roles.py`.
- **Postgres runs as a Container App with ephemeral storage** because the demo subscription restricts Azure Database for PostgreSQL Flexible Server. Production deployment swaps to managed PostgreSQL.
- **Application Insights, alerting, and SLO tracking are not wired.** Container Apps logs flow to Log Analytics (30-day retention); operator action is manual.
- **The KG generation evaluation loop is manual.** No automated retrieval relevance harness.

**Demo readiness.** All seven recent PRs landed on `main` (#33, #34, #35, #36, #37, #38, #39). 301 backend unit tests pass (2 skipped) plus 131 ML unit tests pass; six pre-existing failures predate this work and are unrelated to feature code (`pypdf` missing in env, etc.).

## 2. Team and handoff context

| Name | Roles |
|------|-------|
| Nathan Dorsey | Scrum Master, AI/ML Engineer |
| Jayden Ferguson | AI/ML Engineer, Data Engineer |
| Samuel Fries | Product Owner, Tech Lead, Software Engineer |
| Eugene Pak | DevOps, Security Engineer, Software Engineer |
| Zhan Su | Infrastructure Engineer, QA Engineer, Software Engineer |
| Phuong Thai | AI/ML Engineer, Data Engineer |

Faculty advisor: Prof. Kirk Carver, Baylor School of Engineering and Computer Science.
Industry mentor: Shyam, Microsoft AI Architect.

Backlog: [Jira](https://samueltfries.atlassian.net/jira/software/projects/SCRUM/summary).

Operational secrets, Azure subscription credentials, and admin contacts are not stored in the repo. Request from Zhan (infrastructure) or Samuel (product owner). The Microsoft Consulting handoff packet is delivered separately on demo day (not checked into the repo).

## 3. Architecture overview

```
                  ┌─────────────────────────────────────────────────────┐
                  │              Microsoft Entra ID (MSAL)              │
                  └────────────────────────┬────────────────────────────┘
                                           │ ID token (audience = backend client ID)
                                           ▼
   ┌────────────────────┐         ┌─────────────────────┐         ┌────────────────────┐
   │  Next.js front end │ ──────▶ │  FastAPI back end   │ ──────▶ │  PostgreSQL 16     │
   │  (Container App)   │  HTTPS  │  (Container App)    │  asyncpg│  (system of record)│
   │  reactflow, MSAL   │         │  16 routers         │         │  28 tables         │
   └────────────────────┘         └──────────┬──────────┘         └────────────────────┘
                                             │
                                             │  internal-only HTTP
                                             ▼
                                  ┌─────────────────────┐         ┌────────────────────┐
                                  │  ML GraphRAG API    │ ──────▶ │  Neo4j 5           │
                                  │  (Container App)    │  bolt   │  corpus KG         │
                                  │  /context /assist   │         │  5 vector indexes  │
                                  └──────────┬──────────┘         │  540 embeddings    │
                                             │ DefaultAzureCredential └─────────▲──────┘
                                             │ (system-assigned MI)             │
                                             ▼                                  │ bolt
                                  ┌─────────────────────┐         ┌────────────────────┐
                                  │  Azure AI Foundry   │         │  Container Apps Job│
                                  │  Kimi-K2.5          │         │  one-shot ingest   │
                                  │  cross-subscription │         │  + enrich (~42 min)│
                                  │  RBAC               │         └─────────────────────┘
                                  └─────────────────────┘
```

**Two pipelines.** Cocoon runs two distinct AI pipelines that share Neo4j.

1. **AI Recommendation Pipeline (runtime).** Triggered when an author submits a SoW. The back end fans out parallel calls from `backend/services/ai.py` to the ML service for validation, risk extraction, similar-SoW retrieval, and approval routing, then scores the extracted risks via `backend/services/risk_framework.py` (keyword-driven category classifier → impact + probability → priority band → mitigation playbook). Retrieval is vector ANN over the five Neo4j indexes plus Cypher traversal across typed edges.
2. **KG Generation Pipeline (offline, manual).** A Container Apps Job runs `uv run python main_new.py ingest && uv run python main_new.py enrich` against the seven Contoso reference SoWs (`Data/sow-md/`), the operational guides (`Data/SOW Guides MD/`), and the JSON rule files (`Data/rules/`). LLM extraction uses Kimi-K2.5 via Foundry. End-to-end runtime is ~42 minutes wall-clock. Triggered manually via `az containerapp job start` after corpus or rule changes.

**Two data stores.** PostgreSQL is the system of record for SoW state, history, workflow data, and attachments metadata. Neo4j is the corpus knowledge graph for retrieval. They are not synced; they answer different questions.

## 4. Tech stack

- **Frontend** — Next.js 15 (`^15.1.0`), React 19, `@azure/msal-browser` 3, `framer-motion`, `reactflow` 11 (workflow editor + schema-proposal graph view). Hand-rolled CSS, no UI library.
- **Backend** — Python 3.13, FastAPI, `asyncpg`, official Neo4j driver, `python-docx` (handoff package), `httpx` (ML proxy + Graph). 16 router modules, ~115 declared HTTP routes.
- **Auth** — Microsoft Entra ID via MSAL on both surfaces. Multi-tenant `/common` authority. RS256 JWT validation against Microsoft JWKS. `authFetch` wrapper deduplicates concurrent token acquisition and retries once on 401.
- **Graph DB** — Neo4j 5 community. 15 node labels with uniqueness constraints. Five cosine-similarity vector indexes at 384 dimensions.
- **Relational DB** — PostgreSQL 16. 28 tables, ~40 non-PK indexes (B-tree + GIN full-text + unique partial), trigger-maintained `tsvector` for search.
- **Embeddings** — `sentence-transformers/all-MiniLM-L6-v2` running locally on the ML container. No remote embedding calls.
- **LLM** — `Kimi-K2.5` deployment on Azure AI Foundry, API version `2025-01-01-preview`. Authenticated via `DefaultAzureCredential` + `get_bearer_token_provider` (no API key).
- **IaC** — Bicep modules under `infra/`. Deployed with Azure Developer CLI (`azd`).
- **Hosting** — Azure Container Apps for every service; Container Apps Job for the ingestion run. Log Analytics workspace at 30-day retention.
- **CI/CD** — GitHub Actions: `CICD_Workflow.yml` runs lint, format, backend + ML unit tests, and a Docker Compose build on every push and pull request to `main`. `azure-deploy.yml` is a manual `workflow_dispatch` using OIDC federated credentials and `azd up` / `azd deploy` / `azd provision`.
- **Local dev** — Docker Compose with `backend`, `frontend`, `neo4j` 5 community, `postgres` 16 alpine.
- **Tooling** — `uv` (Python), `npm` (Node 20), Ruff lint + format, Prettier (JS/CSS/JSON), pre-commit hooks.

## 5. Repository layout

```
Capstone-Microsoft-SoW/
├── backend/                  Python/FastAPI API (16 routers, schema bootstrapped at startup)
│   ├── main.py               Lifespan (28 CREATE TABLE IF NOT EXISTS + indexes), router registration
│   ├── auth.py               Entra ID JWT validation, CurrentUser dependency
│   ├── config.py             Centralized env-var reads with safe defaults
│   ├── routers/              auth, sow, sow_comments, sow_extraction, sow_roles, review,
│   │                         finalize, rules, workflow, coa, attachments, ai, audit,
│   │                         users, roles, status
│   ├── services/             ai.py (parallel ML fan-out + risk scorer), workflow_engine.py,
│   │                         risk_framework.py (6 categories, 5×5 priority matrix, mitigation
│   │                         playbooks; source-of-truth for /api/rules/risk-framework),
│   │                         docx_renderer.py (handoff DOCX generation; mirrors
│   │                         SoWDocumentReader.js section ordering)
│   ├── seeds/                microsoft_workflow.py (11-stage default template seed)
│   ├── utils/                esap.py (deterministic ESAP approval-tier rule), db_helpers.py,
│   │                         document_text.py (PDF/DOCX text extraction), role_labels.py,
│   │                         section_schemas.py, sow_text.py
│   ├── validators.py         Pure functions for input validation (Cypher label/rel-type guards)
│   └── tests/                Backend pytest (unit + smoke; integration marker reserved)
├── frontend/                 Next.js 15 UI
│   ├── pages/                draft/[id], my-reviews, drm-review/[id], internal-review/[id],
│   │                         ai-review, business-logic (Risk Assessment + Workflow Templates
│   │                         tabs), create-new, workflows/[id]/edit, schema-proposals, ...
│   ├── components/           workflow/, ai-review/ (incl. RiskAssessmentSection.js — interactive
│   │                         5×5 heatmap, sortable register, mitigation disclosure),
│   │                         proposals/graph/ (Neo4j-palette force-directed view: CircleNode,
│   │                         LabeledCurvedEdge, useForceLayout, etc.), comments/, sow/, ...
│   ├── lib/                  auth.js (authFetch + getGraphToken), msalConfig.js,
│   │                         draftTabs/{agile,sureStep,waterfall,cloudAdoption}.js,
│   │                         hooks/, workflowStages.js
│   └── styles/               Hand-rolled CSS, design tokens in globals.css
├── ml/                       FastAPI GraphRAG service + CLI
│   ├── api.py                FastAPI app (port 8001). /health /context /assist /sows/*
│   │                         /approval /schema/proposals* /api/deals/* (mounted from
│   │                         deal_router)
│   ├── main.py               Click CLI; loads native + deal commands at module load
│   ├── main_new.py           Async ingest + enrich (invoked by the Container Apps Job)
│   ├── llm_gen.py            LLM generation entry; intents, prompts, context serialization
│   ├── sow_kg/               KG modules:
│   │   ├── db.py             Neo4j schema bootstrap (constraints + vector indexes)
│   │   ├── ingest_markdown.py  Markdown SoW + guide ingestion (SOW/Section/Deliverable/Risk + ClauseType/Rule/Term nodes); used by main.py
│   │   ├── ingest_json.py    Rule-file ingestion (banned-phrases, ESAP workflow, review-checklists, methodology-alignment, required-elements); used by main.py
│   │   ├── ingest_csv.py     Synthetic-deal CSV ingestion (deal_overview, closeout, budget, staffing, status_report)
│   │   ├── ingest_async.py   Async parallel ingestion path used by main_new.py for the Container Apps Job
│   │   ├── ingest.py         Legacy synchronous helpers (production paths are ingest_async.py and the markdown/JSON modules above)
│   │   ├── ingest_deal_data.py  CSV → DealContext nodes (deal_overview, status_report, etc.)
│   │   ├── extract.py        Markdown extraction (H1-H4 + pipe tables)
│   │   ├── enrich.py         Sentence-transformer embedding + vector index population
│   │   ├── graphrag.py       retrieve() + DealContext-aware _load_deal_context
│   │   ├── graph_rag.py      RetrievedContext dataclass, prompt context formatting
│   │   ├── llm_client.py     Foundry client (DefaultAzureCredential) + extraction prompts
│   │   ├── queries.py        Approval routing, similar-SoW search, validation queries
│   │   ├── schema_evolution.py  LLM-proposed schema lifecycle (record/promote/score)
│   │   ├── proposal_eval.py  LLM-based proposal scoring
│   │   ├── proposal_cli.py   Click commands for proposal lifecycle management
│   │   ├── deal_router.py    /api/deals/* FastAPI router (mounted by api.py)
│   │   ├── deal_queries.py   Deal analytics queries (summary, similar, risk profile)
│   │   ├── deal_cli.py       Click commands: ingest-deals, deals-summary, deal-risk, link-deal
│   │   ├── assist_router.py  FastAPI /api/assist router — defined but not currently mounted in api.py
│   │   ├── assist_cli.py     Click commands for cross-section assist queries
│   │   └── assist.py         Cross-section assist entry
│   └── kg_data_gen/          Synthetic deal CSV generator (NOT synthetic SoWs)
├── tests/                    ML module unit tests (pytest from repo root)
├── Data/                     Rules JSON, reference SoWs, risk-framework spec
│   ├── sow-md/               Seven Contoso reference SoWs (contoso-*.md)
│   ├── SOW Guides MD/        Operational guides for KG ingestion
│   ├── RISK_ASSESSMENT_AND_MITIGATION_FRAMEWORK.md  Source-of-truth spec mirrored in
│   │                         backend/services/risk_framework.py (§2 categories, §4 matrix,
│   │                         §5 playbooks)
│   └── rules/
│       ├── compliance/       banned-phrases.json, required-elements.json
│       ├── methodology/      methodology-alignment.json
│       └── workflow/         esap-workflow.json, review-checklists.json
├── infra/                    Azure Bicep IaC
│   ├── main.bicep            Top-level deployment composition
│   ├── main.parameters.json  Parameter file consumed by azd
│   └── modules/              container-app, container-apps-environment,
│                             container-registry, log-analytics, ml-container,
│                             ingestion-job, foundry-rbac, neo4j-container,
│                             postgres-container, postgresql-flexible
├── infrastructure/postgres/init/   Two-table SQL init (backstop; real schema in lifespan)
├── docs/                     README.md (index for handed-off design docs);
│                             superpowers/plans/ (in-flight design + plan notes)
├── .github/workflows/        CICD_Workflow.yml, azure-deploy.yml, azure-teardown.yml
├── docker-compose.yml        Local stack: backend, frontend, neo4j, postgres
├── azure.yaml                azd service map
├── Dockerfile.ingestion      Container Apps Job image
├── ruff.toml                 Python lint/format config
├── .pre-commit-config.yaml   Git hook config (ruff + prettier + standard hooks)
├── CLAUDE.md                 Codebase conventions (validators, Cypher injection guards,
│                             where pure functions belong; canonical for AI assistants)
└── README.md                 This file
```

Per-directory READMEs in `backend/`, `frontend/`, `ml/`, `infra/`, `tests/` go deeper where useful.

## 6. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (required)
- [Git](https://git-scm.com/downloads) (required)
- [Python 3.13](https://www.python.org/downloads/) (for local backend / ML hot-reload + tests; pinned by CI)
- [Node.js 20](https://nodejs.org/) (for local frontend hot-reload; matches the production Dockerfile)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (only needed for AI features and Azure deploy)
- [Azure Developer CLI](https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/install-azd) (only needed for Azure deploy)

## 7. Local quick start

```bash
# 1. Clone
git clone https://github.com/SamuelF2/Capstone-Microsoft-SoW.git
cd Capstone-Microsoft-SoW

# 2. Copy the env template and fill in credentials (get from Zhan or Samuel)
cp .env.example .env

# 3. Build and start all services
docker compose up -d --build

# 4. Verify everything is running
docker compose ps
curl http://localhost:8000/health
```

Expected `/health` response:

```json
{ "status": "healthy", "neo4j": "connected", "postgres": "connected" }
```

### Access points

| Service | Local URL | Notes |
|---------|-----------|-------|
| Backend API | http://localhost:8000 | Swagger at `/docs`, status dashboard at `/status` |
| Frontend | http://localhost:3000 | Sign in with the Entra app's allowed test users |
| ML service | http://localhost:8001 | Internal-only in production; `/docs` available locally |
| Neo4j Browser | http://localhost:7474 | Bolt at 7687, creds in `.env` |
| PostgreSQL | localhost:5432 | Creds in `.env`; default db name `cocoon` |

Database credentials are not stored in the repo; the `.env.example` documents the keys.

## 8. Hot-reload development

`docker compose up` is fine for verifying the full stack, but for active development the hot-reload modes below are faster.

### Backend (FastAPI on host)

```bash
docker compose up -d postgres neo4j
cd backend
uv venv && uv pip install -r requirements.txt
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=$(grep NEO4J_PASSWORD ../.env | cut -d= -f2)
export DATABASE_URL=postgresql://cocoon:$(grep POSTGRES_PASSWORD ../.env | cut -d= -f2)@localhost:5432/cocoon
export AZURE_AD_CLIENT_ID=$(grep AZURE_AD_CLIENT_ID ../.env | cut -d= -f2)
uv run uvicorn main:app --reload --port 8000
```

### Frontend (Next.js on host)

```bash
cd frontend
npm install
export NEXT_PUBLIC_API_URL=http://localhost:8000
export NEXT_PUBLIC_AZURE_CLIENT_ID=<same-as-AZURE_AD_CLIENT_ID>
npm run dev
```

### ML service (FastAPI on host, port 8001)

```bash
cd ml
cp .env.example .env             # then fill AZURE_OPENAI_ENDPOINT / DEPLOYMENT
uv venv && uv pip install -e .
az login                          # required for DefaultAzureCredential
uv run uvicorn api:app --reload --port 8001
```

The backend reaches ML via the `GRAPHRAG_API_URL` env var (defaults to `http://host.docker.internal:8001` in Docker).

### One-shot ML CLI tasks

```bash
cd ml
uv run python main.py --help                       # list all commands (native + deal-context)
uv run python main.py ingest --data-dir ../Data    # full corpus ingestion
uv run python main.py enrich --batch-size 64       # generate embeddings
uv run python main.py ingest-deals                 # CSV → DealContext nodes (synthetic)
uv run python main.py deals-summary                # aggregate deal analytics
uv run python main.py deal-risk --project-id <id>  # per-deal risk profile
uv run python main.py link-deal --sow-id <s> --project-id <p>
```

## 9. Configuration reference

Required env vars by service. Values not in the repo; request from infrastructure owner.

### `.env` at repo root (consumed by docker-compose)

| Variable | Required | Purpose |
|----------|----------|---------|
| `POSTGRES_PASSWORD` | yes | Postgres password used by both the postgres container and the backend |
| `NEO4J_PASSWORD` | yes | Neo4j password used by both the neo4j container and the backend/ML services |
| `AZURE_AD_CLIENT_ID` | yes (non-dev) | Entra app registration client ID; backend validates the JWT audience against this. Backend startup fails if missing in non-dev environments |
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | yes | Same client ID, exposed to the front end at build time |
| `NEXT_PUBLIC_API_URL` | optional | Defaults to `http://localhost:8000` |
| `ENV` | optional | `development`/`testing`/`production`. Controls strictness of `AZURE_AD_CLIENT_ID` validation and the `/api/users/me/role` dev endpoint |

### `ml/.env` (consumed by the ML service and CLI)

| Variable | Required | Purpose |
|----------|----------|---------|
| `AZURE_OPENAI_ENDPOINT` | yes for AI features | Foundry project endpoint, e.g. `https://foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW` |
| `AZURE_OPENAI_DEPLOYMENT` | optional | Deployment name. Defaults to `Kimi-K2.5` |
| `AZURE_OPENAI_API_VERSION` | optional | Defaults to `2024-10-21`; current deployments use `2025-01-01-preview` |
| `NEO4J_URI` | optional | Defaults to `bolt://localhost:7687`; set to the Neo4j Container App FQDN in production |
| `NEO4J_USER` / `NEO4J_PASSWORD` | yes | Same as the backend |

Auth: when `AZURE_OPENAI_ENDPOINT` is set the ML service constructs the client through `DefaultAzureCredential` + `get_bearer_token_provider` against `https://cognitiveservices.azure.com/.default`. No API key.

### GitHub Actions secrets (for `azure-deploy.yml`)

| Secret | Purpose |
|--------|---------|
| `AZURE_CLIENT_ID` | Deployment service principal client ID (OIDC) |
| `AZURE_TENANT_ID` | Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Target subscription |
| `AZURE_ENV_NAME` | `azd` environment name |
| `AZURE_LOCATION` | Region (e.g. `eastus2`) |
| `AZURE_POSTGRES_PASSWORD` | Postgres password injected as a secret reference |
| `AZURE_NEO4J_PASSWORD` | Neo4j password |
| Foundry endpoints | Optional, only if overriding defaults |

## 10. Authentication and identity

### Entra ID app registration (front end + back end)

Cocoon uses a single app registration in the demo tenant. Both surfaces target the multi-tenant `/common` authority. Required configuration:

- Application type: SPA (the `redirect_uri` is the front end's deployed URL).
- ID token issuance enabled.
- Implicit grant: off (MSAL.js uses authorization code with PKCE).
- API permissions: `User.Read` (Microsoft Graph, delegated). Granted with user consent on first sign-in.

The back end validates the bearer token as an RS256 JWT against Microsoft's JWKS, audience-pinned to `AZURE_AD_CLIENT_ID`. Issuer verification is disabled by design because `/common` tokens carry per-tenant issuers. Production deployment should commit to single-tenant or allow-listed multi-tenant operation and enable `verify_iss` (see §14 migration roadmap).

### Microsoft Graph admin consent (group-collaborator feature)

The group auto-enrollment feature in `backend/routers/sow_roles.py` requires the delegated `GroupMember.Read.All` scope, which requires tenant-wide admin consent. The Azure-for-Students demo tenant does not grant this, so the sync is disabled. The picker on `/create-new` still works because `/me/memberOf` is covered by `User.Read`.

Reactivation when admin consent becomes obtainable is a four-step checklist in the header banner of `backend/routers/sow_roles.py:` (1) grant tenant-wide admin consent for `GroupMember.Read.All`; (2) add the scope back into `GRAPH_SCOPES` in `frontend/lib/auth.js`; (3) uncomment the `@router.post` decorator above `sync_group_collaborators`; (4) uncomment the sync call in `frontend/pages/create-new.js` (search for "GROUP SYNC DISABLED").

### Managed identity (ML service and Ingestion Job to Foundry)

The ML Container App and the Container Apps Job each carry a system-assigned managed identity (`infra/modules/ml-container.bicep:50-52`, `infra/modules/ingestion-job.bicep:72-74`). The deployment authors a cross-subscription role assignment that grants both principals the `Azure AI Developer` role on the Foundry resource (`infra/modules/foundry-rbac.bicep:31-45`). This is the only managed-identity path today; PostgreSQL and Neo4j credentials and ACR pulls all use shared secrets.

To grant a user access to call Foundry from their local machine: assign them the `Azure AI Developer` role on the `Foundry-SOW` resource, then `az login`. The ML service's `DefaultAzureCredential` picks up the Azure CLI token chain automatically.

### Secure Future Initiative (SFI) readiness

Microsoft's Secure Future Initiative requires internal services to eliminate shared secrets in favour of workload identity, enforce phishing-resistant auth, and pin token issuers. Cocoon was partway through that migration when the demo deadline forced a triage: the Foundry path is compliant, the rest is not. The next owner inherits this as the highest-priority security debt for the platform.

**Compliant today**

- **ML service → Azure AI Foundry** and **Ingestion Job → Foundry**: system-assigned managed identity with the cross-subscription `Azure AI Developer` role grant via `infra/modules/foundry-rbac.bicep`. No API key in transit or at rest.

**Not yet compliant**

| Surface | Current state (verified 2026-05-12) | Why it blocks SFI | Migration path |
|---------|--------------------------------------|-------------------|----------------|
| Backend ↔ PostgreSQL | Shared password from `POSTGRES_PASSWORD` env var; container Postgres in the demo, and the alternate `infra/modules/postgresql-flexible.bicep` module still uses `administratorLoginPassword` | Static secret with no rotation, no audit trail, no per-user identity | Re-deploy via `postgresql-flexible.bicep` on a non-student subscription, then extend that module to enable Entra ID auth (`authConfig.activeDirectoryAuth = Enabled`); update `backend/database.py` to acquire access tokens via `DefaultAzureCredential` (asyncpg supports a token-as-password handshake against Flexible Server). Backend already reads `DATABASE_URL` so the connection-string format is the only public contract change. |
| Backend / ML ↔ Neo4j | Shared password from `NEO4J_PASSWORD` env var on Neo4j 5 **Community** | Community edition does not support OIDC bolt auth; only basic and Kerberos | Largest open work item. Two viable paths: (a) migrate to Neo4j **AuraDB**, which supports OIDC bolt against Entra; (b) front the self-hosted instance with an auth-aware proxy that exchanges Entra tokens for short-lived bolt creds. Both require code changes in `ml/sow_kg/db.py` and `backend/main.py` Neo4j-driver init. |
| Container Apps → ACR | `adminUserEnabled: true` in `infra/modules/container-registry.bicep:22`; the password is injected as a `registry-password` secret reference into every Container App and the Ingestion Job (see `infra/modules/ingestion-job.bicep:97-100`) | The admin user is a long-lived super-credential and a username/password pull is not workload-identity auth | Disable ACR admin user; assign each Container App's and the Ingestion Job's system MI the `AcrPull` role on the registry; remove the `registry-password` secret refs and the `registries[*].username/passwordSecretRef` blocks from `infra/modules/*.bicep`. Container Apps will then pull with the MI automatically. |
| Backend JWT validation | `verify_iss: False` at `backend/auth.py:122`, commented `"/common tokens have varying issuers"` | Backend accepts tokens from any Entra tenant; an attacker-controlled tenant could mint a token that the backend trusts | Commit to single-tenant or allow-listed multi-tenant operation, then flip `verify_iss` to `True` and pass `issuer=` (string or list) so the JWT library pins the allowed tenant issuer(s). Same audit-pinning pattern as the `verify_aud` line directly above it. |
| Secrets at rest in env | `POSTGRES_PASSWORD` and `NEO4J_PASSWORD` flow as plain `azd env set --secret` values that land in the Container App's environment block | Plain-text secret material in env, no rotation hook, no Key Vault audit trail | After the Postgres and Neo4j migrations above both env vars disappear. Until then, route them through Key Vault references — `Microsoft.App/containerApps` supports `secrets[*].keyVaultUrl` natively — instead of inlining the value in the deployment parameters. |

A full SFI gap audit was attempted as part of COC-118 (Sprint 6) but the audit document was never committed to the repo. The table above is reconstructed from `infra/modules/*`, `backend/auth.py`, and `backend/config.py`; treat it as the working source of truth until a fresh audit replaces it.

## 11. Production deployment

### One-shot deployment (clean slate)

```bash
# 1. Sign in and target the right subscription
az login
az account set --subscription <subscription-id>

# 2. Configure azd environment
azd env new <env-name>             # e.g. cocoon-prod
azd env set AZURE_LOCATION eastus2
azd env set AZURE_TENANT_ID <tenant-guid>
# Set Postgres + Neo4j passwords as azd secrets, not env vars:
azd env set --secret POSTGRES_PASSWORD <pw>
azd env set --secret NEO4J_PASSWORD   <pw>

# 3. Provision + deploy
azd up
```

The `azd up` action does Bicep provision + container build + container push + Container App update. Estimated wall-clock time: 15-20 minutes for a clean deployment.

### What gets provisioned

| Bicep module | What it creates |
|--------------|-----------------|
| `container-apps-environment` | Container Apps environment + workload profiles |
| `log-analytics` | Workspace at 30-day retention, `PerGB2018` SKU |
| `container-registry` | ACR with admin user enabled |
| `postgres-container` | Postgres 16 Container App with ephemeral storage. Used because Azure for Students restricts Flexible Server |
| `neo4j-container` | Neo4j 5 community Container App |
| `container-app` (generic) | Backend + frontend services |
| `ml-container` | ML service with system-assigned MI and `external: false` ingress |
| `ingestion-job` | Container Apps Job for one-shot Neo4j seeding |
| `foundry-rbac` | Cross-subscription `Azure AI Developer` role assignment for the ML and Job MIs |

### Triggering the ingestion Job

The Job is manual-trigger only. Run it after deployment to populate Neo4j from the reference corpus, and any time `Data/sow-md/`, `Data/SOW Guides MD/`, or `Data/rules/` changes.

```bash
# Start the Job
az containerapp job start \
  --name <job-name> \
  --resource-group <rg>

# Watch execution
az containerapp job execution list \
  --name <job-name> \
  --resource-group <rg> \
  --output table

# Stream logs
az containerapp job logs show \
  --name <job-name> \
  --resource-group <rg> \
  --container <container-name>
```

End-to-end runtime is ~42 minutes against the seven Contoso reference SoWs. The Job runs `uv run python main_new.py ingest && uv run python main_new.py enrich --batch-size 64`, scales to zero between invocations, and uses `replicaTimeout: 3600s`.

### Manual GitHub Actions deploy

`azure-deploy.yml` exposes `azd up`, `azd deploy`, and `azd provision` as `workflow_dispatch` actions using OIDC federated credentials. Run from the Actions tab when you don't want to deploy from a local machine. Same secrets list as §9.

### Cost management

Demo cadence is `azd up` before a demo, `azd down` after. The `azure-teardown.yml` workflow wraps `azd down` for cleanup.

## 12. Operations playbook

### Health probes

- `GET /health` on the backend: probes Neo4j + Postgres connectivity. Returns JSON.
- `GET /status/health` on the backend: richer JSON with per-service status and timing.
- `GET /status` on the backend: HTML dashboard with five-second auto-refresh. Use this during demo runs.
- `GET /health` on the ML service: Neo4j connectivity + embedding model loaded.

### Logs

Container Apps stdout and stderr stream to the Log Analytics workspace. Three ways to read:

```bash
# Live tail
az containerapp logs show --name <app> --resource-group <rg> --follow

# Query via KQL in the portal
# Logs -> ContainerAppConsoleLogs_CL

# az monitor
az monitor log-analytics query \
  --workspace <workspace-id> \
  --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == '<app>' | take 100"
```

### What is not wired (yet)

- **Application Insights**: not configured. Add the SDK to the backend and ML service if you want per-request telemetry.
- **Alert rules**: none. Log Analytics receives logs but does not page.
- **SLOs**: none defined.
- **AI-degradation alerting**: no signal on Foundry rate-limit responses or Neo4j vector-index drift.

Each is named in §13 (Known limitations) and the project paper's §9.3 (Remaining engineering work).

### Restart and revision rollback

Container Apps revision-level rollback works through the platform without code changes:

```bash
# List revisions
az containerapp revision list --name <app> --resource-group <rg> --output table

# Activate a previous revision
az containerapp revision activate \
  --name <app> \
  --resource-group <rg> \
  --revision <revision-name>
```

A known incident during deploy verification: a Postgres password drift required a container revision restart that re-ran `initdb` and lost ephemeral data. Procedure for that case: `azd env set --secret POSTGRES_PASSWORD <new>`, redeploy postgres, accept data loss until a managed PostgreSQL migration lands.

## 13. Known limitations and operational notes

The following are intentional or known-limitation states at handoff. Each has rationale and either a workaround or a migration path.

| Limitation | Rationale | Migration path |
|------------|-----------|----------------|
| Group auto-enrollment disabled (PR #36) | `GroupMember.Read.All` Graph scope requires admin consent that Azure-for-Students cannot grant | Four-step checklist in `backend/routers/sow_roles.py` after the platform moves to a tenant where consent is obtainable |
| PostgreSQL ephemeral storage | Azure-for-Students restricts Flexible Server | Switch `infra/main.bicep` to `postgresql-flexible.bicep` (already authored) on a non-student subscription. Small code lift; backend already reads `DATABASE_URL` |
| Shared-secret auth for Postgres, Neo4j, ACR pulls | SFI migration is staged; only ML→Foundry was prioritized for the demo | Workload-identity federated credentials for Postgres + Neo4j + ACR |
| `verify_iss` disabled in backend JWT path | `/common` issues per-tenant issuers; demo accepts any tenant | Production must commit to single-tenant or allow-listed multi-tenant and enable issuer validation |
| Application Insights / alerting / SLO not wired | Out of scope for demo timeline | Wire `applicationinsights-async` SDK in both FastAPI apps; set up Log Analytics alert rules |
| KG generation evaluation is manual | No labeled ground truth; corpus is small | Build a probe-query harness once a real deal-book corpus is available (project paper §9.3.7) |
| Engagement-risk tier is a deterministic rule, not learned | No labeled review outcomes to train on | Replace `backend/utils/esap.py` thresholds with a learned classifier once a deal-book corpus exists. Keep the rule as an auditable baseline |
| Synthetic data generator emits tabular CSV, not synthetic SoWs | Out of scope for capstone; needs Microsoft project history | `ml/kg_data_gen/run.py` produces deal_overview, status_report, etc. for `NUM_PROJECTS` engagements. Real Microsoft project history ingestion is the highest-leverage future-work item (project paper §9.3.6) |
| `KNOWN_LABELS` allowlist | Cypher injection guard for dynamic labels | Module-level set in `ml/sow_kg/schema_evolution.py:15-42`. Extending the schema means adding a label to the set. Includes the five PR #34 deal-context labels (`DealContext`, `Customer`, `Industry`, `StaffingRole`, `StatusSnapshot`) |
| `backend/routers/permissions.py` is unmounted | Access-control helper module (`require_review_access`, `require_sow_status`) that lives under `routers/` but is not registered in `main.py` and has no callers. Vestigial from an earlier refactor — the "16 routers" count is unaffected because this file is not a router | Move to `backend/utils/` or delete during the next cleanup pass. Not load-bearing today |
| `ml/sow_kg/assist_router.py` is unmounted | Defines a `/api/assist` FastAPI router but `ml/api.py` does not include it. Routes are reachable today through `app.post("/assist")` in `ml/api.py` instead | Either mount the router in `api.py` and remove the duplicate handler, or delete `assist_router.py`. Not load-bearing today |

## 14. API surface

The backend's 16 routers and the ML service's 6 deal-context routes plus its native `/context`, `/assist`, `/sows/*`, `/approval`, `/schema/proposals*` endpoints together expose ~144 declared HTTP routes (118 backend, 26 ML, recounted 2026-05-12 after PR #39 added risk-framework and SoW-ingest endpoints). The OpenAPI specs are the source of truth.

### Live API docs

| Surface | Swagger | ReDoc | OpenAPI JSON |
|---------|---------|-------|--------------|
| Backend (port 8000) | `/docs` | `/redoc` | `/openapi.json` |
| ML service (port 8001) | `/docs` | `/redoc` | `/openapi.json` |

### Backend router quick reference

| Router | Mount prefix | Purpose |
|--------|--------------|---------|
| `auth` | `/api/auth` | MSAL login state, `/me` profile |
| `sow` | `/api/sow` | SoW CRUD, status transitions, AI analysis trigger, methodology templates, upload |
| `sow_comments` | `/api/sow/{id}/comments` | Threaded comment discussions with suggested edits |
| `sow_extraction` | `/api/sow` | DOCX and PDF document extraction |
| `sow_roles` | `/api/sow` | Per-SoW role assignments and collaborator management |
| `review` | `/api/review` | Review submission, role-scoped checklists, stage advancement |
| `finalize` | `/api/finalize` | DOCX handoff package, post-approval state |
| `rules` | `/api/rules` | Read-only rule metadata; plus `GET /risk-framework` (6 categories + 5×5 matrix + mitigation playbooks) and `GET /risk-summary` (portfolio aggregation across the caller's SoWs, capped at 200 most-recent rows) |
| `workflow` | `/api/workflow` | Workflow template CRUD, per-SoW workflow snapshotting, transitions |
| `coa` | `/api/coa` | Conditions of Approval lifecycle |
| `attachments` | `/api/attachments` | Attachment upload, listing, retrieval, stage-typed binding |
| `ai` | `/api/ai` | AI proxy: similar-SoW, risk extraction, validation, approval routing |
| `audit` | `/api/audit` | Unified audit timeline |
| `users` | `/api/users` | User profile, presence, `/me/groups` Graph proxy |
| `roles` | `/api/roles` | System-wide role definitions |
| `status` | (none) | `/status` HTML dashboard, `/status/health` JSON |

### ML service quick reference

| Endpoint | Purpose |
|----------|---------|
| `GET /context` | Graph-RAG retrieval (sections, rules, banned phrases, risks, deliverables, similar SoWs) |
| `POST /assist` | Retrieval + Foundry LLM generation |
| `POST /assist/checklist` | Per-checklist-item assist |
| `POST /extract/sow-fields` | LLM-driven SoW field extraction |
| `GET /sows`, `GET /sows/{id}/{validate,risks,similar}` | SoW-level queries against the KG; `/risks` now returns `category_breakdown` and `overall_risk_score` for client-side aggregation (PR #39) |
| `POST /sows/ingest`, `POST /sows/{id}/reingest`, `DELETE /sows/{id}` | SoW ingest, reingest, and delete via the runtime API (added in PR #39 for the graph-view refresh) |
| `GET /approval` | Engagement-tier routing from `EsapLevel`/`ApprovalStage` nodes |
| `GET /schema/proposals`, `POST /schema/proposals/{id}/{approve,reject}`, `POST /schema/proposals/bulk-review` | Schema-proposal lifecycle |
| `GET /api/deals/{summary,{id},{id}/similar,{id}/risk-profile,compliance/patterns}`, `POST /api/deals/link` | Deal-context analytics |
| `GET /graph/summary` | Graph stats |
| `GET /health` | Liveness probe |

## 15. Testing

```bash
# Backend unit + smoke tests (mocked, no DB required)
cd backend
uv pip install -r requirements.txt
uv run pytest -m "not integration" -v

# ML module unit tests (from repo root)
uv run pytest tests/unit/ -v
```

Current baseline (re-run 2026-05-12 after PR #39): **301 backend unit tests pass, 2 skipped, 6 failed** + **131 ML unit tests pass**. PR #39 added ~50 risk-scorer tests (`tests/unit/test_risk_scorer.py`) and ~59 DOCX-renderer tests (`tests/unit/test_docx_renderer.py`) to the backend baseline. The six backend failures are pre-existing and unrelated to feature code:

- `tests/unit/test_document_text.py::TestExtractTextPdf::test_joins_page_text` — `pypdf` missing in the dev venv
- `tests/test_api.py::TestUpdateSowStatus::test_valid_status` and `::test_invalid_status_returns_400` — async-mock incompatibility with the asyncpg connection-acquire flow
- `tests/unit/test_auth.py::TestUserUpsert::test_first_login_creates_user` and `::test_second_login_returns_existing_user` — `Header.strip` AttributeError against the current `Header` API
- `tests/test_schema_proposals.py::TestRoleOverrideHeader::test_admin_override_swaps_role_to_system_admin` — same header-handling root cause

The new team can address them at their discretion.

CI runs lint, pre-commit hooks, backend pytest, and ML pytest on every push and PR to `main` (`.github/workflows/CICD_Workflow.yml`). The integration marker is reserved for future DB-backed tests; no integration suite exists today.

The front end does not have a test runner.

End-to-end functional coverage is demonstrated through internal walkthroughs in which team members exercise each role against the deployed environment across the four supported methodologies. No automated browser-driven suite. Project paper §8.1 documents this explicitly.

## 16. Code conventions

`CLAUDE.md` is the canonical conventions document. Read it before contributing. Highlights:

- Backend env vars use `os.getenv()` with defaults in `config.py`. Never `os.environ[]`.
- Neo4j labels and relationship types in dynamic Cypher are validated via regex in `validators.py` (backend) or the local `_safe_label` helpers (ml) to prevent Cypher injection.
- Pure functions go in `validators.py` or `status_utils.py` and are tested without mocks.
- Pytest markers: `integration` reserves for tests that require a live DB; the default CI run is `pytest -m "not integration"`.
- One concrete claim per sentence in user-facing prose. No em dashes (used in code review and documentation outputs).

## 17. Git workflow

- Feature work on its own branch named `feature/<jira-key>-<short>` or `hotfix/<short>`.
- One PR per branch. Don't push to `main` directly except for documentation-only changes (this README).
- PRs trigger CI (`CICD_Workflow.yml`). Merge only after green.
- Pre-commit hooks (`ruff`, `ruff-format`, `prettier`, trailing whitespace, JSON/YAML checks) run on every commit. Re-stage auto-fixed files and commit again. **Do not use `--no-verify`.**
- Commit messages: imperative subject + a body explaining why. No `Co-Authored-By: Claude` trailers.
- Recent merged PRs at handoff: #33 (eval system), #34 (Deal context data layer), #35 (Entra ID picker), #36 (group picker hotfix + sync disable), #37 (schema-evolution promotion bug fixes), #38 (deal-context wiring), #39 (Risk-assessment framework + DOCX renderer extraction + proposals graph view refresh).

## 18. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker compose up` immediately exits | Docker Desktop not running | Start Docker Desktop and wait for the whale icon to settle |
| Port 3000 / 8000 / 5432 / 7474 / 7687 already in use | Another local process is bound to the port | `docker compose down`, or stop the conflicting process. Common culprits: old `next dev`, local Postgres install |
| `/health` returns `neo4j: error` or `postgres: error` | Containers still warming up; healthchecks haven't passed yet | Wait ~30 s, retry. If it persists, `docker compose logs neo4j` / `docker compose logs postgres` |
| Backend crashes on startup with `AZURE_AD_CLIENT_ID is required` | Missing `.env` value | Populate `.env`. For pure local dev set `ENV=development` to keep the empty value (auth will reject all tokens but the app boots) |
| AI/RAG endpoints 500 with `RuntimeError: AZURE_OPENAI_ENDPOINT must be set` | ML service can't reach Foundry | Set `AZURE_OPENAI_ENDPOINT` in `ml/.env` and `az login` |
| AI calls 401/403 from Foundry | User principal lacks **Azure AI Developer** on `Foundry-SOW` | Assign the role on the Foundry resource (cross-sub RBAC via `infra/modules/foundry-rbac.bicep`) |
| Group picker on `/create-new` stays empty | The Graph token isn't reaching the proxy, or `User.Read` isn't granted | Open browser devtools; confirm `/api/users/me/groups` returns 200 with a non-empty `groups` array. If 401, the user hasn't consented to `User.Read` yet |
| Submit with a group selected shows `console.info: auto-enrollment is disabled` | This is intentional; see §13 Known limitations | Add collaborators individually through the existing add-collaborator UI |
| Frontend renders but every API call fails CORS | Backend is configured for `allow_origins=["*"]` in dev; check `NEXT_PUBLIC_API_URL` | Confirm both services are pointed at the same host |
| `pre-commit` not found after `uv tool install` | uv shim isn't on PATH | `uv tool update-shell` and restart the terminal |
| `git commit` blocked by ruff/prettier | Formatter wants to apply fixes | The hook auto-fixes — `git add .` and re-commit |
| Schema looks out of date after pulling new branch | Tables auto-create at startup with `IF NOT EXISTS`; column changes don't apply | `docker compose down -v && docker compose up -d --build` to reset (loses data) |
| Ingestion Job runs but `/context` returns empty | Embeddings not written, or vector indexes drifted | Check Job execution logs; the enrich phase should report `540 embeddings written` against the seven reference SoWs. Re-run `enrich --force` if stale |
| `python main.py deal-risk --project-id <id>` returns empty | DealContext nodes not yet ingested | Run `python main.py ingest-deals --data-dir Data` first |

## 19. Sprint schedule (historical)

- **Sprint 1 (Feb 17 – Mar 3 2026):** Environment setup, repo skeleton, architecture
- **Sprint 2 (Mar 3 – Mar 17):** Frontend skeleton, vector embeddings, ML unit tests, KG seeding
- **Sprint 3 (Mar 17 – Mar 31):** Entra ID auth, frontend UX polish, CSV utilities, async ingestion, AI review recommendations
- **Sprint 4 (Mar 31 – Apr 14):** Workflow flexibility, KG-LLM integration, RAG API
- **Sprint 5 (Apr 14 – Apr 21):** Async ingestion productionization, AI service prep
- **Sprint 6 (Apr 21 – Apr 30):** Frontend AI integration, schema-proposal dashboard, comment threads, suggestion edits, roles + permissions, Microsoft default workflow template, COC-118 managed identity migration to Azure Container Apps
- **Demo prep (May 1 – May 13):** Soak, schema-evolution and deal-context PR landings (#33-#38), risk-assessment framework + DOCX renderer extraction + proposals graph refresh (#39), Entra group picker hotfix, documentation pass
- **Final Demo:** May 14, 2026, 4:30 PM – 6:30 PM
- **Handoff:** After demo, to Microsoft Consulting

## 20. Contact and handoff

For operational handover questions during transition: contact Samuel Fries (Product Owner) or Zhan Su (Infrastructure). Faculty advisor: Prof. Kirk Carver. Microsoft mentor: Shyam.

The detailed project report and the architectural rationale for non-obvious decisions live in the final report (`Cocoon Final Report.docx`, delivered separately). This README is the operational document; the report is the strategic one.

For day-zero operational issues post-handoff, the team's commit history (`git log --since="2026-02-01"`) is the authoritative narrative of what was built and why. PRs #33 through #38 in particular document the late-cycle decisions on schema evolution, deal context, and the Entra group flow.
