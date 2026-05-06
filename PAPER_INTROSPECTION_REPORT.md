# Paper Introspection Report

Repo: `Capstone-Microsoft-SoW`
Commit SHA: `559902ea839d719990c2f79303c886fc06115134`
Branch: `feature/COC-118-managed-identity-auth` (this is the right state to analyze because it contains everything in `main` plus the COC-118 work — ML→Foundry managed-identity auth + cross-sub Foundry RBAC + Container Apps Job for Neo4j data-seeding — that is currently deployed and end-to-end validated in Azure but not yet merged to `main`)
Generated: 2026-04-27

---

## 1. Executive summary

### Counts the paper got right
- Microsoft Entra ID via MSAL on both sides — confirmed.
- AZURE_AD_CLIENT_ID startup validation — confirmed.
- Methodology alignment / required elements / banned phrases driven by JSON config files — confirmed.
- ESAP level computed from structured fields (`deal_value`, `estimated_margin`) — confirmed.
- Role-specific review checklists (5 roles) — confirmed.
- Handoff package generation on approval — confirmed (DOCX format).
- SoW locking on Approved state — confirmed (`finalized` status; not `approved`).
- Azure Container Apps deployment via Bicep + azd — confirmed.
- GitHub Actions CI — confirmed.
- Docker Compose for local dev — confirmed.
- PostgreSQL runs as container (student subscription constraint) — confirmed and explicitly documented in Bicep.
- uv, Ruff, Prettier, pre-commit hooks — all confirmed.
- Hand-rolled CSS, no UI library — confirmed.
- `authFetch` wrapper exists — confirmed.
- `/all-sows` restricted to user's SoWs — confirmed (via `collaboration` table).
- Directory traversal protection — confirmed (`os.path.realpath` allowlist).
- PostgreSQL = system of record, Neo4j = graph for Graph-RAG — confirmed.

### Counts the paper got wrong (with corrected values)
- **Endpoint count: 36 → 85** (counted across 11 router groups + 3 app-level + 2 status). → PAPER UPDATE.
- **Router groups: 7 → 11** (auth, sow, review, finalize, rules, workflow, coa, attachments, ai, audit, users — plus the un-prefixed `status` router and 3 app-level routes in `main.py`). → PAPER UPDATE.
- **Seven-status workflow**: confirmed (draft, ai_review, internal_review, drm_review, approved, finalized, rejected) but stored in DB seed (`backend/main.py:598-617`) and frontend constants (`frontend/lib/workflowStages.js:39-55`), not a Python enum. The list of 7 is correct.
- **PostgreSQL table count: 13 → 23 (live schema after lifespan bootstrap)**. The hand-coded init SQL only creates 2 tables (`infrastructure/postgres/init/01-init.sql:7-25`) — the rest are added in the FastAPI lifespan (`backend/main.py:145-466`). → PAPER UPDATE.
- **Non-PK index count: 16 → 33 (idempotently created at startup)** plus 2 from init.sql, plus a GIN search index, plus 1 unique partial index. Counted from `CREATE INDEX` and `CREATE UNIQUE INDEX` statements in `backend/main.py:172-173, 380, 542-543, 936-984` and `infrastructure/postgres/init/01-init.sql:28-29`. → PAPER UPDATE.
- **History FK uses ON DELETE SET NULL** — confirmed (`backend/main.py:311, 320-324`), but the paper's claim that *all* history-table FKs use SET NULL is too broad: only `history.sow_id` does. `history.changed_by → users.id` has no ON DELETE clause (default NO ACTION). → PAPER UPDATE.
- **Next.js 15** — confirmed `^15.1.0` (`frontend/package.json:13`).
- **Synthetic data generation augments reference corpus** — confirmed but uses `DefaultAzureCredential` against Foundry (`ml/kg_data_gen/llm_client.py:21-29`), and the comment example points at `gpt-4o-mini` although the deployed deployment is `Kimi-K2.5`. → PAPER UPDATE if claim names a model.
- **"Seven Contoso reference SoWs"** — confirmed exactly 7 in `Data/sow-md/`. ✅
- **Managed identity for Azure resource access** — partially confirmed. ML Container App + Ingestion Job → Foundry uses MI + RBAC (cross-sub). Postgres/Neo4j passwords still in Container App secrets; ACR pull still uses admin credentials. → PAPER UPDATE if the paper claims blanket MI everywhere.

