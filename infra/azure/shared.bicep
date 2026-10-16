// What the apps need around them, deployed once into the resource group that already holds the
// Container Apps environment and the Key Vault: the identity the apps run as, which reads the Key
// Vault secrets and pulls images from the shared registry. GitHub Actions signs in with the team's
// own service principal (see README.md), so nothing here is for the workflows.
targetScope = 'resourceGroup'

@description('Azure region. Defaults to the resource group\'s.')
param location string = resourceGroup().location

@description('The existing Key Vault that holds the apps\' secrets.')
param keyVaultName string

@description('Resource ID of the shared registry the images are pulled from.')
param registryId string

param appIdentityName string = 'emirates-apps'

// Built-in role definition.
var keyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: appIdentityName
  location: location
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource appReadsSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appIdentity.id, keyVaultSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUser)
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// The registry is shared with other projects, so it lives in another resource group (and maybe
// another subscription).
module appPullsImages 'registry-pull.bicep' = {
  name: 'emirates-apps-pull'
  scope: resourceGroup(split(registryId, '/')[2], split(registryId, '/')[4])
  params: {
    registryName: last(split(registryId, '/'))
    principalId: appIdentity.properties.principalId
  }
}
