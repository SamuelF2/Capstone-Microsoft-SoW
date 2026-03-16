"""
Cocoon Backend API — FastAPI with Neo4j + PostgreSQL

Structure
---------
main.py        App entry point, lifespan, middleware, health check
database.py    Shared connection state (neo4j_driver, pg_pool)
auth.py        JWT utilities + get_current_user dependency
models.py      Pydantic models (UserResponse, SoWCreate, …)
config.py      Env-var driven configuration
routers/
  auth.py      POST /api/auth/login|logout|register  GET /api/auth/me
  sow.py       CRUD + status for /api/sow/…

PostgreSQL schema (per Database Schema for PostgreSQL.pdf)
----------------------------------------------------------
users           — authentication (id, email, username, hashed_password, name, …)
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
from contextlib import asynccontextmanager

import asyncpg
import database
from config import DATABASE_URL, NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from routers.auth import router as auth_router
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

    # ── Neo4j ────────────────────────────────────────────────────────────────
    database.neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    for attempt in range(15):
        try:
            database.neo4j_driver.verify_connectivity()
            print("Neo4j connected")
            break
        except Exception:
            if attempt == 14:
                raise
            print(f"Neo4j not ready, retrying ({attempt + 1}/15)...")
            await asyncio.sleep(2)

    # ── PostgreSQL ───────────────────────────────────────────────────────────
    for attempt in range(15):
        try:
            database.pg_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
            print("PostgreSQL connected")
            break
        except Exception:
            if attempt == 14:
                raise
            print(f"PostgreSQL not ready, retrying ({attempt + 1}/15)...")
            await asyncio.sleep(2)

    # ── Schema bootstrap ─────────────────────────────────────────────────────
    # Core tables from infrastructure/postgres/init/01-init.sql are created on
    # first container start.  Everything below is idempotent and aligns the
    # schema with the Database Schema for PostgreSQL.pdf specification.
    async with database.pg_pool.acquire() as conn:
        # ------------------------------------------------------------------ #
        # 1. USERS                                                            #
        # PDF §2.6: id, username, password, name                              #
        # We keep email-based auth and add username + name alias columns.     #
        # ------------------------------------------------------------------ #
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              SERIAL PRIMARY KEY,
                email           TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                full_name       TEXT,
                role            TEXT NOT NULL DEFAULT 'consultant',
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
        for col_ddl in [
            # PDF §2.6 — username (short login handle / display alias)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;",
            # PDF §2.6 — name (display name, mirrors full_name)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;",
        ]:
            await conn.execute(col_ddl)

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
        # ------------------------------------------------------------------ #
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id          SERIAL PRIMARY KEY,
                sow_id      INTEGER REFERENCES sow_documents(id) ON DELETE CASCADE,
                changed_by  INTEGER REFERENCES users(id),
                change_type TEXT,
                changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                diff        JSONB
            );
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
        # 9. INDEXES                                                          #
        # ------------------------------------------------------------------ #
        for idx_ddl in [
            "CREATE INDEX IF NOT EXISTS idx_sow_status      ON sow_documents(status);",
            "CREATE INDEX IF NOT EXISTS idx_sow_client_id   ON sow_documents(client_id);",
            "CREATE INDEX IF NOT EXISTS idx_sow_methodology ON sow_documents(methodology);",
            "CREATE INDEX IF NOT EXISTS idx_sow_cycle       ON sow_documents(cycle);",
            "CREATE INDEX IF NOT EXISTS idx_sow_content_id  ON sow_documents(content_id);",
            "CREATE INDEX IF NOT EXISTS idx_review_sow_id   ON review_results(sow_id);",
            "CREATE INDEX IF NOT EXISTS idx_history_sow_id  ON history(sow_id);",
            "CREATE INDEX IF NOT EXISTS idx_collab_sow_id   ON collaboration(sow_id);",
            "CREATE INDEX IF NOT EXISTS idx_collab_user_id  ON collaboration(user_id);",
        ]:
            await conn.execute(idx_ddl)

    print("PostgreSQL schema ready")

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
