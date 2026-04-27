# Cocoon Auth Audit — 2026-04-21

**Scope:** Every service-to-service authentication hop in Cocoon, audited against the Microsoft SFI target pattern of **managed identity + Azure RBAC**.
**Trigger:** Sprint 5 review — Shyam (Microsoft AI Architect) flagged the Container App → Azure AI Foundry call as API-key-based, which will not pass SFI review. Prof. Carver extended scope to every service hop.
**Method:** Read-only audit. No code or infra was modified. All claims cite `file:line`.
**Auditor:** Claude (via `/effort` xhigh) on behalf of the Baylor Capstone team.

**Revision history:**
- 2026-04-21 v1 — initial audit based on committed code/infra.
- 2026-04-21 v2 — revised Path 2 after the team's working `.env` file (with a live `AZURE_OPENAI_API_KEY`) was produced. The Foundry integration is not "pre-wired but not implemented" as originally reported — it is actively live in `ml/` (currently local-dev only, never deployed to Azure). New finding added for the backend↔ML-service hop.

---

## ⚠️ Immediate action: rotate the leaked Foundry key

The development `.env` containing `AZURE_OPENAI_API_KEY=BbSr…V1rf` for the Foundry resource at `https://foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW` (deployment `Kimi-K2.5`) was shared outside its original storage during the audit-handoff workflow. Treat the key as compromised and rotate it in the Azure Portal before any other action on this report. Follow-up ticket **P1-0** below captures this; it is the only item that should land before end of day today.

---

## Summary

Cocoon currently has **zero managed identities configured** and **zero `Microsoft.Authorization/roleAssignments` resources** in the Bicep templates (`Grep infra/ for identity:|roleAssignments|principalId` → no matches). Every service-to-service credential is a password, an API key, or a shared key, injected into Container Apps as Container App–scoped secrets. The frontend↔backend leg is the one clean path: it uses Microsoft Entra ID via MSAL.js, with the backend validating RS256 JWTs against the public JWKS.

The GitHub Actions deployment leg is already keyless (OIDC federated credentials), though the workflow header still documents an obsolete `AZURE_CLIENT_SECRET` requirement.

**Posture by mechanism (7 runtime paths + 1 deploy path):**

| Mechanism | Count | Paths |
|---|---|---|
| Managed identity + RBAC | 0 | — |
| MSAL bearer token (Entra JWT) | 1 | Frontend → Backend |
| OIDC federated credential (keyless) | 1 | GitHub Actions → Azure subscription |
| API key / password / shared key | 5 | Foundry, Postgres, Neo4j, ACR, Log Analytics |
| No auth (public endpoint) | 1 | Backend → Microsoft JWKS (expected — public keys) |

**Shyam-flagged finding confirmed and worse than first thought.** Two things are true at once:

1. The Bicep wires `AZURE_AI_KEY` + `AZURE_AI_ENDPOINT` as Container App secrets on the deployed `api` app (`infra/main.bicep:194-195, 201-202`). **No backend file reads these env vars** — it's dead wiring. `backend/services/ai.py:1-251` is still mock-only.
2. The real Foundry integration lives in `ml/`, not `backend/`, and is **actively live** in local dev today. `ml/sow_kg/llm_client.py:19-25` instantiates `openai.OpenAI(base_url=AZURE_OPENAI_ENDPOINT, api_key=AZURE_OPENAI_API_KEY)`. `ml/kg_data_gen/llm_client.py:18-25` instantiates `AzureOpenAI(azure_endpoint=…, api_key=…, api_version=…)`. The team's working `.env` points at Foundry project `foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW`, deployment `Kimi-K2.5`, API version `2025-01-01-preview`. The ML service is **not** provisioned in any Bicep module and runs only on developer machines today (`GRAPHRAG_API_URL=http://host.docker.internal:8001`).

So when the ML service *is* deployed to Azure, it will carry the API-key pattern with it unless it's rewritten against `DefaultAzureCredential` first. The remediation window is "before the ML service gets a Container App" — which, based on `azure.yaml` and `infra/main.bicep`, has not happened yet. Same fix effort as before, but the code changes move to `ml/` instead of `backend/`, and a new `infra/modules/ml-container.bicep` is now part of the Sprint 6 scope.

## Summary table

