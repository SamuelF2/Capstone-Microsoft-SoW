# Cocoon System Test Plan

**Owner:** Zhan Su (QA Engineer)
**Final demo:** May 14, 2026
**Plan generated:** April 28, 2026
**Analysis branch:** `system-test-plan-analysis` (origin/main + COC-118 + AzurePatch + async-ingestion-testing folded in)

---

## 1. Introduction

This is the system test plan for Cocoon — Microsoft Consulting Services' AI-enabled SoW automation tool. We're building toward the May 14 demo, so this plan covers everything from unit-level regressions all the way up to a live UAT run with Shyam (Microsoft AI Architect) and Professor Carver. The aim isn't 100% coverage of every code path — it's making sure the demo journey (Solution Architect drafts a SoW, AI flags issues, reviewers sign off, handoff package gets generated) doesn't break.

**References**
- `Data/SOW_DRAFTING_GUIDANCE.md` — methodology rules driving the AI review
- `Data/RISK_ASSESSMENT_AND_MITIGATION_FRAMEWORK.md` — risk taxonomy informing priority
- `docs/audits/coc-118-step6-deploy-verification.md` — end-to-end verification on Azure
- `CLAUDE.md` — backend/frontend conventions, test commands
- Repo: https://github.com/SamuelF2/Capstone-Microsoft-SoW
- Microsoft Customer Engagement Methodology (MCEM) — the framework behind the workflow engine

**Scope**
- In: backend API, frontend UI, PostgreSQL + Neo4j integration, Entra ID auth, AI review pipeline, deployment smoke on Azure Container Apps.
- Out: load/stress beyond a single light run, penetration testing beyond OWASP self-checks, mobile responsive testing beyond a quick eyeball pass.

---

## 2. System Under Test

### 2.1 Architecture (in prose)

A Next.js 15 frontend (Pages Router, React 19) talks to a FastAPI backend over HTTPS. The backend uses asyncpg for PostgreSQL and the official Neo4j driver for the graph. Both clients sit behind a single MSAL-acquired token — `authFetch` on the frontend attaches the bearer, `auth.py` on the backend validates it against Entra ID's JWKS. AI work runs out-of-process: the backend proxies to a separate ML Container App (`GRAPHRAG_API_URL`) that hits Azure AI Foundry via `DefaultAzureCredential` (managed identity, post-COC-118) and reads from Neo4j. Neo4j is seeded by a one-shot Container Apps Job that runs on each `azd up`. Local dev runs all four services under Docker Compose; staging/demo runs on Azure Container Apps inside a single environment, fronted by Container Registry + Log Analytics.

### 2.2 Component inventory

| Component | Tech | Where it lives |
|---|---|---|
| Frontend | Next.js 15.1, React 19, MSAL Browser, ReactFlow, Framer Motion | `frontend/` |
| Backend API | FastAPI 0.115+, asyncpg, neo4j 5 driver, python-jose, PyPDF2, python-docx | `backend/` |
| ML / GraphRAG service | FastAPI, OpenAI SDK 2.x, sentence-transformers, pymupdf, click | `ml/` |
| PostgreSQL | postgres:16-alpine (compose) / Container App (Azure) | `infrastructure/postgres/` |
| Neo4j | neo4j:5-community + APOC | compose / Container App |
| Auth provider | Microsoft Entra ID via MSAL | external |
| AI provider | Azure AI Foundry (Kimi-K2.5, et al.) | external, cross-sub RBAC |
| IaC | Bicep + azd | `infra/`, `azure.yaml` |
| CI/CD | GitHub Actions | `.github/workflows/CICD_Workflow.yml` |
| Data seeding | Container Apps Job (COC-118) | `infra/modules/ingestion-job.bicep` |

### 2.3 Test environments

- **Local (dev):** `docker compose up` — backend, frontend, postgres, neo4j. Smoke + functional testing happens here daily.
- **Staging (Azure):** `azd up` provisions the full Container Apps environment + Foundry RBAC + ingestion Job. We tear down with `azd down --purge` between runs to keep student-subscription costs down — every staging visit is a cold start, factor that into your schedule.
- **Demo:** same as staging but provisioned the day before (May 13) and left running through the May 14 demo.

---

## 3. Test Approach

