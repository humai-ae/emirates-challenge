using './apps.bicep'

param containerAppsEnvironmentName = 'emirates-challenge-app-env'
param keyVaultName = 'emirates-challenge-kv'
param registryServer = 'emirateschallenge.azurecr.io'

// Read when deploying: the tag the apps run now, and the Supabase project.
param imageTag = readEnvironmentVariable('IMAGE_TAG')
param supabaseUrl = readEnvironmentVariable('SUPABASE_URL')
