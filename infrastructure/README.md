# Infrastructure

**Owner:** Zhan Su

## Status

Pending decisions:
- [ ] Database choice (ArangoDB vs Neo4j + PostgreSQL)
- [ ] Deployment approach (Azure Container Apps)
- [ ] CI/CD pipeline setup

## Files (to be added)

```
/infrastructure
├── docker-compose.yml      # Local development
├── docker-compose.test.yml # Testing
├── Dockerfile.backend      # Backend container
├── Dockerfile.frontend     # Frontend container
└── azure.yaml              # Azure deployment config
```

## Local Development

```bash
docker-compose up -d
```
