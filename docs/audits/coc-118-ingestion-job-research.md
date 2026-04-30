# Neo4j Data-Seeding Job Research

**Date:** 2026-04-26
**Author:** Zhan Su (via Claude Code recon)
**Purpose:** Inform the design of a Container Apps Job that seeds the deployed Neo4j with the `section_embeddings` vector index and source SoW data so that `/context` queries (currently 500ing — see `coc-118-step3-validation-v3-e2e.md`) work end-to-end.

---

## TL;DR (for the implementation prompt)

- Two CLI calls do the seeding: `python main_new.py ingest` then `python main_new.py enrich`. Both are Click commands in `ml/main_new.py`.
- `ingest` uses Foundry heavily (LLM classification + entity/risk/deliverable extraction). The Job's MI **needs** `Azure AI Developer` on Foundry-SOW.
- `enrich` is what actually creates the `section_embeddings` vector index and populates embeddings — it uses local sentence-transformers (no Foundry).
- Source data lives at repo root in `Data/`, which is **NOT** in the ML Docker image today (the `ml` service's docker context is `ml/`). The Job needs the data via either Dockerfile change or blob staging.
- `azure.yaml` exists with 5 services; Container Apps Jobs are NOT registered as azd services — they're Bicep-only resources that azd provisions but doesn't manage as deployable services.
- `foundry-rbac.bicep` currently takes a single `mlPrincipalId`; should be parameterized to accept a list (or invoked twice with different principalIds).
- Container Apps Environment is `Consumption` workload profile — Jobs are supported, same-environment connectivity to Neo4j on `bolt://ca-neo4j-<token>:7687` works.

---

## Q1: Ingestion entry point

**Production CLI:** `ml/main_new.py` (a Click CLI). The older `ml/main.py` exists alongside but uses the simpler synchronous `ingest_markdown` path — it's superseded but not deleted. `ml/pyproject.toml:23` declares `[project.scripts] sow-kg = "main:cli"` pointing at `main.py`, which is stale; the actual production CLI is `main_new.py` and would be invoked directly via `python main_new.py ...`.

**Invocation for seeding:**
```bash
# Phase 1: ingest rules + SOWs (uses Foundry for LLM extraction)
uv run python main_new.py ingest \
  --uri bolt://ca-neo4j-<token>:7687 \
  --user neo4j \
  --password "$NEO4J_PASSWORD" \
  --data-dir /app/Data \
  [--clear]              # optional: wipe graph first
  [--no-cache]           # optional: ignore content-hash cache
  [--workers 8]          # optional: parallel worker cap

# Phase 2: create vector indexes + populate embeddings (uses local model)
uv run python main_new.py enrich [--batch-size 64] [--force]
```

**The `enrich` command is what creates `section_embeddings`** — `ml/sow_kg/enrich.py:95-112` (`ensure_vector_indexes`) iterates `VECTOR_INDEXES` (line 35-41) and runs `CREATE VECTOR INDEX {index_name} IF NOT EXISTS …` for 5 indexes including `section_embeddings`. It then loads `sentence-transformers/all-MiniLM-L6-v2` and embeds Section/Deliverable/Risk/Rule/ClauseType nodes.

**Idempotency:**
- `ingest` uses Cypher `MERGE` everywhere (no duplicates on re-run) plus a SHA-256 content-hash sidecar (`.ingest_cache.json` at the data dir root) that skips unchanged files.
- `enrich` uses `IF NOT EXISTS` on index creation and an `embed_hash` property + `WHERE $force OR n.embed_hash IS NULL` filter so it only re-embeds changed nodes (or all of them with `--force`).
- Both are safe to re-run; first run populates, subsequent runs are fast no-ops.

**Other ingest variants and their roles:**

| File | Role | Used by Job? |
|---|---|---|
| `ml/sow_kg/ingest_async.py` | Production async orchestrator: 2-phase pipeline (foundation CSVs → parallel CSVs+SOWs). Imported by `main_new.py`. | **Yes** (called via `main_new.py ingest`) |
| `ml/sow_kg/ingest.py` | Per-file SOW ingestion logic (LLM-driven). Called by `ingest_async`. No `__main__` — not directly runnable. | **Yes** (transitively via async) |
| `ml/sow_kg/ingest_csv.py` | CSV-specific ingestors (deal_overview, budget, etc.). Called by `ingest_async`. | **Yes** (only if CSVs exist; see Q3) |
| `ml/sow_kg/ingest_json.py` | JSON rules ingestion (banned-phrases, esap-workflow, review-checklists, etc.). Called by `main_new.py ingest` Phase 0. | **Yes** |
| `ml/sow_kg/ingest_markdown.py` | Older simpler markdown SOW ingestion (no LLM). Used by **old** `main.py` only. Superseded. | **No** |

**Missing artifact:** `ingest_async.py` docstrings reference `seed_kg.py` as the producer of rules/banned-phrases/guides ("they are seeded once via seed_kg.py and assumed to already exist in the graph"). **No such file exists in the repo.** That responsibility moved into `main_new.py`'s `ingest` command Phase 0 (`init_schema` + `ingest_all_json`). The doc references are stale; the functionality is intact.

---

## Q2: Env vars and CLI args

| Variable / Arg | Required? | Purpose | Source in code |
|---|---|---|---|
| `NEO4J_URI` env (or `--uri` flag) | Required | Bolt URI (`bolt://host:7687`) | `ml/sow_kg/db.py:12`, `main_new.py:52` |
| `NEO4J_USER` env (or `--user` flag) | Required | Default `neo4j` | `ml/sow_kg/db.py:13`, `main_new.py:53` |
| `NEO4J_PASSWORD` env (or `--password` flag) | Required | DB password | `ml/sow_kg/db.py:14`, `main_new.py:54` |
| `--data-dir` flag | Required (defaults to `<ml/..>/Data` = repo-root `Data/`) | Source data root | `main_new.py:42, 51` |
| `AZURE_OPENAI_ENDPOINT` env | Required (for ingest) | Foundry endpoint URL | `ml/sow_kg/llm_client.py:19` |
| `AZURE_OPENAI_DEPLOYMENT` env | Required (for ingest) | Foundry deployment name (e.g. `Kimi-K2.5`) | `ml/sow_kg/llm_client.py:46` |
| `AZURE_OPENAI_API_VERSION` env | Optional (default `2024-10-21`) | OpenAI API version | `ml/sow_kg/llm_client.py:20` |
| `--clear` flag | Optional | Wipe graph before ingest | `main_new.py:57` |
| `--no-cache` flag | Optional | Ignore `.ingest_cache.json` | `main_new.py:58` |
| `--workers` flag | Optional, default 8 | Parallel worker cap (Phase 2) | `main_new.py:59` |
| `--batch-size` flag (enrich) | Optional, default 64 | Embedding batch | `main_new.py:287` |
| `--force` flag (enrich) | Optional | Re-embed even if hash unchanged | `main_new.py:288` |

**Auth model:** Foundry calls go through `ml/sow_kg/llm_client.py:33-36` which constructs `DefaultAzureCredential() + get_bearer_token_provider()` for scope `https://cognitiveservices.azure.com/.default`. **No API key path exists** — this is the COC-118-migrated client. The Job's MI needs `Azure AI Developer` on Foundry-SOW, full stop.

**Hardcoded password warning:** `main_new.py:55` has `--password default="capstone202620222Password"` — same value as the deployed `AZURE_NEO4J_PASSWORD` in `.azure/Capstone/.env`. Convenient for local dev; not great hygiene. The Job should explicitly pass via `secretRef` rather than relying on the default.

---

## Q3: Source data location

**Where data lives:** `Data/` at the repo root (not in `ml/Data/`, not generated). Confirmed structure:

```
Data/
├── Capstone-Data.zip                              # Archive of guides + SOWs + 1 rules file (legacy)
├── RISK_ASSESSMENT_AND_MITIGATION_FRAMEWORK.md
├── rules/
│   ├── compliance/
│   │   ├── banned-phrases.json
│   │   └── required-elements.json
│   ├── methodology/
│   │   └── methodology-alignment.json
│   └── workflow/
│       ├── esap-workflow.json
│       └── review-checklists.json
├── SOW Guides MD/                                 # 9 guide markdown files
│   ├── SOW_Writing_Guide_Formatted.md
│   ├── SOW Drafting Guidance & Deal Review Standards.md
│   └── ...
└── sow-md/                                        # 7 sample SOW markdown files
    ├── contoso-agile-sow.md
    ├── contoso-data-strategy.md
    └── ...
```

**Currently bundled in ML Docker image?** **No.** `ml/Dockerfile` does `COPY . .` from build context, and `azure.yaml:22-28` sets the ml service's docker context to `./ml/` (relative to `project: ./ml`). So only `ml/`'s contents are in the image — `Data/` is at repo root, one level up. Additionally, `ml/.dockerignore` excludes `*.md` and `kg_data_gen/output/`, which would matter only if `Data/` ever ended up under `ml/`.

**CSVs are NOT in `Data/`.** The async ingest pipeline expects `deal_overview.csv`, `project_closeout.csv`, `budget.csv`, etc. in the data dir, but the only CSV-producing artifact in the repo is `ml/kg_data_gen/run.py`, which writes to `ml/kg_data_gen/output/csvs/`. The output directory exists but is currently empty; it's also `.dockerignore`d. **Implication: a Job using just `Data/` will run ingest with the JSON rules + SOW markdown, and the CSV ingestion phases will print "file not found, skipping" warnings — that's fine for unblocking `/context`, since `section_embeddings` only embeds Section/Deliverable/Risk/Rule/ClauseType nodes, all of which come from the markdown path.** CSVs are needed for richer Project/Customer/Budget queries but not for the immediate validation path.

**Approximate size:** `Data/` is ~1 MB total (8 SOW MDs + 9 guide MDs + 5 JSON rule files + 1 risk framework MD + the redundant zip). Trivially bundleable.

**Implication for Job:** Three options:

1. **Bundle into image (recommended).** Easiest. Either change azure.yaml to put the ml service docker context at `./` and update Dockerfile paths (`COPY ml/ /app/ml/` + `COPY Data/ /app/Data/`), OR create a separate `Dockerfile.ingestion` for the Job that explicitly bakes in `Data/`. The Job points at the resulting image. ~1 MB cost; rebuilds on every `azd deploy`.
2. **Stage in Azure Storage Blob.** Upload `Data/` to a Storage Account container at deploy time (azd hook), have the Job download via `azcopy` or the Python SDK at startup. More moving parts; introduces a Storage Account into the deploy.
3. **`git clone` at startup.** Job pulls the repo from GitHub on each run. Requires public repo OR a deploy key, adds network failure modes, ~1MB to ~50MB transfer.

Recommendation: **Option 1** — a separate `Dockerfile.ingestion` that uses the same Python base + `Data/` baked in. Keeps the runtime ML image lean and doesn't affect anything else.

---

## Q4: Foundry usage during ingestion

**Does ingestion call Foundry?** **Yes, heavily during `ingest`; no during `enrich`.**

**`ingest` Foundry-using steps** (all routed through `ml/sow_kg/llm_client.py` → `DefaultAzureCredential` → AzureOpenAI):
- `classify_section(heading, preview)` — assigns each Section to a SoW clause type. Called per Section in `ingest.py:140-151`.
- `extract_entities(heading, content)` — pulls structured entities + relationships + schema proposals per Section. Called in `ingest.py:288, 414`.
- `extract_risks_llm(content)` — extracts risks from risk sections. Called in `ingest.py:297`.
- `extract_deliverables_llm(content)` — extracts deliverables. Called in `ingest.py:326`.

A typical 7-SOW × ~20-section ingest run will issue several hundred Foundry chat completions. Token cost is real but small.

**`enrich` Foundry usage:** **None.** `ml/sow_kg/enrich.py:122` imports `from sentence_transformers import SentenceTransformer` and runs `sentence-transformers/all-MiniLM-L6-v2` locally inside the container to produce 384-dim vectors. This is the same model the deployed ML Container App already loads at startup (matches the `Loading weights` log lines we observed in v3 validation).

**Implication for Job MI:**
- Job needs `Azure AI Developer` on Foundry-SOW (same role as the ML Container App's MI).
- Job MI does NOT need Storage Blob or any other Azure-side role for the data — local file reads only.
- Cleanest: parameterize `infra/modules/foundry-rbac.bicep` to accept a list of principalIds, then invoke once with `[ml.outputs.principalId, ingestionJob.outputs.principalId]`.

**Sentence-transformers also used?** Yes — split is clean: Foundry for LLM/extraction, sentence-transformers for embeddings. No overlap.

---

## Q5: azd project structure

**`azure.yaml` exists?** Yes, at `./azure.yaml` (16 lines):

```yaml
name: cocoon
metadata:
  template: cocoon-template
services:
  api:    { project: ./backend,  language: python, host: containerapp, docker: { path: ./Dockerfile, context: . } }
  web:    { project: ./frontend, language: js,     host: containerapp, docker: { path: ./Dockerfile, context: . } }
  ml:     { project: ./ml,       language: python, host: containerapp, docker: { path: ./Dockerfile, context: . } }
  neo4j:  { project: ./,         host: containerapp, image: neo4j:5-community, docker: { path: ./Dockerfile.neo4j,    context: . } }
  postgres: { project: ./,       host: containerapp, image: postgres:16-alpine, docker: { path: ./Dockerfile.postgres, context: . } }
hooks:
  postprovision: { ... }
```

5 services registered, all `containerapp` host type. There's a postprovision hook but no postdeploy.

**Recommended Job placement:** **Pure Bicep** (do NOT register the Job as an azd service). Rationale:
- azd's `services` registry expects deployable apps with persistent endpoints. Container Apps Jobs are run-on-demand resources that don't have an "endpoint" in the azd sense.
- The image the Job runs CAN be built by an existing azd service (the `ml` service builds and pushes `cocoon/ml-capstone:azd-deploy-...` to ACR), and the Job module references that image by reading `containerRegistry.outputs.loginServer + cocoon/ml-capstone:latest` (or a parameterized tag).
- Alternatively, if we go with a separate `Dockerfile.ingestion`, register a new service `ingestion` in `azure.yaml` with `host: containerapp` (Job is an extension of containerapp), but Bicep declares the resource as `Microsoft.App/jobs` rather than `Microsoft.App/containerApps`. This is the cleaner separation.

**Existing Container App module pattern (conventions to mirror):**
- One Bicep file per container service in `infra/modules/<svc>-container.bicep` (e.g., `ml-container.bicep`, `neo4j-container.bicep`, `postgres-container.bicep`); generic apps use the shared `container-app.bicep`.
- Each takes params: `name`, `location`, `tags`, `containerAppsEnvironmentId`, `containerRegistryName`, `<service-specific>`.
- ACR auth: `containerRegistry.listCredentials()` for username/password, stored as `registry-password` secret.
- Identity: `type: 'SystemAssigned'`. `output principalId string = <res>.identity.principalId`.
- Image placeholder for azd-managed deploy: `mcr.microsoft.com/azuredocs/containerapps-helloworld:latest` (azd swaps it on `azd deploy`).
- Internal-only services: `ingress.external = false` + `additionalPortMappings` if non-HTTP needed (see `neo4j-container.bicep:55-61`).
- A new `infra/modules/ingestion-job.bicep` should follow the same param shape but produce a `Microsoft.App/jobs@2024-03-01` resource with `properties.configuration.triggerType = 'Manual'` (for `az containerapp job start`-driven runs).

---

## Q6: Foundry RBAC module reuse

**Current `foundry-rbac.bicep` shape:** Accepts a single `mlPrincipalId string` param, creates one role assignment for `Azure AI Developer` (`64702f94-c441-49e6-a78b-ef80e0188fee`) on the existing `Foundry-SOW` account. Invoked from `infra/main.bicep:214-221` with `mlPrincipalId: ml.outputs.principalId`.

**Recommended approach:** **Parameterize to accept a list.** Two viable options:

**A. Refactor existing module to take a list (cleaner):**
```bicep
// foundry-rbac.bicep
param foundryAccountName string
param principalIds array  // <-- list now

resource foundry 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: foundryAccountName
}

resource roleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in principalIds: {
  scope: foundry
  name: guid(foundry.id, principalId, '64702f94-c441-49e6-a78b-ef80e0188fee')
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '64702f94-c441-49e6-a78b-ef80e0188fee')
    principalType: 'ServicePrincipal'
  }
}]
```

`main.bicep` then calls it once: `params: { principalIds: [ml.outputs.principalId, ingestionJob.outputs.principalId] }`.

**B. Invoke twice:** Keep the module unchanged, declare two `module foundryRbac` invocations in `main.bicep` with different `name`s. Works but creates near-duplicate code; minor duplication tax.

Option A is the right call here — the role-assignment shape is identical for both principals, the module's existing scope (`existing` Foundry account) supports it cleanly, and adding more MI consumers in future (api Container App's MI for any direct Foundry calls, etc.) becomes a one-line change.

**Migration risk:** Bicep `for` loops over `principalIds` are stable and well-supported. The existing single role assignment will be retained on redeploy because the `guid()` name function produces the same deterministic name for the same `(foundry.id, principalId, roleId)` tuple.

---

## Q7: Neo4j connectivity from a Job in same Environment

**Internal Bolt URL pattern:** `bolt://ca-neo4j-<token>:7687` where `<token>` is `uniqueString(subscription().id, environmentName, location)` per `infra/main.bicep:89`. For the current deploy, that's `bolt://ca-neo4j-nrflxor4bm2jw:7687`. The Job should construct this from `neo4j.outputs.name` rather than hardcoding the token, mirroring how `ml-container.bicep:205` does it: `'bolt://${neo4j.outputs.name}:7687'`.

**Container Apps Environment type:** **Consumption-only workload profile** (`infra/modules/container-apps-environment.bicep:31-36`):
```bicep
workloadProfiles: [
  { name: 'Consumption', workloadProfileType: 'Consumption' }
]
```
Container Apps Jobs are fully supported on Consumption profiles (`Microsoft.App/jobs@2024-03-01` works the same way as Container Apps).

**Same-environment connectivity confirmed:** Yes. The Container Apps Environment provides internal DNS — any container or job in the same Environment can reach `ca-neo4j-<token>` by name on its declared port (7687). The Neo4j ingress is `external: false` with `additionalPortMappings` exposing 7687 internally only — exactly what we need.

---

## Recommended Job design (summary for implementation prompt)

Based on the answers above:

- **Image:** Separate `Dockerfile.ingestion` at repo root (or `ml/Dockerfile.ingestion`) that bakes in `Data/` and reuses the same Python + uv setup as `ml/Dockerfile`. Tag: `cocoon/ingestion:azd-deploy-<timestamp>` pushed to the existing ACR.
  - Alternative: register as an azd service `ingestion` in `azure.yaml` so azd handles the build+push.
  - Alternative-alternative: reuse the `ml` image but stage `Data/` via a second `COPY` line (requires changing the ml service's docker context to repo root and updating COPY paths — invasive).

- **Command:** Two-step. Either chain in one shell step or run as two sequential job executions:
  ```bash
  uv run python /app/ml/main_new.py ingest \
      --uri "bolt://${NEO4J_HOST}:7687" \
      --user "$NEO4J_USER" \
      --password "$NEO4J_PASSWORD" \
      --data-dir /app/Data \
      --no-cache \
    && uv run python /app/ml/main_new.py enrich --batch-size 64
  ```
  (Or split into `ingestion-job` and `enrichment-job` resources. Probably overkill for v1.)

- **Env vars:**
  - `NEO4J_HOST` (from `neo4j.outputs.name`)
  - `NEO4J_USER` = `neo4j`
  - `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` (mirror what `ml-container.bicep` sets)

- **Secrets:**
  - `neo4j-password` (`secretRef` for `NEO4J_PASSWORD`)
  - `registry-password` (for ACR pull)

- **Identity:** SystemAssigned. Role assignments needed:
  - `Azure AI Developer` (`64702f94-c441-49e6-a78b-ef80e0188fee`) on Foundry-SOW (added to refactored `foundry-rbac.bicep` principalIds list)

- **Trigger type:** `Manual` (`properties.configuration.triggerType = 'Manual'`). Operator runs via `az containerapp job start --name <job> --resource-group rg-Capstone`. Could later add `Schedule` for periodic re-ingestion if data set grows.

- **Replica timeout / `replicaTimeout`:** Recommend **3600 seconds** (1 hour). Empirical: 7 SOWs × ~20 sections × ~4 LLM calls each = ~560 Foundry calls, at ~2-3s per call (including retries) = ~20-30 min of Foundry work. Enrichment is faster (~1-2 min for ~150 nodes). 1h gives generous headroom; cheap on Consumption since it scales to zero between runs.

- **Replica retry limit:** 1 (don't auto-retry — failures need investigation, not blind retry).

- **Parallelism:** 1 (single replica per run; the in-process `--workers 8` already parallelizes Foundry calls).

- **Data dependency:** **Bundled in image** via separate `Dockerfile.ingestion` (recommended). Avoids a Storage Account for ~1 MB of mostly-static data.

---

## Risks and open questions

1. **Stale `seed_kg.py` references in `ingest_async.py` docstrings** could mislead a future reader. Worth a separate cleanup commit (out of scope for this task).
2. **`pyproject.toml:23` declares `sow-kg = "main:cli"` pointing at the OLD `main.py`** — if anyone installs `ml` as a package and runs `sow-kg ingest`, they get the wrong (legacy) CLI. The Job uses direct `python main_new.py` invocation so this doesn't bite us, but it's a foot-gun. (Out of scope.)
3. **Hardcoded Neo4j password default in `main_new.py:55`** — same as `.azure/Capstone/.env` value. The Job MUST use a `secretRef` rather than the CLI default; verify in the Bicep that the env passes the secret, not a hardcoded literal.
4. **CSV ingestion will print "not found" warnings** during the Job's ingest phase since `Data/` doesn't have CSVs. Cosmetically noisy; functionally correct. If we want clean logs, either generate placeholder empty CSVs (not great) or run `kg_data_gen/run.py` first to produce real synthetic CSVs (much bigger scope — separate Job, separate decision).
5. **Idempotency cache (`.ingest_cache.json`) is written into `data_dir`.** If `Data/` is read-only in the image (typical for `COPY`), the cache write will fail or be invisible. Either bake `Data/` writable, mount an emptyDir-equivalent for the cache, or pass `--no-cache` (recommended for the Job — re-running with no cache is fine since `MERGE` is idempotent).
6. **Foundry token / RBAC propagation timing on first Job run.** If the role assignment is created at the same `azd up` as the Job's MI, the first Job invocation may hit a brief 401 window before RBAC propagates (~1-5 min). Worth a `--retry` strategy in the CLI invocation or a documented "wait 5 min after deploy before triggering the first run" note.
7. **Neo4j Container App is ephemeral storage** (`neo4j-container.bicep:6-9` notes "Data is lost on restart"). After every Neo4j restart (e.g., new revision), the Job needs to re-run. Consider making the Job auto-trigger on Neo4j Container App restart (probably out of scope; manual re-trigger is fine for the demo).
8. **Replica timeout choice (1h) is a guess.** If the team has a measured local-dev `python main_new.py ingest` runtime against the full `Data/`, use that × 2 as the Job's `replicaTimeout`. Worth checking once before committing.
9. **No telemetry / structured logging configured for the Job.** `console.print` Rich output goes to stdout, which Container Apps Jobs route to Log Analytics. Adequate for v1; consider OpenTelemetry instrumentation if the Job becomes operational rather than one-off.
