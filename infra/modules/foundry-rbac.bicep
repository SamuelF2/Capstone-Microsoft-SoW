// =============================================================================
// Cross-subscription RBAC: Cocoon MIs → Azure AI Developer on Foundry
// =============================================================================
// The Foundry-SOW resource lives in a separate subscription (RG-SOW under
// Kirk Carver's Pay-As-You-Go). Zhan has User Access Administrator inherited
// to that scope, which lets the deploying principal author these assignments
// from the cocoon deployment without changing subs.
//
// `Azure AI Developer` is the right role for project-style endpoints
// (`/api/projects/<name>`). `Cognitive Services OpenAI User` is too narrow.
//
// Principals granted today (passed in via `principalIds`):
//   - ML Container App MI       (runtime LLM calls from /context, /generate, …)
//   - Ingestion Job MI          (one-shot LLM calls during data seeding)
// Adding a new principal is a one-line change in main.bicep — no module edit
// needed. The `guid()` name function deterministically produces the same
// assignment name for the same (foundry, principalId, role) tuple, so existing
// assignments survive redeploys with no churn.
// =============================================================================

@description('Name of the existing Foundry account (exists already; we only author RBAC)')
param foundryAccountName string

@description('Array of principal IDs to grant Azure AI Developer on Foundry-SOW')
param principalIds array

resource foundry 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: foundryAccountName
}

// Azure AI Developer — correct for Foundry project endpoints
var azureAiDeveloperRoleId = '64702f94-c441-49e6-a78b-ef80e0188fee'

resource foundryRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in principalIds: {
  scope: foundry
  name: guid(foundry.id, principalId, azureAiDeveloperRoleId)
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      azureAiDeveloperRoleId
    )
    principalType: 'ServicePrincipal'
  }
}]

output foundryEndpoint string = foundry.properties.endpoint
output foundryId string = foundry.id
