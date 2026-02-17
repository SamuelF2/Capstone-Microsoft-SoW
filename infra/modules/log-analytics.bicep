// =============================================================================
// Log Analytics Workspace
// =============================================================================
// Collects logs and metrics from Container Apps for monitoring and debugging.
// Retention set to 30 days to conserve costs on student Azure credits.
// =============================================================================

param name string
param location string
param tags object = {}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018' // Pay-per-GB, cheapest for low-volume student usage
    }
    retentionInDays: 30
  }
}

output id string = logAnalytics.id
output name string = logAnalytics.name
