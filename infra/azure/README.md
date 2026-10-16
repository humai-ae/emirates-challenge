# Deploying to Azure

The app runs on Azure Container Apps in the resource group `emirates-challenge` (UK South). A hosted Supabase project provides its database and file storage. There is one environment, and every merge to `main` deploys to it.

## What runs where

The resource group already holds the foundation:
- the network, with a NAT gateway: all outbound traffic leaves from `4.250.127.47`;
- the Log Analytics workspace `emirates-challenge-logs`;
- the Key Vault `emirates-challenge-kv`;
- the Container Apps environment `emirates-challenge-app-env`.

`shared.bicep` adds what the apps need around them:

| Resource | Purpose |
|---|---|
| Registry `emirateschallenge` | Images `emirates-api`, `emirates-ai` and `emirates-web`, tagged with the commit's 7-character SHA. |
| Identity `emirates-apps` | The apps run as it: it pulls images and reads Key Vault secrets. |
| Identity `emirates-github-deployer` | GitHub Actions signs in as it through OpenID Connect, so no Azure secret is stored. It can push images and update the apps in this resource group, from workflow runs on `main` only. |

`apps.bicep` adds the apps:

| Resource | Purpose |
|---|---|
| `emirates-web` | The only public app: Caddy serves both front ends and proxies `/api` to the api. |
| `emirates-api` | The API, reachable only inside the Container Apps environment. |
| `emirates-ai` | The AI service, reachable only inside the Container Apps environment and only with the service token. |
| Job `emirates-migrate` | Runs the migrations and the demo seed with the api image, before each rollout. |

## How a change is deployed

**Merge to `main`.** The "Build and deploy" workflow:
- builds the three images and pushes them as `emirates-<component>:<sha7>`;
- runs the migration job;
- updates ai, then api, then web.

It waits until each step succeeds or each revision is running and healthy. If one doesn't, it shows that revision's logs and stops.

**Roll back** in either of two ways:
- Run the "Deploy" workflow on `main` (Actions, then "Deploy", then "Run workflow") with an earlier commit's 7-character SHA. Its images are still in the registry.
- Revert the change on `main`. Merging the revert deploys it.

A rollback doesn't undo migrations. The older release's migration step finds nothing to do, and the database keeps the newer schema. So every migration must leave a schema the release before it can still use.

## One-time setup

You need **Owner** on `emirates-challenge`, because `shared.bicep` creates role assignments.

1. Sign in and pick the subscription:

   ```bash
   az login
   az account set --subscription "<subscription name or id>"
   ```

2. Create the shared resources. Note the three outputs:

   ```bash
   az deployment group create -g emirates-challenge \
     -f infra/azure/shared.bicep -p infra/azure/shared.bicepparam \
     --query properties.outputs
   ```

3. **GitHub settings** (Settings, then Secrets and variables, then Actions). The IDs are secrets, so that they stay out of the public workflow logs:

   | Secret | Value |
   |---|---|
   | `AZURE_CLIENT_ID` | output `deployerClientId` |
   | `AZURE_TENANT_ID` | output `tenantId` |
   | `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |

   | Variable | Value |
   |---|---|
   | `AZURE_REGISTRY` | output `registryServer` |
   | `AZURE_RESOURCE_GROUP` | `emirates-challenge` |

   Until `AZURE_REGISTRY` is set, the deploy workflows skip.

4. **Supabase:**
   - Create a hosted project.
   - In Storage, create a private bucket `datasets` with a 25 MB file limit, allowing `text/csv`.
   - Note the project URL, the **Session pooler** connection string and a secret key (Project Settings, then API Keys).
   - If the project restricts database access by IP, allow `4.250.127.47`.

5. **Key Vault secrets**, named `emirates-<secret>`. To write them you need Key Vault Secrets Officer on the vault:

   ```bash
   vault=$(az keyvault show -g emirates-challenge -n emirates-challenge-kv --query id -o tsv)
   az role assignment create --role "Key Vault Secrets Officer" \
     --assignee "$(az ad signed-in-user show --query id -o tsv)" --scope "$vault"

   az keyvault secret set --vault-name emirates-challenge-kv -n emirates-database-url --value '<session pooler connection string>'
   az keyvault secret set --vault-name emirates-challenge-kv -n emirates-supabase-secret-key --value '<Supabase secret key>'
   az keyvault secret set --vault-name emirates-challenge-kv -n emirates-ai-service-token --value "$(openssl rand -hex 32)"
   az keyvault secret set --vault-name emirates-challenge-kv -n emirates-seed-user-password --value '<12+ characters>'
   ```

   Optional secrets. Add any of these, then set the matching parameter in `apps.bicepparam`:

   | Secret | Parameter |
   |---|---|
   | `emirates-database-ssl-ca` (the project's CA certificate, `--file prod-ca-2021.crt`) | `hasDatabaseCa = true` (verify the database certificate) |
   | `emirates-typesafe-api-key` | `hasTypesafeKey = true` |
   | `emirates-text-model-api-key` | `hasTextModelKey = true`, and also `textModelBaseUrl` (any OpenAI-compatible API, such as `https://<resource>.services.ai.azure.com/openai/v1/`); `textModel` names the model (default `gpt-6-luna`) |

6. **First images.** Run the "Build and deploy" workflow (Actions, then "Run workflow"). It pushes the images. Its rollout step reports that the apps aren't provisioned yet, which is expected at this point.

7. **Create the apps.** Use the tag the workflow pushed (the commit's 7-character SHA):

   ```bash
   IMAGE_TAG=<sha7> SUPABASE_URL=https://<project>.supabase.co \
     az deployment group create -g emirates-challenge \
     -f infra/azure/apps.bicep -p infra/azure/apps.bicepparam --query properties.outputs.url
   az containerapp job start -g emirates-challenge -n emirates-migrate
   ```

   The output is the app's address. When the job has finished (`az containerapp job execution list -g emirates-challenge -n emirates-migrate -o table`), sign in with a demo account and the `emirates-seed-user-password` value.

   From then on, every merge to `main` deploys.

## Changing settings

- **App settings** (environment variables, scaling, probes) live in `apps.bicep` and `apps.bicepparam`. Deploy them with the tag the apps already run; otherwise the apps move to another image:

  ```bash
  image=$(az containerapp show -g emirates-challenge -n emirates-api \
    --query "properties.template.containers[0].image" -o tsv)
  IMAGE_TAG=${image##*:} SUPABASE_URL=https://<project>.supabase.co \
    az deployment group create -g emirates-challenge \
    -f infra/azure/apps.bicep -p infra/azure/apps.bicepparam
  ```

- **Secrets:** change the Key Vault secret. The apps pick it up within 30 minutes. To apply it at once, restart the app's active revision:

  ```bash
  az containerapp revision restart -g emirates-challenge -n emirates-api \
    --revision "$(az containerapp show -g emirates-challenge -n emirates-api \
      --query properties.latestRevisionName -o tsv)"
  ```

## Notes

- Each app keeps one replica running, so no request waits for a cold start. To let the apps scale to zero when idle, set `minReplicas = 0` in `apps.bicepparam`. The first request after a quiet spell is then slower.
- Logs are in the `emirates-challenge-logs` workspace (table `ContainerAppConsoleLogs_CL`). You can also use `az containerapp logs show -g emirates-challenge -n <app>`.
- The default `*.azurecontainerapps.io` address is used for now. A custom domain is added on `emirates-web` with a managed certificate.
