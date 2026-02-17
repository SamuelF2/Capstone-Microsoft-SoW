// =============================================================================
// Azure Container Apps Environment
// =============================================================================
// The shared environment that hosts all container apps. Provides:
//   - Internal DNS (containers can reach each other by name)
//   - Log routing to Log Analytics
//   - Shared networking
//
// All Cocoon container apps (api, web, neo4j) run inside this environment.
// =============================================================================

param name string
param location string
param tags object = {}
param logAnalyticsWorkspaceId string

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2023-09-01').customerId
        #disable-next-line use-resource-symbol-reference
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
      }
    }
    // Consumption-only workload profile — pay only for what you use
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

output id string = containerAppsEnvironment.id
output name string = containerAppsEnvironment.name
output defaultDomain string = containerAppsEnvironment.properties.defaultDomain