- **Functional** — happy-path coverage of every endpoint and page. Backend uses `pytest` with `dependency_overrides` to fake auth (already wired in `backend/tests/test_api.py`). Frontend uses whatever the existing 15 `*.test.*` files use; for new UI tests we'll add `@testing-library/react` if the team agrees.
- **System (E2E)** — the journeys in §5. Run by hand on Docker Compose first, then re-run on staging post-`azd up`. Candidate for Playwright automation if we get time.
- **Integration** — backend ↔ Postgres, backend ↔ Neo4j, backend ↔ ML service (mocked at `_proxy_get`/`_proxy_post`), frontend ↔ backend via `authFetch`. Backend has a pytest marker `integration` reserved but unused — start populating it.
- **Security** — Entra ID token validation (already covered by `tests/unit/test_auth.py`), role-based access, directory traversal in attachment uploads (already covered by sprint4/SCRUM-106), SoW ownership scoping on `/api/sow` and `/all-sows`. We'll do one deliberate negative pass: cross-user access, expired tokens, traversal payloads.
- **Regression** — `pytest -m "not integration" -v` for backend + `pytest tests/unit/ -v` for ML, both already wired into `CICD_Workflow.yml`. Every PR runs them. Frontend tests trail.
- **AI evaluation** — compare AI review output against the seven Contoso reference SoWs in `Data/sow-md/`. Metric set: precision/recall on Green/Yellow/Red classification of methodology rules; semantic similarity for suggestion quality. DeepEval/RAGAS aren't wired in yet — adding them is itself a test deliverable.
- **Non-functional** — light load (k6 or hey, ~50 concurrent users for 5 minutes) on the AI review endpoint and `/api/sow` listing. Cold-start latency measurement on Container Apps after `azd up` (target: first request < 30 s, steady-state < 2 s).
- **UAT** — Shyam and Prof. Carver drive the demo on May 14. We'll script the journey beforehand and rehearse on May 12.

---

## 4. Test Coverage Matrix

🟢 covered, 🟡 partial, 🔴 gap.

| Feature area | Functional | Integration | Security | AI-Eval | Non-functional |
|---|:-:|:-:|:-:|:-:|:-:|
| Auth & session | 🟡 | 🟡 | 🟢 | — | 🔴 |
| SoW lifecycle (7 statuses) | 🟡 | 🟡 | 🟡 | — | 🔴 |
| SoW ownership / `/all-sows` | 🟡 | 🟡 | 🟢 | — | — |
| Upload & ingestion | 🟡 | 🔴 | 🟢 | 🔴 | 🔴 |
| AI review pipeline | 🔴 | 🔴 | 🟡 | 🔴 | 🔴 |
| Review assignments | 🟡 | 🟡 | 🟡 | — | — |
| Workflow engine | 🔴 | 🔴 | 🟡 | — | — |
| Handoff packages | 🟡 | 🔴 | 🟡 | — | — |
| Audit & history | 🟡 | 🟡 | 🟡 | — | — |
| Chart of accounts | 🔴 | 🔴 | 🟡 | — | — |
| User/role mgmt | 🔴 | 🔴 | 🔴 | — | — |
| Frontend UX | 🟡 | — | — | — | 🔴 |
| Deployment smoke | 🟡 | 🟡 | — | — | 🟡 |

The 🔴 cells in user/role mgmt are because Eugene's PR #29 just landed today and hasn't been touched by tests yet. AI-Eval is mostly red because the eval harness doesn't exist.

---

## 5. Test Cases

Personas referenced: **SA** (Solution Architect), **CPL** (Consulting Practice Lead), **CDP** (Customer Delivery Partner), **DM** (Delivery Manager), **Admin** (`system-admin` role).

Priority: **High** = blocks demo if it fails. **Medium** = degrades demo. **Low** = polish.

### 5.1 Authentication & session

**TC-AUTH-1: Sign in via Entra ID**
- Persona: SA
- Preconditions: User exists in tenant; `AZURE_AD_CLIENT_ID` set in backend.
- Steps: 1) Visit `/login`. 2) Click "Sign in with Microsoft". 3) Complete MSAL popup.
- Expected: Redirect to `/`, navbar shows user name/email, `localStorage` has a valid MSAL token.
- Priority: High. Type: System. Automation: Manual.

**TC-AUTH-2: Backend rejects expired token**
- Persona: SA
- Preconditions: Captured a token, waited > 1 hr OR forged exp claim in past.
- Steps: 1) Call `GET /api/sow` with that bearer.
- Expected: 401 with `{detail: "Token expired"}` (or equivalent decode_token failure).
- Priority: High. Type: Security. Automation: Automated (extend `tests/unit/test_auth.py`).

**TC-AUTH-3: Sign out clears session**
- Persona: any
- Preconditions: Signed in.
- Steps: 1) Click sign-out. 2) Hit any protected page.
- Expected: Redirect to `/login`, MSAL cache cleared, `POST /api/auth/logout` returns 200.
- Priority: Medium. Type: Functional. Automation: Manual.

**TC-AUTH-4: First-time user upsert**
- Persona: any new user
- Preconditions: User in tenant but not yet in `users` table.
- Steps: 1) Sign in. 2) Inspect `users` table.
- Expected: Row created with `oid`, `email`, `name`; default `role` assigned; subsequent `GET /api/auth/me` returns the row.
- Priority: High. Type: Integration. Automation: Automated (already in `test_auth.py`).

