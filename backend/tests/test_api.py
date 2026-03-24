"""Tests for Cocoon Backend API endpoints.

Uses FastAPI TestClient with mocked database connections so tests
run without Neo4j or PostgreSQL.
"""

from contextlib import asynccontextmanager
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, mock_open, patch

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
    def test_returns_documents(self, auth_client):
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

        resp = auth_client.get("/api/sow")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "SoW A"

    def test_returns_empty_list(self, auth_client):
        import database

        _mock_pg_acquire(database, fetch=[])

        resp = auth_client.get("/api/sow")
        assert resp.status_code == 200
        assert resp.json() == []


# ── POST /api/sow ────────────────────────────────────────


class TestCreateSow:
    def test_success(self, auth_client):
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

        resp = auth_client.post("/api/sow", json={"title": "New SoW"})
        assert resp.status_code == 201
        assert resp.json()["title"] == "New SoW"

    def test_with_content_and_metadata(self, auth_client):
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

        resp = auth_client.post(
            "/api/sow",
            json={
                "title": "Full SoW",
                "content": {"sections": ["scope"]},
                "metadata": {"version": 1},
            },
        )
        assert resp.status_code == 201
        assert resp.json()["content"] == {"sections": ["scope"]}

    def test_missing_title_returns_422(self, auth_client):
        resp = auth_client.post("/api/sow", json={})
        assert resp.status_code == 422

    def test_empty_title_returns_422(self, auth_client):
        resp = auth_client.post("/api/sow", json={"title": ""})
        assert resp.status_code == 422

    def test_invalid_methodology_returns_400(self, auth_client):
        resp = auth_client.post("/api/sow", json={"title": "Test", "methodology": "InvalidMethod"})
        assert resp.status_code == 400
        assert "Invalid methodology" in resp.json()["detail"]

    def test_valid_methodology_succeeds(self, auth_client):
        import database

        _mock_pg_acquire(
            database,
            fetchval=1,
            fetchrow={
                "id": 1,
                "title": "Test",
                "status": "draft",
                "cycle": 1,
                "content_id": 1,
                "ai_suggestion_id": None,
                "uploaded_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
                "client_id": None,
                "methodology": "Waterfall",
                "customer_name": None,
                "opportunity_id": None,
                "deal_value": None,
                "content": None,
                "metadata": None,
            },
        )

        resp = auth_client.post("/api/sow", json={"title": "Test", "methodology": "Waterfall"})
        assert resp.status_code == 201
        assert resp.json()["methodology"] == "Waterfall"


# ── GET /api/sow/{sow_id} ───────────────────────────────


class TestGetSow:
    def test_found(self, auth_client):
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

        resp = auth_client.get("/api/sow/1")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Found"

    def test_not_found(self, auth_client):
        import database

        _mock_pg_acquire(database, fetchrow=None)

        resp = auth_client.get("/api/sow/999")
        assert resp.status_code == 404


# ── DELETE /api/sow/{sow_id} ────────────────────────────


class TestDeleteSow:
    def test_success(self, auth_client):
        import database

        _mock_pg_acquire(database, execute="DELETE 1")

        resp = auth_client.delete("/api/sow/1")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 1

    def test_not_found(self, auth_client):
        import database

        _mock_pg_acquire(database, execute="DELETE 0")

        resp = auth_client.delete("/api/sow/999")
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


# ── Shared mock data ────────────────────────────────────


def _full_sow_row(**overrides):
    """Return a complete sow_documents row dict for mocking."""
    row = {
        "id": 1,
        "title": "Test SoW",
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
    }
    row.update(overrides)
    return row


# ── GET /api/sow/by-client/{client_id} ──────────────────


class TestGetSowByClientId:
    def test_found(self, auth_client):
        import database

        _mock_pg_acquire(
            database,
            fetchrow=_full_sow_row(client_id="abc-123", title="Client SoW"),
        )

        resp = auth_client.get("/api/sow/by-client/abc-123")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Client SoW"
        assert resp.json()["client_id"] == "abc-123"

    def test_not_found(self, auth_client):
        import database

        _mock_pg_acquire(database, fetchrow=None)

        resp = auth_client.get("/api/sow/by-client/nonexistent")
        assert resp.status_code == 404


# ── PATCH /api/sow/{sow_id} ─────────────────────────────


