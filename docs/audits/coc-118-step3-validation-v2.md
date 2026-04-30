# COC-118 Step 3 Validation Report (v2 — post tenant switch)

**Date:** 2026-04-25
**Commit validated:** `db610ef` (HEAD of `feature/COC-118-managed-identity-auth`)
**Tenant:** Kirk Carver - Personal (`4274bfb0-b43c-4843-9216-14582acead34`)
**Subscription:** Pay-As-You-Go (`0a96bee6-0b0e-4a8e-8ef7-cc83cb272a81`)
**Resource group (intended for Cocoon):** would have been `rg-Capstone` (created by Bicep, not `RG-SOW`)
**Location:** `eastus2`
**Deploy duration:** 2m0s (`azd up`, exited at template-validation stage)
**Validator:** Zhan Su

## Summary

`azd up` failed at the ARM template-validation step with `AuthorizationFailed` against the subscription scope. The Bicep template uses `targetScope = 'subscription'` (it creates a new RG `rg-Capstone` and provisions everything inside it), but Zhan's RBAC in Kirk's tenant is limited to **RG-SOW** (inherited via the `MicrosoftSOWTeam` group). Subscription-scope operations — including `Microsoft.Resources/deployments/validate/action` — are blocked. **No resources were created**; `RG-SOW` and Foundry-SOW are untouched. The previous cross-tenant blocker is resolved (validation passed the tenant gate this time), so the tenant switch was the right call — but a second permission gap remains. Step 3's Python and secret-cleanup commit (`db610ef`) is still correct; this is purely an infra-scope/RBAC mismatch.

## Background

The original validation (see `coc-118-step3-validation.md`) failed with `CrossTenantDeploymentNotPermitted` because Cocoon was deploying into Baylor's Azure for Students tenant while Foundry-SOW lived in a separate Kirk-owned tenant. The decision was made to deploy Cocoon entirely in Kirk's tenant alongside Foundry, eliminating the cross-tenant boundary. This validation is run against that new same-tenant configuration. The cross-tenant error did not recur — confirming the tenant switch fixed that specific issue — but a second blocker surfaced one layer down.

## Step 1: Deploy