**TC-AUTH-5: Backend startup fails when AZURE_AD_CLIENT_ID missing in production**
- Persona: Admin / DevOps
- Preconditions: `ENV=production`, `AZURE_AD_CLIENT_ID=""`.
- Steps: 1) Start backend.
- Expected: Process exits with the explicit error from `backend/main.py:85`.
- Priority: Medium. Type: Functional. Automation: Candidate.

### 5.2 SoW lifecycle (7-status workflow)

**TC-SOW-1: Create draft from scratch**
- Persona: SA
- Preconditions: Signed in.
- Steps: 1) Visit `/create-new`. 2) Fill in metadata. 3) Submit.
- Expected: 201 from `POST /api/sow`, redirect to `/draft/{id}`, status = `draft`, `collaboration` row created with current user as owner.
- Priority: High. Type: System. Automation: Manual.

**TC-SOW-2: Move draft → ai_review**
- Persona: SA
- Preconditions: A draft SoW exists and is owned by the user.
- Steps: 1) Open `/draft/{id}`. 2) Hit "Submit for AI review".
- Expected: Status transitions to `ai_review`, history row appended, AI banner appears on `/ai-review`.
- Priority: High. Type: System. Automation: Manual.

**TC-SOW-3: Move ai_review → internal_review with assignment**
- Persona: SA + CPL
- Preconditions: SoW in `ai_review`, CPL pre-assigned via `sow_reviewer_assignments`.
- Steps: 1) SA approves AI suggestions (or skips). 2) Submits for internal review.
- Expected: Status = `internal_review`, CPL sees it on `/my-reviews`.
- Priority: High. Type: System. Automation: Manual.

**TC-SOW-4: internal_review → drm_review**
- Persona: CPL → DM
- Preconditions: SoW in `internal_review` with CPL approval.
- Steps: 1) CPL hits "Approve". 2) DM sees on `/drm-dashboard`.
- Expected: Status = `drm_review`, DM-stage assignments resolve.
- Priority: High. Type: System. Automation: Manual.

**TC-SOW-5: drm_review → approved → finalized**
- Persona: DM → SA
- Preconditions: SoW in `drm_review`.
- Steps: 1) DM approves. 2) SA opens `/finalize/{id}`. 3) Generates handoff package. 4) Marks finalized.
- Expected: Statuses progress draft→…→approved→finalized; once finalized, all editing endpoints return 409.
- Priority: High. Type: System. Automation: Manual.

**TC-SOW-6: Reject branch from any review stage**
- Persona: any reviewer
- Preconditions: SoW in a `*_review` status.
- Steps: 1) Reviewer hits "Reject" with reason.
- Expected: Status = `rejected`, history captures reason; SoW becomes editable again only if SA "sends back" via the reject→draft path documented in `frontend/lib/workflowStages.js`.
- Priority: High. Type: System. Automation: Manual.

**TC-SOW-7: Send-back from reviewer to author (no unsaved-changes block)**
- Persona: reviewer
- Preconditions: SoW in `internal_review` or `drm_review`; reviewer has unsaved input in DecisionModal.
- Steps: 1) Open DecisionModal, type into a textarea, then click "Send back". 2) Confirm send-back.
- Expected: Navigation succeeds, no "unsaved changes" guard fires (PR #28 fix). Status returns to `draft` for the author.
- Priority: Medium. Type: Functional. Automation: Candidate (regression for PR #28).

### 5.3 SoW ownership & access control

**TC-OWN-1: `/all-sows` lists only the user's SoWs**
- Persona: SA
- Preconditions: Multiple users own different SoWs.
- Steps: 1) `GET /api/sow` while signed in as user A.
- Expected: Only SoWs where user A appears in `collaboration` are returned.
- Priority: High. Type: Security. Automation: Automated (extend `test_api.py`).

**TC-OWN-2: Cross-user GET returns 404 (not 403)**
- Persona: SA-A vs SA-B
- Preconditions: SA-B owns SoW 42.
- Steps: 1) As SA-A, `GET /api/sow/42`.
- Expected: 404 (deliberately not 403, to avoid leaking existence — see `backend/routers/review.py:854` pattern).
- Priority: High. Type: Security. Automation: Automated.

**TC-OWN-3: `require_author` blocks PATCH from non-owner**
- Persona: SA-A vs SA-B
- Preconditions: SoW 42 owned by SA-B.
- Steps: 1) SA-A `PATCH /api/sow/42`.
- Expected: 403.
- Priority: High. Type: Security. Automation: Automated.

**TC-OWN-4: Reviewer access via `require_collaborator`**
- Persona: CPL
- Preconditions: CPL added to SoW 42 via `collaboration` with role `reviewer`.
- Steps: 1) CPL `GET /api/ai/sow/42/risks`.
- Expected: 200 with risk payload (or 503 if ML down).
- Priority: High. Type: Security. Automation: Automated.

