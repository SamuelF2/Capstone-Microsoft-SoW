"""
Cocoon Backend API - FastAPI with Neo4j + PostgreSQL
"""

from contextlib import asynccontextmanager

import asyncpg
from config import DATABASE_URL, NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from status import router as status_router
from validators import (
    build_health_status,
    format_graph_stats,
    format_knowledge_result,
    validate_knowledge_payload,
    validate_sow_payload,
)

# ── Database clients ────────────────────────────────────
neo4j_driver = None
pg_pool = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    global neo4j_driver, pg_pool

    # --- Start Neo4j driver ---
    neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    neo4j_driver.verify_connectivity()
    print("Neo4j connected")

    # --- Start PostgreSQL pool ---
    pg_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    print("PostgreSQL connected")

    # --- Create initial tables if needed ---
    async with pg_pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sow_documents (
                id              SERIAL PRIMARY KEY,
                title           TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'draft',
                uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content         JSONB,
                metadata        JSONB
            );
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS review_results (
                id              SERIAL PRIMARY KEY,
                sow_id          INTEGER REFERENCES sow_documents(id) ON DELETE CASCADE,
                reviewer        TEXT,
                score           REAL,
                findings        JSONB,
                reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
    print("PostgreSQL tables initialized")

    yield

    # --- Cleanup ---
    if neo4j_driver:
        neo4j_driver.close()
    if pg_pool:
        await pg_pool.close()


# ── App ─────────────────────────────────────────────────
app = FastAPI(
    title="Cocoon API",
    description="AI-enabled Statement of Work review and automation",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Status page ─────────────────────────────────────────
app.include_router(status_router)


# ── Health ──────────────────────────────────────────────
@app.get("/health")
async def health():
    """Check connectivity to both databases."""
    neo4j_ok, neo4j_error = True, None
    pg_ok, pg_error = True, None

    try:
        neo4j_driver.verify_connectivity()
    except Exception as e:
        neo4j_ok, neo4j_error = False, str(e)

    try:
        async with pg_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
    except Exception as e:
        pg_ok, pg_error = False, str(e)

    return build_health_status(neo4j_ok, neo4j_error, pg_ok, pg_error)


# ── SoW CRUD (PostgreSQL) ──────────────────────────────
@app.get("/api/sow")
async def list_sows():
    """List all SoW documents."""
    async with pg_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, title, status, uploaded_at, updated_at FROM sow_documents ORDER BY updated_at DESC"
        )
    return [dict(r) for r in rows]


@app.post("/api/sow")
async def create_sow(payload: dict):
    """Create a new SoW document."""
    title = validate_sow_payload(payload)

    async with pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO sow_documents (title, content, metadata) VALUES ($1, $2, $3) RETURNING *",
            title,
            payload.get("content"),
            payload.get("metadata"),
        )
    return dict(row)


@app.get("/api/sow/{sow_id}")
async def get_sow(sow_id: int):
    """Get a single SoW document."""
    async with pg_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sow_documents WHERE id = $1", sow_id)
    if not row:
        raise HTTPException(status_code=404, detail="SoW not found")
    return dict(row)


@app.delete("/api/sow/{sow_id}")
async def delete_sow(sow_id: int):
    """Delete a SoW document."""
    async with pg_pool.acquire() as conn:
        result = await conn.execute("DELETE FROM sow_documents WHERE id = $1", sow_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="SoW not found")
    return {"deleted": sow_id}


# ── Graph Operations (Neo4j) ───────────────────────────
@app.get("/api/graph/stats")
async def graph_stats():
    """Get Neo4j graph statistics."""
    with neo4j_driver.session() as session:
        node_count = session.run("MATCH (n) RETURN count(n) AS count").single()["count"]
        rel_count = session.run("MATCH ()-[r]->() RETURN count(r) AS count").single()["count"]
        labels = session.run(
            "CALL db.labels() YIELD label RETURN collect(label) AS labels"
        ).single()["labels"]
    return format_graph_stats(node_count, rel_count, labels)


@app.post("/api/graph/sow-knowledge")
async def add_sow_knowledge(payload: dict):
    """Add SoW knowledge entities and relationships to Neo4j.

    Example payload:
    {
        "sow_id": 1,
        "entities": [
            {"label": "Deliverable", "name": "Architecture Document", "properties": {}},
            {"label": "Milestone", "name": "Phase 1 Complete", "properties": {}}
        ],
        "relationships": [
            {"from": "Architecture Document", "to": "Phase 1 Complete", "type": "PART_OF"}
        ]
    }
    """
    sow_id, entities, relationships = validate_knowledge_payload(payload)

    with neo4j_driver.session() as session:
        # Create or merge entities
        for entity in entities:
            session.run(
                f"MERGE (n:{entity['label']} {{name: $name, sow_id: $sow_id}}) SET n += $props",
                name=entity["name"],
                sow_id=sow_id,
                props=entity.get("properties", {}),
            )

        # Create relationships
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
