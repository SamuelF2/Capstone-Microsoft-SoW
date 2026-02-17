// =============================================================================
// Azure Container App: PostgreSQL (Relational Database)
// =============================================================================
// Runs PostgreSQL as a container app since Azure Database for PostgreSQL
// Flexible Server is restricted on Azure for Students subscriptions.
//
// IMPORTANT: Container Apps have ephemeral storage by default.
// Data is lost on container restart. For the capstone demo this is
// acceptable — run init scripts to seed data on startup.
// For persistence, uncomment the Azure Files volume mount below.
//
// PostgreSQL is internal-only (not exposed to the internet).
// Only the api container can reach it via internal DNS.
//
// Port: 5432
// =============================================================================

param name string
param location string
param tags object = {}
param containerAppsEnvironmentId string
param containerRegistryName string

@secure()
param postgresPassword string

@description('PostgreSQL database name')
param postgresDbName string = 'cocoon'

@description('PostgreSQL username')
param postgresUser string = 'cocoon'

// Look up the existing container registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: containerRegistryName
}

resource postgres 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: union(tags, { 'azd-service-name': 'postgres' })
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId

    configuration: {
      activeRevisionsMode: 'Single'

      // PostgreSQL is internal-only — only other containers can reach it
      ingress: {
        external: false
        targetPort: 5432
        transport: 'tcp'
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
          name: 'postgres-password'
          value: postgresPassword
        }
      ]
    }

    template: {
      containers: [
        {
          image: 'docker.io/library/postgres:16-alpine'
          name: 'postgres'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'POSTGRES_DB'
              value: postgresDbName
            }
            {
              name: 'POSTGRES_USER'
              value: postgresUser
            }
            {
              name: 'POSTGRES_PASSWORD'
              secretRef: 'postgres-password'
            }
          ]

          // ---------------------------------------------------------------
          // OPTIONAL: Mount Azure Files for persistent PostgreSQL data.
          // Uncomment below AND the volumes section if persistence needed.
          // ---------------------------------------------------------------
          // volumeMounts: [
          //   {
          //     volumeName: 'postgres-data'
          //     mountPath: '/var/lib/postgresql/data'
          //   }
          // ]
        }
      ]

      // ---------------------------------------------------------------
      // OPTIONAL: Azure Files volume for persistence.
      // ---------------------------------------------------------------
      // volumes: [
      //   {
      //     name: 'postgres-data'
      //     storageType: 'AzureFile'
      //     storageName: '<your-storage-mount-name>'
      //   }
      // ]

      scale: {
        minReplicas: 1   // Must always be running
        maxReplicas: 1   // Single instance
      }
    }
  }
}

output id string = postgres.id
output name string = postgres.name
output fqdn string = postgres.properties.configuration.ingress.fqdn