**TC-OWN-5: Admin override on `/api/review/...`**
- Persona: Admin
- Preconditions: Admin (`role = "system-admin"`) signed in. SoW 42 has no admin assignment.
- Steps: 1) Admin hits review-stage endpoints for SoW 42.
- Expected: Access granted (per the admin escape hatch at `routers/review.py:866`).
- Priority: Medium. Type: Security. Automation: Candidate.

### 5.4 Document upload & ingestion

**TC-UP-1: Upload PDF attachment**
- Persona: SA
- Preconditions: Draft SoW exists.
- Steps: 1) `POST /api/attachments` with a 2-MB PDF.
- Expected: 201, `sow_attachments` row, downloadable via the GET endpoint.
- Priority: High. Type: Functional. Automation: Manual (Candidate).

**TC-UP-2: Reject directory traversal in filename**
- Persona: malicious SA
- Preconditions: Draft SoW exists.
- Steps: 1) `POST /api/attachments` with filename `../../etc/passwd`.
- Expected: 400 / 422 (sprint4/SCRUM-106 protection); no file written outside the upload root.
- Priority: High. Type: Security. Automation: Automated (already exists, verify).

**TC-UP-3: Async ingestion of DOCX produces graph nodes**
- Persona: SA / Admin
- Preconditions: ML service up; Neo4j reachable; `async-ingestion-testing` branch behavior present.
- Steps: 1) Trigger ingestion via `ml/main.py` async path with a DOCX. 2) Query Neo4j for new nodes.
- Expected: Job completes within ~60 s for a 10-page DOC, nodes labelled appropriately, no duplicates on re-run.
- Priority: Medium. Type: Integration. Automation: Candidate.

**TC-UP-4: Reject unsupported MIME type**
- Persona: SA
- Preconditions: Draft SoW.
- Steps: 1) Upload `evil.exe` renamed to `.pdf`.
- Expected: 415 or 400; magic-byte check rejects.
- Priority: Medium. Type: Security. Automation: Candidate.

**TC-UP-5: Large file (50 MB) rejected gracefully**
- Persona: SA
- Preconditions: Default upload size limit in place.
- Steps: 1) Upload a 50-MB PDF.
- Expected: 413 or clear error; backend doesn't OOM. UI shows a toast, not a stack trace.
- Priority: Medium. Type: Non-functional. Automation: Manual.

### 5.5 AI review pipeline

**TC-AI-1: AI review happy path on Contoso reference SoW**
- Persona: SA
- Preconditions: ML up; Contoso SoW 1 imported.
- Steps: 1) Trigger AI review. 2) Inspect response.
- Expected: Risks, violations, suggestions, similar SoWs, approval routing all populated; severity in {high, medium, low}.
- Priority: High. Type: AI-Eval. Automation: Manual.

**TC-AI-2: ML unreachable → 503 + `AIUnavailableBanner`**
- Persona: SA
- Preconditions: `GRAPHRAG_API_URL` empty OR ML container stopped.
- Steps: 1) Open `/ai-review?sowId=42`.
- Expected: Backend returns 503 with `{detail: {message, retryable}}`. Frontend shows the banner; no mock data.
- Priority: High. Type: Functional. Automation: Automated.

**TC-AI-3: AI review respects ownership**
- Persona: SA-A on SoW owned by SA-B
- Preconditions: Cross-user setup.
- Steps: 1) `GET /api/ai/sow/{B-sow-id}/risks`.
- Expected: 404 (not 403, per `_require_sow_collaborator`).
- Priority: High. Type: Security. Automation: Automated.

**TC-AI-4: Methodology violation detection — banned phrase**
- Persona: SA
- Preconditions: SoW contains a phrase from `banned_phrases.json`.
- Steps: 1) Run AI review.
- Expected: Violation flagged with severity ≥ medium; suggestion proposes alternative wording.
- Priority: High. Type: AI-Eval. Automation: Candidate (eval harness).

**TC-AI-5: Severity weighting reflects in approval routing**
- Persona: SA
- Preconditions: SoW with one `critical` finding.
- Steps: 1) Run AI review. 2) Inspect `approval` payload.
- Expected: Routing escalates beyond default (per `SEVERITY_WEIGHT` in `services/ai.py`).
- Priority: Medium. Type: AI-Eval. Automation: Candidate.

**TC-AI-6: Re-running AI review is idempotent**
- Persona: SA
- Preconditions: SoW already reviewed once.
- Steps: 1) Trigger AI review again on the same draft. 2) Diff results.
- Expected: Findings stable (allowing for LLM nondeterminism within a tolerance); no duplicate violations stored; cache hit logged if caching is on.
- Priority: Medium. Type: AI-Eval. Automation: Manual.

### 5.6 Review assignments & checklists

