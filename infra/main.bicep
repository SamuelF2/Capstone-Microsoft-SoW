// =============================================================================
// Cocoon – Main Infrastructure Template
// =============================================================================
// Provisions all Azure resources for the Cocoon SoW Automation system.
//
// Resources created:
//   - Azure Container Apps Environment (hosts all containers)
//   - Azure Container Registry (stores Docker images)
//   - Container App: api (FastAPI backend)
//   - Container App: web (Next.js frontend)
//   - Container App: neo4j (graph database)
//   - Container App: postgres (relational database)
//   - Log Analytics Workspace (monitoring/logging)
//
// NOTE: PostgreSQL runs as a container because Azure Database for PostgreSQL
// Flexible Server is restricted on Azure for Students subscriptions.
//
// Usage:
//   azd up              → provisions + deploys everything
//   azd provision       → provisions infrastructure only
//   azd deploy          → deploys containers only
//   azd down            → tears down everything (saves credits)
// =============================================================================

targetScope = 'subscription'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@minLength(1)
@maxLength(64)
@description('Name of the environment (e.g., dev, staging, prod)')
param environmentName string

@minLength(1)
@description('Azure region for all resources')
param location string

@description('PostgreSQL username')
param postgresUser string = 'cocoon'

@secure()
@description('PostgreSQL password')
param postgresPassword string

@secure()
@description('Neo4j password')
param neo4jPassword string

@description('PostgreSQL database name')
param postgresDbName string = 'cocoon'

@secure()
@description('Azure AI Foundry endpoint URL (optional)')
param azureAiEndpoint string = ''

@secure()
@description('Azure AI Foundry API key (optional)')
param azureAiKey string = ''

@description('Microsoft Entra ID Application (Client) ID')
param azureAdClientId string = ''

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))

var tags = {
  'azd-env-name': environmentName
  project: 'cocoon'
  team: 'baylor-capstone'
}

var abbrs = loadJsonContent('./abbreviations.json')
var resourceGroupName = '${abbrs.resourcesResourceGroups}${environmentName}'

// ---------------------------------------------------------------------------
// Resource Group
// ---------------------------------------------------------------------------

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// ---------------------------------------------------------------------------
// Monitoring – Log Analytics Workspace
// ---------------------------------------------------------------------------

module logAnalytics 'modules/log-analytics.bicep' = {
  name: 'log-analytics'
  scope: rg
  params: {
    name: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    location: location
    tags: tags
  }
}

// ---------------------------------------------------------------------------
// Container Registry (ACR)
// ---------------------------------------------------------------------------

module containerRegistry 'modules/container-registry.bicep' = {
  name: 'container-registry'
  scope: rg
  params: {
    name: '${abbrs.containerRegistryRegistries}${resourceToken}'
    location: location
    tags: tags
  }
}

// ---------------------------------------------------------------------------
// Container Apps Environment
// ---------------------------------------------------------------------------

module containerAppsEnv 'modules/container-apps-environment.bicep' = {
  name: 'container-apps-env'
  scope: rg
  params: {
    name: '${abbrs.appManagedEnvironments}${resourceToken}'
    location: location
    tags: tags
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
  }
}

// ---------------------------------------------------------------------------
// Container App: PostgreSQL (Relational Database)
// ---------------------------------------------------------------------------

module postgres 'modules/postgres-container.bicep' = {
  name: 'postgresql'
  scope: rg
  params: {
    name: '${abbrs.appContainerApps}postgres-${resourceToken}'
    location: location
    tags: tags
    containerAppsEnvironmentId: containerAppsEnv.outputs.id
    containerRegistryName: containerRegistry.outputs.name
    postgresPassword: postgresPassword
    postgresDbName: postgresDbName
    postgresUser: postgresUser
  }
}

// ---------------------------------------------------------------------------
// Container App: Neo4j (Graph Database)
// ---------------------------------------------------------------------------

