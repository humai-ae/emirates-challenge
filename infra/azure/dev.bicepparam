using './apps.bicep'

param environment = 'dev'
param containerAppsEnvironmentName = 'emirates-challenge-app-env'
param keyVaultName = 'emirates-challenge-kv'
param registryServer = 'emirateschallenge.azurecr.io'

// Read when deploying: the tag currently rolled out, and this environment's Supabase project.
param imageTag = readEnvironmentVariable('IMAGE_TAG')
param supabaseUrl = readEnvironmentVariable('SUPABASE_URL')

// dev scales to zero when idle.
param minReplicas = 0
param maxReplicas = 2
