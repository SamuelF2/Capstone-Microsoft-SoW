# COC-118 Foundry Call Sites — Recon Report

## Summary
- Total Python files that construct OpenAI/AzureOpenAI clients: **3**
- Total Python files that read `AZURE_OPENAI_*` env vars: **4** (3 client files + 1 config module that is imported by one of them)
- Files in `ml/`:
  - `ml/llm_gen.py` (constructs `OpenAI` client)
  - `ml/sow_kg/llm_client.py` (constructs `AzureOpenAI` client)
  - `ml/kg_data_gen/llm_client.py` (constructs `AzureOpenAI` client)
  - `ml/kg_data_gen/config.py` (reads env, imported by `kg_data_gen/llm_client.py`)
  - `ml/kg_data_gen/run.py` (docstring-only references, no runtime use)
- Files outside `ml/`: **0** (no call sites in `backend/`, `frontend/`, or `tests/`)

## ml/ directory structure

```
ml/
├── .dockerignore
├── .env.example
├── .python-version
├── .venv/                    (excluded)
├── Dockerfile
├── README.md
├── api.py
├── kg_data_gen/
│   ├── README.md
│   ├── config.py
│   ├── generators/
│   ├── llm_client.py
│   ├── output/
│   ├── requirements.txt
│   └── run.py
├── llm_gen.py
├── main.py
├── main_new.py
├── pyproject.toml
├── sow_kg/
│   ├── __init__.py
│   ├── __pycache__/          (excluded)
│   ├── assist.py
│   ├── assist_cli.py
│   ├── assist_router.py
│   ├── db.py
│   ├── enrich.py
│   ├── extract.py
│   ├── graph_rag.py
│   ├── graphrag.py
│   ├── ingest.py
│   ├── ingest_async.py
│   ├── ingest_csv.py
│   ├── ingest_json.py
│   ├── ingest_markdown.py
│   ├── llm_client.py
│   ├── queries.py
│   ├── schema_evolution.py
│   └── sow-kg-schema.html
└── uv.lock
```

## Python files in ml/ (excluding .venv and __pycache__)

- `ml/api.py`
- `ml/llm_gen.py`
- `ml/main.py`
- `ml/main_new.py`
- `ml/kg_data_gen/config.py`
- `ml/kg_data_gen/llm_client.py`
- `ml/kg_data_gen/run.py`
- `ml/kg_data_gen/generators/*.py` (closeout.py, status_reports.py, and others — consumers of `llm_client`)
- `ml/sow_kg/__init__.py`
- `ml/sow_kg/assist.py`
- `ml/sow_kg/assist_cli.py`
- `ml/sow_kg/assist_router.py`
- `ml/sow_kg/db.py`
- `ml/sow_kg/enrich.py`
- `ml/sow_kg/extract.py`
- `ml/sow_kg/graph_rag.py`
- `ml/sow_kg/graphrag.py`
- `ml/sow_kg/ingest.py`
- `ml/sow_kg/ingest_async.py`
- `ml/sow_kg/ingest_csv.py`
- `ml/sow_kg/ingest_json.py`
- `ml/sow_kg/ingest_markdown.py`
- `ml/sow_kg/llm_client.py`
- `ml/sow_kg/queries.py`
- `ml/sow_kg/schema_evolution.py`

## Foundry call sites

### ml/llm_gen.py
- **Purpose:** constructs an `OpenAI` (not `AzureOpenAI`) client using the Azure Foundry endpoint as `base_url`; standalone ad-hoc smoke script (no imports from this file elsewhere in the repo).
- **Env vars read:** `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`
- **Line 1–22:**
```python
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).parent / ".env")

client = OpenAI(
    base_url=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
)

completion = client.chat.completions.create(
    model=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
    messages=[
        {
            "role": "user",
            "content": "What is the capital of France?",
        }
    ],
)
```

### ml/sow_kg/llm_client.py
- **Purpose:** constructs an `AzureOpenAI` client (lazy singleton via `get_client()`) for the SOW knowledge-graph extraction / classification / enrichment pipeline. This is the primary production LLM client — imported by `ml/sow_kg/ingest.py` and `ml/sow_kg/assist.py`.
- **Env vars read:** `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT`
- **Line 15–38:**
```python
def get_client():
    global _client
    if _client is not None:
        return _client
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")
    if not endpoint or not api_key:
        raise RuntimeError("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set in .env")
    from urllib.parse import urlparse

    from openai import AzureOpenAI

    # AzureOpenAI expects the bare host (e.g. https://foo.services.ai.azure.com).
    # The .env may contain a full Foundry project path — strip it.
    parsed = urlparse(endpoint)
    azure_endpoint = f"{parsed.scheme}://{parsed.netloc}"

    _client = AzureOpenAI(
        azure_endpoint=azure_endpoint,
        api_key=api_key,
        api_version=api_version,
    )
    return _client
```
- **Also hardcodes Foundry URL shape:** line 28 comment explicitly references `https://foo.services.ai.azure.com` and strips the project path from the endpoint URL — Foundry-awareness is baked in.

