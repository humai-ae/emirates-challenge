using './shared.bicep'

param keyVaultName = 'emirates-challenge-kv'

// Read when deploying, so that no subscription ID is committed:
// REGISTRY_ID=$(az acr show -n mairitacr --query id -o tsv)
param registryId = readEnvironmentVariable('REGISTRY_ID')
