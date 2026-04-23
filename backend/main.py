"""
Cocoon Backend API — FastAPI with Neo4j + PostgreSQL

Structure
---------
main.py        App entry point, lifespan, middleware, health check
database.py    Shared connection state (neo4j_driver, pg_pool)
auth.py        Entra ID JWT validation + get_current_user dependency
models.py      Pydantic models (UserResponse, SoWCreate, …)
config.py      Env-var driven configuration
routers/
  auth.py      POST /api/auth/logout  GET /api/auth/me
  sow.py       CRUD + status for /api/sow/…

PostgreSQL schema (per Database Schema for PostgreSQL.pdf)
----------------------------------------------------------
users           — authentication (id, oid, email, name, role, …)
ai_suggestion   — ML risk output (id, flag, validation_recommendation, risks)
content         — SOW body skeleton (id, scope_id, price_id, assumption_id, resource_id)
scope           — work scope (id, content_id, in_scope, out_scope)
pricing         — financial terms (id, content_id, total_value, breakdown)
assumptions     — drafting assumptions (id, content_id, items)
resources       — staffing (id, content_id, team)
sow_documents   — primary SOW record (id, cycle, content_id, ai_suggestion_id, …)
history         — audit log (id, sow_id, changed_by, change_type, changed_at, diff)
collaboration   — user↔SOW role mapping (id, sow_id, user_id, role)
review_results  — review findings (id, sow_id, reviewer, score, findings, reviewed_at)
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

import asyncpg
import database
from config import (
    CONTENT_TEMPLATES_DIR,
    DATABASE_URL,
    NEO4J_PASSWORD,
    NEO4J_URI,
    NEO4J_USER,
    PG_SSL,
)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from routers.ai import router as ai_router
from routers.attachments import router as attachments_router
from routers.audit import router as audit_router
from routers.auth import router as auth_router
from routers.coa import router as coa_router
from routers.finalize import router as finalize_router
from routers.review import router as review_router
from routers.rules import router as rules_router
from routers.sow import router as sow_router
from routers.users import router as users_router
from routers.workflow import router as workflow_router
from status import router as status_router
from validators import (
    build_health_status,
    format_graph_stats,
    format_knowledge_result,
    validate_knowledge_payload,
)

# ── Lifespan ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise and tear down database connections."""

    # ── Validate Entra ID config ─────────────────────────────────────────────
    from config import AZURE_AD_CLIENT_ID

    env = os.getenv("ENV", "development")
    if not AZURE_AD_CLIENT_ID and env not in ("development", "test"):
        raise RuntimeError(
            "AZURE_AD_CLIENT_ID is required. "
            "Set it in .env or as an environment variable. "
            "See .env.example for details."
        )
    if not AZURE_AD_CLIENT_ID:
        print("WARNING: AZURE_AD_CLIENT_ID is empty — auth will reject all tokens")

    # ── Connect databases (with retries) ────────────────────────────────────
    # On Azure Container Apps, databases may still be starting when the API
    # boots. Retry a few times before falling back to degraded mode.

    max_retries = 6
    retry_delay = 5  # seconds

    # Neo4j
    for attempt in range(1, max_retries + 1):
        try:
            database.neo4j_driver = GraphDatabase.driver(
                NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
            )
            database.neo4j_driver.verify_connectivity()
            print("Neo4j connected")
            break
        except Exception as e:
            print(f"Neo4j attempt {attempt}/{max_retries} failed: {e}")
            database.neo4j_driver = None
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)

    # PostgreSQL
    ssl_ctx = False if PG_SSL == "disable" else PG_SSL
    for attempt in range(1, max_retries + 1):
        try:
            database.pg_pool = await asyncio.wait_for(
                asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10, ssl=ssl_ctx),
                timeout=5,
            )
            print("PostgreSQL connected")
            break
        except Exception as e:
            print(f"PostgreSQL attempt {attempt}/{max_retries} failed: {e}")
            database.pg_pool = None
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)

    # ── Schema bootstrap ─────────────────────────────────────────────────────
    # Core tables from infrastructure/postgres/init/01-init.sql are created on
    # first container start.  Everything below is idempotent and aligns the
    # schema with the Database Schema for PostgreSQL.pdf specification.
    if not database.pg_pool:
        print("Skipping schema bootstrap — PostgreSQL not available")
        yield
        return

    print("Starting schema bootstrap...")
    # noinspection PyBroadException
    try:
        async with database.pg_pool.acquire() as conn:
            # ------------------------------------------------------------------ #
            # 1. USERS                                                            #
            # Authenticated via Microsoft Entra ID. oid is the stable Entra       #
            # object ID; users are auto-created on first sign-in.                 #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              SERIAL PRIMARY KEY,
                oid             TEXT UNIQUE,
                email           TEXT UNIQUE NOT NULL,
                full_name       TEXT,
                username        TEXT UNIQUE,
                name            TEXT,
                role            TEXT NOT NULL DEFAULT 'consultant',
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
            # Migration: make hashed_password nullable for existing databases
            await conn.execute("""
            DO $$ BEGIN
                ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;
            EXCEPTION WHEN undefined_column THEN NULL;
            END $$;
        """)
            for col_ddl in [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS oid TEXT UNIQUE;",
            ]:
                await conn.execute(col_ddl)
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_oid ON users(oid);")

            # ------------------------------------------------------------------ #
            # 2. AI SUGGESTION                                                    #
            # Must exist before sow_documents references it.                      #
            # PDF §2.3: id, flag (Green/Yellow/Red), validation_recommendation,  #
            #           risks                                                      #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_suggestion (
                id                        SERIAL PRIMARY KEY,
                flag                      TEXT,
                validation_recommendation JSONB,
                risks                     JSONB
            );
        """)
            # Phase 1 AI integration: cache provenance columns
            for ai_ddl in [
                "ALTER TABLE ai_suggestion ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
                "ALTER TABLE ai_suggestion ADD COLUMN IF NOT EXISTS generation_meta JSONB;",
            ]:
                await conn.execute(ai_ddl)

            # ------------------------------------------------------------------ #
            # 3. CONTENT (skeleton — child FK columns added after child tables)  #
            # PDF §2.2: id, scope_id, price_id, assumption_id, resource_id       #
            # Created without FK constraints first; FKs are added below.         #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS content (
                id            SERIAL PRIMARY KEY,
                scope_id      INTEGER,
                price_id      INTEGER,
                assumption_id INTEGER,
                resource_id   INTEGER
            );
        """)

            # ------------------------------------------------------------------ #
            # 4. CHILD CONTENT TABLES  (PDF §2.2.1–2.2.4)                        #
            # Each references content(id) via content_id.                         #
            # Extra columns store the actual section data (JSONB for flexibility) #
            # until the PDF's TBD types are finalised.                            #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS scope (
                id         SERIAL PRIMARY KEY,
                content_id INTEGER REFERENCES content(id) ON DELETE CASCADE,
                in_scope   JSONB,
                out_scope  JSONB
            );
        """)
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS pricing (
                id          SERIAL PRIMARY KEY,
                content_id  INTEGER REFERENCES content(id) ON DELETE CASCADE,
                total_value NUMERIC,
                breakdown   JSONB
            );
        """)
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS assumptions (
                id         SERIAL PRIMARY KEY,
                content_id INTEGER REFERENCES content(id) ON DELETE CASCADE,
                items      JSONB
            );
        """)
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS resources (
                id         SERIAL PRIMARY KEY,
                content_id INTEGER REFERENCES content(id) ON DELETE CASCADE,
                team       JSONB
            );
        """)

            # ------------------------------------------------------------------ #
            # 5. SOW_DOCUMENTS  (primary SOW record)                              #
            # Core columns from infra SQL; extended to match PDF §2.1.            #
            # PDF §2.1: id, cycle (1–4), content_id → content,                   #
            #           ai_suggestion_id → ai_suggestion                          #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS sow_documents (
                id          SERIAL PRIMARY KEY,
                title       TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'draft',
                uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content     JSONB,
                metadata    JSONB
            );
        """)
            for col_ddl in [
                # PDF §2.1 columns
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS cycle INTEGER;",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS content_id INTEGER REFERENCES content(id);",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS ai_suggestion_id INTEGER REFERENCES ai_suggestion(id);",
                # Application bridging + metadata columns
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS client_id TEXT UNIQUE;",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS methodology TEXT;",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS customer_name TEXT;",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS opportunity_id TEXT;",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS deal_value NUMERIC;",
                # Phase 1: ESAP + margin columns
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS esap_level TEXT;",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS estimated_margin NUMERIC;",
                # Phase 1 AI integration: identity bridge to Neo4j KG
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS kg_node_id TEXT;",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS kg_content_hash TEXT;",
                # Phase 4: finalization columns
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;",
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS finalized_by INTEGER REFERENCES users(id);",
            ]:
                await conn.execute(col_ddl)

            # ------------------------------------------------------------------ #
            # 6. REVIEW RESULTS                                                   #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS review_results (
                id          SERIAL PRIMARY KEY,
                sow_id      INTEGER REFERENCES sow_documents(id) ON DELETE CASCADE,
                reviewer    TEXT,
                score       REAL,
                findings    JSONB,
                reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

            # ------------------------------------------------------------------ #
            # 7. HISTORY  (audit log)                                             #
            # PDF §2.4: id (+ application columns for full audit trail)           #
            # sow_id uses ON DELETE SET NULL so audit records survive SoW         #
            # deletion (the sow_title is captured in the diff where useful).      #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id          SERIAL PRIMARY KEY,
                sow_id      INTEGER REFERENCES sow_documents(id) ON DELETE SET NULL,
                changed_by  INTEGER REFERENCES users(id),
                change_type TEXT,
                changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                diff        JSONB
            );
        """)
            # Migration: change existing CASCADE to SET NULL for audit preservation
            await conn.execute("""
            DO $$ BEGIN
                ALTER TABLE history DROP CONSTRAINT IF EXISTS history_sow_id_fkey;
                ALTER TABLE history ADD CONSTRAINT history_sow_id_fkey
                    FOREIGN KEY (sow_id) REFERENCES sow_documents(id) ON DELETE SET NULL;
            END $$;
        """)

            # ------------------------------------------------------------------ #
            # 8. COLLABORATION  (user↔SOW role mapping)                           #
            # PDF §2.5: user_id → users, role                                     #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS collaboration (
                id      SERIAL PRIMARY KEY,
                sow_id  INTEGER REFERENCES sow_documents(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                role    TEXT
            );
        """)

            # ------------------------------------------------------------------ #
            # 9. REVIEW ASSIGNMENTS  (Phase 1+: per-SoW review duties)           #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS review_assignments (
                id                  SERIAL PRIMARY KEY,
                sow_id              INTEGER NOT NULL REFERENCES sow_documents(id) ON DELETE CASCADE,
                user_id             INTEGER NOT NULL REFERENCES users(id),
                reviewer_role       TEXT NOT NULL,
                stage               TEXT NOT NULL,
                status              TEXT NOT NULL DEFAULT 'pending',
                decision            TEXT,
                comments            TEXT,
                conditions          JSONB,
                checklist_responses JSONB,
                assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at        TIMESTAMPTZ
            );
        """)

            # ------------------------------------------------------------------ #
            # 9b. SOW REVIEWER ASSIGNMENTS  (per-SoW pre-designation per role)   #
            # ------------------------------------------------------------------ #
            # Author picks who fills which role at which stage BEFORE the SoW
            # advances into that stage.  At transition time, create_stage_assignments
            # reads this table to decide who gets a review_assignments row.
            # Separate from review_assignments (the work-list created at runtime).
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS sow_reviewer_assignments (
                id           SERIAL PRIMARY KEY,
                sow_id       INTEGER NOT NULL REFERENCES sow_documents(id) ON DELETE CASCADE,
                stage_key    TEXT    NOT NULL,
                role_key     TEXT    NOT NULL,
                user_id      INTEGER NOT NULL REFERENCES users(id),
                assigned_by  INTEGER REFERENCES users(id),
                assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (sow_id, stage_key, role_key)
            );
        """)
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sra_sow ON sow_reviewer_assignments(sow_id);"
            )

            # Phase 2: enhance review_results with additional columns
            for col_ddl in [
                "ALTER TABLE review_results ADD COLUMN IF NOT EXISTS reviewer_user_id INTEGER REFERENCES users(id);",
                "ALTER TABLE review_results ADD COLUMN IF NOT EXISTS review_stage TEXT;",
                "ALTER TABLE review_results ADD COLUMN IF NOT EXISTS checklist_responses JSONB;",
                "ALTER TABLE review_results ADD COLUMN IF NOT EXISTS decision TEXT;",
                "ALTER TABLE review_results ADD COLUMN IF NOT EXISTS conditions JSONB;",
            ]:
                await conn.execute(col_ddl)

            # ------------------------------------------------------------------ #
            # 10. HANDOFF PACKAGES  (Phase 4: finalization)                       #
            # ------------------------------------------------------------------ #
            await conn.execute("""
            CREATE TABLE IF NOT EXISTS handoff_packages (
                id              SERIAL PRIMARY KEY,
                sow_id          INTEGER NOT NULL REFERENCES sow_documents(id) ON DELETE CASCADE,
                created_by      INTEGER REFERENCES users(id),
                document_path   TEXT,
                package_data    JSONB,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

            # ------------------------------------------------------------------ #
            # 11. CONDITIONS OF APPROVAL  (Phase 2: COA system)                  #
            # ------------------------------------------------------------------ #
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS conditions_of_approval (
                    id                   SERIAL PRIMARY KEY,
                    sow_id               INTEGER NOT NULL REFERENCES sow_documents(id) ON DELETE CASCADE,
                    review_assignment_id INTEGER REFERENCES review_assignments(id) ON DELETE SET NULL,
                    condition_text       TEXT NOT NULL,
                    category             TEXT NOT NULL DEFAULT 'general',
                    priority             TEXT NOT NULL DEFAULT 'medium',
                    assigned_to          INTEGER REFERENCES users(id),
                    due_date             DATE,
                    status               TEXT NOT NULL DEFAULT 'open',
                    resolution_notes     TEXT,
                    resolved_by          INTEGER REFERENCES users(id),
                    resolved_at          TIMESTAMPTZ,
                    evidence             JSONB DEFAULT '[]',
                    created_by           INTEGER REFERENCES users(id),
                    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            # ------------------------------------------------------------------ #
            # 12. SOW CONTENT TEMPLATES  (Phase 3: pre-populated content)         #
            # ------------------------------------------------------------------ #
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sow_content_templates (
                    id              SERIAL PRIMARY KEY,
                    name            TEXT NOT NULL,
                    methodology     TEXT NOT NULL,
                    description     TEXT,
                    template_data   JSONB NOT NULL,
                    is_system       BOOLEAN DEFAULT FALSE,
                    created_by      INTEGER REFERENCES users(id),
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            # ------------------------------------------------------------------ #
            # 12b. SOW ATTACHMENTS  (Phase 4: document attachments)              #
            # ------------------------------------------------------------------ #
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sow_attachments (
                    id              SERIAL PRIMARY KEY,
                    sow_id          INTEGER NOT NULL REFERENCES sow_documents(id) ON DELETE CASCADE,
                    filename        TEXT NOT NULL,
                    original_name   TEXT NOT NULL,
                    file_path       TEXT NOT NULL,
                    file_size       INTEGER,
                    mime_type       TEXT,
                    document_type   TEXT NOT NULL DEFAULT 'other',
                    stage_key       TEXT,
                    description     TEXT,
                    uploaded_by     INTEGER REFERENCES users(id),
                    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            # ------------------------------------------------------------------ #
            # 13. WORKFLOW TEMPLATES                                              #
            # ------------------------------------------------------------------ #
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_templates (
                    id              SERIAL PRIMARY KEY,
                    name            TEXT NOT NULL UNIQUE,
                    description     TEXT,
                    is_system       BOOLEAN DEFAULT FALSE,
                    created_by      INTEGER REFERENCES users(id),
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_template_stages (
                    id              SERIAL PRIMARY KEY,
                    template_id     INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
                    stage_key       TEXT NOT NULL,
                    display_name    TEXT NOT NULL,
                    stage_order     INTEGER NOT NULL,
                    stage_type      TEXT NOT NULL DEFAULT 'review',
                    config          JSONB DEFAULT '{}',
                    UNIQUE(template_id, stage_key)
                );
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_template_stage_roles (
                    id              SERIAL PRIMARY KEY,
                    stage_id        INTEGER NOT NULL REFERENCES workflow_template_stages(id) ON DELETE CASCADE,
                    role_key        TEXT NOT NULL,
                    is_required     BOOLEAN DEFAULT TRUE,
                    esap_levels     TEXT[]
                );
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_template_transitions (
                    id              SERIAL PRIMARY KEY,
                    template_id     INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
                    from_stage_key  TEXT NOT NULL,
                    to_stage_key    TEXT NOT NULL,
                    condition       TEXT NOT NULL DEFAULT 'default',
                    UNIQUE(template_id, from_stage_key, to_stage_key, condition)
                );
            """)

            # Migration: add condition column if table was created before this change
            await conn.execute("""
                ALTER TABLE workflow_template_transitions
                ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT 'default';
            """)

            # Drop the old 3-column unique constraint (template_id, from_stage_key,
            # to_stage_key) if it exists, since the new schema allows the same pair
            # with different conditions.  Look up the constraint name dynamically to
            # avoid hard-coding a possibly-truncated auto-generated name.
            await conn.execute("""
                DO $$
                DECLARE _cname text;
                BEGIN
                    SELECT conname INTO _cname
                    FROM   pg_constraint
                    WHERE  conrelid = 'workflow_template_transitions'::regclass
                      AND  contype  = 'u'
                      AND  array_length(conkey, 1) = 3;
                    IF _cname IS NOT NULL THEN
                        EXECUTE format('ALTER TABLE workflow_template_transitions DROP CONSTRAINT %I', _cname);
                    END IF;
                END $$;
            """)
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_wtt_template_from_to_condition
                ON workflow_template_transitions (template_id, from_stage_key, to_stage_key, condition);
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sow_workflow (
                    id              SERIAL PRIMARY KEY,
                    sow_id          INTEGER NOT NULL UNIQUE REFERENCES sow_documents(id) ON DELETE CASCADE,
                    template_id     INTEGER REFERENCES workflow_templates(id),
                    current_stage   TEXT NOT NULL DEFAULT 'draft',
                    workflow_data   JSONB NOT NULL,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            # Add parallel_branches column for parallel gateway fan-out tracking
            await conn.execute("""
                ALTER TABLE sow_workflow
                ADD COLUMN IF NOT EXISTS parallel_branches JSONB;
            """)

            # ------------------------------------------------------------------ #
            # 13b. WORKFLOW STAGE DOCUMENT REQUIREMENTS  (Phase 4)               #
            # Must be after workflow_templates to satisfy FK constraint.          #
            # ------------------------------------------------------------------ #
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_stage_document_requirements (
                    id              SERIAL PRIMARY KEY,
                    template_id     INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
                    stage_key       TEXT NOT NULL,
                    document_type   TEXT NOT NULL,
                    is_required     BOOLEAN DEFAULT FALSE,
                    description     TEXT,
                    UNIQUE(template_id, stage_key, document_type)
                );
            """)

            # ------------------------------------------------------------------ #
            # 14. SEED DEFAULT WORKFLOW TEMPLATE                                  #
            # ------------------------------------------------------------------ #
            existing_template = await conn.fetchval(
                "SELECT id FROM workflow_templates WHERE name = 'Default ESAP Workflow'"
            )
            if not existing_template:
                template_id = await conn.fetchval("""
                    INSERT INTO workflow_templates (name, description, is_system)
                    VALUES ('Default ESAP Workflow',
                            'Standard ESAP-driven workflow: Draft → AI Review → Internal Review → DRM Review → Approved → Finalized',
                            TRUE)
                    RETURNING id
                """)

                # Stages — config.assignment_stage_keys maps workflow stage_key to
                # the stage values stored in review_assignments.stage (which use a
                # legacy hyphenated naming: "internal-review", "drm-approval").
                stage_defs = [
                    ("draft", "Draft", 1, "draft", {}),
                    ("ai_review", "AI Review", 2, "ai_analysis", {}),
                    (
                        "internal_review",
                        "Internal Review",
                        3,
                        "review",
                        {"assignment_stage_keys": ["internal-review"]},
                    ),
                    (
                        "drm_review",
                        "DRM Review",
                        4,
                        "approval",
                        {"assignment_stage_keys": ["drm-approval"]},
                    ),
                    ("approved", "Approved", 5, "terminal", {}),
                    ("finalized", "Finalized", 6, "terminal", {}),
                    ("rejected", "Rejected", 0, "terminal", {"is_failure": True}),
                ]
                stage_ids = {}
                for key, name, order, stype, cfg in stage_defs:
                    sid = await conn.fetchval(
                        """
                        INSERT INTO workflow_template_stages
                            (template_id, stage_key, display_name, stage_order, stage_type, config)
                        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                        RETURNING id
                    """,
                        template_id,
                        key,
                        name,
                        order,
                        stype,
                        json.dumps(cfg),
                    )
                    stage_ids[key] = sid

                # Stage roles (mirrors _INTERNAL_REVIEW_REQUIRED and _DRM_REQUIRED)
                role_defs = [
                    # (stage_key, role_key, esap_levels)
                    ("internal_review", "solution-architect", ["type-1", "type-2", "type-3"]),
                    ("internal_review", "sqa-reviewer", ["type-1", "type-2"]),
                    ("drm_review", "cpl", ["type-1", "type-2", "type-3"]),
                    ("drm_review", "cdp", ["type-1", "type-2"]),
                    ("drm_review", "delivery-manager", ["type-1"]),
                ]
                for stage_key, role_key, esap_levels in role_defs:
                    await conn.execute(
                        """
                        INSERT INTO workflow_template_stage_roles
                            (stage_id, role_key, is_required, esap_levels)
                        VALUES ($1, $2, TRUE, $3)
                    """,
                        stage_ids[stage_key],
                        role_key,
                        esap_levels,
                    )

                # Transitions — matches the "Fixed Default ESAP Workflow"
                # reference template.  Forward edges are real (user-editable),
                # reject/send-back are implicit but included for backend routing.
                # NOTE: AI Analysis stages may only be entered from a draft
                # stage (enforced by _validate_workflow_data), so the only
                # legitimate incoming edge to ai_review is "draft → ai_review".
                # Send-backs from later stages must target draft directly.
                transitions = [
                    ("draft", "ai_review", "default"),
                    ("ai_review", "internal_review", "on_approve"),
                    ("internal_review", "drm_review", "on_approve"),
                    ("drm_review", "approved", "on_approve"),
                    ("approved", "finalized", "default"),
                    ("ai_review", "draft", "on_send_back"),
                    ("internal_review", "draft", "on_send_back"),
                    ("internal_review", "rejected", "on_reject"),
                    ("drm_review", "internal_review", "on_send_back"),
                    ("drm_review", "rejected", "on_reject"),
                    ("rejected", "draft", "default"),
                ]
                for from_key, to_key, condition in transitions:
                    await conn.execute(
                        """
                        INSERT INTO workflow_template_transitions
                            (template_id, from_stage_key, to_stage_key, condition)
                        VALUES ($1, $2, $3, $4)
                    """,
                        template_id,
                        from_key,
                        to_key,
                        condition,
                    )

                print(f"Seeded default workflow template (id={template_id})")

                # Seed default document requirements for the ESAP template
                doc_req_defs = [
                    (
                        "internal_review",
                        "solution-architecture",
                        True,
                        "Solution architecture document covering technical design",
                    ),
                    (
                        "internal_review",
                        "staffing-plan",
                        False,
                        "Resource allocation and staffing plan",
                    ),
                    ("drm_review", "risk-register", False, "Risk register with mitigations"),
                    (
                        "drm_review",
                        "srm-presentation",
                        False,
                        "SRM presentation deck for deal review",
                    ),
                ]
                for stage_key, doc_type, is_req, desc in doc_req_defs:
                    await conn.execute(
                        """
                        INSERT INTO workflow_stage_document_requirements
                            (template_id, stage_key, document_type, is_required, description)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (template_id, stage_key, document_type) DO NOTHING
                        """,
                        template_id,
                        stage_key,
                        doc_type,
                        is_req,
                        desc,
                    )
                print("Seeded default document requirements")

            # Backfill any transitions that may be missing from previously-seeded
            # templates (the guard above skips re-seeding if the template exists).
            esap_id = existing_template or template_id
            if esap_id:
                # AI Analysis stages may only be entered from a draft stage
                # (enforced by _validate_workflow_data), so internal_review
                # send-backs target draft directly instead of looping back
                # through ai_review.
                required_transitions = [
                    ("draft", "ai_review", "default"),
                    ("ai_review", "internal_review", "on_approve"),
                    ("internal_review", "drm_review", "on_approve"),
                    ("drm_review", "approved", "on_approve"),
                    ("approved", "finalized", "default"),
                    ("ai_review", "draft", "on_send_back"),
                    ("internal_review", "draft", "on_send_back"),
                    ("internal_review", "rejected", "on_reject"),
                    ("drm_review", "internal_review", "on_send_back"),
                    ("drm_review", "rejected", "on_reject"),
                    ("rejected", "draft", "default"),
                ]
                for from_key, to_key, condition in required_transitions:
                    await conn.execute(
                        """
                        INSERT INTO workflow_template_transitions
                            (template_id, from_stage_key, to_stage_key, condition)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT DO NOTHING
                        """,
                        esap_id,
                        from_key,
                        to_key,
                        condition,
                    )

            # ── Seed content templates from JSON files ────────────────────────
            import json as _json
            from pathlib import Path as _Path

            templates_dir = _Path(CONTENT_TEMPLATES_DIR)
            if templates_dir.exists():
                for tmpl_file in sorted(templates_dir.glob("*.json")):
                    with open(tmpl_file) as f:
                        tmpl_data = _json.load(f)

                    existing = await conn.fetchval(
                        "SELECT id FROM sow_content_templates WHERE name = $1",
                        tmpl_data.get("name", tmpl_file.stem),
                    )
                    if not existing:
                        await conn.execute(
                            """
                            INSERT INTO sow_content_templates
                                (name, methodology, description, template_data, is_system)
                            VALUES ($1, $2, $3, $4::jsonb, TRUE)
                            """,
                            tmpl_data.get("name", tmpl_file.stem),
                            tmpl_data.get("methodology", ""),
                            tmpl_data.get("description"),
                            _json.dumps(tmpl_data.get("template_data", {})),
                        )
                        print(f"Seeded content template: {tmpl_data.get('name', tmpl_file.stem)}")

            # ------------------------------------------------------------------ #
            # 13a. BACKFILL assignment_stage_keys on default template            #
            # Older seeds inserted empty configs. Patch the default template's   #
            # internal_review / drm_review stages so WorkflowProgress can map    #
            # review_assignments.stage back to workflow stages.                  #
            # ------------------------------------------------------------------ #
            default_tmpl_id_mig = await conn.fetchval(
                "SELECT id FROM workflow_templates WHERE is_system = TRUE AND name = 'Default ESAP Workflow'"
            )
            if default_tmpl_id_mig:
                stage_cfg_patches = {
                    "internal_review": {"assignment_stage_keys": ["internal-review"]},
                    "drm_review": {"assignment_stage_keys": ["drm-approval"]},
                    "rejected": {"is_failure": True},
                }
                for stage_key, patch in stage_cfg_patches.items():
                    await conn.execute(
                        """
                        UPDATE workflow_template_stages
                        SET    config = COALESCE(config, '{}'::jsonb) || $1::jsonb
                        WHERE  template_id = $2 AND stage_key = $3
                        """,
                        json.dumps(patch),
                        default_tmpl_id_mig,
                        stage_key,
                    )

                # Re-snapshot any sow_workflow rows using this template whose
                # snapshot is missing assignment_stage_keys on the mapped stages.
                from routers.workflow import build_workflow_snapshot as _bws

                fresh_snapshot = await _bws(conn, default_tmpl_id_mig)
                fresh_snapshot_str = json.dumps(fresh_snapshot)
                stale = await conn.fetch(
                    """
                    SELECT id, workflow_data FROM sow_workflow
                    WHERE template_id = $1
                    """,
                    default_tmpl_id_mig,
                )
                for sw in stale:
                    data = (
                        sw["workflow_data"]
                        if isinstance(sw["workflow_data"], dict)
                        else json.loads(sw["workflow_data"])
                    )
                    needs = True
                    for st in data.get("stages", []):
                        if st.get("stage_key") == "drm_review":
                            if (st.get("config") or {}).get("assignment_stage_keys"):
                                needs = False
                            break
                    if needs:
                        await conn.execute(
                            "UPDATE sow_workflow SET workflow_data = $1::jsonb, updated_at = NOW() WHERE id = $2",
                            fresh_snapshot_str,
                            sw["id"],
                        )

            # ------------------------------------------------------------------ #
            # 13b. PHASE 5 MIGRATION — Backfill sow_workflow for legacy SoWs    #
            # Idempotent: ON CONFLICT DO NOTHING skips SoWs already migrated.   #
            # ------------------------------------------------------------------ #
            from routers.workflow import build_workflow_snapshot, get_default_template_id

            existing_sows = await conn.fetch("""
                SELECT sd.id, sd.status FROM sow_documents sd
                LEFT JOIN sow_workflow sw ON sw.sow_id = sd.id
                WHERE sw.id IS NULL
            """)
            if existing_sows:
                default_tmpl_id = await get_default_template_id(conn)
                if default_tmpl_id:
                    import json as _json2

                    default_snapshot = await build_workflow_snapshot(conn, default_tmpl_id)
                    snapshot_str = _json2.dumps(default_snapshot)
                    for sow in existing_sows:
                        await conn.execute(
                            """
                            INSERT INTO sow_workflow (sow_id, template_id, current_stage, workflow_data)
                            VALUES ($1, $2, $3, $4::jsonb)
                            ON CONFLICT (sow_id) DO NOTHING
                            """,
                            sow["id"],
                            default_tmpl_id,
                            sow["status"],
                            snapshot_str,
                        )
                    print(f"Backfilled sow_workflow for {len(existing_sows)} existing SoWs")

            # ------------------------------------------------------------------ #
            # 13c. BACKFILL transition conditions on existing templates           #
            # Infer conditions from topology for rows still set to 'default'.    #
            # ------------------------------------------------------------------ #
            await conn.execute("""
                UPDATE workflow_template_transitions t
                SET    condition = 'on_reject'
                WHERE  t.to_stage_key = 'rejected'
                  AND  t.condition = 'default'
                  AND  NOT EXISTS (
                        SELECT 1 FROM workflow_template_transitions dup
                        WHERE  dup.template_id    = t.template_id
                          AND  dup.from_stage_key = t.from_stage_key
                          AND  dup.to_stage_key   = t.to_stage_key
                          AND  dup.condition       = 'on_reject'
                  );
            """)
            await conn.execute("""
                UPDATE workflow_template_transitions t
                SET    condition = 'on_send_back'
                WHERE  t.from_stage_key IN ('drm_review', 'internal_review', 'ai_review')
                  AND  t.to_stage_key  IN ('draft', 'internal_review')
                  AND  t.condition = 'default'
                  AND  t.from_stage_key != t.to_stage_key
                  AND  NOT EXISTS (
                        SELECT 1 FROM workflow_template_transitions dup
                        WHERE  dup.template_id    = t.template_id
                          AND  dup.from_stage_key = t.from_stage_key
                          AND  dup.to_stage_key   = t.to_stage_key
                          AND  dup.condition       = 'on_send_back'
                  );
            """)
            await conn.execute("""
                UPDATE workflow_template_transitions t
                SET    condition = 'on_approve'
                WHERE  t.from_stage_key IN ('internal_review', 'drm_review')
                  AND  t.to_stage_key NOT IN ('rejected', 'draft', 'internal_review')
                  AND  t.condition = 'default'
                  AND  NOT EXISTS (
                        SELECT 1 FROM workflow_template_transitions dup
                        WHERE  dup.template_id    = t.template_id
                          AND  dup.from_stage_key = t.from_stage_key
                          AND  dup.to_stage_key   = t.to_stage_key
                          AND  dup.condition       = 'on_approve'
                  );
            """)

            # ------------------------------------------------------------------ #
            # 14. INDEXES                                                         #
            # ------------------------------------------------------------------ #
            for idx_ddl in [
                "CREATE INDEX IF NOT EXISTS idx_sow_status      ON sow_documents(status);",
                "CREATE INDEX IF NOT EXISTS idx_sow_client_id   ON sow_documents(client_id);",
                "CREATE INDEX IF NOT EXISTS idx_sow_methodology ON sow_documents(methodology);",
                "CREATE INDEX IF NOT EXISTS idx_sow_cycle       ON sow_documents(cycle);",
                "CREATE INDEX IF NOT EXISTS idx_sow_content_id  ON sow_documents(content_id);",
                "CREATE INDEX IF NOT EXISTS idx_sow_kg_node_id  ON sow_documents(kg_node_id) WHERE kg_node_id IS NOT NULL;",
                "CREATE INDEX IF NOT EXISTS idx_review_sow_id   ON review_results(sow_id);",
                "CREATE INDEX IF NOT EXISTS idx_history_sow_id     ON history(sow_id);",
                "CREATE INDEX IF NOT EXISTS idx_history_changed_by ON history(changed_by);",
                "CREATE INDEX IF NOT EXISTS idx_collab_sow_id      ON collaboration(sow_id);",
                "CREATE INDEX IF NOT EXISTS idx_collab_user_id  ON collaboration(user_id);",
                # review_assignments indexes
                "CREATE INDEX IF NOT EXISTS idx_review_assignments_sow    ON review_assignments(sow_id);",
                "CREATE INDEX IF NOT EXISTS idx_review_assignments_user   ON review_assignments(user_id);",
                "CREATE INDEX IF NOT EXISTS idx_review_assignments_status ON review_assignments(status);",
                # handoff_packages index
                "CREATE INDEX IF NOT EXISTS idx_handoff_sow ON handoff_packages(sow_id);",
                # conditions_of_approval indexes
                "CREATE INDEX IF NOT EXISTS idx_coa_sow      ON conditions_of_approval(sow_id);",
                "CREATE INDEX IF NOT EXISTS idx_coa_status   ON conditions_of_approval(status);",
                "CREATE INDEX IF NOT EXISTS idx_coa_assigned ON conditions_of_approval(assigned_to);",
                # sow_content_templates index
                "CREATE INDEX IF NOT EXISTS idx_content_templates_methodology ON sow_content_templates(methodology);",
                # sow_attachments indexes
                "CREATE INDEX IF NOT EXISTS idx_attachments_sow   ON sow_attachments(sow_id);",
                "CREATE INDEX IF NOT EXISTS idx_attachments_type  ON sow_attachments(document_type);",
                "CREATE INDEX IF NOT EXISTS idx_attachments_stage ON sow_attachments(stage_key);",
                # workflow_stage_document_requirements index
                "CREATE INDEX IF NOT EXISTS idx_wf_doc_reqs_template ON workflow_stage_document_requirements(template_id);",
                # workflow indexes
                "CREATE INDEX IF NOT EXISTS idx_wf_stages_template      ON workflow_template_stages(template_id);",
                "CREATE INDEX IF NOT EXISTS idx_wf_roles_stage           ON workflow_template_stage_roles(stage_id);",
                "CREATE INDEX IF NOT EXISTS idx_wf_transitions_template  ON workflow_template_transitions(template_id);",
                "CREATE INDEX IF NOT EXISTS idx_sow_workflow_sow         ON sow_workflow(sow_id);",
                "CREATE INDEX IF NOT EXISTS idx_sow_workflow_template    ON sow_workflow(template_id);",
            ]:
                await conn.execute(idx_ddl)

            # ------------------------------------------------------------------ #
            # 15. FULL-TEXT SEARCH  (Phase 6)                                    #
            # tsvector column on sow_documents, GIN index, and trigger to keep   #
            # it updated on title/customer_name/opportunity_id/methodology edits. #
            # ------------------------------------------------------------------ #
            await conn.execute(
                "ALTER TABLE sow_documents ADD COLUMN IF NOT EXISTS search_vector tsvector;"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sow_search ON sow_documents USING GIN(search_vector);"
            )

            # Trigger function — fires BEFORE INSERT OR UPDATE on key columns
            await conn.execute("""
                CREATE OR REPLACE FUNCTION sow_search_vector_update() RETURNS trigger AS $$
                BEGIN
                    NEW.search_vector := to_tsvector('english',
                        coalesce(NEW.title, '') || ' ' ||
                        coalesce(NEW.customer_name, '') || ' ' ||
                        coalesce(NEW.opportunity_id, '') || ' ' ||
                        coalesce(NEW.methodology, '')
                    );
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            """)

            # Drop and recreate trigger so it is idempotent
            await conn.execute("DROP TRIGGER IF EXISTS trg_sow_search_vector ON sow_documents;")
            await conn.execute("""
                CREATE TRIGGER trg_sow_search_vector
                    BEFORE INSERT OR UPDATE OF title, customer_name, opportunity_id, methodology
                    ON sow_documents
                    FOR EACH ROW
                    EXECUTE FUNCTION sow_search_vector_update();
            """)

            # Backfill existing rows that have no search_vector.
            # Uses only columns on sow_documents itself; the trigger keeps it
            # updated going forward on title/customer_name/opportunity_id/methodology.
            await conn.execute("""
                UPDATE sow_documents SET search_vector =
                    to_tsvector('english',
                        coalesce(title, '') || ' ' ||
                        coalesce(customer_name, '') || ' ' ||
                        coalesce(opportunity_id, '') || ' ' ||
                        coalesce(methodology, '')
                    )
                WHERE search_vector IS NULL
            """)

        print("PostgreSQL schema ready")
    except Exception as e:
        print(f"Schema bootstrap FAILED: {e}")

    # ── Upload directory ──────────────────────────────────────────────────────
    from pathlib import Path

    from config import UPLOAD_DIR

    Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    print(f"Upload directory ready: {UPLOAD_DIR}")

    yield

    # ── Cleanup ──────────────────────────────────────────────────────────────
    if database.neo4j_driver:
        database.neo4j_driver.close()
    if database.pg_pool:
        await database.pg_pool.close()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Cocoon API",
    description="AI-enabled Statement of Work drafting, review, and automation",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(status_router)  # /status  (HTML status page)
app.include_router(auth_router)  # /api/auth/...
app.include_router(sow_router)  # /api/sow/...
app.include_router(review_router)  # /api/review/...
app.include_router(finalize_router)  # /api/finalize/...
app.include_router(rules_router)  # /api/rules/...
app.include_router(workflow_router)  # /api/workflow/...
app.include_router(coa_router)  # /api/coa/...
app.include_router(attachments_router)  # /api/attachments/...
app.include_router(ai_router)  # /api/ai/...
app.include_router(audit_router)  # /api/audit/...
app.include_router(users_router)  # /api/users/...


# ── Health ────────────────────────────────────────────────────────────────────


@app.get("/health", tags=["health"])
async def health():
    """Check connectivity to both databases."""
    neo4j_ok, neo4j_error = True, None
    pg_ok, pg_error = True, None

    try:
        database.neo4j_driver.verify_connectivity()
    except Exception as exc:
        neo4j_ok, neo4j_error = False, str(exc)

    try:
        async with database.pg_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
    except Exception as exc:
        pg_ok, pg_error = False, str(exc)

    return build_health_status(neo4j_ok, neo4j_error, pg_ok, pg_error)


# ── Graph endpoints (Neo4j — managed by separate team; kept in main for now) ──


@app.get("/api/graph/stats", tags=["graph"])
async def graph_stats():
    """Get Neo4j graph statistics."""
    with database.neo4j_driver.session() as session:
        node_count = session.run("MATCH (n) RETURN count(n) AS count").single()["count"]
        rel_count = session.run("MATCH ()-[r]->() RETURN count(r) AS count").single()["count"]
        labels = session.run(
            "CALL db.labels() YIELD label RETURN collect(label) AS labels"
        ).single()["labels"]
    return format_graph_stats(node_count, rel_count, labels)


@app.post("/api/graph/sow-knowledge", tags=["graph"])
async def add_sow_knowledge(payload: dict):
    """Add SoW knowledge entities and relationships to Neo4j."""
    sow_id, entities, relationships = validate_knowledge_payload(payload)

    with database.neo4j_driver.session() as session:
        for entity in entities:
            session.run(
                f"MERGE (n:{entity['label']} {{name: $name, sow_id: $sow_id}}) SET n += $props",
                name=entity["name"],
                sow_id=sow_id,
                props=entity.get("properties", {}),
            )
        for rel in relationships:
            session.run(
                f"MATCH (a {{name: $from_name, sow_id: $sow_id}}), "
                f"(b {{name: $to_name, sow_id: $sow_id}}) "
                f"MERGE (a)-[r:{rel['type']}]->(b)",
                from_name=rel["from"],
                to_name=rel["to"],
                sow_id=sow_id,
            )

    return format_knowledge_result(len(entities), len(relationships))