class TestUpdateSow:
    def test_partial_update_title(self, auth_client):
        import database

        _mock_pg_acquire(
            database,
            fetchrow=_full_sow_row(title="Updated Title"),
        )

        resp = auth_client.patch("/api/sow/1", json={"title": "Updated Title"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"

    def test_not_found(self, auth_client):
        import database

        _mock_pg_acquire(database, fetchrow=None)

        resp = auth_client.patch("/api/sow/999", json={"title": "X"})
        assert resp.status_code == 404

    def test_empty_payload_returns_current(self, auth_client):
        import database

        _mock_pg_acquire(database, fetchrow=_full_sow_row())

        resp = auth_client.patch("/api/sow/1", json={})
        assert resp.status_code == 200
        assert resp.json()["title"] == "Test SoW"

    def test_empty_payload_not_found(self, auth_client):
        import database

        _mock_pg_acquire(database, fetchrow=None)

        resp = auth_client.patch("/api/sow/999", json={})
        assert resp.status_code == 404

    def test_invalid_methodology_returns_400(self, auth_client):
        resp = auth_client.patch("/api/sow/1", json={"methodology": "BadMethod"})
        assert resp.status_code == 400
        assert "Invalid methodology" in resp.json()["detail"]

    def test_valid_methodology(self, auth_client):
        import database

        _mock_pg_acquire(
            database,
            fetchrow=_full_sow_row(methodology="Sure Step 365"),
        )

        resp = auth_client.patch("/api/sow/1", json={"methodology": "Sure Step 365"})
        assert resp.status_code == 200
        assert resp.json()["methodology"] == "Sure Step 365"


# ── PUT /api/sow/{sow_id}/status ────────────────────────


class TestUpdateSowStatus:
    def test_valid_status(self, auth_client):
        import database

        _mock_pg_acquire(
            database,
            fetchrow=_full_sow_row(status="approved"),
        )

        resp = auth_client.put("/api/sow/1/status", json={"status": "approved"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    def test_invalid_status_returns_400(self, auth_client):
        resp = auth_client.put("/api/sow/1/status", json={"status": "bogus"})
        assert resp.status_code == 400
        assert "Invalid status" in resp.json()["detail"]

    def test_not_found(self, auth_client):
        import database

        _mock_pg_acquire(database, fetchrow=None)

        resp = auth_client.put("/api/sow/999/status", json={"status": "draft"})
        assert resp.status_code == 404


# ── POST /api/sow/upload ────────────────────────────────


class TestUploadSow:
    def test_success_pdf(self, auth_client):
        import database

        _mock_pg_acquire(
            database,
            fetchval=1,
            fetchrow=_full_sow_row(
                methodology="Waterfall",
                metadata='{"file_path": "1_test.pdf", "original_filename": "test.pdf"}',
            ),
        )

        with patch("builtins.open", mock_open()):
            resp = auth_client.post(
                "/api/sow/upload",
                data={"methodology": "Waterfall"},
                files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
            )

        assert resp.status_code == 201
        assert resp.json()["methodology"] == "Waterfall"

    def test_success_docx(self, auth_client):
        import database

        _mock_pg_acquire(
            database,
            fetchval=1,
            fetchrow=_full_sow_row(
                title="report",
                methodology="Agile Sprint Delivery",
                metadata='{"file_path": "1_report.docx", "original_filename": "report.docx"}',
            ),
        )

        with patch("builtins.open", mock_open()):
            resp = auth_client.post(
                "/api/sow/upload",
                data={"methodology": "Agile Sprint Delivery"},
                files={
                    "file": (
                        "report.docx",
                        b"fake docx",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
            )

        assert resp.status_code == 201

    def test_invalid_methodology_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/sow/upload",
            data={"methodology": "BadMethod"},
            files={"file": ("test.pdf", b"content", "application/pdf")},
        )
        assert resp.status_code == 400
        assert "Invalid methodology" in resp.json()["detail"]

    def test_invalid_extension_returns_400(self, auth_client):
        resp = auth_client.post(
            "/api/sow/upload",
            data={"methodology": "Waterfall"},
            files={"file": ("test.txt", b"content", "text/plain")},
        )
        assert resp.status_code == 400
        assert "Invalid file type" in resp.json()["detail"]

    def test_missing_file_returns_422(self, auth_client):
        resp = auth_client.post(
            "/api/sow/upload",
            data={"methodology": "Waterfall"},
        )
        assert resp.status_code == 422

    def test_missing_methodology_returns_422(self, auth_client):
        resp = auth_client.post(
            "/api/sow/upload",
            files={"file": ("test.pdf", b"content", "application/pdf")},
        )
        assert resp.status_code == 422


# ── Protected auth endpoints ─────────────────────────────


_fake_user = None


def _get_fake_user():
    global _fake_user
    if _fake_user is None:
        from models import UserResponse

        _fake_user = UserResponse(
            id=1,
            email="test@example.com",
            full_name="Test User",
            username=None,
            name=None,
            role="consultant",
            is_active=True,
            created_at=datetime(2026, 1, 1),
            oid="fake-entra-oid-123",
        )
    return _fake_user


@pytest.fixture()
def auth_client(client):
    """TestClient with get_current_user overridden to return a fake user."""
    import main
    from auth import get_current_user

    main.app.dependency_overrides[get_current_user] = _get_fake_user
    yield client
    main.app.dependency_overrides.pop(get_current_user, None)


# ── POST /api/auth/logout ───────────────────────────────


class TestLogout:
    def test_success(self, auth_client):
        resp = auth_client.post("/api/auth/logout")
        assert resp.status_code == 200
        assert "message" in resp.json()

    def test_unauthenticated_returns_401(self, client):
        resp = client.post("/api/auth/logout")
        assert resp.status_code in (401, 403)


# ── GET /api/auth/me ─────────────────────────────────────


class TestMe:
    def test_success(self, auth_client):
        resp = auth_client.get("/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["role"] == "consultant"

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code in (401, 403)