**TC-RA-1: Pre-assign reviewer at SoW creation**
- Persona: SA
- Preconditions: User pool with at least one CPL.
- Steps: 1) `POST /api/sow` with reviewer slot for `consulting_practice_lead`. 2) Inspect `sow_reviewer_assignments`.
- Expected: Pre-designation row created, visible on the SoW manage page.
- Priority: High. Type: Functional. Automation: Candidate.

**TC-RA-2: Role-specific checklist loads for CPL**
- Persona: CPL
- Preconditions: SoW in `internal_review`, CPL assigned.
- Steps: 1) `GET /api/review/sow/{id}/checklist`.
- Expected: Items match `_load_checklist("consulting_practice_lead")`; UI renders checkboxes with the correct labels.
- Priority: High. Type: Integration. Automation: Automated.

**TC-RA-3: Checklist submission persists decisions**
- Persona: CPL
- Preconditions: Checklist loaded.
- Steps: 1) Tick all items. 2) Submit decision = `approve`. 3) Refresh.
- Expected: Decisions persisted to `review_results`; checklist comes back pre-filled if reopened.
- Priority: High. Type: Functional. Automation: Manual.

**TC-RA-4: Most-recent-assignment-wins ordering**
- Persona: Admin
- Preconditions: Same user reassigned twice to same role+stage.
- Steps: 1) Query `/api/review/...` with the dedup query.
- Expected: Only the latest row surfaces (matches `DISTINCT ON (user_id, reviewer_role, stage)` at `routers/review.py:1038`).
- Priority: Medium. Type: Integration. Automation: Candidate.

**TC-RA-5: Decision modal "send back" doesn't trigger unsaved-warning**
- Persona: reviewer
- Preconditions: Reviewer has typed in the textarea.
- Steps: 1) Click Send Back.
- Expected: No browser confirm; navigation proceeds (PR #28 regression).
- Priority: Medium. Type: Functional. Automation: Candidate.

### 5.7 Workflow engine

**TC-WF-1: Create custom workflow template**
- Persona: Admin
- Preconditions: Admin signed in.
- Steps: 1) `POST /api/workflow/templates` with stages [draft, technical_review, approved]. 2) Inspect.
- Expected: Template + stages + transitions persisted; `ReactFlow` canvas at `/workflows/{id}/edit` renders the graph.
- Priority: High. Type: Functional. Automation: Candidate.

**TC-WF-2: Custom workflow drives a real SoW**
- Persona: Admin → SA
- Preconditions: Custom template from TC-WF-1.
- Steps: 1) SA creates a SoW with that template. 2) Walk through transitions.
- Expected: Status transitions follow custom stages; anchors (`draft`, `approved`, `finalized`, `rejected`) still respected.
- Priority: High. Type: System. Automation: Manual.

**TC-WF-3: Reject anchor stays hidden but functional**
- Persona: SA
- Preconditions: Default template.
- Steps: 1) Inspect canvas — `rejected` should not render (`isHiddenAnchor`). 2) Reject anyway via API.
- Expected: Rejection works server-side; frontend doesn't try to render the hidden node.
- Priority: Medium. Type: Functional. Automation: Candidate.

**TC-WF-4: Stage document requirements enforced**
- Persona: SA
- Preconditions: Stage requires an SoW PDF attachment to advance.
- Steps: 1) Try to advance without uploading.
- Expected: 409 with explanatory message from `workflow_stage_document_requirements`.
- Priority: Medium. Type: Functional. Automation: Candidate.

### 5.8 Handoff packages

**TC-HO-1: Generate DOCX on `finalized`**
- Persona: SA
- Preconditions: SoW in `approved`.
- Steps: 1) `POST /api/finalize/{id}/handoff`.
- Expected: DOCX produced, stored, downloadable; `handoff_packages` row exists.
- Priority: High. Type: System. Automation: Manual.

**TC-HO-2: DOCX contains all reviewer decisions**
- Persona: SA
- Preconditions: SoW with CPL + DM approvals.
- Steps: 1) Inspect generated DOCX.
- Expected: Reviewer table includes every approval row from `routers/finalize.py:358`; reviewer_role and decision both present.
- Priority: High. Type: Functional. Automation: Manual.

**TC-HO-3: Locking prevents post-finalize edits**
- Persona: SA
- Preconditions: SoW `finalized`.
- Steps: 1) `PATCH /api/sow/{id}` to change title.
- Expected: 409.
- Priority: High. Type: Security. Automation: Automated.

**TC-HO-4: Handoff regeneration on amendment**
- Persona: Admin (worst case path)
- Preconditions: Finalized SoW. Workflow allows "amendment" branch (if implemented).
- Steps: 1) Open amendment flow. 2) Regenerate handoff.
- Expected: Either supported and a v2 row appears, OR cleanly rejected with a UX message. No partial state.
- Priority: Low. Type: Functional. Automation: Manual.

### 5.9 Audit log & history

