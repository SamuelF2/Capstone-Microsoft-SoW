// =============================================================================
// Cross-subscription RBAC: ML Container App MI → Azure AI Developer on Foundry
// =============================================================================
// The Foundry-SOW resource lives in a separate subscription (RG-SOW under
// Kirk Carver's Pay-As-You-Go). Zhan has User Access Administrator inherited
// to that scope, which lets the deploying principal author this assignment
// from the cocoon deployment without changing subs.
//
// `Azure AI Developer` is the right role for project-style endpoints
// (`/api/projects/<name>`). `Cognitive Services OpenAI User` is too narrow.
// =============================================================================

@description('Name of the existing Foundry account (exists already; we only author RBAC)')
param foundryAccountName string

@description('Principal ID of the ML Container App managed identity')
param mlPrincipalId string

resource foundry 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: foundryAccountName
}

// Azure AI Developer — correct for Foundry project endpoints
var azureAiDeveloperRoleId = '64702f94-c441-49e6-a78b-ef80e0188fee'

resource foundryRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: foundry
  name: guid(foundry.id, mlPrincipalId, azureAiDeveloperRoleId)
  properties: {
    principalId: mlPrincipalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      azureAiDeveloperRoleId
    )
    principalType: 'ServicePrincipal'
  }
}

output foundryEndpoint string = foundry.properties.endpoint
output foundryId string = foundry.id
