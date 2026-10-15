// One environment's apps (web, api, ai) and its migration job, inside the existing Container Apps
// environment. Images come from the registry by tag; secrets are Key Vault references read
// through the shared app identity (see shared.bicep). Only web is reachable from the internet.
targetScope = 'resourceGroup'

@allowed(['dev', 'prod'])
param environment string

@description('Azure region. Defaults to the resource group\'s.')
param location string = resourceGroup().location

param containerAppsEnvironmentName string
param keyVaultName string
param appIdentityName string = 'hrcc-apps'

@description('The registry\'s login server, e.g. emirateschallenge.azurecr.io.')
param registryServer string

@description('Tag of the api, ai and web images, all built from one commit (its 7-character SHA).')
param imageTag string

@description('The hosted Supabase project URL, e.g. https://abcd.supabase.co.')
param supabaseUrl string

param supabaseStorageBucket string = 'datasets'

@description('TLS to Postgres: require, or verify when the CA certificate is in Key Vault.')
param hasDatabaseCa bool = false

@description('Set when the TypeSafe API key is in Key Vault.')
param hasTypesafeKey bool = false

@description('Set when the Microsoft Foundry API key is in Key Vault.')
param hasFoundryKey bool = false

@description('The Microsoft Foundry resource name, when Claude on Foundry is used.')
param foundryResource string = ''

param minReplicas int = 0
param maxReplicas int = 2

var names = {
  web: 'hrcc-web-${environment}'
  api: 'hrcc-api-${environment}'
  ai: 'hrcc-ai-${environment}'
  migrate: 'hrcc-migrate-${environment}'
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: containerAppsEnvironmentName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: appIdentityName
}

var identity = {
  type: 'UserAssigned'
  userAssignedIdentities: { '${appIdentity.id}': {} }
}
var registries = [{ server: registryServer, identity: appIdentity.id }]

// Key Vault secrets are named hrcc-<environment>-<secret>; the apps see them as <secret>.
var vaultSecret = map(
  [
    'database-url'
    'database-ssl-ca'
    'supabase-secret-key'
    'ai-service-token'
    'seed-user-password'
    'typesafe-api-key'
    'anthropic-foundry-api-key'
  ],
  name => {
    name: name
    keyVaultUrl: '${keyVault.properties.vaultUri}secrets/hrcc-${environment}-${name}'
    identity: appIdentity.id
  }
)
var secret = toObject(vaultSecret, item => item.name)

var databaseSecrets = concat([secret['database-url']], hasDatabaseCa ? [secret['database-ssl-ca']] : [])
var databaseEnv = concat(
  [
    { name: 'DATABASE_URL', secretRef: 'database-url' }
    { name: 'DATABASE_SSL', value: hasDatabaseCa ? 'verify' : 'require' }
  ],
  hasDatabaseCa ? [{ name: 'DATABASE_SSL_CA', secretRef: 'database-ssl-ca' }] : []
)

resource ai 'Microsoft.App/containerApps@2024-03-01' = {
  name: names.ai
  location: location
  identity: identity
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      // Reachable only inside the environment; the api calls it by name over plain HTTP.
      ingress: { external: false, targetPort: 3100, transport: 'http', allowInsecure: true }
      registries: registries
      secrets: concat(
        [secret['ai-service-token']],
        hasTypesafeKey ? [secret['typesafe-api-key']] : [],
        hasFoundryKey ? [secret['anthropic-foundry-api-key']] : []
      )
    }
    template: {
      containers: [
        {
          name: 'ai'
          image: '${registryServer}/hrcc/ai:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat(
            [
              { name: 'NODE_ENV', value: 'production' }
              { name: 'PORT', value: '3100' }
              { name: 'AI_SERVICE_TOKEN', secretRef: 'ai-service-token' }
            ],
            hasTypesafeKey ? [{ name: 'TYPESAFE_API_KEY', secretRef: 'typesafe-api-key' }] : [],
            hasFoundryKey ? [{ name: 'ANTHROPIC_FOUNDRY_API_KEY', secretRef: 'anthropic-foundry-api-key' }] : [],
            empty(foundryResource) ? [] : [{ name: 'ANTHROPIC_FOUNDRY_RESOURCE', value: foundryResource }]
          )
          // Its routes need the service token, so the probes only check that the port answers.
          probes: [
            { type: 'Liveness', tcpSocket: { port: 3100 }, periodSeconds: 30 }
            { type: 'Readiness', tcpSocket: { port: 3100 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: { minReplicas: minReplicas, maxReplicas: maxReplicas }
    }
  }
}

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: names.api
  location: location
  identity: identity
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      // Reachable only inside the environment; web proxies /api to it by name.
      ingress: { external: false, targetPort: 3000, transport: 'http', allowInsecure: true }
      registries: registries
      secrets: concat(databaseSecrets, [secret['supabase-secret-key'], secret['ai-service-token']])
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${registryServer}/hrcc/api:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(databaseEnv, [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'AUTH_MODE', value: 'password' }
            { name: 'COOKIE_SECURE', value: 'true' }
            { name: 'SUPABASE_URL', value: supabaseUrl }
            { name: 'SUPABASE_SECRET_KEY', secretRef: 'supabase-secret-key' }
            { name: 'SUPABASE_STORAGE_BUCKET', value: supabaseStorageBucket }
            { name: 'AI_SERVICE_URL', value: 'http://${names.ai}' }
            { name: 'AI_SERVICE_TOKEN', secretRef: 'ai-service-token' }
          ])
          probes: [
            { type: 'Startup', httpGet: { path: '/api/v1/health/live', port: 3000 }, periodSeconds: 5, failureThreshold: 24 }
            { type: 'Liveness', httpGet: { path: '/api/v1/health/live', port: 3000 }, periodSeconds: 30 }
            // 503 while the database is unreachable, which takes the replica out of rotation.
            { type: 'Readiness', httpGet: { path: '/api/v1/health', port: 3000 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: { minReplicas: minReplicas, maxReplicas: maxReplicas }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: names.web
  location: location
  identity: identity
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      // The only public app: HTTPS at the edge, plain HTTP redirected.
      ingress: { external: true, targetPort: 80, transport: 'auto', allowInsecure: false }
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${registryServer}/hrcc/web:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [{ name: 'API_UPSTREAM', value: '${api.name}:80' }]
          probes: [
            { type: 'Liveness', httpGet: { path: '/', port: 80 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/', port: 80 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: { minReplicas: minReplicas, maxReplicas: maxReplicas }
    }
  }
}

// Runs migrations and the demo seed with the api image, once per rollout and before the apps
// update, so replicas never race to migrate.
resource migrate 'Microsoft.App/jobs@2024-03-01' = {
  name: names.migrate
  location: location
  identity: identity
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: registries
      secrets: concat(databaseSecrets, [secret['seed-user-password']])
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: '${registryServer}/hrcc/api:${imageTag}'
          command: ['sh', '-c', 'node dist/database/migrate.js && node dist/database/seed.js']
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(databaseEnv, [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'SEED_USER_PASSWORD', secretRef: 'seed-user-password' }
          ])
        }
      ]
    }
  }
}

@description('The public address of this environment.')
output url string = 'https://${web.properties.configuration.ingress.fqdn}'
