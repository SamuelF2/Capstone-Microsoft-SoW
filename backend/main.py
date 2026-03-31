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
import os
from contextlib import asynccontextmanager

import asyncpg
import database
from config import (
    DATABASE_URL,
    NEO4J_PASSWORD,
    NEO4J_URI,
    NEO4J_USER,
    PG_DB,
    PG_HOST,
    PG_PORT,
    PG_USER,
)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from routers.auth import router as auth_router
from routers.finalize import router as finalize_router
from routers.review import router as review_router
from routers.rules import router as rules_router
from routers.sow import router as sow_router
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

    # ── Connect databases (with retry) ─────────────────────────────────────────
    # Try multiple times so the API can wait for database containers to start.
    # Azure Container Apps may start containers in any order.

    max_retries = 6
    retry_delay = 5  # seconds

    for attempt in range(1, max_retries + 1):
        # Neo4j
        if database.neo4j_driver is None:
            try:
                database.neo4j_driver = GraphDatabase.driver(
                    NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
                )
                database.neo4j_driver.verify_connectivity()
                print("Neo4j connected")
            except Exception as e:
                print(f"Neo4j connection attempt {attempt}/{max_retries} failed: {e}")
                database.neo4j_driver = None

        # PostgreSQL
        if database.pg_pool is None:
            try:
                database.pg_pool = await asyncio.wait_for(
                    asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10),
                    timeout=5,
                )
                print("PostgreSQL connected")
            except Exception as e:
                print(f"PostgreSQL connection attempt {attempt}/{max_retries} failed: {e}")
                database.pg_pool = None

        # Both connected — stop retrying
        if database.neo4j_driver and database.pg_pool:
            break

        # Wait before next retry (unless last attempt)
        if attempt < max_retries:
            print(f"Retrying database connections in {retry_delay}s...")
            await asyncio.sleep(retry_delay)

    if not database.neo4j_driver:
        print("WARNING: Neo4j unavailable after all retries — running in degraded mode")
    if not database.pg_pool:
        print("WARNING: PostgreSQL unavailable after all retries — running in degraded mode")

    # ── Schema bootstrap ─────────────────────────────────────────────────────
    # Core tables from infrastructure/postgres/init/01-init.sql are created on
    # first container start.  Everything below is idempotent and aligns the
    # schema with the Database Schema for PostgreSQL.pdf specification.
    if not database.pg_pool:
        print("Skipping schema bootstrap — PostgreSQL not available")
        yield
        return

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
        # 11. INDEXES                                                         #
        # ------------------------------------------------------------------ #
        for idx_ddl in [
            "CREATE INDEX IF NOT EXISTS idx_sow_status      ON sow_documents(status);",
            "CREATE INDEX IF NOT EXISTS idx_sow_client_id   ON sow_documents(client_id);",
            "CREATE INDEX IF NOT EXISTS idx_sow_methodology ON sow_documents(methodology);",
            "CREATE INDEX IF NOT EXISTS idx_sow_cycle       ON sow_documents(cycle);",
            "CREATE INDEX IF NOT EXISTS idx_sow_content_id  ON sow_documents(content_id);",
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
        ]:
            await conn.execute(idx_ddl)

    print("PostgreSQL schema ready")

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


# ── Health ────────────────────────────────────────────────────────────────────


@app.get("/debug/connectivity", tags=["health"])
async def debug_connectivity():
    """Try fresh database connections and report detailed errors."""
    results = {}

    # Test PostgreSQL
    try:
        test_pool = await asyncio.wait_for(
            asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=1),
            timeout=5,
        )
        async with test_pool.acquire() as conn:
            val = await conn.fetchval("SELECT 1")
            results["postgres"] = f"connected, SELECT 1 = {val}"
        await test_pool.close()
    except Exception as e:
        results["postgres"] = f"error: {type(e).__name__}: {e}"

    # Test Neo4j
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        driver.verify_connectivity()
        results["neo4j"] = "connected"
        driver.close()
    except Exception as e:
        results["neo4j"] = f"error: {type(e).__name__}: {e}"

    results["config"] = {
        "POSTGRES_HOST": PG_HOST,
        "POSTGRES_PORT": PG_PORT,
        "POSTGRES_DB": PG_DB,
        "POSTGRES_USER": PG_USER,
        "NEO4J_URI": NEO4J_URI,
        "DATABASE_URL_HOST": DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "not set",
    }
    return results


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
