# COC-118 Step 3 — End-to-End Manual Test Report

**Date:** 2026-04-26 (test session 17:36:59 → 17:37:48 UTC, ~49s)
**Triggered by:** Zhan Su (manual frontend interaction)
**Watcher:** Claude Code (log capture and analysis)
**ML Container App:** `ca-ml-nrflxor4bm2jw` in `rg-Capstone`
**ML MI principalId:** `aeae842f-ca4e-430a-818e-0d9c78d53f2c`
**Frontend URL exercised:** `https://ca-web-nrflxor4bm2jw.proudfield-c2158be3.eastus2.azurecontainerapps.io/`
**Companion report:** `coc-118-step3-validation-v3.md` (validates RBAC + config; this report covers the live MI→Foundry test that v3 deferred)

## Pre-test state

- [x] Role assignment confirmed in place: ServicePrincipal entry with `Azure AI Developer` (`64702f94-...`) on Foundry-SOW for principal `aeae842f-...` — verified via `az rest` Graph-API GET against the Foundry resource scope
- [x] ML Container App `runningStatus`: `Running` (revision `ca-ml-nrflxor4bm2jw--azd-1777163857`, minReplicas=1, maxReplicas=1)
- [x] Pre-test log baseline captured: 52 lines (`/tmp/ml-logs-pre.txt`) — content was the original startup-time logs from the deploy at 2026-04-26T00:39Z; no inbound traffic between deploy and test

## Frontend action triggered

**Action:** Zhan exercised the Cocoon frontend "to the best of her abilities" — based on the captured traffic, this generated 10 inbound requests to the ML service over ~49 seconds, all in the SoW context-retrieval and similarity flows (`/context`, `/sows/{id}/similar`, `/sows/ingest`).

**Outcome in UI:** "done" (UI responded, but per the log evidence below, most requests returned errors — Zhan likely saw partial functionality at best).

## New log lines captured

- Total new lines (post-test minus pre-test baseline): 302
- Lines within Zhan's actual test window (17:36:59–17:37:48): 300
- Time window: 49 seconds

### Inbound HTTP requests to ML (10 total)

| Method | Path (first ~80 chars) | Status |
|---|---|---|
| GET | `/context?query=In+Scope%3A%0A-&sow_id=4&top_k=5&hop_depth=2` | **500** |
| GET | `/context?query={pb-1777224981475-avuk3j JSON object}&sow_id=4&...` | **500** |
| GET | `/context?query=2026-04-27&sow_id=4&top_k=5&hop_depth=2` | **500** |
| GET | `/context?query={del-1777225056158-9t5ui9 JSON object}&sow_id=4&...` | **500** |
| GET | `/context?query=fdsa&sow_id=4&top_k=5&hop_depth=2` | **500** |
| GET | `/context?query=fdsa%0AAcceptance%3A+fdsa&sow_id=4&top_k=5&...` | **500** |
| GET | `/context?query=2026-04-27&sow_id=4&top_k=5&hop_depth=2` (again) | **500** |
| POST | `/sows/ingest` | **404** |
| GET | `/context?query=Assignment_10+%282%29&top_k=5&hop_depth=2` | **500** |
| GET | `/sows/4/similar` | **200** ✅ |

Status code summary: **1× 200, 1× 404, 8× 500.**

### Successful Foundry calls

**None observed.** Zero outbound HTTP requests to `foundry-sow.services.ai.azure.com`, `*.openai.azure.com`, or any `*.cognitiveservices.azure.com` host. Zero `chat.completions` invocations. Zero log lines from any Azure SDK client targeting Foundry.

### Auth errors

**None observed.** Zero `azure.identity` log lines, zero `DefaultAzureCredential` failures, zero `ManagedIdentityCredential` errors, zero 401 / 403 HTTP responses (inbound or outbound).

This is **not** a "MI auth path is broken" outcome. The MI auth path was never exercised at all, because every request that *would* have called Foundry failed earlier in the request lifecycle.

### Other notable lines

- 8× identical `neo4j.exceptions.ClientError` — root cause of every `/context` 500:

