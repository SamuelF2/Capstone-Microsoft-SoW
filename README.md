# Cocoon - Microsoft SoW Automation Project

AI-enabled SOW review system using GraphRAG and ML classification.

## Team

| Name | Roles |
|------|-------|
| Samuel Fries | Product Owner, Tech Lead, Software Engineer |
| Zhan Su | Infrastructure Engineer, QA Engineer, Software Engineer |
| Eugene Pak | DevOps, Security Engineer, Software Engineer |
| Nate Dorsey | Scrum Master, AI/ML Engineer |
| Jayden Ferguson | AI/ML Engineer, Data Engineer |

## Tech Stack

- **Frontend:** TBD (React/Next.js or Gradio)
- **Backend:** Python/FastAPI
- **Database:** TBD (ArangoDB or Neo4j + PostgreSQL)
- **AI/ML:** Azure AI Foundry

## Quick Start

```bash
# Start services
docker-compose up -d

# Check status
docker-compose ps
```

## Project Structure

```
/cocoon-project
├── /backend          # Python/FastAPI API
├── /frontend         # UI
├── /infrastructure   # Docker, deployment configs
├── /tests            # Test suites
└── /docs             # Documentation
```

## Sprint Schedule

- Sprint 1: Environment setup, architecture
- Sprint 2-4: Feature development  
- Final Demo: May 14, 2026