| # | Path | Caller | Callee | Mechanism | Secret storage | Managed identity? | RBAC role? | Gap severity |
|---|------|--------|--------|-----------|----------------|-------------------|------------|--------------|
| 1 | Frontend → Backend | `web` Container App (Next.js) | `api` Container App (FastAPI) | MSAL ID token (RS256 JWT, audience-validated) | Client-side sessionStorage (MSAL-managed) | N/A (user auth, not service auth) | N/A | Low |
| 2a | Backend → ML service (GraphRAG) | `api` Container App | `ml/` FastAPI on port 8001 (not yet deployed to Azure — local dev only) | **No auth** (unauthenticated `httpx` GET/POST) | N/A | None | None | **High** (latent; becomes live the moment the ML service is deployed) |
| 2b | ML service → Azure AI Foundry | `ml/` FastAPI (`ml/sow_kg/llm_client.py`, `ml/kg_data_gen/llm_client.py`) | Foundry project `foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW`, deployment `Kimi-K2.5` | **API key** (`AZURE_OPENAI_API_KEY`) — actively live | Developer `.env` file (local only; ML service not in Bicep) | None | None | **High** (Shyam-flagged; live integration) |
| 2c | Backend → Foundry (dead Bicep wiring) | `api` Container App | Nothing — env vars `AZURE_AI_ENDPOINT`/`AZURE_AI_KEY` injected but no backend code reads them | N/A (dead) | Container App secret (`azure-ai-key` / `azure-ai-endpoint`) | None | None | Low (delete — not actually used) |
| 3 | Backend → PostgreSQL | `api` Container App | `postgres` Container App | Password in connection string | Container App secret (`postgres-password`) | None | None (Postgres is containerized — no Azure-side RBAC target exists) | Medium |
| 4 | Backend → Neo4j | `api` Container App | `neo4j` Container App | Basic auth (user=`neo4j` + password) | Container App secret (`neo4j-password`) | None | None (Neo4j Community — no Azure RBAC path exists) | Medium |
| 5 | Container Apps → Azure Container Registry | Every Container App (`api`, `web`, `neo4j`, `postgres`) | ACR | ACR admin user (`adminUserEnabled: true`) | Container App secret (`registry-password`) pulled via `listCredentials()` at deploy time | None | None | **High** (cheapest keyless win) |
| 6 | GitHub Actions → Azure subscription | GitHub-hosted runner | Azure Resource Manager | **OIDC federated credential** (keyless) | N/A (short-lived workload identity token) | User-assigned federated app registration | Whatever the deploying SP has (not audited — cross-subscription concern) | Low (already keyless) |
| 7 | Container Apps Environment → Log Analytics | Container Apps platform | Log Analytics workspace | Shared key (primarySharedKey) | Embedded in Managed Environment config via `listKeys()` | None | None | Medium |
| 8 | Backend → Microsoft JWKS | `api` Container App | `login.microsoftonline.com/common/discovery/v2.0/keys` | None (public endpoint) | N/A | N/A | N/A | N/A (this is correct) |

(Severity key: **High** = Shyam-flagged / SFI-blocking; **Medium** = should migrate but not the worst offender; **Low** = acceptable as-is.)

---

## Per-path detail

### 1. Frontend → Backend (MSAL bearer token) — Low

**Description.** The Next.js SPA acquires a Microsoft Entra ID token via MSAL.js PKCE flow, then attaches it as a `Bearer` header on every backend call through the `authFetch` wrapper. The backend validates the signed JWT against Microsoft's published JWKS.

**Current state.**
- Frontend MSAL config: `frontend/lib/msalConfig.js:7-45`. Uses `PublicClientApplication`, authority `https://login.microsoftonline.com/common`, scopes `['openid', 'profile', 'email']`. Client ID read from `NEXT_PUBLIC_AZURE_CLIENT_ID` (`msalConfig.js:9`).
- `authFetch` wrapper: `frontend/lib/auth.js:201-248`. Acquires token via `acquireTokenSilent` (`auth.js:72-75`) with an interactive popup fallback on `InteractionRequiredAuthError` (`auth.js:81-89`). Attaches `Authorization: Bearer ${token}` (`auth.js:209`). Retries once on 401 after forcing a token refresh (`auth.js:213-228`), then redirects to `/login` if still failing.
- Every frontend component calling the API uses `authFetch` — sampled: `components/ActivityLog.js:170`, `components/AttachmentManager.js:107-109,156,213,232`, `components/COATracker.js:77-78,114,133`, `pages/ai-review.js:83,123,149,174,240,254,260,270,310`, `pages/all-sows.js:137,164`, `pages/business-logic.js:23`. No direct `fetch()` calls to API routes were found outside of `/api/auth/me` during login/init, which use the same Bearer header (`auth.js:131-132, 164-165`).
- Backend JWT validation: `backend/auth.py:78-112`. Fetches and caches JWKS (`auth.py:38-55`), matches `kid` to a key (with force-refresh on miss — `auth.py:58-75`), then `jwt.decode` with `algorithms=['RS256']`, `audience=AZURE_AD_CLIENT_ID`, `verify_exp=True` (`auth.py:97-107`).
- **Caveat:** `verify_iss` is deliberately set to `False` (`auth.py:103`, documented at `auth.py:82-85`) because the `/common` multi-tenant authority returns per-tenant issuers. The audience check pins tokens to the app registration, but **any** tenant's Entra ID can mint a token that passes. Whether this is acceptable depends on whether this app will be single-tenant or multi-tenant in production — flag for Eugene.
- `AZURE_AD_CLIENT_ID` is wired into both Container Apps as a plaintext env var (not a secret) — `main.bicep:196` (api), `main.bicep:224` (web as `NEXT_PUBLIC_AZURE_CLIENT_ID`). Client IDs are not secrets, so this is correct.

**Target state.** No change needed — this *is* the target pattern for user↔service auth. Managed identity is for service↔service; user auth correctly uses OAuth2/OIDC bearer tokens.

**Gap.** Minor: the disabled issuer check is worth documenting on the Sprint 6 ticket as a "confirm tenancy model and decide" item rather than an immediate fix.

**Effort.** S (documentation only).

---

### 2. Foundry access — three related findings

Shyam's single flagged path has split into three after reading the team's working `.env` and the `ml/` directory. Handling them together because the fix is coupled.

#### 2a. Backend → ML service (GraphRAG) — **High** (latent)