### ml/kg_data_gen/llm_client.py
- **Purpose:** constructs an `AzureOpenAI` client (module-level, eager) for the KG synthetic-data generator. Imported by `ml/kg_data_gen/generators/status_reports.py` and `ml/kg_data_gen/generators/closeout.py`.
- **Env vars read:** indirectly via `ml/kg_data_gen/config.py` — `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` (+ hardcoded `AZURE_OPENAI_API_VERSION = "2024-12-01-preview"`)
- **Line 10–39:**
```python
from config import (
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_DEPLOYMENT,
    AZURE_OPENAI_ENDPOINT,
    USE_LLM,
)

if USE_LLM:
    from openai import AzureOpenAI

    client = AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION,
    )


def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
    """Call Azure OpenAI with retry logic."""
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=AZURE_OPENAI_DEPLOYMENT,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_completion_tokens=max_tokens,
            )
```

### ml/kg_data_gen/config.py (env-read only, no client construction)
- **Purpose:** centralizes the env-var reads consumed by `kg_data_gen/llm_client.py`; also pins `AZURE_OPENAI_API_VERSION` as a literal.
- **Env vars read:** `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`
- **Line 13–22:**
```python
# ── Azure OpenAI ────────────────────────────────────────────────────────────
# Set these 3 env vars to enable LLM text generation.
# Find them in Azure AI Foundry → your deployment → Endpoint + Keys.
AZURE_OPENAI_ENDPOINT = os.environ.get(
    "AZURE_OPENAI_ENDPOINT", ""
)  # e.g. "https://your-resource.openai.azure.com"
AZURE_OPENAI_API_KEY = os.environ.get("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "")  # e.g. "gpt-4o-mini"
AZURE_OPENAI_API_VERSION = "2024-12-01-preview"
USE_LLM = bool(AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT)
```

### ml/kg_data_gen/run.py (docstring only — no runtime code path)
- **Purpose:** pipeline entry point; only references Foundry env vars inside its usage docstring.
- **Env vars read:** none (runtime)
- **Line 10–14:**
```python
    # With Azure OpenAI for realistic text:
    export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
    export AZURE_OPENAI_API_KEY="your_key"
    export AZURE_OPENAI_DEPLOYMENT="gpt-4o-mini"
    python run.py
```

## Backend references

Confirmed **zero hits** in `backend/` for any of: `OpenAI`, `Foundry`, `foundry`, `AZURE_OPENAI`, `AZURE_AI`, `foundry-sow`, or `azure.*openai` (case-insensitive). The prior audit's claim that the backend is mock-only w.r.t. Foundry is accurate.

## Config surface (Bicep, .env, YAML, JSON)

**Bicep** (`infra/main.bicep`):
- Params: `azureAiEndpoint`, `azureAiKey` (backend-facing, lines 54–60), `azureOpenAiEndpoint`, `azureOpenAiDeployment`, `azureOpenAiApiVersion`, `azureOpenAiApiKey` (ML-facing, lines 65–78 — scoped explicitly to COC-118 step 2).
- Env injection: `AZURE_AI_ENDPOINT` / `AZURE_AI_KEY` (lines 231–232) into the backend container.

**Bicep** (`infra/modules/ml-container.bicep`):
- System-assigned managed identity is already provisioned on the ML container app (comment on lines 8–11 explicitly marks this as prep for COC-118 step 3).
- Env injection (lines 110–113): `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` as plain values; `AZURE_OPENAI_API_KEY` as a `secretRef`. The key is labeled "temporary, replaced by MI + RBAC in COC-118 step 3" on line 32.

**Parameters JSON** (`infra/main.parameters.json`, lines 24, 27, 33, 36, 39, 42): binds all six params above to env-var substitutions.

**Workflow** (`.github/workflows/azure-deploy.yml`, lines 24–30, 65–71): enumerates the same secrets. Line 30 comment already tags `AZURE_OPENAI_API_KEY` as "temporary — removed in COC-118 step 3".

**docker-compose.yml** (lines 22–23): wires `AZURE_AI_ENDPOINT` / `AZURE_AI_KEY` into the backend service only. No `AZURE_OPENAI_*` wiring to the ML service in local compose.

**.env / .env.example** (repo root): only `AZURE_AI_ENDPOINT=` and `AZURE_AI_KEY=` (backend placeholders, unused per the backend grep above).

