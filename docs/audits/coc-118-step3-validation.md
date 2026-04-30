# COC-118 Step 3 Validation Report

**Date:** 2026-04-25
**Commit validated:** `db610ef` (HEAD of `feature/COC-118-managed-identity-auth`)
**Deploy duration:** 11m13s (`azd up`, exited at template-validation stage)
**Validator:** Zhan Su

## Summary

`azd up` failed at the ARM template-validation step with `CrossTenantDeploymentNotPermitted`. The new `foundry-rbac` module attempts to author a role assignment on a resource (`Foundry-SOW`) that lives in a **different Azure AD tenant** from the Cocoon deployment tenant — Azure ARM forbids this within a single deployment, regardless of the deploying principal's RBAC. **No Azure resources were created** (validation runs before any provisioning), so the cluster is in a clean pre-deploy state. Step 3's Python and secret-cleanup changes are correct; only the Bicep cross-tenant role-assignment approach needs to be reworked.

## Step 1: Deploy

- [x] `azd up` started — completed package stage for all 5 services (api, ml, neo4j, postgres, web)
- [ ] **`azd up` did NOT complete provisioning** — failed at deployment validation
- Deploy log highlights:
  - All 5 service container images packaged successfully (azd-deploy-1777095658…1777096185)
  - "Initialize bicep provider" + "Reading subscription and location from environment" succeeded
  - "Creating a deployment plan" + "Comparing deployment state" reached
  - **`POST .../validate` returned 400** with `CrossTenantDeploymentNotPermitted` before any resource creation
- Confirmed post-failure: `az group exists --name rg-Capstone` → `false`. No partial deployment.

### Failure detail (verbatim)

```
ERROR CODE: CrossTenantDeploymentNotPermitted

The template deployment tries to deploy resources to subscription
'0a96bee6-0b0e-4a8e-8ef7-cc83cb272a81'. However, the current tenant
'22d2fb35-256a-459b-bcf4-dc23d42dc0a4' is not authorized to deploy
resources to that subscription. Please see
https://aka.ms/arm-template/#resources for usage details.

TraceID: 0e97355e60e84ef8c120c2c4eaeb24b9
```

The deploying tenant is Baylor's (`22d2fb35-…`); the Foundry-SOW resource lives in Kirk Carver's tenant (the one owning sub `0a96bee6-…`). ARM does not permit a single template deployment to author resources or role assignments across tenant boundaries even when the deploying principal has permission — this is an Azure platform constraint, not an IAM gap.

## Step 2: Role assignment verification

**Cannot execute** — no deploy, no ML Container App MI was created, no role assignment was authored.

