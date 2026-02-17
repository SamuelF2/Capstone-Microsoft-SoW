// =============================================================================
// Azure Container App (Reusable Module)
// =============================================================================
// Generic container app module used by both the FastAPI backend (api) and
// the Next.js frontend (web). Each service passes its own config.
//
// Resource allocation is set conservatively for student Azure credits:
//   - 0.25 vCPU / 0.5 Gi RAM per container
//   - Min 0 replicas (scale to zero when idle)
//   - Max 2 replicas (enough for demos)
// =============================================================================

param name string
param location string
param tags object = {}
param containerAppsEnvironmentId string
param containerRegistryName string

@description('Port the container listens on')
param targetPort int

@description('Whether this app is accessible from the internet')
param external bool = true

@description('Environment variables for the container')
param env array = []

@description('Secrets (passwords, API keys) injected at runtime')
param secrets array = []

// Look up the existing container registry to get credentials
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: containerRegistryName
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId

    configuration: {
      // Allow azd to push new images without changing this template
      activeRevisionsMode: 'Single'

      ingress: {
        external: external
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }

      // ACR credentials so Container Apps can pull images
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]

      // Combine ACR password secret with any app-specific secrets
      secrets: union(
        [
          {
            name: 'registry-password'
            value: containerRegistry.listCredentials().passwords[0].value
          }
        ],
        secrets
      )
    }

    template: {
      containers: [
        {
          // azd replaces this placeholder image on `azd deploy`
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          name: 'main'
          resources: {
            cpu: json('0.25')  // Quarter vCPU — plenty for demo workloads
            memory: '0.5Gi'
          }
          env: env
        }
      ]
      scale: {
        minReplicas: 0   // Scale to zero when idle (saves credits)
        maxReplicas: 2   // Enough for demo; increase if needed
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

output id string = containerApp.id
output name string = containerApp.name
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output uri string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