**Description.** The backend proxies AI requests to a separate ML FastAPI (`ml/api.py`) that hosts GraphRAG + LLM orchestration. The proxy is in `backend/routers/ai.py:264-274`. Today the ML service is **not deployed to Azure** — `GRAPHRAG_API_URL` in the working dev `.env` points at `http://host.docker.internal:8001`, meaning the ML service runs on the developer's host machine and is reachable only from containers on the same Docker network.

**Current state.**
- Backend side: `backend/routers/ai.py:266-274` — `httpx.AsyncClient(base_url=GRAPHRAG_API_URL, timeout=30.0).get(...)` / `.post(...)`. **No `Authorization` header on the outbound request**, no client certificate, no API key.
- ML side: `ml/api.py:48-60` — FastAPI app with `CORSMiddleware(allow_origins=["*"])`. **No auth dependency** on any endpoint. Any caller that can reach the URL can invoke `/assist`, `/context`, `/sows/{id}/validate`, etc.
- `GRAPHRAG_API_URL` is read from env at `backend/config.py:46`. Default is `""` which triggers the stub-data fallback in `_proxy_or_stub`.
- No Bicep module provisions the ML service. `azure.yaml` declares four services (`api`, `web`, `neo4j`, `postgres`) — no `ml` entry.

**Why this is High (latent).** The moment the ML service gets a Container App, the backend will be forwarding authenticated user requests (with Entra ID claims stripped at the proxy boundary) to an unauthenticated downstream, *including* the SoW content being analyzed. An attacker with any network path to the ML service's ingress can call it directly, bypassing the backend's Entra check.

**Target state.** Two options, pick one per Eugene/Jayden:
1. **MI-to-MI** (SFI-preferred): deploy the ML service as a Container App with its own system-assigned MI. Put Entra "Easy Auth" on the ML Container App configured to accept tokens from a dedicated app registration. The backend's MI acquires a token for that app registration (`client.get_token(f'{ml_app_id}/.default')`) and passes it as `Authorization: Bearer …` in the proxy call.
2. **Internal-only ingress + mTLS** (weaker but simpler): set `ingress.external: false` on the ML Container App so only other containers in the same environment can reach it, then require mTLS via a shared self-signed cert rotated quarterly.

Option 1 is what SFI will ask for.

**Gap.** Full build — MI on the new ML Container App, backend MI, Easy Auth config, outbound token acquisition in `_proxy_or_stub`.

**Effort.** M.

---

#### 2b. ML service → Azure AI Foundry (API key, live) — **High** (Shyam-flagged)

**Description.** This is the actual Shyam-flagged call. The ML service calls Azure AI Foundry via the OpenAI SDK with a static API key.

**Current state.**
- Client construction: `ml/sow_kg/llm_client.py:19-25` —
  ```python
  endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
  api_key = os.getenv("AZURE_OPENAI_API_KEY")
  if not endpoint or not api_key:
      raise RuntimeError("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set in .env")
  _client = OpenAI(base_url=endpoint, api_key=api_key)
  ```
- Second client (used for KG data generation): `ml/kg_data_gen/llm_client.py:21-25` —
  ```python
  client = AzureOpenAI(
      azure_endpoint=AZURE_OPENAI_ENDPOINT,
      api_key=AZURE_OPENAI_API_KEY,
      api_version=AZURE_OPENAI_API_VERSION,
  )
  ```
  Config centralized at `ml/kg_data_gen/config.py:16-22` with `USE_LLM = bool(AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT)` — the key presence is also a feature toggle.
- Third client (one-off script): `ml/llm_gen.py:9-12`.
- The working `.env` (provided out-of-band) populates:
  - `AZURE_OPENAI_ENDPOINT=https://foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW`
  - `AZURE_OPENAI_DEPLOYMENT=Kimi-K2.5`
  - `AZURE_OPENAI_API_VERSION=2025-01-01-preview`
  - `AZURE_OPENAI_API_KEY=BbSr…V1rf` (84 chars; matches Azure AI / Cognitive Services key format)
- Credential storage today: file-based `.env` on developer machines. `.env` is correctly gitignored (`.gitignore:5`), so the key is not in source. The `ml/.env.example:1-4` documents the pattern but with placeholder values.
- No Bicep path exists for the ML service, so no Container App secret exists either — Sprint 6 will need to decide whether to plumb the key through Bicep (stopgap) or skip the key entirely (target).

**Target state.**
- Rewrite `ml/sow_kg/llm_client.py` and `ml/kg_data_gen/llm_client.py` to use `DefaultAzureCredential` with `azure_ad_token_provider`:
  ```python
  from azure.identity import DefaultAzureCredential, get_bearer_token_provider
  from openai import AzureOpenAI
  token_provider = get_bearer_token_provider(
      DefaultAzureCredential(),
      "https://cognitiveservices.azure.com/.default",
  )
  _client = AzureOpenAI(
      azure_endpoint=AZURE_OPENAI_ENDPOINT,
      azure_ad_token_provider=token_provider,
      api_version=AZURE_OPENAI_API_VERSION,
  )
  ```
  Note: the current `ml/sow_kg/llm_client.py` uses the non-Azure `OpenAI` class with `base_url=`. Switch to `AzureOpenAI` with `azure_endpoint=` — `OpenAI` with a Foundry `base_url` does not support the MI token provider pattern cleanly.
