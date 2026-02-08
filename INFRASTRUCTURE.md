# Cocoon Infrastructure

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start all services
docker compose up -d

# 3. Wait ~30 seconds for ArangoDB to initialize, then verify
docker compose ps
curl http://localhost:8000/health
```

## Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | — |
| Backend API | http://localhost:8000 | — |
| API Docs (Swagger) | http://localhost:8000/docs | — |
| ArangoDB Web UI | http://localhost:8529 | root / cocoon_dev_2026 |

## Common Commands

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f              # all services
docker compose logs -f backend      # backend only

# Restart a service after code changes
docker compose restart backend

# Stop everything
docker compose down

# Stop and delete all data (fresh start)
docker compose down -v

# Rebuild after Dockerfile changes
docker compose up -d --build
```

## Project Structure

```
Capstone-Microsoft-SoW/
├── docker-compose.yml              # Orchestrates all containers
├── .env.example                    # Environment template
├── .env                            # Local env (not committed)
├── backend/
│   ├── Dockerfile                  # Python container with uv
│   ├── pyproject.toml              # Python deps (uv-managed)
│   ├── requirements.txt            # Fallback deps
│   ├── main.py                     # FastAPI application
│   └── db.py                       # ArangoDB connection
├── frontend/
│   ├── Dockerfile                  # Node container
│   ├── package.json                # Node deps
│   └── pages/
│       └── index.js                # Landing page
└── infrastructure/
    └── arangodb/
        └── init/
            └── 001_init_cocoon.js  # DB seed script
```

## Adding Python Dependencies

```bash
# Using uv (from inside the backend container)
docker compose exec backend uv add <package-name>

# Or edit pyproject.toml directly, then rebuild
docker compose up -d --build backend
```

## ArangoDB Notes

- **Web UI**: http://localhost:8529 → select `cocoon` database
- **AQL queries**: Use the web UI's query editor
- **Graph viewer**: Web UI → Graphs → `sow_graph`
- **Data persists** in the `arango_data` Docker volume
- **Fresh start**: `docker compose down -v` deletes all data

## Deployment Path

Local Docker → Azure Container Apps (future)

The same Docker images used locally will be pushed to Azure Container Registry
and deployed to Azure Container Apps when the team is ready.

---

**Owner**: Zhan Su (Infrastructure Engineer)
