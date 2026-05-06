// =============================================================================
// Azure Container App: Neo4j (Graph Database)
// =============================================================================
// Neo4j has no managed Azure service, so we run it as a container app.
//
// IMPORTANT LIMITATIONS:
//   - Container Apps have ephemeral storage by default. Data is lost on restart.
//   - For persistent Neo4j data, you would need Azure Files mounted as a volume.
//   - For the capstone demo this is acceptable — data can be re-seeded.
//   - If persistence is critical, enable the Azure Files volume (commented below).
//
// Neo4j is internal-only (not exposed to the internet). Only the api
// container can reach it via the internal Container Apps DNS.
//
// Ports:
//   - 7474: Neo4j Browser UI (HTTP)
//   - 7687: Bolt protocol (driver connections)
// =============================================================================

param name string
param location string
param tags object = {}
param containerAppsEnvironmentId string
param containerRegistryName string

@secure()
param neo4jPassword string

// Look up the existing container registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: containerRegistryName
}

resource neo4j 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: union(tags, { 'azd-service-name': 'neo4j' })
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId

    configuration: {
      activeRevisionsMode: 'Single'

      // Neo4j is internal-only — accessible by other containers in the env,
      // but NOT from the public internet
      ingress: {
        external: false
        targetPort: 7474
        transport: 'auto'
        allowInsecure: false
        // Expose Bolt port as additional TCP port
        additionalPortMappings: [
          {
            external: false
            targetPort: 7687
            exposedPort: 7687
          }
        ]
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
          // If using a custom Dockerfile.neo4j, azd pushes to ACR.
          // Otherwise, you can point directly to the Docker Hub image:
          //   image: 'neo4j:5-community'
          image: 'docker.io/library/neo4j:5-community'
          name: 'neo4j'
          resources: {
            cpu: json('0.5')   // Neo4j needs more resources than the app containers
            memory: '1Gi'
          }
          env: [
            {
              name: 'NEO4J_AUTH'
              value: 'neo4j/${neo4jPassword}'
            }
            {
              name: 'NEO4J_PLUGINS'
              value: '["apoc"]'
            }
            {
              name: 'NEO4J_apoc_export_file_enabled'
              value: 'true'
            }
            {
              name: 'NEO4J_apoc_import_file_enabled'
              value: 'true'
            }
            {
              name: 'NEO4J_apoc_import_file_use__neo4j__config'
              value: 'true'
            }
          ]

          // ---------------------------------------------------------------
          // OPTIONAL: Mount Azure Files for persistent Neo4j data.
          // Uncomment the volumeMounts below AND the volumes section
          // if you need data to survive container restarts.
          // ---------------------------------------------------------------
          // volumeMounts: [
          //   {
          //     volumeName: 'neo4j-data'
          //     mountPath: '/data'
          //   }
          // ]
        }
      ]

      // ---------------------------------------------------------------
      // OPTIONAL: Azure Files volume for persistence.
      // Requires creating an Azure Storage Account + File Share first.
      // ---------------------------------------------------------------
      // volumes: [
      //   {
      //     name: 'neo4j-data'
      //     storageType: 'AzureFile'
      //     storageName: '<your-storage-mount-name>'
      //   }
      // ]

      scale: {
        minReplicas: 1   // Neo4j must always be running (no scale-to-zero)
        maxReplicas: 1   // Single instance — Neo4j Community doesn't support clustering
      }
    }
  }
}

output id string = neo4j.id
output name string = neo4j.name
output fqdn string = neo4j.properties.configuration.ingress.fqdn
output principalId string = neo4j.identity.principalId