- Provision an ML Container App in Bicep with `identity: { type: 'SystemAssigned' }`.
- Grant that MI the **`Cognitive Services OpenAI User`** role (role ID `5e0bd9bd-7b93-4f28-af87-19fc36ad61bd`) on the Foundry/OpenAI resource via `Microsoft.Authorization/roleAssignments`. Use **`Azure AI Developer`** (role ID `64702f94-c441-49e6-a78b-ef80e0188fee`) instead if the API surface broadens beyond OpenAI endpoints (Foundry hubs, project management, model deployment mgmt). For current code (chat completions only), `OpenAI User` is sufficient.
- Delete `AZURE_OPENAI_API_KEY` everywhere: `.env.example` in `ml/`, `ml/kg_data_gen/config.py:19,22`, the three client files. Keep `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_DEPLOYMENT` (not secrets).
- Rotate the leaked key (see P1-0).
- Local dev: developers use `az login` on their machine, and `DefaultAzureCredential` picks up the AZ CLI identity. No shared secret on disk.

**Gap.** Live migration — three code files + new Bicep module + Foundry-side role assignment + key rotation + GitHub Actions cleanup. The Sprint 6 scope in v1 of this report (greenfield client) was wrong; it's a rewrite of existing working code.

**Effort.** M (unchanged estimate — rewrite is still ≤50 LOC per file, well-known pattern).

---

#### 2c. Backend Bicep — dead `AZURE_AI_*` wiring — Low

**Description.** The `api` Container App is configured to receive `AZURE_AI_ENDPOINT` and `AZURE_AI_KEY` as secret-backed env vars, but no backend code reads them. This is residual scaffolding from an earlier plan to put the Foundry client in the backend itself.

**Current state.**
- `infra/main.bicep:194-195, 201-202` — env vars and Container App secrets defined.
- `infra/main.parameters.json:23-28` — parameters declared.
- `azure-deploy.yml:62` — forwarded from GitHub Secrets.
- `docker-compose.yml:22-23` — forwarded in local dev.
- Backend code: no match for `AZURE_AI_KEY` / `AZURE_AI_ENDPOINT` outside config/infra (grep confirmed).

**Target state.** Delete. This wiring will otherwise collide with the ML Container App's own secrets or tempt someone to put a second keyed Foundry client in the backend.

**Gap.** Cleanup only.

**Effort.** XS.

---

### 3. Backend → PostgreSQL (password in connection string) — Medium

**Description.** Postgres runs as a Container App (not the managed Azure DB service — `infra/main.bicep:14-16` notes that Flexible Server is restricted on Azure for Students subs). The `api` Container App connects via a standard `postgresql://user:password@host:5432/db` connection string over internal Container Apps DNS.

**Current state.**
- Connection string assembled at `backend/config.py:21` from `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` env vars.
- Pool created at `backend/main.py:115-118` with `asyncpg.create_pool(DATABASE_URL, ssl=ssl_ctx)`, where `PG_SSL` defaults to `"disable"` (`config.py:24`) — SSL is off because the containerized Postgres doesn't serve TLS.
- Password injected via Container App secret: `main.bicep:193` (`POSTGRES_PASSWORD` env → `secretRef: 'postgres-password'`), secret defined at `main.bicep:200`. Secret value comes from the `@secure()` Bicep parameter `postgresPassword` (`main.bicep:43-45`), which is populated from GitHub Secret `AZURE_POSTGRES_PASSWORD` (`azure-deploy.yml:59`).
- `postgresql-flexible.bicep` exists in `infra/modules/` but is **not referenced** by `main.bicep`. It was written for the managed-service path, then abandoned per the comment at `main.bicep:14-16`. Flag separately — this is dead code that could confuse future readers.

**Target state (given containerized Postgres).** Postgres running inside a Container App has **no Azure RBAC surface** — managed identity cannot authenticate to a self-hosted Postgres process. The realistic targets are:
- Short-term: move the password out of the Container App secret and into **Azure Key Vault** with a Key Vault reference, so rotation is centralized.
- Medium-term: migrate to **Azure Database for PostgreSQL Flexible Server** (per the unused `postgresql-flexible.bicep`) and use **Microsoft Entra authentication for PostgreSQL** with a managed identity. Requires a Flexible Server sub (or exception for Students).

**Gap.** No MI path while Postgres is a container. The Container App secret is not worse than a Key Vault reference from a secrecy perspective (both are platform-protected), but a KV reference gives a rotation/audit path.

**Effort.** S (Key Vault reference migration). L (full move to Flex Server + MI).

---

### 4. Backend → Neo4j (basic auth) — Medium

**Description.** Neo4j Community Edition runs as a Container App (`infra/modules/neo4j-container.bicep:1-153`) with the official `neo4j:5-community` image. Basic auth (user + password) is the only auth mode Neo4j Community supports.

**Current state.**
- Driver construction: `backend/main.py:99-101` calls `GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))`, where `NEO4J_URI` is `bolt://neo4j:7687` by default (`config.py:10`) and `NEO4J_PASSWORD` is read from env (`config.py:12`).
- Bicep wiring: `main.bicep:186-188` injects `NEO4J_URI`, `NEO4J_USER=neo4j`, and `NEO4J_PASSWORD` (as secretRef `neo4j-password`) into the `api` Container App. Secret defined at `main.bicep:199`.
- Neo4j container reads the same password: `infra/modules/neo4j-container.bicep:94-97` sets `NEO4J_AUTH=neo4j/${neo4jPassword}`.
- Neo4j is internal-only (`neo4j-container.bicep:47` — `external: false`), so the password never crosses the public internet.