**TC-AUD-1: Every state change writes a history row**
- Persona: SA
- Preconditions: Any SoW.
- Steps: 1) Drive a state transition. 2) `GET /api/audit/sow/{id}`.
- Expected: One row per transition; `change_type`, `changed_by`, `changed_at`, diff populated.
- Priority: High. Type: Integration. Automation: Automated (Candidate).

**TC-AUD-2: User deletion preserves history (`SET NULL`)**
- Persona: Admin
- Preconditions: User X authored several history rows.
- Steps: 1) Delete user X. 2) Re-query history.
- Expected: Rows still exist; `changed_by` is NULL (per `history.sow_id` `ON DELETE SET NULL` semantics).
- Priority: Medium. Type: Integration. Automation: Candidate.

**TC-AUD-3: Reviewer role surfaces in audit metadata**
- Persona: any
- Preconditions: A reviewer decision exists.
- Steps: 1) Query audit endpoint.
- Expected: `metadata.role` and `metadata.stage` populated from `routers/audit.py:51`.
- Priority: Medium. Type: Functional. Automation: Candidate.

### 5.10 Chart of accounts

**TC-COA-1: List COA codes**
- Persona: SA
- Preconditions: Seeded COA data.
- Steps: 1) `GET /api/coa/codes`.
- Expected: Paginated, alphabetised list returned.
- Priority: Medium. Type: Functional. Automation: Manual.

**TC-COA-2: Attach COA code to SoW**
- Persona: SA
- Preconditions: Draft SoW.
- Steps: 1) `POST /api/coa/sow/{id}` with code.
- Expected: 201; COA visible on the SoW. `COATracker` component renders it.
- Priority: Medium. Type: Functional. Automation: Manual.

**TC-COA-3: Invalid COA rejected**
- Persona: SA
- Preconditions: Code that doesn't exist.
- Steps: 1) Attach.
- Expected: 400 with the available-codes hint.
- Priority: Low. Type: Functional. Automation: Candidate.

### 5.11 User & role management (newest area — Eugene PR #29)

**TC-USR-1: List role definitions**
- Persona: any signed-in user
- Preconditions: Default seeded roles present.
- Steps: 1) `GET /api/roles`.
- Expected: Returns the 5 personas (SA, CPL, CDP, DM, Admin) plus any custom.
- Priority: High. Type: Functional. Automation: Automated (new).

**TC-USR-2: Create custom role (admin only)**
- Persona: Admin
- Steps: 1) `POST /api/roles` with `{key, label, permissions}`. 2) Re-list.
- Expected: 201, role visible. As non-admin: 403.
- Priority: High. Type: Security. Automation: Candidate.

**TC-USR-3: Patch role permissions**
- Persona: Admin
- Steps: 1) `PATCH /api/roles/{key}`.
- Expected: Update reflects in subsequent permission checks; existing assignments unaffected.
- Priority: High. Type: Functional. Automation: Candidate.

**TC-USR-4: Delete role with active assignments**
- Persona: Admin
- Preconditions: Role assigned to at least one user/SoW.
- Steps: 1) `DELETE /api/roles/{key}`.
- Expected: Either soft-rejected with 409 OR cascades cleanly (whichever Eugene's impl chose) — verify behaviour matches docstrings.
- Priority: High. Type: Functional. Automation: Manual (verify behaviour first).

**TC-USR-5: User group basic check**
- Persona: any
- Steps: 1) Sign in. 2) Hit a group-gated endpoint (per Eugene's "Basic User Groups Check").
- Expected: 200 if member, 403 if not.
- Priority: Medium. Type: Security. Automation: Candidate.

### 5.12 Frontend UX

**TC-UX-1: Loading state on AI review**
- Persona: SA
- Preconditions: ML service responsive but slow (artificial delay).
- Steps: 1) Open `/ai-review`.
- Expected: Skeleton/spinner shows; doesn't flash empty content; recovers cleanly.
- Priority: Medium. Type: Functional. Automation: Manual.

**TC-UX-2: Empty state on `/all-sows`**
- Persona: brand-new user
- Preconditions: User has zero SoWs.
- Steps: 1) Visit page.
- Expected: Friendly empty state with CTA to create, not a blank table.
- Priority: Medium. Type: Functional. Automation: Manual.

**TC-UX-3: Error toast on backend 500**
- Persona: SA
- Preconditions: Force a backend error (kill DB).
- Steps: 1) Trigger an action.
- Expected: Toast / banner shown; no white-screen-of-death.
- Priority: Medium. Type: Functional. Automation: Manual.

**TC-UX-4: Page transitions feel smooth**
- Persona: any
- Preconditions: Framer Motion animations enabled.
- Steps: 1) Click through 5 main pages.
- Expected: Transitions complete < 400 ms; no layout shift; reduce-motion respected.
- Priority: Low. Type: Non-functional. Automation: Manual.

### 5.13 Deployment smoke tests