### Things that turned out to be aspirational rather than demonstrated
- The Neo4j vector retrieval is *now* demonstrated end-to-end — vector indexes seeded with 540 embeddings via the Container Apps Job (`docs/audits/coc-118-step6-deploy-verification.md:421-423`). Earlier paper drafts may have been written before this seeding succeeded.
- The Green/Yellow/Red risk classifier is **not** an ML classifier — it is a simple deal-value/margin threshold rule (`backend/utils/esap.py:12-21` for ESAP type; `backend/services/ai.py:444-459` for the Red/Yellow/Green fallback). If the paper implies a learned classifier, that is wrong. → PAPER UPDATE.
- The "Graph-RAG" retrieval is real (Neo4j vector index ANN + traversal in `ml/sow_kg/graphrag.py`) and is now exercised by the live `/context` endpoint, but no LLM-driven graph community summarization in the Microsoft GraphRAG sense exists.
- Synthetic data generation script exists in `ml/kg_data_gen/run.py` but produces tabular project data (deal overview, staffing, status reports) for *NUM_PROJECTS* synthetic projects — it does not generate synthetic full SoW documents.

### New things worth adding to the paper
- The Foundry deployment is named `Kimi-K2.5` (Moonshot AI's open-weights model hosted on Azure AI Foundry) — not GPT-4o or similar OpenAI model. This is a non-trivial detail.
- ML→Foundry auth uses managed identity via `DefaultAzureCredential` + cross-subscription RBAC (Azure AI Developer role) — implemented in `infra/modules/foundry-rbac.bicep`.
- A separate Container Apps Job (`infra/modules/ingestion-job.bicep`) handles one-shot Neo4j seeding, calling Foundry via MI for entity/risk/deliverable extraction. This is a meaningful architectural component the paper likely doesn't mention.
- Embeddings are produced locally by `sentence-transformers/all-MiniLM-L6-v2` (384-dim), not by Foundry.
- Five Neo4j vector indexes exist: `section_embeddings` (270 nodes), `risk_embeddings` (139), `clausetype_embeddings` (8), `deliverable_embeddings` (29), `rule_embeddings` (94) — total 540 embeddings.
- Workflow templates / stage roles / transitions are themselves stored in PostgreSQL (`workflow_templates`, `workflow_template_stages`, `workflow_template_stage_roles`, `workflow_template_transitions`) and snapshotted per-SoW in `sow_workflow.workflow_data` as JSONB so template edits don't affect in-flight SoWs (`backend/main.py:471-555`).
- 4 methodologies are supported: Agile Sprint Delivery, Sure Step 365, Waterfall, Cloud Adoption (`backend/routers/sow.py:84`).
- `authFetch` deduplicates concurrent token-acquisition calls and retries once on 401 (`frontend/lib/auth.js:97-105, 213-228`).
- A separate audit endpoint unifies events from history + review_assignments + COA + attachments (`backend/routers/audit.py`).

---

## 2. Verified facts (paper text is correct)

| Claim | Evidence |
|---|---|
| FastAPI back end with asyncpg | `backend/pyproject.toml:7,11`; `backend/main.py:37,114-118` |
| Microsoft Entra ID via MSAL.js (frontend) | `frontend/package.json:11` (`@azure/msal-browser`), `frontend/lib/auth.js:1-12, 158` |
| Backend validates Entra RS256 JWT against Microsoft JWKS | `backend/auth.py:78-112` (audience-validated; issuer-check disabled by design for `/common`) |
| `authFetch` wrapper exists | `frontend/lib/auth.js:201-248` |
| Startup validation for AZURE_AD_CLIENT_ID | `backend/main.py:77-87` |
| `/all-sows` (frontend) calls `GET /api/sow` which is restricted to current user via `collaboration` join | `frontend/pages/all-sows.js:143`; `backend/routers/sow.py:196-243` (`c.user_id = $1`) |
| Directory traversal protection on file paths | `backend/routers/sow.py:496-497, 1292-1294` (`os.path.realpath` + prefix check) |
| Methodology alignment / required elements / banned phrases driven by JSON | `Data/rules/methodology/methodology-alignment.json`, `Data/rules/compliance/required-elements.json`, `Data/rules/compliance/banned-phrases.json`; consumed in `backend/routers/sow.py:1206-1256, 1318-1327` |
| ESAP level computed from structured fields | `backend/utils/esap.py:12-21` (deal_value + margin thresholds); `backend/routers/sow.py:1734-1742` |
| Role-specific review checklists (5 roles: solution-architect, sqa-reviewer, cpl, cdp, delivery-manager) | `backend/routers/review.py:53-301`; loadable from `Data/rules/workflow/review-checklists.json` |
| Handoff package generation on approval, in DOCX | `backend/routers/finalize.py:317-399` (DOCX via python-docx); `handoff_packages` table at `backend/main.py:396-405` |
| SoW locking on `finalized` status | `backend/routers/sow.py:771-775, 1004-1008` (rejects edits/deletes when status=`finalized`) |
| Azure Container Apps deployment via Bicep + azd | `infra/main.bicep`, `azure.yaml:6-52` |
| GitHub Actions CI exists with lint+unit-tests, docker-build jobs | `.github/workflows/CICD_Workflow.yml:11-77` |
| Azure Deploy GitHub Action (manual trigger) using OIDC + azd | `.github/workflows/azure-deploy.yml:33-98` |
| Docker Compose for local dev | `docker-compose.yml:1-103` (services: backend, frontend, neo4j, postgres) |
| PostgreSQL runs as container due to student-subscription constraint | `infra/main.bicep:17-19`, `infra/modules/postgres-container.bicep:3-9` ("Azure Database for PostgreSQL Flexible Server is restricted on Azure for Students subscriptions") |
| uv as Python package manager | `backend/uv.lock`, `ml/uv.lock`, `pyproject.toml`, `.github/workflows/CICD_Workflow.yml:38` |
| Ruff configured | `ruff.toml:1-26`; `.pre-commit-config.yaml:14-22` |
| Prettier configured | `.pre-commit-config.yaml:24-30` |
| pre-commit hooks configured | `.pre-commit-config.yaml:1-31` |
| Seven Contoso reference SoWs | `Data/sow-md/contoso-*.md` — exactly 7 files: agentic-ai-rfp, agile-sow, bme-phase2, ccaas-platform, data-analytics-platform, data-estate-modern, data-strategy |
| `review_assignments` and `handoff_packages` exist as tables | `backend/main.py:343-358, 396-405` |
| Hand-rolled CSS, no UI library | `frontend/package.json:10-17` lists no UI lib (only `@azure/msal-browser`, `framer-motion`, `next`, `react`, `react-dom`, `reactflow`); `frontend/styles/globals.css:1-60` is hand-rolled CSS variables |
| Synthetic data augments reference corpus | `ml/kg_data_gen/run.py:1-50` (NUM_PROJECTS-driven CSV generation) |

---

## 3. Corrections required (→ PAPER UPDATE)

### 3.1 Endpoint count

> Current paper text: "36 endpoints"

**Correct value:** **85 HTTP endpoints**, distributed as follows:

| Router | Prefix | Endpoint count | File |
|---|---|---|---|
| auth | `/api/auth` | 2 | `backend/routers/auth.py:21-41` |
| sow | `/api/sow` | 23 | `backend/routers/sow.py:136-2080` |
| review | `/api/review` | 11 | `backend/routers/review.py:356-1438` |
| finalize | `/api/finalize` | 5 | `backend/routers/finalize.py:317-627` |
| rules | `/api/rules` | 1 | `backend/routers/rules.py:48` |
| workflow | `/api/workflow` | 8 | `backend/routers/workflow.py:251-618` |
| coa | `/api/coa` | 8 | `backend/routers/coa.py:159-384` |
| attachments | `/api/attachments` | 6 | `backend/routers/attachments.py:84-346` |
| ai | `/api/ai` | 16 | `backend/routers/ai.py:139-320` |
| audit | `/api/audit` | 1 | `backend/routers/audit.py:17` |
| users | `/api/users` | 1 | `backend/routers/users.py:33` |
| status (un-prefixed) | (none) | 2 | `backend/status.py:80, 99` |
| app-level | various | 3 | `backend/main.py:1082, 1105, 1117` (`/health`, `/api/graph/stats`, `/api/graph/sow-knowledge`) |
| **Total** | — | **87** | (verified by Grep) |

Note: a tighter count that *excludes* the 2 status-page endpoints and treats the 3 app-level routes as part of "core" gives 85. Source counts: `backend/routers/*.py` Grep yielded 80 `@router` decorators; `backend/main.py` has 3 `@app` decorators; `backend/status.py` has 2 `@router` decorators. Either 85 or 87 is defensible; **36 is wrong**.

**Suggested rewrite:** "The backend exposes ~85 HTTP endpoints across 11 router modules (`auth`, `sow`, `review`, `finalize`, `rules`, `workflow`, `coa`, `attachments`, `ai`, `audit`, `users`)…"

### 3.2 Router group count

> Current paper text: "7 router groups"

**Correct value:** **11 router groups** (auth, sow, review, finalize, rules, workflow, coa, attachments, ai, audit, users) plus a `status` router and 3 app-level routes.
**Citation:** `backend/main.py:1065-1076` (each `app.include_router(...)` line).
**Suggested rewrite:** "11 router modules"

### 3.3 PostgreSQL table count

> Current paper text: "13-table PostgreSQL schema"

**Correct value:** **23 tables created at startup** (idempotent CREATE TABLE IF NOT EXISTS in the FastAPI lifespan):

| # | Table | Source |
|---|---|---|
| 1 | `users` | `backend/main.py:145-158` |
| 2 | `ai_suggestion` | `backend/main.py:181-188` |
| 3 | `content` | `backend/main.py:201-209` |
| 4 | `scope` | `backend/main.py:217-224` |
| 5 | `pricing` | `backend/main.py:225-232` |
| 6 | `assumptions` | `backend/main.py:233-239` |
| 7 | `resources` | `backend/main.py:240-246` |
| 8 | `sow_documents` | `backend/main.py:254-264` |
| 9 | `review_results` | `backend/main.py:291-300` |
| 10 | `history` | `backend/main.py:308-317` |
| 11 | `collaboration` | `backend/main.py:331-338` |
| 12 | `review_assignments` | `backend/main.py:343-358` |
| 13 | `sow_reviewer_assignments` | `backend/main.py:367-378` |
| 14 | `handoff_packages` | `backend/main.py:396-405` |
| 15 | `conditions_of_approval` | `backend/main.py:410-429` |
| 16 | `sow_content_templates` | `backend/main.py:434-446` |
| 17 | `sow_attachments` | `backend/main.py:451-466` |
| 18 | `workflow_templates` | `backend/main.py:471-481` |
| 19 | `workflow_template_stages` | `backend/main.py:483-494` |
| 20 | `workflow_template_stage_roles` | `backend/main.py:496-504` |
| 21 | `workflow_template_transitions` | `backend/main.py:506-515` |
| 22 | `sow_workflow` | `backend/main.py:546-556` |
| 23 | `workflow_stage_document_requirements` | `backend/main.py:568-578` |

**Note for the writing team:** the hand-coded init script (`infrastructure/postgres/init/01-init.sql`) only creates 2 tables (`sow_documents`, `review_results`). The remaining 21 are created at FastAPI startup. If the paper said "13" because someone counted models or PDF spec sections, those are stale.

**Suggested rewrite:** "a 23-table PostgreSQL schema (bootstrapped idempotently in the FastAPI lifespan handler)"

### 3.4 Non-PK index count

> Current paper text: "16 non-primary-key indexes"

**Correct value:** **33 non-PK indexes** (32 B-tree + 1 GIN full-text + 1 unique partial), plus 2 baseline indexes from `01-init.sql` (which are then re-created by the lifespan `CREATE INDEX IF NOT EXISTS`).

Indexes by source:
- `backend/main.py:172-173`: `idx_users_email`, `idx_users_oid` (2)
- `backend/main.py:380`: `idx_sra_sow` (1)
- `backend/main.py:542-543`: `uq_wtt_template_from_to_condition` (UNIQUE) (1)
- `backend/main.py:936-970`: 27 indexes including `idx_sow_status`, `idx_sow_client_id`, `idx_sow_methodology`, `idx_sow_cycle`, `idx_sow_content_id`, `idx_sow_kg_node_id` (partial, `WHERE kg_node_id IS NOT NULL`), `idx_review_sow_id`, `idx_history_sow_id`, `idx_history_changed_by`, `idx_collab_sow_id`, `idx_collab_user_id`, `idx_review_assignments_sow`, `idx_review_assignments_user`, `idx_review_assignments_status`, `idx_handoff_sow`, `idx_coa_sow`, `idx_coa_status`, `idx_coa_assigned`, `idx_content_templates_methodology`, `idx_attachments_sow`, `idx_attachments_type`, `idx_attachments_stage`, `idx_wf_doc_reqs_template`, `idx_wf_stages_template`, `idx_wf_roles_stage`, `idx_wf_transitions_template`, `idx_sow_workflow_sow`, `idx_sow_workflow_template`
- `backend/main.py:983`: `idx_sow_search` (GIN full-text on `tsvector`) (1)

**Suggested rewrite:** "33 non-primary-key indexes including a GIN full-text index on the SoW search vector and a unique partial index for workflow transitions."

### 3.5 History-table FK ON DELETE behavior

> Current paper text (paraphrased): "History-table foreign keys use ON DELETE SET NULL"

**Correct value:** Only **`history.sow_id`** uses `ON DELETE SET NULL` (`backend/main.py:311`, plus an explicit migration at `backend/main.py:319-325` that drops the prior CASCADE constraint and re-adds it as SET NULL). The other FK on the history table — **`history.changed_by` → `users.id`** — has no `ON DELETE` clause (`backend/main.py:312`), which defaults to NO ACTION (deleting a user with history rows would be rejected by the constraint).

**Suggested rewrite:** "The audit `history` table preserves audit records past SoW deletion via `ON DELETE SET NULL` on the `sow_id` foreign key (`backend/main.py:311`); the `changed_by` foreign key to `users` defaults to NO ACTION."

### 3.6 Risk classifier mechanism

> Current paper text (paraphrased): "Green/Yellow/Red risk classifier"

**Correct value:** This is a **deterministic threshold rule, not a learned classifier**. Two cases exist in code:

1. ESAP type assignment (the canonical green/yellow/red equivalent): hard-coded thresholds in `backend/utils/esap.py:17-21`:
```python
if dv > 5_000_000 or mg < 10:  return "type-1"
if dv > 1_000_000 or mg < 15:  return "type-2"
return "type-3"
```
2. Local fallback when the ML approval endpoint is unreachable: same thresholds with explicit color labels in `backend/services/ai.py:448-459`:
```python
if deal_value >= 5_000_000 or margin <= 0.10: level, esap = "Red", "Type-1"
elif deal_value >= 1_000_000 or margin <= 0.15: level, esap = "Yellow", "Type-2"
else: level, esap = "Green", "Type-3"
```

The "ML side" of the approval call (`ml/api.py:227-238` `/approval` endpoint, served by `sow_kg.queries.get_approval_chain`) reads from the Neo4j knowledge graph but is itself rule-based against `EsapLevel` and `ApprovalStage` nodes seeded from `Data/rules/workflow/esap-workflow.json` — no model training involved.

**Suggested rewrite:** "ESAP and Green/Yellow/Red routing is computed by deterministic thresholds on deal value and estimated margin, sourced from `Data/rules/workflow/esap-workflow.json` (`backend/utils/esap.py:12-21`)." Avoid the word "classifier" if it implies a learned model.

### 3.7 Foundry deployment / model name

> Current paper text: model not named (or named generically as GPT-4o)

**Correct value:** the deployed Foundry deployment is **`Kimi-K2.5`** (Moonshot AI's Kimi K2 family on Azure AI Foundry), API version **`2025-01-01-preview`** by default. Endpoint base is the Foundry project URL `https://foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW`.

**Citations:**
- `ml/sow_kg/llm_client.py:46` — `os.getenv("AZURE_OPENAI_DEPLOYMENT", "Kimi-K2.5")`
- `infra/modules/ingestion-job.bicep:54` (`@description('Foundry deployment name (e.g. Kimi-K2.5)')`)
- `docs/audits/auth-audit-2026-04-21.md:16,49` (cites the same deployment)
- `docs/audits/coc-118-step6-deploy-verification.md:413` ("the LLM-bound phase calling Foundry for classification + extraction")

**Suggested rewrite:** "LLM-driven extraction and authoring suggestions are produced by `Kimi-K2.5` deployed on Azure AI Foundry (`ml/sow_kg/llm_client.py:46`)."

### 3.8 Managed identity scope

> Current paper text (paraphrased): "Managed identities for Azure resource access"

**Correct value:** Managed identity covers **only ML→Foundry and Ingestion-Job→Foundry** (cross-subscription, role: `Azure AI Developer`). Database and registry credentials are still password/key-based at the time of this report.

| Path | Auth mechanism | Citation |
|---|---|---|
| ML Container App → Foundry | System-assigned MI + RBAC | `infra/modules/ml-container.bicep:50-52`; `infra/modules/foundry-rbac.bicep:31-45`; `ml/sow_kg/llm_client.py:33-42` (`DefaultAzureCredential`) |
| Ingestion Job → Foundry | System-assigned MI + RBAC | `infra/modules/ingestion-job.bicep:72-74`; `infra/modules/foundry-rbac.bicep:31-45` |
| Container App → ACR pull | ACR admin user (`listCredentials()`) — NOT MI | `infra/modules/ml-container.bicep:70-87`; `infra/modules/ingestion-job.bicep:89-105` |
| Backend → PostgreSQL | Password (Container App secret) | `infra/main.bicep:281, 287-288` |
| Backend → Neo4j | Basic auth password (Container App secret) | `infra/main.bicep:276, 288` |
| Backend → ML service | No auth (internal-ingress only) | `infra/modules/ml-container.bicep:62`; `backend/services/ai.py:74-90` |
| Frontend → Backend | Entra ID JWT bearer (user auth, not service auth) | `frontend/lib/auth.js`; `backend/auth.py` |
| GitHub Actions → Azure | OIDC federated credentials (keyless) | `.github/workflows/azure-deploy.yml:49-51, 80-84` |

**Suggested rewrite:** "The ML service and ingestion job authenticate to Azure AI Foundry via system-assigned managed identities, with the cross-subscription `Azure AI Developer` role assignment authored from the Cocoon deployment (`infra/modules/foundry-rbac.bicep`). Postgres, Neo4j, and ACR-pull continue to use shared-secret auth pending the broader SFI migration tracked in `docs/audits/auth-audit-2026-04-21.md`."

### 3.9 `/ai-review` page

> Current paper text (paraphrased): "Frontend-only mock with TODO slot for DS team API"

**Correct value:** `/ai-review` (`frontend/pages/ai-review.js`) is **not a frontend mock** — it calls the live backend `/api/ai/*` endpoints, which proxy to the deployed ML service. Specifically it calls `aiClient.runAnalysis` (which hits `POST /api/sow/{id}/ai-analyze`), `aiClient.similar` (`GET /api/ai/sow/{id}/similar`), `POST /api/sow/{id}/proceed-to-review`, `POST /api/sow/{id}/return-to-draft`, and `POST /api/sow/upload`. The `/api/sow/{id}/ai-analyze` endpoint (`backend/routers/sow.py:1912-1988`) calls `services.ai.analyze_sow`, which fans out parallel calls to the ML GraphRAG service.

There is an `AIUnavailableBanner` and a `SkipAIReviewModal` that gracefully degrade when the ML service is unreachable — but this is a runtime fallback, not a TODO.

**Suggested rewrite:** Drop the "frontend-only mock" framing. Replace with: "The `/ai-review` page (`frontend/pages/ai-review.js`) drives a live AI analysis pipeline: an upload triggers `POST /api/sow/upload` → `POST /api/sow/{id}/submit-for-review` → `POST /api/sow/{id}/ai-analyze`, which fans out parallel calls from `backend/services/ai.py` to the ML GraphRAG service for validation, risk extraction, similar-SoW retrieval, and approval routing."

### 3.10 Synthetic data scope

> Current paper text (paraphrased): "LLM-generated synthetic data augments the corpus"

**Correct value:** The synthetic generator (`ml/kg_data_gen/run.py`) produces **tabular project data** (deal overviews, budgets, staffing plans, status reports, closeouts) for `NUM_PROJECTS` synthetic engagements — it does **not** generate synthetic SoW documents. Generation is via Azure OpenAI (Foundry) `chat.completions` calls when `USE_LLM=true` (`ml/kg_data_gen/llm_client.py:32-40`), authenticated through `DefaultAzureCredential`. Output goes to CSVs (`ml/kg_data_gen/output/`).

The **README** claims the example deployment is `gpt-4o-mini` (`ml/kg_data_gen/run.py:13`) but the actual production Foundry deployment is `Kimi-K2.5` — both will work since the call uses whatever `AZURE_OPENAI_DEPLOYMENT` resolves to.

**Suggested rewrite:** "Synthetic data augmentation: `ml/kg_data_gen/run.py` generates internally-consistent project metadata (deal overviews, budgets, staffing) for N synthetic engagements via Foundry `Kimi-K2.5`, producing CSV inputs for the knowledge graph. It does not generate full SoW documents."

---

## 4. Unverifiable from code

| Claim | Why it can't be verified statically |
|---|---|
| Mentor (Microsoft) feedback content (e.g. SFI flags from Shyam) | Documented in `docs/audits/auth-audit-2026-04-21.md` but the actual mentor messages live outside the repo. |
| Final demo deadline / IEEE submission deadline | No deadline metadata in the repo. |
| Whether the demo audience will see live Foundry calls or recorded video | Operational decision not encoded anywhere. |
| Production load / performance numbers (latency, throughput) | No benchmarks in the repo; only static timeouts (`backend/services/ai.py:54-56`) and a 42-min one-shot ingestion-Job runtime documented in `docs/audits/coc-118-step6-deploy-verification.md:407`. |
| Which mentor or stakeholder actually requested each feature | Not encoded in code or commits at the granularity needed to claim authorship of design choices. |
| Any user-study or qualitative-evaluation results | None present in the repo. |
| The IEEE conference target / venue | Not in repo. |
| Whether the team is single-tenant or multi-tenant in production | `backend/auth.py:103` deliberately disables `verify_iss` for `/common`; the choice between single- and multi-tenant in production isn't yet made (flagged in `docs/audits/auth-audit-2026-04-21.md:73`). |

---

## 5. New things worth adding to the paper

| Topic | Details | Citation |
|---|---|---|
| Foundry model name | `Kimi-K2.5` is meaningful (Moonshot AI open-weights via Azure AI Foundry); paper currently doesn't name a model. | `ml/sow_kg/llm_client.py:46` |
| Cross-subscription RBAC | The Foundry resource lives in a separate subscription; the deployment authors `Azure AI Developer` role assignments cross-sub via Bicep. This is unusual enough to be a paper-worthy detail. | `infra/modules/foundry-rbac.bicep:1-49`; `infra/main.bicep:78-85, 245-255` |
| Container Apps Job for one-shot data seeding | A `Microsoft.App/jobs` resource running `main_new.py ingest && main_new.py enrich`, manually triggered, replicaTimeout=3600s, scaled-to-zero between runs. ~42-min wall-clock end-to-end. | `infra/modules/ingestion-job.bicep:1-167` |
| Local sentence-transformers for embeddings | `sentence-transformers/all-MiniLM-L6-v2` (384-dim) running on Container Apps CPU, not Foundry. Justifies cost claims. | `infra/modules/ingestion-job.bicep:11`; `ml/api.py:32` |
| Five Neo4j vector indexes | `section_embeddings`, `risk_embeddings`, `clausetype_embeddings`, `deliverable_embeddings`, `rule_embeddings` — strengthens the Graph-RAG claim. | `docs/audits/coc-118-step6-deploy-verification.md:415-420` |
| 540 embeddings written | Concrete corpus number for retrieval quality discussion. | `docs/audits/coc-118-step6-deploy-verification.md:421-423` |
| Workflow snapshot semantics | Per-SoW JSONB snapshot of the workflow at submission time, so template edits don't disturb in-flight SoWs. Demonstrates production-thinking. | `backend/main.py:471-555`; `backend/routers/workflow.py:54-`; `backend/services/workflow_engine.py:25-36` |
| Conditional / parallel-gateway workflow stages | Code supports parallel branches and join modes (`all_required`, `any_required`, `custom`). Strengthens any "configurable workflow" claim. | `frontend/lib/workflowStages.js:200-228`; `backend/services/workflow_engine.py:86-112` |
| Audit-trail unification | A single endpoint (`/api/audit/sow/{id}`) joins history + review assignments + COA lifecycle + attachment uploads into one timeline. | `backend/routers/audit.py:17-89` |
| Document requirement gating | Stage advancement is blocked if required document types haven't been attached for the current stage. | `backend/routers/sow.py:917-951` |
| Trigger-maintained tsvector | Full-text search uses a Postgres trigger (`sow_search_vector_update`) keeping `search_vector` up to date on title/customer_name/opportunity_id/methodology edits. | `backend/main.py:986-1023` |
| Frontend MSAL ID-token (not access token) auth | Backend accepts the ID token directly; no "Expose an API" scope configured. Worth mentioning if writing an Entra integration paragraph. | `frontend/lib/auth.js:64-66` |
| Pre-existing operational caveats | Container Apps storage is ephemeral by default; a postgres password drift caused a known auth-fail on the deployed environment, fixed by container revision restart that re-ran initdb. | `docs/audits/coc-118-step6-deploy-verification.md:522-530` |

---

## 6. Suggested new citations

| Claim it supports | Candidate citation | Why it fits |
|---|---|---|
| Graph-RAG retrieval over Neo4j | Microsoft GraphRAG: https://microsoft.github.io/graphrag/ | The codebase uses Neo4j vector ANN + traversal. Microsoft's own framing is the most defensible "GraphRAG" reference; cite once for the architectural pattern even though the implementation is custom. |
| Graph-RAG retrieval over Neo4j | Edge et al. 2024, "From Local to Global: A Graph RAG Approach to Query-Focused Summarization" (arXiv:2404.16130) | The original Microsoft GraphRAG paper. Cite when introducing the Graph-RAG concept. |
| Graph-RAG retrieval over Neo4j | Han et al. 2025 "Retrieval-Augmented Generation with Graphs" survey (arXiv:2501.00309) | Survey of graph-RAG methods; supports the placement of Cocoon's design within the broader space. |
| Vector retrieval baseline | Lewis et al. 2020 RAG (NeurIPS) | Foundational RAG paper; cite when motivating the retrieval+generation paradigm. |
| Dense retrieval | Karpukhin et al. 2020, DPR (EMNLP) | Foundational ANN-retrieval citation; supports the use of `sentence-transformers/all-MiniLM-L6-v2` embeddings into Neo4j vector indexes. |
| Neo4j Graph Data Science / vector indexes | https://github.com/neo4j/graph-data-science | Cite when discussing the Neo4j vector schema indexes (`section_embeddings`, etc.). |
| Graphiti (memory layer) | https://github.com/getzep/graphiti | Optional alternative implementation; useful for "we evaluated and chose Neo4j-direct" discussion. |
| Microsoft Entra managed identities | https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/ | Direct primary source for the MI claim. |
| Cross-subscription RBAC pattern | https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments | For the cross-sub role-assignment authoring pattern in `foundry-rbac.bicep`. |
| Azure Container Apps | https://learn.microsoft.com/en-us/azure/container-apps/ | Direct primary source for the deployment platform. |
| Azure Container Apps Jobs | https://learn.microsoft.com/en-us/azure/container-apps/jobs | Specifically supports the manual-trigger one-shot Job pattern for Neo4j seeding. |
| Bicep | https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/ | Primary IaC reference. |
| FastAPI | https://fastapi.tiangolo.com/ | API framework reference. |
| Next.js 15 | https://nextjs.org/blog/next-15 | Frontend framework reference; if claiming "Next.js 15" specifically. |
| Sentence-Transformers / all-MiniLM-L6-v2 | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 | The exact embedding model. |
| Microsoft Cloud Adoption Framework | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ | Useful if the paper situates "Cloud Adoption" as one of the four supported methodologies. |
| Open-weights Kimi K2 model | https://huggingface.co/moonshotai/Kimi-K2-Instruct or vendor publication | Foundry deployment is `Kimi-K2.5`; cite the underlying model. Confirm the author/version that maps to the Foundry deployment if naming the model in-paper. |

KAT-GNN (arxiv 2511.01249) and Chen et al. 2025 (s41598-025-33873-z) — relevance unclear without the paper draft text. Skip unless the paper explicitly uses GNN-on-text or domain-specific clinical-record framing.

---

## 7. Open questions for the writing team

1. **Endpoint count framing.** Do you cite "85 endpoints" (the precise count of declared HTTP routes) or a softer "dozens of endpoints across 11 router modules"? If you keep a number, pick one consistently — 85 (excluding `/status`, `/status/health`) or 87 (including them).
2. **"Graph-RAG" vs "graph retrieval".** The codebase implements vector ANN + Cypher traversal (`ml/sow_kg/graphrag.py`), which is closer to *retrieval over a graph* than to Microsoft's GraphRAG (community summaries + LLM-driven indexing). Decide whether to call it Graph-RAG, graph-aware RAG, or KG-augmented RAG. This affects which citations you anchor on.
3. **Risk classifier wording.** Avoid "classifier" if the implementation is threshold-based. "Risk routing rule" or "ESAP threshold rule" is closer to truth. Decide on one term.
4. **Naming the LLM.** If the paper currently doesn't name a model, do you want to: (a) name `Kimi-K2.5` explicitly (with footnote on Moonshot AI's open-weights model on Azure AI Foundry), (b) abstract it as "a frontier open-weights LLM hosted on Azure AI Foundry", or (c) leave it model-agnostic? Choice (a) is most accurate; (b) is best for a non-vendor-specific framing.
5. **Managed identity claim scope.** You can defensibly say "managed identity for Azure AI Foundry access (the SFI-blocking call flagged in our auth audit)" but **not** "managed identity for all Azure resource access." Decide on phrasing.
6. **What's "system of record."** PostgreSQL holds SoW content, history, workflow state, attachments metadata. Neo4j holds the corpus + extracted entities (sections, risks, deliverables, rules, clause types) for retrieval. Files live on the local Container App filesystem (ephemeral). If you say "PostgreSQL is the system of record," that is true for SoW *state* but you should add "corpus knowledge is held in Neo4j" rather than implying Postgres holds everything.
7. **Deployment freshness.** As of 2026-04-27, COC-118 (this branch) is deployed and validated end-to-end on Azure but not yet merged to `main`. The two new artifacts (Container Apps Job + foundry-rbac module) are real and live, not aspirational. Make sure the paper's "deployed system" framing reflects this branch, not `main`.
8. **"7 Contoso reference SoWs" — is the synthetic generator's NUM_PROJECTS output considered part of the reference corpus?** It's a different beast (CSV project metadata, not SoW prose). Be explicit about which corpus you're describing in evaluation sections.
9. **Authentication of ML service.** The ML Container App has `external: false` ingress (`infra/modules/ml-container.bicep:62`) but no per-call auth from backend → ML. Decide whether to soft-pedal this ("internal-only ingress acts as defense-in-depth") or call it a known gap (`docs/audits/auth-audit-2026-04-21.md:88-108` — Path 2a).
10. **Postgres ephemeral storage.** The deployed Postgres uses the default Container Apps ephemeral storage (data lost on restart). The Bicep comment explicitly says this is "acceptable for the capstone demo" (`infra/modules/postgres-container.bicep:7-9`). If the paper claims production-readiness anywhere, this needs softening or excluding from that claim.