```
neo4j.exceptions.ClientError:
  {neo4j_code: Neo.ClientError.Procedure.ProcedureCallFailed}
  {message: Failed to invoke procedure `db.index.vector.queryNodes`:
            Caused by: java.lang.IllegalArgumentException:
            There is no such vector schema index: section_embeddings}
  {gql_status: 50N42}
```

- 7× `ERROR:api:context retrieval error` log lines (the application's error handler firing on each `/context` failure)
- Multiple `WARNING:neo4j.notifications:` entries on the `/sows/4/similar` query: `label does not exist. The label 'SOW' / 'Section' does not exist`, `property key does not exist. The property 'outcome' / 'name' does not exist`. These are Neo4j 5.x notifications that `MATCH (s:SOW {...})` will return no rows because no `:SOW` nodes have been created in the deployed Neo4j. The `200` status on `/sows/4/similar` is misleading — the endpoint succeeded mechanically (returned an empty result set) but the underlying graph is empty.

## Analysis

**Category: no traffic** (in the COC-118 step 3 sense — no traffic reached the Foundry call code path).

The deployed Neo4j Container App came up empty: no vector index `section_embeddings`, no `:SOW` / `:Section` / `:ClauseType` nodes, no embeddings. Cocoon's `/context` endpoint queries that vector index as the *first* step of the GraphRAG retrieval pipeline; without it, every `/context` request raises a `neo4j.exceptions.ClientError` and returns 500 before the LLM-generation step is reached. The Foundry call would have been the *second* step, after retrieval succeeds.

The single `200` (`/sows/4/similar`) is a different code path that does a graph traversal without vector search — it returned empty rows because the graph is unpopulated, but it didn't error. It also doesn't call Foundry, so it's not informative for our question.

**Net effect on COC-118 step 3 validation:** the live MI→Foundry path is still unexercised. It's not invalidated — there's no contradicting evidence — but it's also not validated. The data-population gap blocks the e2e test.

This is a separate issue from COC-118 entirely. The Neo4j Container App design starts the Bolt service with an empty database; the `ml/` ingestion CLI is the producer that creates the `section_embeddings` vector index and writes `:SOW` / `:Section` / `:ClauseType` / `:ClauseInstance` nodes + relationships. That ingestion has not been run against the deployed Neo4j (only against developers' local docker-compose Neo4js).

## Verdict

| Check | Status | Notes |
|---|---|---|
| Role assignment still in place | ✅ | ServicePrincipal entry persists, role definition `64702f94-...` |
| ML Container App healthy | ✅ | `Running`, single replica, no restarts |
| Frontend action reached ML service | ✅ | 10 inbound requests landed, the API→ML hop works |
| MI acquired Foundry token | ❓ unclear | Code path not reached |
| Foundry call returned 200 | ❓ unclear | No call made |
| No persistent auth errors | ✅ | Zero auth-related errors of any kind in logs |

## Overall

**❓ Inconclusive: frontend action didn't reach the Foundry call code path because Neo4j is empty.**

This is a pre-existing data-population gap, not a regression introduced by COC-118. The MI→Foundry auth path is correctly wired (verified statically in v3 — RBAC role assignment, env vars, identity type, no key leakage) but cannot be exercised end-to-end until Neo4j has the `section_embeddings` vector index and at least one populated SoW.

**To unblock and finish the e2e validation, do one of the following (in order of preference):**

1. **Populate the deployed Neo4j with the ingestion CLI** *(best, ~10 min, exercises the real production code path).* Run the `ml/` ingestion CLI from a local terminal pointed at the deployed Neo4j (Bolt URI: `bolt://ca-neo4j-nrflxor4bm2jw:7687` — but that's an internal-only Container Apps URL; would need to either expose Neo4j publicly temporarily, or run the CLI from inside the cluster e.g. `az containerapp exec --name ca-api-... --command "uv run python -m ml.ingest ..."`). Then re-run the frontend test. The `/context` calls will succeed and the MI→Foundry path will execute.

2. **Direct ML invocation from inside the cluster** *(faster, ~5 min, less realistic but adequate for proving MI→Foundry).* `az containerapp exec` into the api Container App and `curl` the ML service with a payload that bypasses `/context` and goes straight to a Foundry-calling endpoint (need to identify which ML route does this — `/generate` if it exists, or check the ML codebase). This skips the Neo4j gap entirely and isolates the auth question.

3. **Observe via the api Container App** *(complementary check, no cost).* The api Container App also has a system-assigned MI and currently has dead `AZURE_AI_*` env vars (per v3 report). Worth confirming via `az containerapp logs show --name ca-api-...` whether any traffic during Zhan's test triggered Foundry-bound calls from api directly. If yes, observe whether they 401 or 200. If no, this path is also unexercised.

After any of those, re-run this report.

## Manual follow-ups remaining

- [ ] Populate deployed Neo4j (option 1 above) OR run a direct in-cluster test (option 2) to actually exercise the MI→Foundry path before May 14 demo.
- [ ] After MI→Foundry confirmed live: delete `AZURE_OPENAI_API_KEY` GitHub Secret and proceed to COC-118 step 4 (delete dead `AZURE_AI_*` backend wiring at `infra/main.bicep:248-249, 256-257`).
- [ ] **Do NOT delete the `AZURE_OPENAI_API_KEY` GitHub Secret yet** — pre-existing v3 follow-up still applies; this report does not unblock it.
- [ ] Separate ticket worth filing: "Empty deployed Neo4j blocks `/context` queries" — this is a real bug for any user of the deployed environment, not just our validation effort. If the GraphRAG retrieval path is core to the demo, it needs the ingestion CLI to be runnable against the deployed environment (or wired into the deploy pipeline as a postdeploy hook).

## Raw log evidence (new lines from this test)

Showing the 10 inbound HTTP responses + one representative neo4j stack trace. Full 302-line capture is at `/tmp/ml-logs-new.txt` on Zhan's machine (uncommitted, ephemeral).

```
2026-04-26T17:36:59Z  GET /context?query=In+Scope%3A%0A-&sow_id=4&top_k=5&hop_depth=2          → 500
2026-04-26T17:37:01Z  GET /context?query={pb-1777224981475-avuk3j JSON}&sow_id=4&...           → 500
2026-04-26T17:37:08Z  GET /context?query=2026-04-27&sow_id=4&top_k=5&hop_depth=2               → 500
2026-04-26T17:37:36Z  GET /context?query={del-1777225056158-9t5ui9 JSON}&sow_id=4&...          → 500
2026-04-26T17:37:37Z  GET /context?query=fdsa&sow_id=4&top_k=5&hop_depth=2                     → 500
2026-04-26T17:37:38Z  GET /context?query=fdsa%0AAcceptance%3A+fdsa&sow_id=4&...                → 500
2026-04-26T17:37:45Z  GET /context?query=2026-04-27&sow_id=4&top_k=5&hop_depth=2               → 500
2026-04-26T17:37:48Z  POST /sows/ingest                                                        → 404
2026-04-26T17:37:48Z  GET /context?query=Assignment_10+%282%29&top_k=5&hop_depth=2             → 500
2026-04-26T17:37:48Z  GET /sows/4/similar                                                      → 200

Representative stack-trace fragment (8× identical, one per /context call):
  ERROR:api:context retrieval error
  Traceback (most recent call last):
      raise self._hydrate_error(metadata)
  neo4j.exceptions.ClientError:
    {neo4j_code: Neo.ClientError.Procedure.ProcedureCallFailed}
    {message: Failed to invoke procedure `db.index.vector.queryNodes`:
              Caused by: java.lang.IllegalArgumentException:
              There is no such vector schema index: section_embeddings}
    {gql_status: 50N42}
```

Counts of search keywords across the full 302-line new-log capture:
- Outbound HTTP calls to Foundry / OpenAI / Cognitive Services hosts: **0**
- `azure.identity` / `DefaultAzureCredential` / `ManagedIdentityCredential` mentions: **0**
- HTTP 401 / 403 responses (inbound or outbound): **0**
- `ERROR:api:` lines: **7** (all `context retrieval error`, one per `/context` 500)
- `neo4j.exceptions.ClientError`: **8** (one per `/context` 500)
