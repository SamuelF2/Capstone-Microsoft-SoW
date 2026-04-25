// =============================================================================
// Azure Container App: ML / GraphRAG Service
// =============================================================================
// FastAPI service backing the knowledge-graph retrieval + LLM authoring
// assistant. Internal-only — only other containers in the environment can
// reach it. The `api` Container App proxies requests here via GRAPHRAG_API_URL.
//
// Foundry auth: the system-assigned managed identity is granted
// `Azure AI Developer` on Foundry-SOW via the cross-sub `foundry-rbac` module
// invoked from main.bicep. The Python client constructs DefaultAzureCredential
// at runtime — no API key in the container.
//
// Port: 8001 (matches local docker-compose GRAPHRAG_API_URL default)
// =============================================================================

param name string
param location string
param tags object = {}
param containerAppsEnvironmentId string
param containerRegistryName string

@description('Azure OpenAI / Foundry endpoint URL')
param azureOpenAiEndpoint string

@description('Azure OpenAI deployment name')
param azureOpenAiDeployment string

@description('Azure OpenAI API version')
param azureOpenAiApiVersion string

@description('Bolt URI for the Neo4j container (e.g. bolt://<name>:7687)')
param neo4jUri string

@description('Neo4j username')
param neo4jUser string = 'neo4j'

@secure()
@description('Neo4j password')
param neo4jPassword string

// Look up the existing container registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: containerRegistryName
}

resource ml 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: union(tags, { 'azd-service-name': 'ml' })
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId

    configuration: {
      activeRevisionsMode: 'Single'

      // Internal-only — accessible by other containers in the environment,
      // NOT from the public internet
      ingress: {
        external: false
        targetPort: 8001
        transport: 'auto'
        allowInsecure: false
      }

      // ACR admin-user auth for now — step 5 of COC-118 migrates this to
      // the container app's managed identity via the AcrPull role.
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
          // azd replaces this placeholder image on `azd deploy`
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          name: 'main'
          resources: {
            // Embedding model + Neo4j driver warrant more than the generic app default
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAiDeployment }
            { name: 'AZURE_OPENAI_API_VERSION', value: azureOpenAiApiVersion }
            { name: 'NEO4J_URI', value: neo4jUri }
            { name: 'NEO4J_USER', value: neo4jUser }
            { name: 'NEO4J_PASSWORD', secretRef: 'neo4j-password' }
          ]
        }
      ]
      scale: {
        // Sentence-transformer model loads at startup; keep one warm replica
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output id string = ml.id
output name string = ml.name
output fqdn string = ml.properties.configuration.ingress.fqdn
output principalId string = ml.identity.principalId
