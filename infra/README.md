# Cocoon infrastructure

Bicep templates for the Cocoon SoW Automation system. Provisioned by `azd up` from the repo root; orchestration config lives in `azure.yaml`.

## Resource layout

`infra/main.bicep` is `targetScope = 'subscription'` and creates a sibling resource group `rg-Capstone` (not RG-SOW; Foundry-SOW lives in RG-SOW and is referenced via cross-sub `existing` lookup, never modified). Inside `rg-Capstone`:

- 1 Log Analytics workspace
- 1 Container Registry
- 1 Container Apps Environment (Consumption profile)
- 5 Container Apps: api, web, ml, neo4j, postgres
- 1 Container Apps Job: ingestion (manual trigger; see below)

A cross-sub role assignment grants `Azure AI Developer` on Foundry-SOW to two MIs: the ML Container App's MI and the ingestion Job's MI. Both via `infra/modules/foundry-rbac.bicep`, parameterized to take an array of principalIds — adding more MIs is a one-line change in `main.bicep`.

## Triggering the Neo4j ingestion job

The deployed Neo4j Container App starts empty (Container Apps storage is ephemeral; see `infra/modules/neo4j-container.bicep:6-9`). The `caj-ingest-<token>` Container Apps Job seeds it with the `section_embeddings` vector index and the source SoW data from `Data/`.

### When to run

- **After every fresh `azd up`** against a new (or torn-down) environment
- **After Neo4j Container App restart** (any restart — revision change, scale event with no min replica, manual restart — wipes the graph)
- **After ingestion code or `Data/` source changes** so the deployed image picks up the new logic / data

The Job is **manual trigger only**. It does NOT run automatically as part of `azd up`. Two reasons:
- Keeps deploys fast (the ingest phase issues several hundred Foundry chat completions and runs ~20-40 min)
- Avoids surprise Foundry token consumption on every infrastructure tweak

### How to run

```bash
# Find the Job's full name (varies per environment — the resourceToken suffix
# is computed from sub-id + env name + location).
JOB_NAME=$(az containerapp job list \
  --resource-group rg-Capstone \
  --query "[?starts_with(name, 'caj-ingest-')].name | [0]" \
  --output tsv)
echo "Job: $JOB_NAME"

# IMPORTANT — first-run RBAC propagation:
# After a fresh `azd up`, the Job's MI was just granted Azure AI Developer
# on Foundry-SOW (cross-sub). RBAC propagation across subs takes a few minutes;
# triggering the Job immediately can produce a 401 on the first Foundry call.
# Wait ~5 minutes after `azd up` completes before the first trigger.

# Start the Job (returns immediately; the run is async)
az containerapp job start \
  --name "$JOB_NAME" \
  --resource-group rg-Capstone

# Get the latest execution name (use the timestamp to pick the run you just started)
EXEC_NAME=$(az containerapp job execution list \
  --name "$JOB_NAME" \
  --resource-group rg-Capstone \
  --query "[0].name" \
  --output tsv)
echo "Execution: $EXEC_NAME"

# Tail logs (the Job's stdout — Rich console output from the CLI). Use the
# system-type logs to capture both the ingest and enrich phases.
az containerapp logs show \
  --name "$JOB_NAME" \
  --resource-group rg-Capstone \
  --container ingest-and-enrich \
  --type system \
  --follow false \
  --tail 200

# Check execution status / wall-clock time
az containerapp job execution show \
  --name "$EXEC_NAME" \
  --job-name "$JOB_NAME" \
  --resource-group rg-Capstone \
  --query "{status:properties.status, startedAt:properties.startTime, endedAt:properties.endTime}" \
  --output json
```

Expected wall-clock: **20-40 minutes** for the full `Data/` set (7 SOWs + 9 guides + 5 JSON rule files). Distribution: ingest ~18-38 min (Foundry-bound), enrich ~1-2 min (local sentence-transformers).

### Verification after ingestion completes

The simplest end-to-end check is to re-trigger a `/context` request from the deployed frontend and confirm it returns 200 instead of the previous 500. For deeper inspection, exec into the Neo4j Container App and run Cypher:

```bash
az containerapp exec \
  --name ca-neo4j-<token> \
  --resource-group rg-Capstone \
  --command "cypher-shell -u neo4j -p $NEO4J_PASSWORD"
```

Then in the Cypher shell:

```cypher
SHOW VECTOR INDEXES;                           -- expect section_embeddings ONLINE
MATCH (s:SOW) RETURN count(s);                 -- expect 7 (sample SoWs in Data/sow-md/)
MATCH (sec:Section) WHERE sec.embedding IS NOT NULL RETURN count(sec);  -- expect dozens
MATCH (ct:ClauseType) RETURN count(ct);        -- expect dozens
MATCH (b:BannedPhrase) RETURN count(b);        -- expect dozens (from rules/compliance/banned-phrases.json)
```

### Cosmetic warnings during ingestion (safe to ignore)

The Job will print **"file not found, skipping"** warnings for `deal_overview.csv`, `project_closeout.csv`, `budget.csv`, `staffing_plan.csv`, `staffing_actuals_fcst.csv`, and `status_report.csv`. These CSVs are not in `Data/`; they're produced by `ml/kg_data_gen/run.py` when run separately.

The CSV-based data only feeds richer Project / Customer / Budget queries; the `section_embeddings` index and the SoW-markdown ingestion path complete fine without them. Ignoring these warnings is correct for the immediate goal of unblocking `/context`. If we later want the richer queries, generate the CSVs (`cd ml/kg_data_gen && python run.py`), commit the `output/csvs/`, and re-run the Job.

## Deploying

From the repo root:

```bash
azd up               # provisions + deploys everything (full first-time deploy ~10 min)
azd provision        # provisions infrastructure only (Bicep)
azd deploy           # deploys containers only (rebuild + push images, update revisions)
azd down --purge     # tears down rg-Capstone (RG-SOW and Foundry-SOW are NOT touched)
```

Tenant + sub context (current):
- Tenant: Kirk Carver - Personal (`4274bfb0-b43c-4843-9216-14582acead34`)
- Subscription: Pay-As-You-Go (`0a96bee6-0b0e-4a8e-8ef7-cc83cb272a81`)
- Region: eastus2

Operator must have at minimum sub-level `Contributor` (Kirk granted Zhan this on 2026-04-25 to unblock — see `docs/audits/coc-118-step3-validation-v3.md`) plus `User Access Administrator` on RG-SOW (inherited via the `MicrosoftSOWTeam` group) for the cross-sub `foundry-rbac` role assignments to succeed.
