# COC-118 Step 3 Validation Report (v3 — post Contributor grant)

**Date:** 2026-04-26 (UTC; deploy started 2026-04-26T00:30Z)
**Commit validated:** `db610ef` (HEAD of `feature/COC-118-managed-identity-auth`)
**Tenant:** Kirk Carver - Personal (`4274bfb0-b43c-4843-9216-14582acead34`)
**Subscription:** Pay-As-You-Go (`0a96bee6-0b0e-4a8e-8ef7-cc83cb272a81`)
**Cocoon RG:** `rg-Capstone` (created by Bicep)
**Foundry RG:** `RG-SOW` (existing, untouched by Cocoon deploy)
**Location:** `eastus2`
**Deploy duration:** 9m27s (azd's reported time; 9m33s wall-clock including bash overhead)
**Validator:** Zhan Su

## Summary

`azd up` succeeded end-to-end on first try after Kirk granted Zhan sub-level Contributor at 2026-04-25. The full provision-and-deploy ran in 9m27s with no provider-registration prompts, quota errors, or template-validation failures. The cross-sub `foundry-rbac` module successfully authored the `Azure AI Developer` role assignment on `Foundry-SOW` for the ML Container App's system-assigned MI (principalId `aeae842f-ca4e-430a-818e-0d9c78d53f2c`). Deployed-side env vars are correct, the `AZURE_OPENAI_API_KEY` env var and `azure-openai-api-key` secret are absent, and ML startup logs show a clean Uvicorn boot with no `azure.identity` errors. **One caveat:** no Foundry traffic has hit the ML service yet, so the MI → Foundry token path is RBAC-correct on paper but not exercised end-to-end. Recommend a manual frontend test before the May 14 demo to close that gap. Both prior failures (v1 cross-tenant, v2 sub-scope auth) are resolved.

## Background

This is the third validation attempt for COC-118 step 3.

- **v1** (`coc-118-step3-validation.md`) failed with `CrossTenantDeploymentNotPermitted` — Cocoon was deploying from Baylor's tenant into Kirk's tenant, which ARM blocks at the template-validation step regardless of the deploying principal's RBAC.
- **v2** (`coc-118-step3-validation-v2.md`) failed with `AuthorizationFailed` at sub scope after the tenant switch — Zhan's RG-SOW-only RBAC (inherited via `MicrosoftSOWTeam`) couldn't perform `Microsoft.Resources/deployments/validate/action` at the subscription scope that `targetScope = 'subscription'` requires.
- **This run (v3):** Kirk Carver granted Zhan sub-level Contributor on the Pay-As-You-Go subscription on 2026-04-25 to unblock. Combined with the v2 tenant switch, both prior environmental failures should be resolved — and they are.

## Step 1: Deploy

- [x] `azd up` completed without errors (exit code 0)
- Provider registrations needed: none surfaced in the log (either pre-registered on this Pay-As-You-Go sub or completed silently)
- Wall-clock time: 9m27s (azd-reported), 9m33s (bash wall-clock)
- RG created: `rg-Capstone` (2.6s to create; sibling to RG-SOW, never touched RG-SOW)
- Resources provisioned (in the order azd reported them):
  - Container Registry: `crnrflxor4bm2jw` (7.7s)
  - Log Analytics workspace: `log-nrflxor4bm2jw` (24.4s)
  - Container Apps Environment: `cae-nrflxor4bm2jw` (1m49.8s — slowest provision step)
  - Container App: `ca-neo4j-nrflxor4bm2jw` (18.3s)
  - Container App: `ca-postgres-nrflxor4bm2jw` (18.8s)
  - Container App: `ca-ml-nrflxor4bm2jw` (33.7s)
  - Container App: `ca-api-nrflxor4bm2jw` (20.7s)
  - Container App: `ca-web-nrflxor4bm2jw` (19.0s)
- The `foundry-rbac` cross-sub module: not surfaced as a separate progress line in the azd output (azd surfaces RG-scoped resources but not scope-spanning role assignments individually), but the resulting role assignment was authored — verified in step 2.
- Endpoint URLs:
  - api (external): `https://ca-api-nrflxor4bm2jw.proudfield-c2158be3.eastus2.azurecontainerapps.io/`
  - web (external): `https://ca-web-nrflxor4bm2jw.proudfield-c2158be3.eastus2.azurecontainerapps.io/`
  - ml (internal): `https://ca-ml-nrflxor4bm2jw.internal.proudfield-c2158be3.eastus2.azurecontainerapps.io/`
  - neo4j (internal): `https://ca-neo4j-nrflxor4bm2jw.internal.proudfield-c2158be3.eastus2.azurecontainerapps.io/`
  - postgres (internal): `https://ca-postgres-nrflxor4bm2jw.internal.proudfield-c2158be3.eastus2.azurecontainerapps.io/`
- Notable warnings or transient retries: none (only the routine `azd 1.23.5 → 1.24.1 out-of-date` advisory)

### Pre-flight notes (deviations from the runbook)

- The runbook called for `azd env unset AZURE_RESOURCE_GROUP` and `azd env unset SERVICE_*_IMAGE_NAME`. The `unset` subcommand does not exist in azd 1.23.5 (verified by inspecting `azd env --help`; only `config / get-value / get-values / list / new / refresh / remove / select / set / set-secret` are available). The 7 stale entries were removed by editing `.azure/Capstone/.env` directly with prior approval. Effect was identical to the intended `unset`.
- Docker Desktop was not running at first check; user started it before deploy began.

## Step 2: Role assignment verification

- [x] ML Container App MI has `Azure AI Developer` on Foundry-SOW
- ML Container App name: `ca-ml-nrflxor4bm2jw`
- ML Container App principalId: `aeae842f-ca4e-430a-818e-0d9c78d53f2c`
- ServicePrincipal role-assignment principalId on Foundry-SOW: `aeae842f-ca4e-430a-818e-0d9c78d53f2c`
- **Match: yes** (one-to-one match between the Container App's identity.principalId and the principalId of the new role assignment)
- Role assignment ID: `68a0319d-8bd1-5c91-8076-18a4cc326e81`
- Role definition: `64702f94-c441-49e6-a78b-ef80e0188fee` (`Azure AI Developer`)
- Created by: `3c71cf99-967e-4b73-936e-0e6a2dcaa228` (Zhan's user object id) at `2026-04-26T00:33:43Z`
- Total `Azure AI Developer` assignments at Foundry-SOW scope: **2**
  1. Group (principalId `54860a0c-d0ab-4848-8bc5-a66efc644484`, almost certainly `MicrosoftSOWTeam` based on v2 context) — pre-existing
  2. ServicePrincipal (principalId `aeae842f-...`, the ML Container App MI) — **new, authored by this deploy**

**Note on count discrepancy:** the runbook expected "at least three" entries (Zhan direct + group inheritance + new SP). Actual is 2. The v2 report's claim of a "Zhan user direct grant" was inaccurate — Zhan only inherits `Azure AI Developer` via the `MicrosoftSOWTeam` group, not directly. This does not affect the validation: the critical check is the new ServicePrincipal entry, which is present.

**`az` CLI quirk:** `az role assignment list --scope <foundry-resource-id>` returned `(MissingSubscription) The request did not have a subscription or a valid tenant level resource provider`, even with `--subscription` supplied. The same query at RG scope (`--resource-group RG-SOW`) and via `az rest --method GET --url ...providers/Microsoft.Authorization/roleAssignments?...&$filter=atScope()` both worked. Used the `az rest` form to confirm the assignment count at Foundry scope. Filing this here so future validators don't get stuck on the same quirk.

## Step 3: Environment configuration

- [x] Required env vars present on the ML Container App
  - `AZURE_OPENAI_ENDPOINT` = `https://foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW`
  - `AZURE_OPENAI_DEPLOYMENT` = `Kimi-K2.5`
  - `AZURE_OPENAI_API_VERSION` = `2025-01-01-preview`
  - `NEO4J_URI` = `bolt://ca-neo4j-nrflxor4bm2jw:7687`
  - `NEO4J_USER` = `neo4j`
  - `NEO4J_PASSWORD` (secretRef → `neo4j-password`)
- [x] `AZURE_OPENAI_API_KEY` is **NOT** present in env (verified via `properties.template.containers[0].env[].name`)
- [x] No `azure-openai-api-key` in Container App secrets (only `neo4j-password` and `registry-password` are present)
- Full env var list: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (6 total)
- Full secret list: `neo4j-password`, `registry-password` (2 total)

## Step 4: End-to-end Foundry call

- ML Container App startup log summary:
  - Container connected, replica `ca-ml-nrflxor4bm2jw--azd-1777163857-65985d8745-n66ps` started cleanly
  - `BertModel LOAD REPORT` shows `embeddings.position_ids | UNEXPECTED` — normal sentence-transformers load behaviour, not an error
  - 103 weights materialized successfully
  - HuggingFace model assets fetched cleanly (200 OK after standard redirects; the few 404s are for optional template files that don't exist on this model, not failures)
  - `INFO:api:GraphRAG API ready`
  - `INFO: Application startup complete.`
  - `INFO: Uvicorn running on http://0.0.0.0:8001`
- **No `azure.identity` errors, no `DefaultAzureCredential` failures, no 401/403 responses from Foundry, no exceptions.**
- **No actual Foundry call traffic in logs yet** — the service is up and listening, but nothing has exercised the MI → Foundry token-acquisition + LLM-invocation path. This is expected: nothing has hit the ML service since deploy completed (~3 min before logs were captured).
- **Verdict:** pass for "MI auth path is correctly wired and service is healthy", but **unable to validate end-to-end without a manual test**. See recommended action below.

## Step 5: Secret leakage

- [x] `az containerapp show ... | grep -i "openai_api_key\|api-key"` → `No key leakage detected`
- No `AZURE_OPENAI_API_KEY` env var, no `azure-openai-api-key` secret, no stray references in the deployed Container App config JSON

## Verdicts

| Check | Status | Notes |
|---|---|---|
| Deploy succeeded | ✅ | 9m27s, no errors, no provider-registration prompts |
| Role assignment present | ✅ | ML MI `aeae842f-…` granted `Azure AI Developer` on Foundry-SOW |
| Env vars correct | ✅ | All required Foundry env vars present; no `AZURE_OPENAI_API_KEY` |
| MI authenticates to Foundry | ⚠️ unable to validate without manual e2e test | Service started cleanly, no auth errors in logs, but no actual Foundry traffic yet |
| No secret leakage | ✅ | Zero hits for `openai_api_key` / `api-key` in deployed config |

## Issues encountered

1. **`azd env unset` does not exist in azd 1.23.5.** The runbook called for it; substituted by directly editing `.azure/Capstone/.env`. No functional difference. Note for future runbooks: use `azd env set VAR=""` to blank the value, or edit the file directly. The newer azd versions (≥ 1.24) may add `unset`; worth checking.
2. **`az role assignment list --scope <resource-id>` returned `MissingSubscription`.** Worked around with `az rest --method GET --url ".../providers/Microsoft.Authorization/roleAssignments?...&$filter=atScope()"`. Likely an az CLI 2.x bug at certain resource-ID shapes; not deploy-related.
3. **Role-assignment count expectation off in the runbook.** Runbook expected ≥ 3 `Azure AI Developer` entries at Foundry-SOW; actual is 2. v2's claim of a "Zhan direct user grant" was wrong — Zhan only has the role via group inheritance. This doesn't change the verdict.
4. **No Foundry traffic to validate during the log-capture window.** Service started ~3 min before logs were captured; no requests had hit it yet. Standard for a fresh deploy with no inbound traffic. Resolved by manual e2e test (see follow-ups).

## Recommended next action

**Run a manual end-to-end test from the deployed frontend before the May 14 demo to close the "MI authenticates to Foundry" gap, then proceed to step 4** (delete dead `AZURE_OPENAI_API_KEY` GitHub Secret + dead `AZURE_AI_*` backend wiring).

The path forward:

1. Open `https://ca-web-nrflxor4bm2jw.proudfield-c2158be3.eastus2.azurecontainerapps.io/` in a browser.
2. Trigger any feature that hits the ML service (knowledge-graph retrieval, LLM-authoring assistant — anything that flows through `GRAPHRAG_API_URL`).
3. Re-tail ML logs: `az containerapp logs show --name ca-ml-nrflxor4bm2jw --resource-group rg-Capstone --tail 200`
4. Confirm a 200 response from a Foundry call (look for outbound HTTP 200 to `foundry-sow.services.ai.azure.com`). RBAC propagation can take a few minutes after a fresh deploy — first request may 401, but subsequent requests should succeed within ~5 min.
5. If 200s land: validation is fully green, proceed to step 4.
6. If persistent 401s: capture exact error and return to investigation.

If the e2e test goes green, the manual follow-ups below are unblocked.

## Manual follow-ups remaining

- [ ] **Run frontend e2e test** (above) before May 14 demo.
- [ ] (After e2e green) Delete `AZURE_OPENAI_API_KEY` GitHub Secret. Keep until proven; it's the only fallback path until MI auth is confirmed live.
- [ ] (After e2e green) Notify team via Slack/Teams that local dev now requires `az login --tenant 4274bfb0-b43c-4843-9216-14582acead34` and that Kirk needs to grant each developer `Azure AI Developer` on Foundry-SOW for local-dev Foundry calls to work.
- [ ] (Post-validation cleanup, optional) `azd down --purge` between testing sessions to keep costs minimal — Kirk's Pay-As-You-Go is paying. `rg-Capstone` is the only thing it touches; `RG-SOW` and Foundry-SOW are unaffected (verified by Bicep design — see below).
- [ ] Step 4 of COC-118: delete dead `AZURE_AI_*` backend wiring (`AZURE_AI_ENDPOINT` / `AZURE_AI_KEY` env-var injection on the api Container App at `infra/main.bicep:248-249`, plus matching `azure-ai-*` secrets at `:256-257`). These are unrelated to the ML→Foundry MI path but are dead since v1 of step 3.

## Notes for future reference

- Cocoon's Bicep is `targetScope = 'subscription'` and creates `rg-Capstone` as a sibling RG to RG-SOW. `azd down --purge` only deletes `rg-Capstone`, never touches RG-SOW or anything in it (Foundry-SOW, KV-SOW, ML-SOW, Kirk's other resources). The cross-sub `foundry-rbac` role assignment is created in RG-SOW but is technically a child of the Foundry-SOW resource — it should clean up cleanly on `azd down` because Bicep tracks its lifecycle. (If a `down` is performed, re-validate this assumption: `az role assignment list --assignee aeae842f-... --all` after `azd down` should show 0 entries.)
- Sub-level Contributor grant from Kirk persists; future `azd up` runs from Zhan's account work without further Kirk involvement.
- The v2 → v3 unblock did not require any Bicep changes. The branch and commit `db610ef` are validated as-is.
- ML Container App MI principalId (`aeae842f-ca4e-430a-818e-0d9c78d53f2c`) will change on a fresh `azd down` + `azd up` cycle — system-assigned MIs are recreated. The `foundry-rbac` Bicep module re-runs on every deploy and will create a new role assignment for the new principalId. Old role assignments persist as orphans unless manually cleaned up; not a security risk (orphan principal IDs can't be authenticated to) but worth noting for audit hygiene.

## Rollback notes

No rollback needed — validation passed. If something is later found wrong: `azd down --purge --force --no-prompt` from the project root, run from Zhan's account, will tear down `rg-Capstone` and the cross-sub role assignment cleanly. RG-SOW remains untouched.