module neo4j 'modules/neo4j-container.bicep' = {
  name: 'neo4j'
  scope: rg
  params: {
    name: '${abbrs.appContainerApps}neo4j-${resourceToken}'
    location: location
    tags: tags
    containerAppsEnvironmentId: containerAppsEnv.outputs.id
    containerRegistryName: containerRegistry.outputs.name
    neo4jPassword: neo4jPassword
  }
}

// ---------------------------------------------------------------------------
// Container App: API (FastAPI Backend)
// ---------------------------------------------------------------------------

module api 'modules/container-app.bicep' = {
  name: 'api'
  scope: rg
  params: {
    name: '${abbrs.appContainerApps}api-${resourceToken}'
    location: location
    tags: union(tags, { 'azd-service-name': 'api' })
    containerAppsEnvironmentId: containerAppsEnv.outputs.id
    containerRegistryName: containerRegistry.outputs.name
    targetPort: 8000
    external: true
    env: [
      { name: 'ENV', value: 'production' }
      { name: 'NEO4J_URI', value: 'bolt://${neo4j.outputs.name}:7687' }
      { name: 'NEO4J_USER', value: 'neo4j' }
      { name: 'NEO4J_PASSWORD', secretRef: 'neo4j-password' }
      { name: 'POSTGRES_HOST', value: postgres.outputs.name }
      { name: 'POSTGRES_PORT', value: '5432' }
      { name: 'POSTGRES_DB', value: postgresDbName }
      { name: 'POSTGRES_USER', value: postgresUser }
      { name: 'POSTGRES_PASSWORD', secretRef: 'postgres-password' }
      { name: 'AZURE_AI_ENDPOINT', secretRef: 'azure-ai-endpoint' }
      { name: 'AZURE_AI_KEY', secretRef: 'azure-ai-key' }
      { name: 'AZURE_AD_CLIENT_ID', value: azureAdClientId }
    ]
    secrets: [
      { name: 'neo4j-password', value: neo4jPassword }
      { name: 'postgres-password', value: postgresPassword }
      { name: 'azure-ai-endpoint', value: empty(azureAiEndpoint) ? 'not-set' : azureAiEndpoint }
      { name: 'azure-ai-key', value: empty(azureAiKey) ? 'not-set' : azureAiKey }
    ]
  }
}

// ---------------------------------------------------------------------------
// Container App: Web (Next.js Frontend)
// ---------------------------------------------------------------------------

module web 'modules/container-app.bicep' = {
  name: 'web'
  scope: rg
  params: {
    name: '${abbrs.appContainerApps}web-${resourceToken}'
    location: location
    tags: union(tags, { 'azd-service-name': 'web' })
    containerAppsEnvironmentId: containerAppsEnv.outputs.id
    containerRegistryName: containerRegistry.outputs.name
    targetPort: 3000
    external: true
    env: [
      { name: 'NEXT_PUBLIC_API_URL', value: 'https://${api.outputs.fqdn}' }
      { name: 'NEXT_PUBLIC_AZURE_CLIENT_ID', value: azureAdClientId }
    ]
    secrets: []
  }
}

// ---------------------------------------------------------------------------
// Outputs (used by azd and GitHub Actions)
// ---------------------------------------------------------------------------

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = containerRegistry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = containerRegistry.outputs.name
output AZURE_CONTAINER_APPS_ENVIRONMENT_ID string = containerAppsEnv.outputs.id
output API_URL string = 'https://${api.outputs.fqdn}'
output WEB_URL string = 'https://${web.outputs.fqdn}'
output NEO4J_FQDN string = neo4j.outputs.fqdn
output POSTGRES_FQDN string = postgres.outputs.fqdn
output AZURE_RESOURCE_GROUP string = rg.name

// Managed identity principal IDs for downstream RBAC role assignments (COC-118)
output apiPrincipalId string = api.outputs.principalId
output webPrincipalId string = web.outputs.principalId
output postgresPrincipalId string = postgres.outputs.principalId
output neo4jPrincipalId string = neo4j.outputs.principalId
