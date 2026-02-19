// =============================================================================
// Azure Container Registry (ACR)
// =============================================================================
// Stores Docker images built by azd/GitHub Actions. The Container Apps
// pull images from here during deployment.
//
// Using Basic SKU to minimize costs on student Azure credits.
// =============================================================================

param name string
param location string
param tags object = {}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Basic' // Cheapest tier — sufficient for capstone project
  }
  properties: {
    adminUserEnabled: true // Required for Container Apps to pull images
  }
}

output id string = containerRegistry.id
output name string = containerRegistry.name
output loginServer string = containerRegistry.properties.loginServer