**ml/.env.example**: the four `AZURE_OPENAI_*` vars consumed by the three ML call sites (`AZURE_OPENAI_ENDPOINT=<foundary_link>`, `AZURE_OPENAI_API_KEY=<key>`, `AZURE_OPENAI_DEPLOYMENT=Kimi-K2.5`, `AZURE_OPENAI_API_VERSION=2025-01-01-preview`).

No file in the repo hardcodes the literal `services.ai.azure.com` hostname in Python code. The prior audit document (`docs/audits/auth-audit-2026-04-21.md`) references `foundry-sow.services.ai.azure.com` only in prose (not executable code).

## Discrepancies with prior audit

- **`ml/sow_kg/llm_client.py`** — prior audit was **correct**. File exists (6,164 bytes, last modified Apr 23 11:54) and constructs `AzureOpenAI` exactly as described. The user's PowerShell grep missed this file; the audit stands.
- **`ml/kg_data_gen/llm_client.py`** — prior audit was **correct**. File exists (11,901 bytes, last modified Mar 27 23:28) and constructs `AzureOpenAI`. The user's PowerShell grep missed this file too.
- **`ml/llm_gen.py`** — prior audit was **correct**. File exists; however it uses the generic `OpenAI` constructor (not `AzureOpenAI`) with `base_url` set to the Foundry endpoint. This is a **stylistic mismatch** with the other two files — worth noting for the MI rewrite because the auth pattern differs (a plain `OpenAI` client authenticated against Foundry behaves differently from `AzureOpenAI` and does not support the `azure_ad_token_provider` kwarg used for MI-based auth).

**Net assessment:** the prior audit's 3-file list was accurate. The user's manual PowerShell grep produced a false negative (likely due to path globbing, encoding, or a filtered directory rule). No additional hidden call sites were found.

## Step 3 scope implications

Given the actual findings, the step 3 ticket should:

- **Target these files for the MI rewrite:**
  - `ml/sow_kg/llm_client.py` — primary production client; swap `api_key=` for `azure_ad_token_provider` using `DefaultAzureCredential` + `get_bearer_token_provider(..., "https://cognitiveservices.azure.com/.default")`. This is the highest-impact change (imported by `ingest.py`, `assist.py`).
  - `ml/kg_data_gen/llm_client.py` — secondary client; same MI pattern. Config module `ml/kg_data_gen/config.py` must drop `AZURE_OPENAI_API_KEY` from `USE_LLM` gating (or the gate becomes meaningless under MI).
  - `ml/llm_gen.py` — **decision point.** File is a 24-line ad-hoc smoke script that no other module imports. Two options: (a) rewrite to `AzureOpenAI` + MI for consistency, or (b) delete it outright. Recommend deletion unless a dev still depends on it locally — but verify with the team before removing.

- **Keep/drop the `kg_data_gen` rewrite: KEEP.** The file exists, actively constructs a live `AzureOpenAI` client, and is imported by two generator modules (`status_reports.py`, `closeout.py`). Dropping it would leave a key-auth path live.

- **Keep/drop the `sow_kg` rewrite: KEEP.** This is the primary production LLM integration — dropping it would leave COC-118 step 3 effectively no-op.

- **Other changes needed that weren't in the original step 3 scope:**
  - **`ml/llm_gen.py` decision** (rewrite vs. delete) — not covered by the original 3-file list framing.
  - **`ml/kg_data_gen/config.py`**: `USE_LLM = bool(endpoint and key and deployment)` gate must be redesigned for MI (no key to gate on). Either drop the key from the gate or replace with a credential-probe.
  - **`infra/modules/ml-container.bicep`**: remove the `azureOpenAiApiKey` param, the `azure-openai-api-key` secret, and the `AZURE_OPENAI_API_KEY` env-var injection. Add Cognitive Services User (or equivalent) role assignment on the ML container app's system-assigned managed identity over the Foundry resource.
  - **`infra/main.bicep`**: drop `azureOpenAiApiKey` param + pass-through.
  - **`infra/main.parameters.json`**: drop the `AZURE_OPENAI_API_KEY` binding.
  - **`.github/workflows/azure-deploy.yml`**: remove the `AZURE_OPENAI_API_KEY` secret reference (lines 30, 71).
  - **`ml/.env.example`**: document that `AZURE_OPENAI_API_KEY` is dev-only (local fallback) if the MI rewrite retains a dual-path; otherwise remove.
  - **`ml/Dockerfile` / `pyproject.toml`**: verify `azure-identity` is available (it is not listed in the Foundry call-site imports today — will need to be added).
  - **Prior audit cleanup**: `docs/audits/auth-audit-2026-04-21.md` line 16 flags a leaked key for the Foundry resource — the P1-0 rotation must precede or accompany the MI cutover; otherwise the rotated key will be live during the transition window.
