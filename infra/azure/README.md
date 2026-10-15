# Deploying to Azure

The app runs on Azure Container Apps in the resource group `emirates-challenge` (UK South). Hosted Supabase provides each environment's database and file storage.

## What runs where

The resource group already holds the foundation:
- the network, with a NAT gateway: all outbound traffic leaves from `4.250.127.47`;
- the Log Analytics workspace `emirates-challenge-logs`;
- the Key Vault `emirates-challenge-kv`;
- the Container Apps environment `emirates-challenge-app-env`.

`shared.bicep` adds what every environment shares:

| Resource | Purpose |
|---|---|
| Registry `emirateschallenge` | Images `hrcc/api`, `hrcc/ai` and `hrcc/web`, tagged with the commit's 7-character SHA. |
| Identity `hrcc-apps` | The apps run as it: it pulls images and reads Key Vault secrets. |
| Identity `hrcc-github-deployer` | GitHub Actions signs in as it through OpenID Connect, so no Azure secret is stored. It can push images and update the apps in this resource group, from `main` and from the GitHub Environments `dev` and `production` only. |

`apps.bicep` adds one environment (`dev` or `prod`):

| Resource | Purpose |
|---|---|
| `hrcc-web-<env>` | The only public app: Caddy serves both front ends and proxies `/api` to the api. |
| `hrcc-api-<env>` | The API, reachable only inside the environment. |
| `hrcc-ai-<env>` | The AI service, reachable only inside the environment and only with the service token. |
| Job `hrcc-migrate-<env>` | Runs the migrations and the demo seed with the api image, before each rollout. |

## How a change reaches production

1. **Merge to `main`.** The "Build and deploy dev" workflow:
   - builds the three images and pushes them as `hrcc/<component>:<sha7>`;
   - runs the migration job;
   - updates ai, then api, then web.

   It waits until each step succeeds or each revision is running and healthy. If one doesn't, it shows that revision's logs and stops.
2. **Promote.** Run `deploy/promote.sh`. It writes the tag dev runs into `deploy/prod.yaml`; you can pass a tag to choose a different one. Open a PR with the change. Merging it starts the "Deploy" workflow, which waits for a `production` reviewer and then rolls prod out the same way.
3. **Roll back.** Revert the promotion PR. The previous images are still in the registry.

To roll an environment out to a given tag by hand, use Actions, then "Deploy", then "Run workflow".

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

3. **GitHub settings** (Settings, then Secrets and variables, then Actions, then Variables):

   | Variable | Value |
   |---|---|
   | `AZURE_CLIENT_ID` | output `deployerClientId` |
   | `AZURE_TENANT_ID` | output `tenantId` |
   | `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
   | `AZURE_REGISTRY` | output `registryServer` |
   | `AZURE_RESOURCE_GROUP` | `emirates-challenge` |

   Create two Environments under Settings, then Environments:
   - `dev`, with no rules;
   - `production`, with the people who approve prod rollouts as required reviewers, limited to the `main` branch.

   Until `AZURE_REGISTRY` is set, the deploy workflows skip.

4. **Supabase**, once per environment:
   - Create a hosted project.
   - In Storage, create a private bucket `datasets` with a 25 MB file limit, allowing `text/csv`.
   - Note the project URL, the **Session pooler** connection string and a secret key (Project Settings, then API Keys).
   - If the project restricts database access by IP, allow `4.250.127.47`.

5. **Key Vault secrets**, per environment, named `hrcc-<env>-<secret>`. To write them you need Key Vault Secrets Officer on the vault:

   ```bash
   vault=$(az keyvault show -g emirates-challenge -n emirates-challenge-kv --query id -o tsv)
   az role assignment create --role "Key Vault Secrets Officer" \
     --assignee "$(az ad signed-in-user show --query id -o tsv)" --scope "$vault"

   env=dev   # then prod
   az keyvault secret set --vault-name emirates-challenge-kv -n "hrcc-$env-database-url" --value '<session pooler connection string>'
   az keyvault secret set --vault-name emirates-challenge-kv -n "hrcc-$env-supabase-secret-key" --value '<Supabase secret key>'
   az keyvault secret set --vault-name emirates-challenge-kv -n "hrcc-$env-ai-service-token" --value "$(openssl rand -hex 32)"
   az keyvault secret set --vault-name emirates-challenge-kv -n "hrcc-$env-seed-user-password" --value '<12+ characters>'
   ```

   Optional secrets. Add any of these, then set the matching parameter in `<env>.bicepparam`:

   | Secret | Parameter |
   |---|---|
   | `hrcc-<env>-database-ssl-ca` (the project's CA certificate, `--file prod-ca-2021.crt`) | `hasDatabaseCa = true` (verify the database certificate) |
   | `hrcc-<env>-typesafe-api-key` | `hasTypesafeKey = true` |
   | `hrcc-<env>-anthropic-foundry-api-key` | `hasFoundryKey = true`, and also `foundryResource` |

6. **First images.** Run the "Build and deploy dev" workflow (Actions, then "Run workflow"). It pushes the images. Its rollout step reports that dev isn't provisioned yet, which is expected at this point.

7. **Create dev.** Use the tag the workflow pushed (the commit's 7-character SHA):

   ```bash
   IMAGE_TAG=<sha7> SUPABASE_URL=https://<dev project>.supabase.co \
     az deployment group create -g emirates-challenge \
     -f infra/azure/apps.bicep -p infra/azure/dev.bicepparam --query properties.outputs.url
   az containerapp job start -g emirates-challenge -n hrcc-migrate-dev
   ```

   The output is dev's address. Sign in with a demo account and the `hrcc-dev-seed-user-password` value.

8. **Create prod** in the same way, with `prod.bicepparam` and the prod project's URL. Then promote: `deploy/promote.sh <sha7>`, open a PR, and merge it.

## Changing settings

- **App settings** (environment variables, scaling, probes) live in `apps.bicep`. Deploy it with the tag the environment already runs; otherwise the apps move to another image:
  - for prod: `IMAGE_TAG=$(scripts/azure/read-tag.sh deploy/prod.yaml)`;
  - for dev: the latest `main` build's tag.
- **Secrets:** change the Key Vault secret. The apps pick it up within 30 minutes. To apply it at once, restart the app's active revision:

  ```bash
  az containerapp revision restart -g emirates-challenge -n hrcc-api-prod \
    --revision "$(az containerapp show -g emirates-challenge -n hrcc-api-prod \
      --query properties.latestRevisionName -o tsv)"
  ```

## Notes

- Prod keeps one replica of each app running. Dev scales to zero when idle, so its first request afterwards is slower.
- Logs are in the `emirates-challenge-logs` workspace (table `ContainerAppConsoleLogs_CL`). You can also use `az containerapp logs show -g emirates-challenge -n <app>`.
- The default `*.azurecontainerapps.io` address is used for now. A custom domain is added on `hrcc-web-<env>` with a managed certificate.
