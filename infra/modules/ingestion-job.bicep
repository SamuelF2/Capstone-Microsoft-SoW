// =============================================================================
// Container Apps Job: Neo4j data seeding (ingest + enrich)
// =============================================================================
// Manually-triggered one-shot Job that:
//   1. Runs `python main_new.py ingest` — parses Data/sow-md/, Data/SOW Guides MD/,
//      Data/rules/*.json; calls Foundry (LLM) for classification + extraction;
//      writes :SOW / :Section / :Deliverable / :Risk / :ClauseType / :BannedPhrase
//      nodes into Neo4j.
//   2. Runs `python main_new.py enrich` — creates the `section_embeddings` vector
//      index (and four others) and populates 384-dim embeddings via
//      sentence-transformers/all-MiniLM-L6-v2 (local, no Foundry).
//
// Without this Job's output the GraphRAG /context endpoint returns 500 because
// `db.index.vector.queryNodes('section_embeddings', ...)` references an index
// that does not exist (see docs/audits/coc-118-step3-validation-v3-e2e.md).
//
// Trigger: `az containerapp job start --name <jobName> --resource-group rg-Capstone`
// Deliberately Manual (not Schedule / Event) — keeps `azd up` fast and avoids
// surprise Foundry token consumption.
//
// Auth model: SystemAssigned MI; Azure AI Developer on Foundry-SOW is granted
// via the parameterized infra/modules/foundry-rbac.bicep (this module's
// principalId is one of the entries in main.bicep's principalIds list).
// =============================================================================

@description('Job name (e.g. caj-ingest-<resourceToken>)')
param jobName string

@description('Location for the Job')
param location string

@description('Tags to apply')
param tags object = {}

@description('Container Apps Environment ID (must be the same env as the Neo4j Container App)')
param containerAppsEnvironmentId string

@description('Container Registry name (Job pulls its image from here)')
param containerRegistryName string

@description('Image reference for the ingestion job (set by azd via SERVICE_INGESTION_IMAGE_NAME, with a :latest fallback)')
param image string

@description('Neo4j Container App name — used to construct the internal Bolt URI bolt://<name>:7687')
param neo4jName string

@description('Neo4j password (stored as a Job secret, injected into the container as NEO4J_PASSWORD env)')
@secure()
param neo4jPassword string

@description('Foundry endpoint URL (full Foundry project path, e.g. https://foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW)')
param foundryEndpoint string

@description('Foundry deployment name (e.g. Kimi-K2.5)')
param foundryDeployment string

@description('Foundry API version (e.g. 2025-01-01-preview)')
param foundryApiVersion string

@description('Replica timeout in seconds. Default 1 hour — empirically ingest+enrich runs ~20-40 min over the full Data/ set; this gives generous headroom on Consumption (cheap since it scales to zero between runs).')
param replicaTimeoutSeconds int = 3600

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: containerRegistryName
}

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
  location: location
  // azd-service-name lets `azd deploy` know which build maps to this resource.
  tags: union(tags, { 'azd-service-name': 'ingestion' })
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: replicaTimeoutSeconds
      // Don't auto-retry — failures need investigation, not blind retry. The
      // CLI is idempotent (Cypher MERGE + IF NOT EXISTS on indexes) so an
      // operator can safely re-trigger by hand after fixing the underlying
      // issue.
      replicaRetryLimit: 1
      manualTriggerConfig: {
        replicaCompletionCount: 1
        parallelism: 1
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
        {
          name: 'neo4j-password'
          value: neo4jPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'ingest-and-enrich'
          image: image
          // Two phases in a single execution. `--no-cache` skips the
          // .ingest_cache.json sidecar write (which would fail on the read-only
          // image-baked Data/ dir anyway); MERGE-based ingest is idempotent so
          // this is safe across re-runs. `--workers 8` matches the CLI default.
          command: [
            '/bin/sh'
            '-c'
          ]
          args: [
            'uv run python main_new.py ingest --uri "bolt://${neo4jName}:7687" --user neo4j --password "$NEO4J_PASSWORD" --data-dir /app/Data --no-cache && uv run python main_new.py enrich --batch-size 64'
          ]
          resources: {
            // sentence-transformers all-MiniLM-L6-v2 + neo4j driver + parallel
            // Foundry calls — 1 vCPU / 2 GiB is a reasonable single-shot budget.
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            // ml/sow_kg/db.py reads NEO4J_URI / NEO4J_USER at module-import time
            // (not from the CLI --uri flag — main_new.py's Phase 0 schema-init and
            // enrich.py both call get_driver() which reads these env vars).
            // Without them, both fall back to localhost:7687 and the Job fails.
            {
              name: 'NEO4J_URI'
              value: 'bolt://${neo4jName}:7687'
            }
            {
              name: 'NEO4J_USER'
              value: 'neo4j'
            }
            {
              name: 'NEO4J_PASSWORD'
              secretRef: 'neo4j-password'
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: foundryEndpoint
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT'
              value: foundryDeployment
            }
            {
              name: 'AZURE_OPENAI_API_VERSION'
              value: foundryApiVersion
            }
          ]
        }
      ]
    }
  }
}

output principalId string = job.identity.principalId
output jobName string = job.name
output jobId string = job.id