For reference, the existing two `Azure AI Developer` assignments on Foundry-SOW (Zhan's user direct grant + `MicrosoftSOWTeam` group inheritance) are unaffected; only the new ServicePrincipal entry that the foundry-rbac module would have added is missing.

## Step 3: Environment configuration

**Cannot execute** — no ML Container App was created.

Bicep build (`az bicep build --file infra/main.bicep`) returned exit 0 prior to deploy, confirming the templates compile. The `azureOpenAiApiKey` param/secret/env-var removals from `infra/modules/ml-container.bicep`, `infra/main.bicep`, and `infra/main.parameters.json` are syntactically correct — they were never the cause of the failure. The cross-tenant block is purely the new `foundry-rbac` module invocation in `infra/main.bicep:214-221`.

## Step 4: End-to-end Foundry call

**Cannot execute** — no ML Container App, no logs to inspect.

## Step 5: Secret leakage

**Cannot execute** — no deployed Container App config to query.

For reference, source-side cleanup verified prior to deploy:
- `grep AZURE_OPENAI_API_KEY|azureOpenAiApiKey|azure-openai-api-key` over the codebase returned zero hits in code/config/Bicep (only historical mentions in `docs/audits/auth-audit-2026-04-21.md` and `docs/audits/coc-118-foundry-callsites.md`).

## Verdicts

| Check | Status | Notes |
|---|---|---|
| Deploy succeeded | ❌ | `CrossTenantDeploymentNotPermitted` at template-validation step |
| Role assignment present | ⚠️ N/A | No deploy → MI never created |
| Env vars correct | ⚠️ N/A | No deploy → no Container App to inspect |
| MI authenticates to Foundry | ⚠️ N/A | No deploy |
| No secret leakage | ⚠️ N/A | Source-side clean; deployed-side cannot be checked |

## Issues encountered

**Sole blocker: `infra/modules/foundry-rbac.bicep` is invoked across an Azure AD tenant boundary.** The module itself is structurally correct (uses `existing` lookup + cross-sub `subscriptionResourceId` for the role definition + the right role GUID `64702f94-c441-49e6-a78b-ef80e0188fee`), but ARM's tenant-isolation rule blocks the entire deployment template at validation time, before any resources are created.

Where the constraint comes from: a single ARM deployment graph (which is what `main.bicep` is, even when `targetScope = 'subscription'`) is bounded to one tenant. The `scope: resourceGroup(foundrySubscriptionId, foundryResourceGroup)` syntax reaches across **subscriptions** within the same tenant, but does not reach across tenants — there is no Bicep/ARM construct that does. The original audit assumed the boundary was sub-only; it is in fact tenant-only.

No transient/retryable failures observed. Re-running `azd up` against the current `db610ef` will fail identically.

## Recommended next action

**Stop and remediate before proceeding to step 4.** Three viable paths, in order of pragmatism for this project:

1. **Extract `foundry-rbac` from Bicep; do the role assignment manually post-deploy.** *(Simplest. Recommended.)*
   - Remove `module foundryRbac { ... }` from `infra/main.bicep:214-221`.
   - Remove `infra/modules/foundry-rbac.bicep`.
   - Re-run `azd up` — main infra deploys cleanly into Baylor's tenant.
   - Add `output mlPrincipalId` to `azd env get-values` consumption (already there at `infra/main.bicep:303`).
   - Run once, manually, after the first deploy:
     ```bash
     ML_MI=$(azd env get-value MLPRINCIPALID)  # or read mlPrincipalId from azd env
     az role assignment create \
       --assignee-object-id "$ML_MI" \
       --assignee-principal-type ServicePrincipal \
       --role "Azure AI Developer" \
       --scope /subscriptions/0a96bee6-0b0e-4a8e-8ef7-cc83cb272a81/resourceGroups/RG-SOW/providers/Microsoft.CognitiveServices/accounts/Foundry-SOW
     ```
     Zhan's existing guest access to Kirk's tenant is sufficient. The assignment persists across redeploys (it survives Bicep churn because no Bicep manages it).
   - Document this one-time step in `infra/README.md` or a hooks file (e.g. `.azd/hooks/postdeploy.sh`) so the next operator doesn't miss it.

2. **Move the role assignment into a GitHub Actions step that runs *after* `azd provision`.**
   - Two-step workflow: (1) `azd provision` against Cocoon's tenant via existing OIDC SP; (2) `az login` against Foundry's tenant (separate SP / OIDC credential, or use the Foundry-tenant guest token of the Cocoon SP if Kirk grants it), then `az role assignment create`.
   - More moving parts than option 1, but eliminates the manual step. Worth it only if redeploy churn is high.

3. **Use Azure Lighthouse or a managed-identity federation that crosses tenants.**
   - Architecturally heaviest. Lighthouse lets a principal in tenant A act on tenant B's resources via a delegated definition. Not justified for a single role assignment.

Do **not** keep the `foundry-rbac` Bicep module and try to work around the tenant boundary inside the template — there is no workaround at the template level.

## Manual follow-ups remaining

- [ ] **Do NOT delete the `AZURE_OPENAI_API_KEY` GitHub Secret yet.** Validation has not passed; the secret is the only fallback path until MI auth is proven live in deployed state.
- [ ] **Do NOT notify Jayden about the local-dev `az login` change yet.** Same reason — the migration is not validated end-to-end.
- [ ] After remediation lands and a successful redeploy: re-run this validation pass against the same five checks before issuing those notifications.

## Rollback notes

No rollback action needed. The deploy validation failed before any provisioning, so there is no half-deployed state to clean up. The `feature/COC-118-managed-identity-auth` branch can be amended in place with the fix from option 1 above; the existing commit `db610ef` does not need to be reverted (the Python/secret-cleanup half is correct and should be preserved). Only the Bicep portion needs surgery.