**TC-DEP-1: `azd up` from clean state**
- Persona: Admin / DevOps
- Preconditions: Empty resource group; logged into Azure subscription.
- Steps: 1) `azd up` from repo root.
- Expected: Deployment succeeds; all 4 container apps `Running`; ingestion Job completes successfully (per COC-118 step 6 verification).
- Priority: High. Type: System. Automation: Manual.

**TC-DEP-2: Health endpoint on deployed backend**
- Persona: any
- Preconditions: TC-DEP-1 done.
- Steps: 1) `GET https://<backend-fqdn>/health`.
- Expected: 200; `build_health_status` reports both Postgres and Neo4j up.
- Priority: High. Type: Functional. Automation: Candidate (cron check).

**TC-DEP-3: Managed identity → Foundry RBAC works cross-sub**
- Persona: Admin
- Preconditions: ML container deployed with system-assigned MI; Foundry RBAC bicep applied.
- Steps: 1) From the ML container, call Foundry. 2) Inspect logs.
- Expected: 200 from Foundry; no key-based fallback used.
- Priority: High. Type: Integration. Automation: Manual (read logs).

**TC-DEP-4: `azd down --purge` leaves zero billable resources**
- Persona: Admin
- Steps: 1) `azd down --purge`. 2) Inspect subscription.
- Expected: All resources deleted; no orphan log analytics workspace, no zombie storage account. Cost dashboard back to baseline within 24 h.
- Priority: High. Type: Non-functional. Automation: Manual.

---

## 6. Defect Management

