# COC-118 — Resume here

**Last touched:** 2026-04-28
**Branch:** `feature/COC-118-managed-identity-auth`
**Last commit:** `11b5478` — `COC-118 step 6 fix: NEO4J_URI/NEO4J_USER env vars on ingestion Job`
**Branch is 6 commits ahead of origin, unpushed.** ✅ `/context` validated end-to-end via the frontend AI-improve feature — ready to push.

## Where you are

**Done.** Step 6 plumbing is fully deployed, exercised, and end-to-end-validated. AI-improve feature on the deployed frontend works → `/context` returns 200 → COC-118 step 3 closed.

Full evidence + every dead-end + cost analysis: `docs/audits/coc-118-step6-deploy-verification.md`.

### What got done since last resume

1. **`81a5e78`** — Bicep fix: helloworld placeholder for the Job image bootstrap. Cleared the `MANIFEST_UNKNOWN` provision failure.
2. **`azd up`** ran provision-clean; deploy halted at `ingestion` (predicted Outcome B — azd 1.23.5 doesn't see `Microsoft.App/jobs`). Manual `az containerapp job update --image …` patched the Job to the pushed image.
3. **First Job trigger** (`caj-ingest-nrflxor4bm2jw-gje716a`) failed at ~17 min: `Failed to establish connection to ResolvedIPv4Address(('127.0.0.1', 7687))`. Root cause: `ml/sow_kg/db.py:12-14` reads `NEO4J_URI`/`NEO4J_USER` at module-import time and falls back to `bolt://localhost:7687`. The Job's bicep env block had `NEO4J_PASSWORD` but neither URI nor user.
4. **`11b5478`** — Bicep fix: added `NEO4J_URI`/`NEO4J_USER` env vars to the Job. Live-patched the running Job in parallel via `az containerapp job update --set-env-vars`.
5. **Second Job trigger** (`caj-ingest-nrflxor4bm2jw-bogdvcq`) — **Succeeded** in 42 min wall-clock. Indexed `section_embeddings`, `risk_embeddings`, `clausetype_embeddings`, `deliverable_embeddings`, `rule_embeddings`. Wrote 540 embeddings (270 Section, 29 Deliverable, 139 Risk, 94 Rule, 8 ClauseType).
6. **Discovered + fixed an out-of-band cluster regression:** `azd up`'s halted deploy left `ca-ml-nrflxor4bm2jw` and `ca-web-nrflxor4bm2jw` running their bicep helloworld placeholders at 100% traffic (Unhealthy ml; the cleanly-200 Next.js pages were actually helloworld nginx, not the real frontend). Restored both via `az containerapp update --image` to their most recent ACR-pushed v3 tags.

## Current state of the cluster

- `rg-Capstone`: `Succeeded`. **6** Container Apps + **1** Container App Job, all `Running` / `Succeeded`.
- Job `caj-ingest-nrflxor4bm2jw`: image `cocoon/ingestion-capstone:azd-deploy-1777336962`. Last execution `bogdvcq` Succeeded.
- ml: revision `--0000002`, image `cocoon/ml-capstone:azd-deploy-1777163395` (post-MI-auth-commit; functionally equivalent to current HEAD), Healthy.
- web: revision `--0000002`, image `cocoon/web-capstone:azd-deploy-1777163401`, Healthy. Real Next.js (verified via response body containing Next.js framework scripts).
- api: revision `--azd-1777337824`, freshly deployed. Healthy. `/health` reports `neo4j: connected, postgres: error 'NoneType' has no acquire` — **pre-existing postgres pool init bug**, separate from COC-118.
- Foundry `Azure AI Developer` assignments: **3** (Group + ML MI `aeae842f-...` + Job MI `06e8ddf9-...`).
- Neo4j: seeded with section/deliverable/risk/rule/clausetype nodes + embeddings. Vector indexes ONLINE (per Job logs).

## Next action when you come back

**Push + open PR.** No more blockers in the COC-118 scope.

```bash
git push -u origin feature/COC-118-managed-identity-auth
gh pr create --base main --title "COC-118: ML→Foundry managed identity + Neo4j seeding Job"
```

PR description should walk through the three logical chunks:
1. ML→Foundry auth migrated to MI + cross-sub RBAC (commit `db610ef`)
2. Container Apps Job for Neo4j data-seeding (commits `0ac2e00`, `c2487c9`, `81a5e78`, `11b5478`)
3. Audit trail (commit `619f8d4`)

## Pending follow-ups (after PR is open)

- Delete the `AZURE_OPENAI_API_KEY` GitHub Secret (now that `/context` is green via MI, the key is dead weight; ML will fail-loud if MI ever breaks — that's the desired SFI behaviour).
- Ask Kirk to grant `Azure AI Developer` on Foundry-SOW to remaining team members' user principals before merge to main.
- Notify team of MI auth migration (draft message exists in chat history).

### Separate tickets to file (not COC-118)

- **azd `prepackage`/`preprovision` hook to push images before provision** — closes both the `Microsoft.App/jobs` deploy-resolver gap AND the helloworld-rollback regression that bit ml + web in this run.
- **Move Container App secrets to Key Vault references** — would have prevented the postgres password drift that needed a data-wipe restart this session. Same structural exposure on `neo4j-password`, just hasn't bit yet. (See `docs/audits/auth-audit-2026-04-21.md` for the full SFI gap analysis.)
- **Fix `main_new.py:69` and `enrich.py` to thread the CLI `--uri`/`--user`/`--password` through to `db.py`'s driver** instead of relying on env-var fallback. Code defect — the `# Ensure your db.py uses the provided uri/user/password` comment on line 69 promises something the code doesn't actually do. The Job's bicep env-var workaround masks this.
- **ml/Dockerfile.ingestion: switch base to `python:3.11-slim`** to skip the wasted runtime `uv sync` / cpython-3.11.15 download. ~5 min cost per Job execution; not load-bearing but easy win.

## Sanity checklist when you sit back down

```bash
git status                                                                                  # only the audit docs untracked (or commit them)
git log -1 --oneline                                                                         # 11b5478
az account show --query "{tenant:tenantId, sub:id}" -o table                                 # tenant 4274bfb0-..., sub 0a96bee6-...
az group show --name rg-Capstone --query provisioningState -o tsv                            # Succeeded
az containerapp job execution list --name caj-ingest-nrflxor4bm2jw -g rg-Capstone \
  --query "[0].{name:name,status:properties.status}" -o tsv                                  # bogdvcq  Succeeded
az containerapp revision list --name ca-ml-nrflxor4bm2jw -g rg-Capstone \
  --query "[?properties.trafficWeight > \`0\`].{rev:name,health:properties.healthState}" -o tsv  # --0000002 Healthy
az containerapp revision list --name ca-web-nrflxor4bm2jw -g rg-Capstone \
  --query "[?properties.trafficWeight > \`0\`].{rev:name,health:properties.healthState}" -o tsv  # --0000002 Healthy
```

If any of those drifted, read the verification doc before doing anything else.

## What you should NOT do without re-checking

- Don't run `azd up` again — it'll re-roll ml/web back to helloworld unless we land the prepackage-hook follow-up first. If you must redeploy, immediately re-run the manual `az containerapp update --image` pin afterwards.
- Don't run `azd down` — would tear down the live deploy.
- Don't push the branch yet — `/context` user-side validation hasn't happened.
- Don't re-trigger the Job — it already succeeded; another run wastes Foundry tokens (~$1-5/run) and re-writes the same nodes (idempotent via MERGE, but still pointless).
- Don't delete the helloworld revisions on ml/web — they're at 0% traffic and harmless; deleting them adds blast radius for no benefit.
- Don't commit changes from the running Job's image without re-tagging — there are no staged code changes from this session beyond the two committed Bicep fixes and the audit docs.
