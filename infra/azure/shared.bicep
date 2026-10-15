// Resources every environment shares, deployed once into the resource group that already holds
// the Container Apps environment and the Key Vault: the image registry, the identity the apps
// run as (pulls images, reads Key Vault secrets) and the identity GitHub Actions deploys with.
targetScope = 'resourceGroup'

@description('Azure region. Defaults to the resource group\'s.')
param location string = resourceGroup().location

@description('Container registry name: 5 to 50 lowercase letters and digits, unique in Azure.')
@minLength(5)
@maxLength(50)
param registryName string

@description('The existing Key Vault that holds the apps\' secrets.')
param keyVaultName string

@description('The GitHub repository allowed to deploy, as owner/name.')
param githubRepository string

param appIdentityName string = 'hrcc-apps'
param deployerIdentityName string = 'hrcc-github-deployer'

// Built-in role definitions.
var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  acrPush: '8311e382-0749-4cb8-b61a-304f252e45ec'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c'
}

// GitHub Actions signs in with OpenID Connect, so no Azure secret is stored in the repository.
// Builds run on main; each rollout runs in a GitHub Environment of the same name.
var federatedSubjects = [
  { name: 'github-main', subject: 'repo:${githubRepository}:ref:refs/heads/main' }
  { name: 'github-dev', subject: 'repo:${githubRepository}:environment:dev' }
  { name: 'github-production', subject: 'repo:${githubRepository}:environment:production' }
]

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: appIdentityName
  location: location
}

resource deployerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: deployerIdentityName
  location: location
}

// Federated credentials on one identity must be written one at a time.
@batchSize(1)
resource federatedCredentials 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = [
  for credential in federatedSubjects: {
    parent: deployerIdentity
    name: credential.name
    properties: {
      issuer: 'https://token.actions.githubusercontent.com'
      subject: credential.subject
      audiences: ['api://AzureADTokenExchange']
    }
  }
]

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource appPullsImages 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, appIdentity.id, roles.acrPull)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull)
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appReadsSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appIdentity.id, roles.keyVaultSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roles.keyVaultSecretsUser
    )
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource deployerPushesImages 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, deployerIdentity.id, roles.acrPush)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPush)
    principalId: deployerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Updates the apps and starts the migration job; limited to this resource group.
resource deployerUpdatesApps 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployerIdentity.id, roles.contributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.contributor)
    principalId: deployerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

@description('Set as the repository variable AZURE_REGISTRY.')
output registryServer string = registry.properties.loginServer

@description('Set as the repository variable AZURE_CLIENT_ID.')
output deployerClientId string = deployerIdentity.properties.clientId

@description('Set as the repository variable AZURE_TENANT_ID.')
output tenantId string = tenant().tenantId