**Severity definitions** (aligned with Cocoon's Risk Framework):

| Sev | Meaning | Example |
|---|---|---|
| **S1** | Blocker — demo cannot proceed. | Backend won't start; Entra sign-in broken; AI review 500s on every call. |
| **S2** | Critical — major feature unusable, no workaround. | Handoff DOCX missing reviewer signatures; SoW lifecycle stuck on a transition. |
| **S3** | Major — feature works but UX is broken. | Loading spinner never disappears even though data loaded; toast says success but row missing. |
| **S4** | Cosmetic — copy, alignment, minor visual. | Misaligned button; typo in label; wrong icon. |

**Workflow**

1. Tester finds defect → screenshot/recording, console logs, repro steps.
2. File Jira ticket with severity + linked test case ID.
3. Triage at the daily standup; assign owner.
4. Fix on a feature branch (per the team's branching convention — never on `main`).
5. PR review by another team member; CI must be green.
6. Verifier (usually filer) re-runs the test case; closes if pass.

**Pre-demo cutoff**

- **By May 12:** all S1 + S2 closed. Triage meeting moves anything still open to "post-demo" or escalates.
- **By May 13:** all S3 closed where feasible. S4 deferred unless trivially fixable.

---

## 7. Entry & Exit Criteria

**Entry (start system test pass)**

- Feature branch merged into `main` via PR.
- `pytest -m "not integration" -v` and `pytest tests/unit/ -v` both green in CI.
- `docker compose up` boots cleanly locally.
- A staging deploy via `azd up` has succeeded at least once that week.

**Exit (ready for demo)**

- ≥ 95% of test cases in §5 pass on the latest `main`.
- Zero open S1 or S2 defects.
- AI evaluation metrics meet the agreed thresholds (TBD — proposed: precision ≥ 0.75, recall ≥ 0.7 on banned-phrase detection; suggestions cosine ≥ 0.6 against ground truth).
- Demo dry run completed end-to-end on staging on May 13.
- Tear-down/restore cycle verified once (so the demo `azd up` on May 13 is repeatable).

---

## 8. Risks & Mitigations

Drawing from `Data/RISK_ASSESSMENT_AND_MITIGATION_FRAMEWORK.md` and project reality:

| Risk | Likelihood | Impact | Mitigation |
|---|:-:|:-:|---|
| Azure subscription cost overrun (student sub limit) | Med | High | Daily `azd down --purge`; only spin staging up for explicit test windows; alert on monthly burn ≥ 70%. |
| Entra ID tenant restrictions on demo day | Low | High | Test sign-in with the actual demo accounts the day before; have a backup tenant configured. |
| DS team's GraphRAG API not delivered or unstable | Med | High | Backend already returns 503 + banner cleanly; we can demo the auth/lifecycle/handoff flows even if AI review is offline. Don't make AI critical path. |
| Demo-day deployment failure during fresh `azd up` | Med | High | Pre-deploy on May 13 evening; do *not* re-deploy on May 14. Keep cluster running overnight. |
| LLM nondeterminism breaks AI-Eval thresholds | High | Med | Use temperature 0 where the SDK allows; widen acceptance bands; record golden outputs from a known-good run. |
| Foundry RBAC token expires during demo | Low | High | Managed identity tokens auto-refresh; verify by leaving staging up overnight before demo and re-checking AI calls. |
| Three unmerged branches (COC-118, AzurePatch, async-ingestion) drift | Med | Med | Land COC-118 ASAP (already e2e-validated). Decide AzurePatch (4 wks stale) and async-ingestion (1 commit) — merge or close. |
| Frontend test coverage near zero (15 tests total) | Med | Med | Accept the gap for the demo; cover via manual journeys; flag as post-demo work. |

---

## 9. Schedule

| Week of | Milestone |
|---|---|
| **Apr 28 (this week)** | Plan signed off. Land COC-118 PR. Decide fate of AzurePatch + async-ingestion. Fill in TC-OWN-1/2/3 automation. |
| **May 4** | Feature freeze candidate. All Step 5.1–5.7 test cases run on local Compose. AI-eval harness scaffolded. |
| **May 11** | Full regression on `main`. Staging dry run #1 (`azd up` on the 11th, work all week). All S1/S2 fixes landed by May 12. |
| **May 12** | Demo dry run #1 with the team. S1/S2 cutoff. S3 prioritisation. |
| **May 13** | Final staging deploy stays up. Demo dry run #2 (rehearsal). Backup environment verified. |
| **May 14** | **Demo day.** Shyam + Prof. Carver UAT. QA on standby for live triage. |
| **May 15** | Post-mortem; tear down staging; archive recordings. |

Daily during May 11–14: 10-minute QA standup at 9 am; defect triage at 4 pm.

---

## 10. Appendix

### A. In-flight branches folded into the analysis snapshot

No open PRs exist as of Apr 28. The following branches contain commits ahead of `origin/main` and were merged into `system-test-plan-analysis`:

| Branch | Author | Commits ahead | Status |
|---|---|:-:|---|
| `feature/COC-118-managed-identity-auth` | Ax3lJD (Zhan Su) | 10 | Active — managed identity + ingestion Job, e2e-validated |
| `SamuelF2/AzurePatch` | SamuelF2 | 3 | Stale (4 weeks) — Azure fixes touching backend/frontend |
| `async-ingestion-testing` | Phuong Thai | 1 | Stale (13 days) — single commit on `ml/main.py` |

Recently merged to main (last 5 days), already covered:
- PR #29 — Eugene's "Roles and Permissions and Basic User Groups Check"
- PR #28 — `fix-send-back-unsaved-warning`
- PR #27 — `SCRUM-136-session-persistence-unsaved-warning`
- PR #26 — `SamuelF2/ai-integration`

### B. Stack inventory snapshot

- **Backend:** FastAPI 0.115+, asyncpg, neo4j 5 driver, python-jose, PyPDF2, python-docx (Python ≥ 3.12, uv-managed)
- **Frontend:** Next.js 15.1, React 19, MSAL Browser 3, Framer Motion 12, ReactFlow 11 (Node 20)
- **ML:** FastAPI, OpenAI SDK 2.x, sentence-transformers, pymupdf, click, azure-identity (Python ≥ 3.11)
- **Data:** PostgreSQL 16, Neo4j 5 + APOC
- **Infra:** Bicep, azd, Azure Container Apps, Azure Container Registry, Log Analytics, Azure AI Foundry
- **Auth:** Microsoft Entra ID via MSAL
- **CI/CD:** GitHub Actions (`CICD_Workflow.yml` — lint, unit tests, docker build, azure deploy stub)

### C. Metrics snapshot (post-merge analysis branch)

| Metric | Count |
|---|---:|
| Backend routers | 14 (+ status + main-level routes) |
| Backend endpoints | 105 |
| Frontend pages | 19 |
| Frontend components | 40+ |
| PostgreSQL tables (live, post-lifespan) | 23 |
| Bicep modules | 11 |
| Backend test functions | 125 |
| ML test functions | 75 |
| Frontend test functions | 15 |
| **Total tests** | **215** |
| System test cases in this plan | 60 |

### D. Coverage matrix counts

🟢 = 14, 🟡 = 27, 🔴 = 17 (out of 65 cells, 7 are intentional N/A).

### E. Top 5 highest-priority test gaps

1. **AI evaluation harness doesn't exist.** All AI-Eval cells in §4 are 🔴. Need DeepEval/RAGAS or hand-rolled scripts comparing LLM outputs to the seven Contoso reference SoWs.
2. **User & role management (Eugene PR #29) has zero test coverage.** Highest-risk untested area because it just landed and gates everything else.
3. **Workflow engine — custom templates with anchor stages.** Configurable workflow is a marquee feature; functional tests don't exist yet.
4. **Backend ↔ ML integration tests are mocked or absent.** The `_proxy_get`/`_proxy_post` paths in `services/ai.py` need real-service integration tests, not just unit-level happy-path mocks.
5. **Cold-start latency on Container Apps.** A first-request slow response on demo day would be embarrassing; we have no measurement and no warm-up plan.

---

*End of plan.*