**Target state.** Neo4j Community has no Azure AD / managed identity integration — no RBAC target exists. The target reduces to **Key Vault reference for the password** plus ensuring internal-only ingress (already in place).

**Gap.** Same as Postgres — MI isn't an option for a self-hosted Neo4j. Move the password to Key Vault for rotation; otherwise acceptable.

**Effort.** S (Key Vault reference).

---

### 5. Container Apps → Azure Container Registry (ACR admin user) — **High**

**Description.** Every Container App in the environment pulls its image from the shared ACR using the ACR **admin user** (a username + password baked into the registry itself). This is a classic keyed anti-pattern and one of the easiest SFI wins.

**Current state.**
- ACR admin user enabled: `infra/modules/container-registry.bicep:22` — `adminUserEnabled: true` with the comment "Required for Container Apps to pull images" (this is no longer true — MI+AcrPull has been GA for years; the comment reflects an outdated assumption).
- Credentials fetched at deploy time via ARM: `infra/modules/container-app.bicep:55-72`
  ```
  registries: [{
    server: containerRegistry.properties.loginServer
    username: containerRegistry.listCredentials().username
    passwordSecretRef: 'registry-password'
  }]
  secrets: union([
    { name: 'registry-password', value: containerRegistry.listCredentials().passwords[0].value }
  ], secrets)
  ```
- Same pattern repeats on `neo4j-container.bicep:61-73` and `postgres-container.bicep:56-73`.
- Every Container App has its own copy of the admin password stashed as a `registry-password` Container App secret.