- [x] Pre-flight passed: branch clean (HEAD `db610ef`), Docker running, `az`/`azd` logged in, env vars correct (sub `0a96bee6-…`, tenant `4274bfb0-…`, RG `RG-SOW`, location `eastus2`, OpenAI vars present).
- [x] All 5 services packaged (api, ml, neo4j, postgres, web — image tags `azd-deploy-1777097946…1777097956`).
- [x] Provisioning phase started: "Initialize bicep provider" + "Reading subscription and location from environment" + "Creating a deployment plan" + "Comparing deployment state" all succeeded.
- [ ] **`azd up` did NOT complete provisioning** — failed at `POST .../validate` with HTTP 403.
- Wall-clock time: 2m0s
- Endpoint URLs: none (no resources created)
- Provider registrations needed: unable to check (sub-scope reads are blocked for Zhan)
- Confirmed post-failure:
  - `az group exists --name rg-Capstone` → `Operation returned an invalid status 'Forbidden'` (confirms Zhan can't even read at sub scope; RG was definitely not created)
  - `az group show --name RG-SOW` → `RG-SOW` (intact, untouched)

### Failure detail (verbatim)

```
ERROR CODE: AuthorizationFailed

The client 'zhan_su1@baylor.edu' with object id '3c71cf99-967e-4b73-936e-0e6a2dcaa228'
does not have authorization to perform action
'Microsoft.Resources/deployments/validate/action'
over scope '/subscriptions/0a96bee6-0b0e-4a8e-8ef7-cc83cb272a81'
or the scope is invalid. If access was recently granted, please refresh your credentials.

TraceID: 872e842085ee665f5aed6f399dc06661
```

This is at sub scope (`/subscriptions/0a96bee6-...`), not RG scope. Zhan's `MicrosoftSOWTeam` group inheritance grants Contributor + UAA on `RG-SOW` only — not on the subscription itself. ARM template deployments declared with `targetScope = 'subscription'` (which `infra/main.bicep:25` is) require validation at sub scope, which Zhan cannot perform.

The `az login`/`azd login` credentials are correct; the credentials/refresh is not the problem. This is a stable RBAC scope mismatch.

## Step 2: Role assignment verification

**Cannot execute** — no deploy, no ML Container App MI was created. The two existing `Azure AI Developer` assignments on Foundry-SOW (Zhan's user direct grant + `MicrosoftSOWTeam` group inheritance) remain in place; only the missing third ServicePrincipal entry is the gap, and it cannot be authored without a successful deploy first.

## Step 3: Environment configuration

**Cannot execute** — no ML Container App was created.

For reference, source-side state on `db610ef` is unchanged from v1: `infra/modules/ml-container.bicep` has no `azureOpenAiApiKey` param, no `azure-openai-api-key` secret, no `AZURE_OPENAI_API_KEY` env injection. Bicep build (`az bicep build --file infra/main.bicep`) was clean prior to step 3 commit. The cleanup is correct in source.

## Step 4: End-to-end Foundry call

**Cannot execute** — no ML Container App, no logs to inspect.

## Step 5: Secret leakage

**Cannot execute** — no deployed Container App config to query.

For reference, source-side cleanup verified prior to deploy: zero hits in code/config/Bicep for `AZURE_OPENAI_API_KEY|azureOpenAiApiKey|azure-openai-api-key` (only historical mentions in `docs/audits/auth-audit-2026-04-21.md` and `docs/audits/coc-118-foundry-callsites.md`).

## Verdicts

| Check | Status | Notes |
|---|---|---|
| Deploy succeeded | ❌ | `AuthorizationFailed` at sub-scope `validate/action`; Zhan's access is RG-SOW-only |
| Role assignment present | ⚠️ N/A | No deploy → MI never created |
| Env vars correct | ⚠️ N/A | No deploy → no Container App to inspect |
| MI authenticates to Foundry | ⚠️ N/A | No deploy |
| No secret leakage | ⚠️ N/A | Source-side clean; deployed-side cannot be checked |

## Issues encountered

**Sole blocker: scope mismatch between Bicep `targetScope = 'subscription'` and Zhan's RG-SOW-only RBAC.**

The Bicep template at `infra/main.bicep:25` declares `targetScope = 'subscription'` and explicitly creates a new resource group at `infra/main.bicep:104-108` (`name: '${abbrs.resourcesResourceGroups}${environmentName}'` → `rg-Capstone`). For ARM to validate this, the deploying principal needs `Microsoft.Resources/deployments/*` on the subscription itself — Contributor/UAA inherited *to* RG-SOW only is not enough.

Tangential note: the spec references `--resource-group RG-SOW` in the validation queries, but the current Bicep would have created Cocoon resources in `rg-Capstone` (a new RG alongside RG-SOW), not into RG-SOW. The cross-sub `foundry-rbac` module would have correctly targeted `RG-SOW` for the role assignment because that's where Foundry-SOW lives, but Cocoon's own resources (ACR, Container Apps Env, Container Apps, Log Analytics) would have landed in `rg-Capstone`. This is a separate planning issue from the auth failure but worth flagging.

## Recommended next action

**Stop and decide between three remediation paths.** All three avoid modifying the source code and all three are environmental.

1. **Have Kirk run the deploy.** *(Simplest. Recommended if the goal is "land the deploy once, then iterate from there.")*
   Kirk has owner-equivalent rights on the subscription. He can run `azd up` in his own session against this same `feature/COC-118-managed-identity-auth` branch. Once the resources exist (in `rg-Capstone`), Zhan needs `Reader`/`Contributor` granted to the new `rg-Capstone` to do further `azd deploy` (image pushes), inspect, and run validation. The cross-sub `foundry-rbac` role assignment will succeed under Kirk's deploy because he has UAA at sub level too. After the first successful deploy, Zhan can re-run this validation script.

2. **Have Kirk grant Zhan Contributor at the subscription level (or create a deployment-only custom role).** *(Heavier. Right answer if the team plans to do multiple azd up/down cycles from Zhan's account.)*
   Sub-level Contributor is a wide grant; an alternative is a custom role with just `Microsoft.Resources/deployments/*` and `Microsoft.Resources/subscriptions/resourceGroups/write` at sub scope. This unblocks `azd up` from Zhan's account without giving general subscription-wide ownership.

3. **Restructure Bicep to deploy into an existing RG (RG-SOW) instead of creating a new one.** *(Longest path. Modifies code — out of scope per spec, but worth flagging because the spec's validation queries assume this state.)*
   Change `targetScope` from `'subscription'` to `'resourceGroup'` in `infra/main.bicep`, drop the explicit `Microsoft.Resources/resourceGroups@... resource rg`, and have azd deploy into RG-SOW directly. This reduces the required RBAC to `Microsoft.Resources/deployments/*` at RG scope, which Zhan already has via `MicrosoftSOWTeam` group inheritance. Concern: it also puts Cocoon's churn (ACR, Container Apps, etc.) directly into RG-SOW, mingled with Foundry-SOW. The current sub-scope design exists specifically to keep them separated.

Of these, **option 1 (Kirk deploys once, Zhan validates after)** is the lowest-friction path to unblock COC-118 step 3 validation. Options 2 and 3 are bigger structural decisions that should land via discussion with Kirk and the team, not on the side here.

Do **not**:
- Re-attempt `azd up` from Zhan's account against the current branch — same failure will recur deterministically.
- Modify Bicep to silence the error without team alignment.
- Proceed to step 4 (delete dead `AZURE_AI_*` backend wiring) until validation passes — that work depends on confirming the MI path actually authenticates to Foundry end-to-end.

## Manual follow-ups remaining

- [ ] **Do NOT delete the `AZURE_OPENAI_API_KEY` GitHub Secret yet.** Validation has not passed.
- [ ] **Do NOT notify the team about local-dev `az login` change yet.** Same reason — migration not validated end-to-end.
- [ ] After remediation path is chosen and a successful redeploy lands: re-run this validation pass against the same five checks before issuing those notifications, and write a v3 report.

## Rollback notes

No rollback action needed. The deploy validation failed before any provisioning, so there is no half-deployed state. `RG-SOW` is intact (verified post-failure). The `feature/COC-118-managed-identity-auth` branch and commit `db610ef` do not need to be reverted — both v1 and v2 failures are environmental, not code-level.
