# Cocoon - Microsoft SoW Automation Project

AI-enabled Statement of Work review system using GraphRAG and ML classification, built for Microsoft Consulting Services.

## Team

| Name | Roles |
|------|-------|
| Nate Dorsey | Scrum Master, AI/ML Engineer |
| Jayden Ferguson | AI/ML Engineer, Data Engineer |
| Samuel Fries | Product Owner, Tech Lead, Software Engineer |
| Eugene Pak | DevOps, Security Engineer, Software Engineer |
| Zhan Su | Infrastructure Engineer, QA Engineer, Software Engineer |
| Phuong Thai | AI/ML Engineer, Data Engineer |

## Tech Stack

- **Frontend:** Next.js 15, React, [reactflow](https://reactflow.dev/) (workflow visual editor + schema-proposal graph view)
- **Backend:** Python 3.13 / FastAPI (16 routers, ~118 endpoints)
- **Auth:** Microsoft Entra ID (RS256 JWT validation via JWKS); MSAL on the frontend
- **Graph Database:** Neo4j 5 (GraphRAG, knowledge graph)
- **Relational Database:** PostgreSQL 16 (SoW documents, review data, comment threads, workflow templates — 28 tables, schema bootstrapped at backend startup)
- **AI/ML:** Azure AI Foundry — `DefaultAzureCredential` (managed identity in production via system-assigned MI on the ML Container App; `az login` locally)
- **Local orchestration:** Docker Compose (backend, frontend, neo4j, postgres)
- **Production:** Azure Container Apps + Container Apps Job for ingestion; provisioned via Bicep, deployed via `azd`
- **Package Manager:** uv (Python), npm (Node.js)
- **Lint / format:** Ruff (Python), Prettier (JS/CSS/JSON), enforced via pre-commit + CI
- **Backlog:** [Jira](https://samueltfries.atlassian.net/jira/software/projects/SCRUM/summary)

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (required)
- [Git](https://git-scm.com/downloads) (required)
- [Python 3.13](https://www.python.org/downloads/) (for local backend / ML hot-reload + tests; pinned by CI)
- [Node.js 20](https://nodejs.org/) (for local frontend hot-reload; matches the production Dockerfile)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (only needed for AI features — see *Optional: Azure AI Foundry* below)

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/<org>/Capstone-Microsoft-SoW.git
cd Capstone-Microsoft-SoW

# 2. Copy the environment template and fill in credentials (get from Zhan)
cp .env.example .env

# 3. Build and start all services
docker compose up -d --build

# 4. Verify everything is running
docker compose ps
```

Once running, open http://localhost:8000/health in your browser. You should see:

```json
{
  "status": "healthy",
  "neo4j": "connected",
  "postgres": "connected"
}
```

## Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| Backend API | http://localhost:8000 | — |
| Frontend | http://localhost:3000 | — |
| Neo4j Browser | http://localhost:7474 | See `.env` |
| PostgreSQL | localhost:5432 | See `.env` |

> **Note:** Database credentials are not stored in the repo. Contact Zhan for the `.env` values.

### Optional: Azure AI Foundry (for AI features)

The AI/RAG endpoints (`/api/ai/*`, schema proposals, AI section assist) need access to the Azure AI Foundry resource. Locally, authentication uses `DefaultAzureCredential`:

```bash
# Install the Azure CLI, then sign in
az login

# Confirm you're on the right subscription
az account show
```

Your user principal must have the **Azure AI Developer** role on the `Foundry-SOW` resource (Pay-As-You-Go subscription, RG-SOW). Ask Zhan if you need it added.

If you skip this step the app still runs — `/health`, all SoW CRUD, review workflow, and the UI work fine. You'll only see errors when you trigger an AI feature.

## Developer Setup

After cloning, set up linting and pre-commit hooks so code stays consistent across the team:

```bash
# Install uv (fast Python package manager)
pip install uv

# Install pre-commit via uv
uv tool install pre-commit

# Windows (PowerShell) — add to PATH if prompted
$env:PATH = "$HOME\.local\bin;$env:PATH"
uv tool update-shell

# macOS/Linux — usually not needed, but if pre-commit isn't found:
export PATH="$HOME/.local/bin:$PATH"

# Install git hooks
pre-commit install
```

Pre-commit will now run automatically on every `git commit`, checking for trailing whitespace, valid YAML/JSON, Python lint (Ruff), and JS formatting (Prettier). If a check fails, it auto-fixes most issues — just `git add .` and commit again.

## Commit Workflow

When you run `git commit`, pre-commit hooks automatically run before the commit goes through. Here's what to expect:

1. Stage your changes: `git add .`
2. Commit: `git commit -m "your message"`
3. Pre-commit runs all checks — you'll see each one pass or fail in the terminal
4. If anything fails, the hooks auto-fix most issues (formatting, trailing whitespace, import sorting)
5. Re-stage the auto-fixed files: `git add .`
6. Commit again — it should pass clean this time
7. Push: `git push`

If you're using GitHub Desktop, the same hooks run when you click "Commit". If a commit is blocked, check the terminal for details.

**Important:** Never use `git commit --no-verify` to skip the hooks. They exist to keep the codebase consistent across the team.

## Common Commands

```bash
# Start all services
docker compose up -d

# Start with rebuild (after changing Dockerfiles or dependencies)
docker compose up -d --build

# Stop all services
docker compose down

# View logs (all services)
docker compose logs -f

# View logs (single service)
docker compose logs -f backend

# Reset databases (deletes all data)
docker compose down -v
docker compose up -d --build
```

## Local Development (hot reload)

`docker compose up` is fine for verifying the full stack, but for active development the hot-reload modes below are much faster — your edits show up without rebuilding the image.

### Backend (FastAPI)

Run Postgres + Neo4j in Docker, run the backend on the host:

```bash
# 1. Bring up just the databases
docker compose up -d postgres neo4j

# 2. In a new shell — install deps and run uvicorn with reload
cd backend
uv venv
uv pip install -r requirements.txt
# Point at the dockerized DBs:
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=$(grep NEO4J_PASSWORD ../.env | cut -d= -f2)
export DATABASE_URL=postgresql://cocoon:$(grep POSTGRES_PASSWORD ../.env | cut -d= -f2)@localhost:5432/cocoon
export AZURE_AD_CLIENT_ID=$(grep AZURE_AD_CLIENT_ID ../.env | cut -d= -f2)
uv run uvicorn main:app --reload --port 8000
```

Edits to `.py` files in `backend/` reload automatically.

### Frontend (Next.js)

Run the backend in Docker (or via the recipe above), then run Next dev on the host:

```bash
cd frontend
npm install
# Point at whichever backend you're running
export NEXT_PUBLIC_API_URL=http://localhost:8000
export NEXT_PUBLIC_AZURE_CLIENT_ID=<same-as-AZURE_AD_CLIENT_ID>
npm run dev
```

Frontend at http://localhost:3000 with hot module reload. Edits to `.js` files in `frontend/` re-render in the browser.

### ML service (FastAPI on port 8001)

The ML service is a separate FastAPI app that the backend proxies to for AI/RAG calls.

```bash
cd ml
cp .env.example .env             # then fill in AZURE_OPENAI_ENDPOINT / DEPLOYMENT
uv venv
uv pip install -e .
az login                         # required for DefaultAzureCredential
uv run uvicorn api:app --reload --port 8001
```

The backend hits ML via the `GRAPHRAG_API_URL` env var (defaults to `http://host.docker.internal:8001`).

### One-shot ML CLI tasks

```bash
cd ml
uv run python -m sow_kg.ingest_async <path>     # ingest a SOW (PDF/DOCX/MD)
uv run python -m kg_data_gen.run                # generate synthetic SOW PDFs
uv run python main.py --help                    # Click CLI for queries / KG ops
```

## Running Tests

```bash
# Backend unit + smoke tests (no DB required, all mocked)
cd backend
uv pip install -r requirements.txt
pytest -m "not integration" -v

# ML module unit tests (project root)
pytest tests/unit/ -v

# Frontend has no test runner yet
```

CI runs backend pytest and pre-commit on every push and PR (`.github/workflows/CICD_Workflow.yml`). If your branch's tests fail in CI, run them locally with the commands above and fix before pushing.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker compose up` immediately exits | Docker Desktop not running | Start Docker Desktop and wait for the whale icon to settle |
| Port 3000 / 8000 / 5432 / 7474 / 7687 already in use | Another local process is bound to the port | `docker compose down`, or stop the conflicting process. Common culprits: old `next dev`, local Postgres install. |
| `/health` returns `neo4j: error` or `postgres: error` | Containers still warming up; healthchecks haven't passed yet | Wait ~30 s, retry. If it persists, `docker compose logs neo4j` / `docker compose logs postgres` |
| Backend crashes on startup with `AZURE_AD_CLIENT_ID is required` | Missing `.env` value | Get a value from Zhan, populate `.env`. For pure local dev you can also set `ENV=development` to keep the empty value (auth will reject all tokens but the app boots) |
| AI/RAG endpoints 500 with `RuntimeError: AZURE_OPENAI_ENDPOINT must be set` | ML service can't reach Foundry | Set `AZURE_OPENAI_ENDPOINT` in `ml/.env` and run `az login` |
| AI calls 401/403 from Foundry | Your user principal doesn't have **Azure AI Developer** on `Foundry-SOW` | Ask Zhan to add you (cross-sub RBAC via `infra/modules/foundry-rbac.bicep`) |
| Frontend renders but every API call fails CORS | Backend is configured for `allow_origins=["*"]` in dev — should work; if not, check `NEXT_PUBLIC_API_URL` matches the backend you're running | Confirm both services are pointed at the same host |
| `pre-commit` not found after `uv tool install` | uv shim isn't on PATH | Run `uv tool update-shell` and restart the terminal |
| `git commit` blocked by ruff/prettier | Formatter wants to apply fixes | The hook auto-fixes — `git add .` and re-commit |
| Schema looks out of date after pulling new branch | Postgres tables auto-create at backend startup, but only `IF NOT EXISTS` — column changes don't apply | `docker compose down -v && docker compose up -d --build` to reset (loses data) |

## Project Structure

```
Capstone-Microsoft-SoW/
├── backend/                  Python/FastAPI API — auth, SoW CRUD, review workflow,
│                             comment threads, schema proposals, role-based access,
│                             AI proxy. 16 routers, schema bootstrapped at startup.
├── frontend/                 Next.js 15 UI — pages/, components/{ai-review,ai-assist,
│                             proposals,sow,workflow}, lib/hooks/, MSAL auth, reactflow
│                             workflow editor.
├── ml/                       FastAPI GraphRAG service (api.py on port 8001),
│                             sow_kg/ KG modules, kg_data_gen/ synthetic data,
│                             managed-identity Foundry auth (sow_kg/llm_client.py).
├── tests/                    ML module unit tests (pytest).
├── Data/                     Rules JSON + SoW markdown guides (workflow seeds,
│                             banned-phrase lists, methodology references).
├── infra/                    Azure Bicep IaC — main.bicep + modules/ (container-app,
│                             container-apps-environment, container-registry, log-analytics,
│                             ml-container, ingestion-job, foundry-rbac, neo4j-container,
│                             postgres-container, postgresql-flexible).
├── infrastructure/           Postgres init SQL (used by docker-compose volume mount;
│                             actual schema is created by backend/main.py on startup).
├── docs/                     Architecture notes, audits (auth-audit, COC-118 deploy
│                             verification, Foundry call-sites).
├── .github/workflows/        CICD_Workflow.yml (lint + test + docker build),
│                             azure-deploy.yml + azure-teardown.yml (manual workflow_dispatch).
├── docker-compose.yml        Local stack: backend, frontend, neo4j, postgres.
├── azure.yaml                azd service map for Azure deployment (api, web, ml, neo4j,
│                             postgres, ingestion).
├── Dockerfile.ingestion      Image used by the Container Apps Job that seeds Neo4j.
├── ruff.toml                 Python lint/format config.
├── .pre-commit-config.yaml   Git hook config (ruff + prettier + standard hooks).
├── CLAUDE.md                 Codebase conventions for AI assistants — read this if
│                             you're adding routers, validators, or tests.
└── README.md                 (this file)
```

Per-directory READMEs in `backend/`, `frontend/`, `ml/`, `infra/`, `tests/` go deeper where useful. `CLAUDE.md` documents backend conventions (env-var pattern, Cypher injection guards, where pure functions belong) and is the canonical reference for code style.

## API Documentation

FastAPI auto-generates OpenAPI docs for every router. Browse the live, always-current spec at:

| | Backend (port 8000) | ML service (port 8001) |
|---|---|---|
| Swagger UI | `/docs` | `/docs` |
| ReDoc | `/redoc` | `/redoc` |
| OpenAPI JSON | `/openapi.json` | `/openapi.json` |

Quick links:
- Local backend: http://localhost:8000/docs
- Local ML: http://localhost:8001/docs
- Health snapshot (HTML): http://localhost:8000/status

The ML service is internal-only in production (no public URL). For a non-interactive system snapshot — DB connectivity, Neo4j stats, registered routers — hit `GET /status/health` or load `GET /status` in a browser.

## Sprint Schedule

- **Sprint 1 (Feb 17 – Mar 3):** Environment setup, repo skeleton, architecture
- **Sprint 2 (Mar 3 – Mar 17):** Frontend skeleton, vector embeddings, ML unit tests, KG seeding
- **Sprint 3 (Mar 17 – Mar 31):** Entra ID auth, frontend UX polish, CSV utilities, async ingestion, AI review recommendations
- **Sprint 4 (Mar 31 – Apr 14):** Workflow flexibility, KG-LLM integration, RAG API
- **Sprint 5 (Apr 14 – Apr 21):** Async ingestion productionization, AI service prep
- **Sprint 6 (Apr 21 – Apr 30):** Frontend AI integration, schema-proposal dashboard, comment threads, suggestion edits, roles + permissions, Microsoft default workflow template, COC-118 managed identity migration to Azure Container Apps
- **Demo prep (May 1 – May 13):** Soak, smoke tests, handoff packet to Microsoft Consulting
- **Final Demo:** May 14, 2026 4:30 PM – 6:30 PM