**Target state.**
- Add `identity: { type: 'SystemAssigned' }` to each Container App resource.
- Replace the `registries` block with:
  ```
  registries: [{
    server: containerRegistry.properties.loginServer
    identity: 'system'
  }]
  ```
  (or a user-assigned identity's resource ID if centralizing).
- Add a `Microsoft.Authorization/roleAssignments` resource granting each Container App's `identity.principalId` the **`AcrPull`** role (role ID `7f951dda-4ed3-11e8-89fc-35b5eb8c5e69`) on the ACR.
- Set `adminUserEnabled: false` on the ACR.
- Remove the `registry-password` secret and the `listCredentials()` calls from all three container-app modules.

**Gap.** Wholly keyed today; remediation is entirely in Bicep (no application code touches ACR).

**Effort.** S — pure infra, well-documented Azure pattern, applies to all four container apps via the shared `container-app.bicep` module (plus the two bespoke neo4j/postgres modules).

---

### 6. GitHub Actions → Azure subscription (OIDC federated) — Low (already keyless)

**Description.** The deploy workflow uses GitHub's OIDC provider to exchange a short-lived workload identity token for Azure access, rather than a long-lived service principal secret. This is already the target pattern.

**Current state.**
- `azure-deploy.yml:45-48` — workflow declares `permissions: id-token: write, contents: read` (required for OIDC).
- `azure-deploy.yml:72-78` — logs in with:
  ```
  azd auth login --client-id "$AZURE_CLIENT_ID" \
                 --federated-credential-provider "github" \
                 --tenant-id "$AZURE_TENANT_ID"
  ```
  No `--client-secret`, no service principal JSON. This is OIDC federated.
- Same pattern in `azure-teardown.yml:53-58`.
- **But:** `azure-deploy.yml:17` lists `AZURE_CLIENT_SECRET` in the "Required GitHub Secrets" doc comment, and `sprint4-full-analysis.md:7403` repeats that line. The secret is not actually referenced in either workflow (grep confirms — only doc comments match). This is stale documentation, not a live vulnerability, but it will trip up the next person setting up the deploy.
- The app registration on the Azure side must have a federated credential configured trusting this repo's OIDC tokens. Not visible from the repo — flag for Eugene to confirm.

**Target state.** Already met. Clean up the doc comment.

**Gap.** Documentation only. Remove the `AZURE_CLIENT_SECRET` line from the workflow header comment; confirm the Azure-side federated credential config with Eugene.

**Effort.** XS.

---

### 7. Container Apps Environment → Log Analytics (shared key) — Medium

**Description.** The Managed Environment forwards container logs to Log Analytics using the workspace's primary shared key, embedded in the environment config at deploy time.

**Current state.** `infra/modules/container-apps-environment.bicep:22-28`:
```
appLogsConfiguration: {
  destination: 'log-analytics'
  logAnalyticsConfiguration: {
    customerId: reference(logAnalyticsWorkspaceId, '2023-09-01').customerId
    sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
  }
}
```
The `listKeys()` call fetches the workspace shared key at deploy time and bakes it into the environment config. Rotating the Log Analytics key requires a re-deploy.

**Target state.** Azure now supports managed-identity log ingestion to Log Analytics via Data Collection Endpoints + Data Collection Rules (`azure-monitor-agent`-style). For Container Apps Environments specifically, the `appLogsConfiguration` supports `destination: 'azure-monitor'` with a DCR reference, which authenticates via the environment's system-assigned identity and `Monitoring Metrics Publisher` role on the DCR. This is a more involved migration than the others — consider deferring until after the Foundry + ACR fixes.

**Gap.** Shared key today; DCR-based MI ingestion is the target but not urgent.

**Effort.** M.

---

### 8. Backend → Microsoft JWKS (no auth) — N/A (expected)

**Description.** The backend fetches Microsoft's public signing keys from `https://login.microsoftonline.com/common/discovery/v2.0/keys` to validate Entra JWTs.

**Current state.** `backend/auth.py:49-55` — unauthenticated `httpx.AsyncClient().get(AZURE_AD_JWKS_URL)`. This endpoint is public by design; no auth is required or appropriate.

**Target state.** No change. This is correct.

---

### Other findings (no standalone section)

- **`backend/status.py:58-71`**: `check_frontend` makes an unauthenticated HTTP GET to `http://frontend:3000` / `http://localhost:3000` as a liveness probe. This is same-pod / same-environment traffic and is not a security concern.
- **Backend → ML service proxy** (formerly in this section; now promoted to **Path 2a** above) — no auth on the outbound call, but the ML service isn't deployed to Azure yet.
- **`.env` is correctly gitignored** (`.gitignore:2-5`). The committed `.env.example` contains only empty placeholder values for `AZURE_AI_ENDPOINT`, `AZURE_AI_KEY`, `AZURE_AD_CLIENT_ID` and a locally-scoped `cocoon_dev_2026` password for dev-only Postgres/Neo4j (`.env.example:7,11-12`). The presence of `cocoon_dev_2026` in `.env.example` is intentional for local dev bootstrap.
- **`.env` name drift** — the committed `.env.example` documents `AZURE_AI_ENDPOINT` / `AZURE_AI_KEY`, but the team's actual working `.env` uses `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` (plus `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, `GRAPHRAG_API_URL`). `.env.example` should be updated to match reality before someone tries to set up a clean dev environment from the template and hits the `RuntimeError` at `ml/sow_kg/llm_client.py:22`. Small, independent cleanup ticket.
- **`NEXT_PUBLIC_AZURE_API_SCOPE`** — present in the working `.env` but empty. Not read by any code in the repo (grep confirmed). Appears to be reserved for a future migration from using the ID token audience (app registration client ID) to a dedicated "Expose an API" scope on the app registration. That migration would let the backend validate tokens against a specific API scope rather than any ID token for the app. Not urgent, but worth documenting.

---

## Proposed follow-up tickets

Ordered by priority. Priority combines severity + dependency order (MI on the `api` Container App is needed before #1 and #2 can land, so it's called out as a shared prerequisite).

### Priority 0 — Shared prerequisite

**P0-1. Add system-assigned managed identity to all four Container Apps.** Edit `infra/modules/container-app.bicep`, `neo4j-container.bicep`, and `postgres-container.bicep` to add `identity: { type: 'SystemAssigned' }` on the `Microsoft.App/containerApps` resource. Expose `outputs.principalId` so downstream modules can grant RBAC to it. Non-breaking by itself. **Effort: XS.**

### Priority 1 — Shyam-flagged, SFI-blocking

**P1-0. Rotate the leaked Foundry API key.** (Emergency, not Sprint 6.) The working key for `https://foundry-sow.services.ai.azure.com/api/projects/AI-Project-SOW` was shared outside its original dev-`.env` storage during the audit handoff. Regenerate the key in the Azure Portal → AI Foundry project → Keys, redistribute the new value to anyone running the ML service locally, and confirm that no non-team actor pulled a chat completion against the old key (check the Foundry project's usage logs for anomalous timestamps). **Effort: XS (manual Azure action).** Owner: whoever has Foundry resource Owner on Shyam's team — likely Jayden or Shyam himself. Do this **before** starting P1-1.

**P1-1. Rewrite the ML-service Foundry clients to use managed identity + deploy the ML service to Azure.** Ticket scope:
- **Infra:**
  - Add `infra/modules/ml-container.bicep` for the ML service Container App. System-assigned MI. Internal ingress (`external: false`) — the ML service should only be reachable from other apps in the Container Apps environment.
  - Wire it into `infra/main.bicep` with `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` as plaintext env vars (these are not secrets). **No** `AZURE_OPENAI_API_KEY`.
  - Add `azure.yaml` entry for the `ml` service pointing to `ml/Dockerfile` (not present today — a new Dockerfile will be needed).
  - Provision (or reference via `existing`) the Foundry resource in Bicep so the role assignment can be authored. New module `infra/modules/foundry.bicep` (or an `existing` block if the resource is managed out-of-band by Shyam's team).
  - Grant the ML Container App's MI the **`Cognitive Services OpenAI User`** role (role ID `5e0bd9bd-7b93-4f28-af87-19fc36ad61bd`) on the Foundry resource via `Microsoft.Authorization/roleAssignments`. Switch to **`Azure AI Developer`** (`64702f94-c441-49e6-a78b-ef80e0188fee`) if the API surface broadens beyond OpenAI endpoints — confirm with Jayden.
- **Code (ML side):**
  - Rewrite `ml/sow_kg/llm_client.py:15-30` to use `AzureOpenAI(azure_endpoint=…, azure_ad_token_provider=get_bearer_token_provider(DefaultAzureCredential(), 'https://cognitiveservices.azure.com/.default'), api_version=…)`. Remove the `RuntimeError("… must be set in .env")` guard (the MI check is an access-token failure, not a config one).
  - Rewrite `ml/kg_data_gen/llm_client.py:21-25` the same way. Update `ml/kg_data_gen/config.py:19, 22` to drop `AZURE_OPENAI_API_KEY` and change `USE_LLM = bool(AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT)`.
  - Delete the one-off `ml/llm_gen.py:9-12` smoke-test script or rewrite it to match.
- **Code (dev ergonomics):** `DefaultAzureCredential` falls through to `AzureCliCredential` locally, so `az login` + role assignment on the developer's user principal is the dev workflow. Document this in `ml/README.md`.
- **GitHub Actions:** remove `AZURE_OPENAI_API_KEY` from any workflow env blocks (none exist today, but check before landing).
- **Cleanup follow-on:** once the new ML Container App is the source of truth, execute **P1-2** to delete the dead backend Bicep wiring.

Depends on: P0-1, P1-0. **Effort: M.** (Code: S. Infra: M — new Bicep module + role assignment + azure.yaml change.)

**P1-2. Delete the dead `AZURE_AI_*` wiring from the backend Container App.** Pure cleanup — the backend never reads these env vars. Remove:
- `infra/main.bicep:59-60` (parameter declarations for `azureAiEndpoint`, `azureAiKey`)
- `infra/main.bicep:194-195` (env vars)
- `infra/main.bicep:201-202` (secrets)
- `infra/main.parameters.json:23-28`
- `azure-deploy.yml:61-62` (env forwarding)
- `docker-compose.yml:22-23` (`AZURE_AI_ENDPOINT`, `AZURE_AI_KEY` on the `backend` service)

Verify with a grep after landing that no backend code references these names. Land after P1-1 so the reverse direction (accidentally needing them) is closed off.

Depends on: P1-1. **Effort: XS.**

**P1-3. Authenticate the backend → ML service hop (MI-to-MI).** Covers Path 2a. Ticket scope:
- Create a dedicated app registration for the ML service ("cocoon-ml-api"). Expose an API scope on it (`api://cocoon-ml-api/.default`).
- Configure Entra "Easy Auth" on the ML Container App (via Bicep) trusting tokens minted for that app registration.
- Grant the backend's MI the ability to acquire a token for `api://cocoon-ml-api/.default` (either via a delegated scope grant on the backend's app registration, or — simpler — via a federated cred on the backend MI and a role assignment on the ML-API app registration).
- Update `backend/routers/ai.py:264-274` `_proxy_or_stub` to acquire a bearer token via `DefaultAzureCredential().get_token('api://cocoon-ml-api/.default')` and pass it as `Authorization: Bearer …` on the outbound `httpx` call.

Depends on: P0-1, P1-1. **Effort: M.**

### Priority 2 — easy keyless wins

**P2-1. ACR: switch from admin user to managed identity + AcrPull.** Ticket scope:
- Add `identity: 'system'` to the `registries` block in `container-app.bicep:55-61`, `neo4j-container.bicep:61-67`, `postgres-container.bicep:56-62`.
- Delete the `registry-password` secret in all three modules.
- Add `Microsoft.Authorization/roleAssignments` granting each Container App's `principalId` the **`AcrPull`** role (`7f951dda-4ed3-11e8-89fc-35b5eb8c5e69`) on the ACR. New module `infra/modules/acr-role-assignments.bicep`.
- Set `adminUserEnabled: false` in `container-registry.bicep:22`.
- Update the misleading comment at `container-registry.bicep:22` ("Required for Container Apps to pull images").

Depends on: P0-1. **Effort: S.**

**P2-2. Clean up stale `AZURE_CLIENT_SECRET` documentation.** Remove the `AZURE_CLIENT_SECRET` line from `azure-deploy.yml:17` (doc comment). Confirm with Eugene that the Azure-side federated credential on the deploying app registration is correctly scoped to this repo. No code or secret rotation needed — the secret is not used. **Effort: XS.**

### Priority 3 — Key Vault migration for self-hosted DB passwords

**P3-1. Move Postgres + Neo4j passwords from Container App secrets to Key Vault references.** Ticket scope:
- Provision a Key Vault in `infra/` with `enablePurgeProtection: true`, `enableRbacAuthorization: true`.
- Grant each Container App's managed identity the **`Key Vault Secrets User`** role (role ID `4633458b-17de-408a-b874-0445c86b69e6`) on the vault.
- Store `postgres-password` and `neo4j-password` as Key Vault secrets.
- Change the Container App secrets to use the `keyVaultUrl` + `identity` pattern instead of inline `value`.
- This does not change the DB auth mechanism (still password) — it centralizes rotation and audit.

Depends on: P0-1. **Effort: S-M.**

**P3-2. (Stretch) Migrate Postgres to Azure DB for PostgreSQL Flexible Server with Entra auth.** Only land if Azure for Students restrictions have been lifted / an exception granted. The unused `infra/modules/postgresql-flexible.bicep` already exists as a starting point but would need `authConfig` updates for Entra auth and a Bicep-level wiring change in `main.bicep`. Deprioritize unless the subscription tier changes. **Effort: L.**

### Priority 4 — deferrable

**P4-1. Log Analytics: shared key → DCR + managed identity ingestion.** Migrate `container-apps-environment.bicep:22-28` from `destination: 'log-analytics'` (shared key) to `destination: 'azure-monitor'` with a Data Collection Rule reference; grant the environment's managed identity `Monitoring Metrics Publisher` on the DCR. Defer until P1 and P2 are done. **Effort: M.**

**P4-2. Decide Entra tenancy model + issuer verification.** `backend/auth.py:103` intentionally disables `verify_iss` because the backend uses the `/common` multi-tenant authority. If Cocoon should be single-tenant in production, switch `AZURE_AD_JWKS_URL` to `https://login.microsoftonline.com/{tenant-id}/discovery/v2.0/keys` and re-enable `verify_iss=True` with the expected issuer. This is a product decision, not a bug. Flag for discussion with Eugene. **Effort: XS once the decision is made.**

**P4-3. `.env.example` drift (minor).** Update both `.env.example` at repo root and `ml/.env.example` to match the real variable names the code reads (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, `GRAPHRAG_API_URL`, `NEXT_PUBLIC_AZURE_API_SCOPE`). When P1-1 lands, drop `AZURE_OPENAI_API_KEY` from the example rather than leaving a placeholder (a placeholder in `.env.example` after MI is in place will just cause confusion). **Effort: XS.**

*(Former P4-3 on ML-service outbound auth has been promoted to P1-3 above now that the ML service is known to exist.)*

---

## Open questions

Flag for discussion with **Eugene** (DevOps/Security) and **Jayden** (writing the Foundry integration):

1. **Single-tenant vs. multi-tenant (Eugene).** `backend/auth.py:103` disables issuer verification because MSAL uses `/common`. For a Microsoft-internal deployment, should this move to a specific tenant ID? This changes the security model of Path 1.
2. **Azure for Students quota on Foundry (Eugene / Jayden).** P1-1 provisions a Foundry / Azure OpenAI resource. Is this available on the current subscription, or does it need a different sub / exception? Same question blocked `postgresql-flexible.bicep` from being adopted.
3. **Federated credential setup on the deploying app registration (Eugene).** `azure-deploy.yml:72-78` uses OIDC federation. Confirm the federated credential on the app registration is scoped to `repo:<org>/Capstone-Microsoft-SoW:ref:refs/heads/main` (or similar) and not a permissive wildcard.
4. **ACR SKU (Eugene).** `container-registry.bicep:19` uses Basic SKU. AcrPull via MI works on Basic, but some advanced features (geo-replication, content trust) require Standard/Premium. No action needed unless those are on the roadmap.
5. **Foundry role choice (Jayden).** P1-1 proposes `Cognitive Services OpenAI User`. If the code will hit Foundry hubs/projects/model deployments beyond raw OpenAI endpoints, `Azure AI Developer` is the right choice. Jayden should confirm the API surface before the RBAC assignment is authored.
6. **Dead Bicep file (minor).** `infra/modules/postgresql-flexible.bicep` is not referenced by `main.bicep`. Keep it as a future-state starting point (P3-2), or delete it to avoid confusion? Suggest adding a header comment noting it is unused and why.
7. **ML service deployment plan (Jayden / ML team).** The ML service in `ml/` has real working code and a live Foundry integration, but no Bicep module and no entry in `azure.yaml`. Is the plan to deploy it as a Container App alongside `api`/`web`/`neo4j`/`postgres` (what P1-1 assumes), deploy it separately in a different environment, or keep it local-only while the backend always uses stubs? The answer changes whether P1-1 ships in Sprint 6 or gets re-scoped.
8. **Foundry resource ownership (Shyam / Jayden).** The Foundry project (`foundry-sow.services.ai.azure.com/.../AI-Project-SOW`) was provisioned out-of-band — no Bicep in this repo creates it. Who owns that resource today? Is the Sprint 6 role-assignment ticket (P1-1) authoring a `Microsoft.Authorization/roleAssignments` on a resource in a subscription Cocoon's GitHub Actions principal can reach? If the Foundry resource lives in Shyam's team's subscription, a cross-subscription RBAC grant or a separate manual role-assignment step will be needed.
9. **Foundry deployment model (Jayden).** The endpoint points at `services.ai.azure.com/api/projects/AI-Project-SOW` (Foundry project endpoint) rather than the classic `*.openai.azure.com` endpoint. The `ml/sow_kg/llm_client.py` uses the generic `openai.OpenAI` client (with `base_url=`) instead of `openai.AzureOpenAI` (with `azure_endpoint=`). That works today with an API key but not with `DefaultAzureCredential`'s token provider, which expects the Azure-specific client. P1-1 assumes moving to `AzureOpenAI`; Jayden should confirm that the Foundry project endpoint URL works with `AzureOpenAI(azure_endpoint=..., api_version=...)` — it does in practice for Foundry-backed OpenAI deployments, but the exact URL transformation is worth verifying before the rewrite lands.

---

## Method notes

- All 7 in-scope paths were covered, plus one additional path (Log Analytics) surfaced during infra review.
- Read-only pass. No files under `backend/`, `frontend/`, `infra/`, or `.github/` were modified. No `azd` commands were run. No git operations were performed.
- Evidence cites `file:line` per the audit spec. Claims without citations are flagged in the text (the "assumption" of a federated credential config on the Azure side is the main one — not visible from the repo).
- Tools used: `Read` for known files, `Grep` for keyword sweeps (`identity:`, `roleAssignments`, `DefaultAzureCredential`, `api_key=`, etc.), `Glob`/`ls` for directory mapping.
