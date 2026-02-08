# Cocoon - Microsoft SoW Automation Project

AI-enabled Statement of Work review system using GraphRAG and ML classification, built for Microsoft Consulting Services.

## Team

| Name | Roles |
|------|-------|
| Samuel Fries | Product Owner, Tech Lead, Software Engineer |
| Zhan Su | Infrastructure Engineer, QA Engineer, Software Engineer |
| Eugene Pak | DevOps, Security Engineer, Software Engineer |
| Nate Dorsey | Scrum Master, AI/ML Engineer |
| Jayden Ferguson | AI/ML Engineer, Data Engineer |
| Phuong Thai | AI/ML Engineer, Data Engineer |

## Tech Stack

- **Frontend:** Next.js
- **Backend:** Python / FastAPI
- **Graph Database:** Neo4j (GraphRAG, knowledge graph)
- **Relational Database:** PostgreSQL (SoW documents, review data)
- **AI/ML:** Azure AI Foundry
- **Package Manager:** uv (Python), npm (Node.js)
- **Backlog:** [Jira](https://samueltfries.atlassian.net/jira/software/projects/SCRUM/summary)

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (required)
- [Git](https://git-scm.com/downloads) (required)
- [Python 3.12+](https://www.python.org/downloads/) (for local tooling)

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

## Project Structure

```
Capstone-Microsoft-SoW/
├── backend/                  # Python/FastAPI API
│   ├── Dockerfile
│   ├── main.py               # API routes and database connections
│   ├── requirements.txt      # Python dependencies
│   └── pyproject.toml
├── frontend/                 # Next.js UI
│   ├── Dockerfile
│   ├── package.json
│   └── pages/
├── infrastructure/
│   └── postgres/init/        # SQL init scripts (auto-run on first start)
├── docs/                     # Documentation
├── tests/                    # Test suites
├── docker-compose.yml        # Container orchestration
├── .env.example              # Environment template
├── ruff.toml                 # Python linting config
├── .pre-commit-config.yaml   # Git hook config
├── .editorconfig             # Editor formatting config
├── .prettierrc               # JS/CSS formatting config
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (Neo4j + PostgreSQL status) |
| GET | `/api/sow` | List all SoW documents |
| POST | `/api/sow` | Create a new SoW document |
| GET | `/api/sow/{id}` | Get a single SoW document |
| DELETE | `/api/sow/{id}` | Delete a SoW document |
| GET | `/api/graph/stats` | Neo4j graph statistics |
| POST | `/api/graph/sow-knowledge` | Add entities/relationships to graph |

## Sprint Schedule

- **Sprint 1:** Environment setup, architecture
- **Sprint 2–4:** Feature development
- **Final Demo:** May 14, 2026 4:30PM - 6:30PM
