using './apps.bicep'

param environment = 'prod'
param containerAppsEnvironmentName = 'emirates-challenge-app-env'
param keyVaultName = 'emirates-challenge-kv'
param registryServer = 'emirateschallenge.azurecr.io'

// Read when deploying: the tag currently rolled out, and this environment's Supabase project.
param imageTag = readEnvironmentVariable('IMAGE_TAG')
param supabaseUrl = readEnvironmentVariable('SUPABASE_URL')

// prod keeps one replica warm.
param minReplicas = 1
param maxReplicas = 3
