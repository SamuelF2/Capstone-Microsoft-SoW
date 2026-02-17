// =============================================================================
// Azure Database for PostgreSQL Flexible Server
// =============================================================================
// Managed PostgreSQL service — handles backups, patching, high availability.
// Much better than running Postgres in a container for production/demo use.
//
// Using the Burstable B1ms SKU (1 vCPU, 2 GB RAM, 32 GB storage) which is
// the cheapest tier suitable for development. This costs ~$13/month but is
// the right call for a demo environment that needs data persistence.
//
// Firewall is configured to allow Azure services (Container Apps) to connect.
// =============================================================================

param name string
param location string
param tags object = {}

@description('PostgreSQL admin username')
param adminUser string

@secure()
@description('PostgreSQL admin password')
param adminPassword string

@description('Name of the default database to create')
param databaseName string = 'cocoon'

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'    // Burstable — cheapest tier with decent performance
    tier: 'Burstable'
  }
  properties: {
    version: '16'             // Match your local docker-compose (postgres:16-alpine)
    administratorLogin: adminUser
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: 32       // Minimum size; more than enough for SoW data
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'  // Save costs — not needed for capstone
    }
    highAvailability: {
      mode: 'Disabled'        // Save costs — not needed for capstone
    }
  }
}

// Create the cocoon database
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgresServer
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allow Azure services (Container Apps) to connect to PostgreSQL
resource firewallRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgresServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'   // Special range that means "Azure services only"
  }
}

output id string = postgresServer.id
output name string = postgresServer.name
output fqdn string = postgresServer.properties.fullyQualifiedDomainName
