"""Tests for Cocoon Backend API endpoints.

Uses FastAPI TestClient with mocked database connections so tests
run without Neo4j or PostgreSQL.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

# ── helpers ──────────────────────────────────────────────


@asynccontextmanager
async def _noop_lifespan(app):
    """No-op lifespan — skips real database connections."""
    yield


_UNSET = object()


def _mock_pg_acquire(db, *, fetchval=_UNSET, fetch=_UNSET, fetchrow=_UNSET, execute=_UNSET):
    """Wire up database.pg_pool.acquire() to return an async-context mock connection."""
    conn = AsyncMock()
    if fetchval is not _UNSET:
        conn.fetchval.return_value = fetchval
    if fetch is not _UNSET:
        conn.fetch.return_value = fetch
    if fetchrow is not _UNSET:
        conn.fetchrow.return_value = fetchrow
    if execute is not _UNSET:
        conn.execute.return_value = execute

    # Support `async with conn.transaction():`
    # transaction() is a sync call that returns an async context manager
    tx_ctx = MagicMock()
    tx_ctx.__aenter__ = AsyncMock(return_value=None)
    tx_ctx.__aexit__ = AsyncMock(return_value=None)
    conn.transaction = MagicMock(return_value=tx_ctx)

    ctx = AsyncMock()
    ctx.__aenter__.return_value = conn
    ctx.__aexit__.return_value = None
    db.pg_pool.acquire.return_value = ctx
    return conn


def _mock_neo4j_session(db, run_side_effect=None):
    """Wire up database.neo4j_driver.session() to return a sync-context mock session."""
    session = MagicMock()
    if run_side_effect is not None:
        session.run.side_effect = run_side_effect

    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=session)
    ctx.__exit__ = MagicMock(return_value=False)
    db.neo4j_driver.session.return_value = ctx
    return session


# ── fixtures ─────────────────────────────────────────────


@pytest.fixture()
def client():
    """Create a TestClient with mocked database connections."""
    import database
    import main

    original_lifespan = main.app.router.lifespan_context
    main.app.router.lifespan_context = _noop_lifespan
    database.neo4j_driver = MagicMock()
    database.pg_pool = MagicMock()

    with TestClient(main.app) as c:
        yield c

    main.app.router.lifespan_context = original_lifespan


# ── GET /health ──────────────────────────────────────────


class TestHealth:
    def test_all_healthy(self, client):
        import database

        database.neo4j_driver.verify_connectivity.return_value = None
        _mock_pg_acquire(database, fetchval=1)

        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["neo4j"] == "connected"
        assert data["postgres"] == "connected"

    def test_neo4j_down(self, client):
        import database

        database.neo4j_driver.verify_connectivity.side_effect = Exception("refused")
        _mock_pg_acquire(database, fetchval=1)

        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "degraded"
        assert "error" in data["neo4j"]

    def test_postgres_down(self, client):
        import database

        database.neo4j_driver.verify_connectivity.return_value = None
        ctx = AsyncMock()
        ctx.__aenter__.side_effect = Exception("refused")
        database.pg_pool.acquire.return_value = ctx

        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "degraded"
        assert "error" in data["postgres"]


# ── GET /api/sow ─────────────────────────────────────────


class TestListSows:
    def test_returns_documents(self, client):
        import database

        _mock_pg_acquire(
            database,
            fetch=[
                {
                    "id": 1,
                    "title": "SoW A",
                    "status": "draft",
                    "uploaded_at": "2026-01-01",
                    "updated_at": "2026-01-01",
                },
            ],
        )

        resp = client.get("/api/sow")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "SoW A"

    def test_returns_empty_list(self, client):
        import database

        _mock_pg_acquire(database, fetch=[])

        resp = client.get("/api/sow")
        assert resp.status_code == 200
        assert resp.json() == []


# ── POST /api/sow ────────────────────────────────────────


class TestCreateSow:
    def test_success(self, client):
        import database

        _mock_pg_acquire(
            database,
            fetchval=1,
            fetchrow={
                "id": 1,
                "title": "New SoW",
                "status": "draft",
                "cycle": 1,
                "content_id": 1,
                "ai_suggestion_id": None,
                "uploaded_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
                "client_id": None,
                "methodology": None,
                "customer_name": None,
                "opportunity_id": None,
                "deal_value": None,
                "content": None,
                "metadata": None,
            },
        )

        resp = client.post("/api/sow", json={"title": "New SoW"})
        assert resp.status_code == 201
        assert resp.json()["title"] == "New SoW"

    def test_with_content_and_metadata(self, client):
        import database

        _mock_pg_acquire(
            database,
            fetchval=1,
            fetchrow={
                "id": 2,
                "title": "Full SoW",
                "status": "draft",
                "cycle": 1,
                "content_id": 1,
                "ai_suggestion_id": None,
                "uploaded_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
                "client_id": None,
                "methodology": None,
                "customer_name": None,
                "opportunity_id": None,
                "deal_value": None,
                "content": {"sections": ["scope"]},
                "metadata": {"version": 1},
            },
        )

        resp = client.post(
            "/api/sow",
            json={
                "title": "Full SoW",
                "content": {"sections": ["scope"]},
                "metadata": {"version": 1},
            },
        )
        assert resp.status_code == 201
        assert resp.json()["content"] == {"sections": ["scope"]}

    def test_missing_title_returns_422(self, client):
        resp = client.post("/api/sow", json={})
        assert resp.status_code == 422

    def test_empty_title_returns_422(self, client):
        resp = client.post("/api/sow", json={"title": ""})
        assert resp.status_code == 422


# ── GET /api/sow/{sow_id} ───────────────────────────────


class TestGetSow:
    def test_found(self, client):
        import database

        _mock_pg_acquire(
            database,
            fetchrow={
                "id": 1,
                "title": "Found",
                "status": "draft",
                "uploaded_at": "2026-01-01",
                "updated_at": "2026-01-01",
                "content": None,
                "metadata": None,
            },
        )

        resp = client.get("/api/sow/1")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Found"

    def test_not_found(self, client):
        import database

        _mock_pg_acquire(database, fetchrow=None)

        resp = client.get("/api/sow/999")
        assert resp.status_code == 404


# ── DELETE /api/sow/{sow_id} ────────────────────────────


class TestDeleteSow:
    def test_success(self, client):
        import database

        _mock_pg_acquire(database, execute="DELETE 1")

        resp = client.delete("/api/sow/1")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 1

    def test_not_found(self, client):
        import database

        _mock_pg_acquire(database, execute="DELETE 0")

        resp = client.delete("/api/sow/999")
        assert resp.status_code == 404


# ── GET /api/graph/stats ─────────────────────────────────


class TestGraphStats:
    def test_returns_stats(self, client):
        import database

        _mock_neo4j_session(
            database,
            run_side_effect=[
                MagicMock(single=lambda: {"count": 42}),
                MagicMock(single=lambda: {"count": 10}),
                MagicMock(single=lambda: {"labels": ["SOW", "Section", "Deliverable"]}),
            ],
        )

        resp = client.get("/api/graph/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["nodes"] == 42
        assert data["relationships"] == 10
        assert "SOW" in data["labels"]


# ── POST /api/graph/sow-knowledge ───────────────────────


class TestAddSowKnowledge:
    def test_add_entities_and_relationships(self, client):
        import database

        _mock_neo4j_session(database)

        payload = {
            "sow_id": 1,
            "entities": [
                {"label": "Deliverable", "name": "Arch Doc", "properties": {}},
                {"label": "Milestone", "name": "Phase 1", "properties": {}},
            ],
            "relationships": [
                {"from": "Arch Doc", "to": "Phase 1", "type": "PART_OF"},
            ],
        }

        resp = client.post("/api/graph/sow-knowledge", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["entities_added"] == 2
        assert data["relationships_added"] == 1

    def test_empty_payload(self, client):
        import database

        _mock_neo4j_session(database)

        resp = client.post("/api/graph/sow-knowledge", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["entities_added"] == 0
        assert data["relationships_added"] == 0


# ── GET /status ──────────────────────────────────────────


class TestStatusPage:
    def test_returns_html(self, client):
        resp = client.get("/status")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
        assert "System Status" in resp.text
