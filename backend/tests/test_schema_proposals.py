"""Tests for the schema-proposal admin endpoints in ``routers/ai.py``.

These mirror the auth_client / TestClient pattern from ``test_api.py`` but
override ``get_current_user`` with a system-admin fake user so the admin
gate inside each endpoint passes. Non-admin coverage uses the existing
``auth_client`` fixture (consultant role) which exercises the 403 path.

The ML service is mocked at the ``httpx.AsyncClient`` boundary — we don't
spin up the GraphRAG container for unit tests.
"""

from contextlib import asynccontextmanager
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@asynccontextmanager
async def _noop_lifespan(app):
    yield


@pytest.fixture()
def client():
    import database
    import main

    original_lifespan = main.app.router.lifespan_context
    main.app.router.lifespan_context = _noop_lifespan
    database.neo4j_driver = MagicMock()
    database.pg_pool = MagicMock()

    with TestClient(main.app) as c:
        yield c

    main.app.router.lifespan_context = original_lifespan


def _make_admin_user():
    from models import UserResponse

    return UserResponse(
        id=99,
        email="admin@example.com",
        full_name="Admin User",
        username=None,
        name=None,
        role="system-admin",
        is_active=True,
        created_at=datetime(2026, 1, 1),
        oid="fake-entra-oid-admin",
    )


def _make_consultant_user():
    from models import UserResponse

    return UserResponse(
        id=1,
        email="user@example.com",
        full_name="Regular User",
        username=None,
        name=None,
        role="consultant",
        is_active=True,
        created_at=datetime(2026, 1, 1),
        oid="fake-entra-oid-consultant",
    )


@pytest.fixture()
def admin_client(client):
    """TestClient authenticated as a system-admin."""
    import main
    from auth import get_current_user

    main.app.dependency_overrides[get_current_user] = _make_admin_user
    yield client
    main.app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture()
def non_admin_client(client):
    """TestClient authenticated as a non-admin (consultant)."""
    import main
    from auth import get_current_user

    main.app.dependency_overrides[get_current_user] = _make_consultant_user
    yield client
    main.app.dependency_overrides.pop(get_current_user, None)


def _mock_httpx(method: str, *, status_code: int = 200, json_data: dict | list | None = None):
    """Build an ``AsyncClient`` mock that returns the given response.

    Patches ``backend.routers.ai.httpx.AsyncClient`` so both ``_proxy_get``
    and ``_proxy_post`` see the same fake. ``method`` is ``"get"`` or
    ``"post"``.
    """
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_data if json_data is not None else {}
    response.raise_for_status = MagicMock()

    client_mock = AsyncMock()
    if method == "get":
        client_mock.get = AsyncMock(return_value=response)
    else:
        client_mock.post = AsyncMock(return_value=response)

    ctx = AsyncMock()
    ctx.__aenter__.return_value = client_mock
    ctx.__aexit__.return_value = None

    AsyncClientCls = MagicMock(return_value=ctx)
    return AsyncClientCls, client_mock


# ── GET /api/ai/schema/proposals ─────────────────────────────────────────


class TestGetSchemaProposals:
    def test_non_admin_gets_403(self, non_admin_client):
        with patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"):
            resp = non_admin_client.get("/api/ai/schema/proposals")
        assert resp.status_code == 403
        assert "admin" in resp.json()["detail"].lower()

    def test_no_filters_omits_query_params(self, admin_client):
        """Default page load sends no kind/status/sort filters.

        Regression: httpx serialised ``None`` values as empty strings
        (``?status=&kind=&sort=``), which the ML endpoint's regex
        validators rejected with 422. ``_clean_params`` in the proxy
        drops them so the upstream URL stays clean.
        """
        AsyncClientCls, client_mock = _mock_httpx("get", json_data=[])
        with (
            patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"),
            patch("routers.ai.httpx.AsyncClient", AsyncClientCls),
        ):
            resp = admin_client.get("/api/ai/schema/proposals")
        assert resp.status_code == 200
        forwarded = client_mock.get.call_args.kwargs["params"] or {}
        assert "status" not in forwarded
        assert "kind" not in forwarded
        assert "sort" not in forwarded

    def test_admin_forwards_to_ml(self, admin_client):
        rows = [
            {
                "id": "abc123",
                "kind": "node",
                "label": "Stakeholder",
                "confidence": 0.92,
                "accepted": False,
                "rejected": False,
                "tags": [],
                "uses": 4,
                "source": "msa.pdf",
                "source_section": None,
                "note": None,
                "description": "A project stakeholder",
                "proposed_at": "2026-04-29T00:00:00+00:00",
                "reviewed_at": None,
                "reviewed_by": None,
            }
        ]
        AsyncClientCls, client_mock = _mock_httpx("get", json_data=rows)
        with (
            patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"),
            patch("routers.ai.httpx.AsyncClient", AsyncClientCls),
        ):
            resp = admin_client.get(
                "/api/ai/schema/proposals?status=pending&kind=node&sort=confidence-desc"
            )
        assert resp.status_code == 200
        assert resp.json() == rows
        # Verify forwarded query params
        call_kwargs = client_mock.get.call_args.kwargs
        assert call_kwargs["params"]["status"] == "pending"
        assert call_kwargs["params"]["kind"] == "node"
        assert call_kwargs["params"]["sort"] == "confidence-desc"

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/ai/schema/proposals")
        assert resp.status_code in (401, 403)


# ── POST /api/ai/schema/proposals/{id}/approve ───────────────────────────


class TestApproveProposal:
    def test_non_admin_gets_403(self, non_admin_client):
        with patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"):
            resp = non_admin_client.post(
                "/api/ai/schema/proposals/abc123/approve",
                json={"note": "looks fine"},
            )
        assert resp.status_code == 403

    def test_admin_forwards_with_server_stamped_reviewer(self, admin_client):
        AsyncClientCls, client_mock = _mock_httpx(
            "post",
            json_data={"id": "abc123", "accepted": True, "rejected": False},
        )
        with (
            patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"),
            patch("routers.ai.httpx.AsyncClient", AsyncClientCls),
        ):
            resp = admin_client.post(
                "/api/ai/schema/proposals/abc123/approve",
                json={"note": "lgtm", "reviewed_by": "spoofed"},
            )
        assert resp.status_code == 200
        # The server overrides reviewed_by with the caller's email.
        body_sent = client_mock.post.call_args.kwargs["json"]
        assert body_sent["reviewed_by"] == "admin@example.com"
        assert body_sent["note"] == "lgtm"


# ── POST /api/ai/schema/proposals/{id}/reject ────────────────────────────


class TestRejectProposal:
    def test_non_admin_gets_403(self, non_admin_client):
        with patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"):
            resp = non_admin_client.post(
                "/api/ai/schema/proposals/abc123/reject",
                json={"note": "duplicate"},
            )
        assert resp.status_code == 403

    def test_admin_forwards_with_server_stamped_reviewer(self, admin_client):
        AsyncClientCls, client_mock = _mock_httpx(
            "post",
            json_data={"id": "abc123", "accepted": False, "rejected": True},
        )
        with (
            patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"),
            patch("routers.ai.httpx.AsyncClient", AsyncClientCls),
        ):
            resp = admin_client.post(
                "/api/ai/schema/proposals/abc123/reject",
                json={"tags": ["duplicate"]},
            )
        assert resp.status_code == 200
        body_sent = client_mock.post.call_args.kwargs["json"]
        assert body_sent["reviewed_by"] == "admin@example.com"
        assert body_sent["tags"] == ["duplicate"]


# ── POST /api/ai/schema/proposals/bulk-review ────────────────────────────


class TestBulkReview:
    def test_non_admin_gets_403(self, non_admin_client):
        with patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"):
            resp = non_admin_client.post(
                "/api/ai/schema/proposals/bulk-review",
                json={"ids": ["a", "b"], "action": "approve"},
            )
        assert resp.status_code == 403

    def test_admin_forwards_full_payload(self, admin_client):
        AsyncClientCls, client_mock = _mock_httpx(
            "post",
            json_data={"updated": 2, "ids": ["a", "b"], "action": "reject"},
        )
        with (
            patch("routers.ai.GRAPHRAG_API_URL", "http://ml.test"),
            patch("routers.ai.httpx.AsyncClient", AsyncClientCls),
        ):
            resp = admin_client.post(
                "/api/ai/schema/proposals/bulk-review",
                json={"ids": ["a", "b"], "action": "reject", "note": "stale"},
            )
        assert resp.status_code == 200
        assert resp.json()["updated"] == 2
        body_sent = client_mock.post.call_args.kwargs["json"]
        assert body_sent["ids"] == ["a", "b"]
        assert body_sent["action"] == "reject"
        assert body_sent["reviewed_by"] == "admin@example.com"


# ── ML unconfigured ──────────────────────────────────────────────────────


class TestMlUnavailable:
    def test_503_when_ml_unconfigured(self, admin_client):
        with patch("routers.ai.GRAPHRAG_API_URL", ""):
            resp = admin_client.get("/api/ai/schema/proposals")
        assert resp.status_code == 503
        detail = resp.json()["detail"]
        assert detail["retryable"] is False
        assert "not configured" in detail["message"]


# ── X-Role-Override testing affordance ────────────────────────────────────


class TestRoleOverrideHeader:
    """The frontend's testing-only role override is mirrored to the backend
    via ``X-Role-Override`` so admin-gated routes are reachable while the
    JWT-derived role is something else.

    These tests exercise ``get_current_user`` directly because the existing
    TestClient fixtures use ``dependency_overrides`` to bypass auth entirely
    — that path can't validate header handling. We mock JWT decoding and
    the user upsert so the rest of the function runs unchanged.
    """

    @pytest.mark.asyncio
    async def test_admin_override_swaps_role_to_system_admin(self):
        from auth import get_current_user

        async def fake_decode(_token):
            return {
                "oid": "fake-oid-123",
                "preferred_username": "consultant@example.com",
                "name": "Consultant User",
                "roles": ["consultant"],
            }

        conn = AsyncMock()
        conn.fetchrow.return_value = {
            "id": 1,
            "email": "consultant@example.com",
            "full_name": "Consultant User",
            "username": None,
            "name": "Consultant User",
            "role": "consultant",
            "is_active": True,
            "created_at": datetime(2026, 1, 1),
            "oid": "fake-oid-123",
        }
        ctx = AsyncMock()
        ctx.__aenter__.return_value = conn
        ctx.__aexit__.return_value = None
        pool = MagicMock()
        pool.acquire.return_value = ctx

        with (
            patch("auth.decode_token", fake_decode),
            patch("database.pg_pool", pool),
        ):
            user = await get_current_user(token="fake.jwt", role_override="system-admin")
        assert user.role == "system-admin"

    @pytest.mark.asyncio
    async def test_unknown_override_is_ignored(self):
        # A bogus header value must not perturb the JWT-derived role.
        from auth import get_current_user

        async def fake_decode(_token):
            return {
                "oid": "fake-oid-456",
                "preferred_username": "consultant@example.com",
                "name": "Consultant",
                "roles": ["consultant"],
            }

        conn = AsyncMock()
        conn.fetchrow.return_value = {
            "id": 2,
            "email": "consultant@example.com",
            "full_name": "Consultant",
            "username": None,
            "name": "Consultant",
            "role": "consultant",
            "is_active": True,
            "created_at": datetime(2026, 1, 1),
            "oid": "fake-oid-456",
        }
        ctx = AsyncMock()
        ctx.__aenter__.return_value = conn
        ctx.__aexit__.return_value = None
        pool = MagicMock()
        pool.acquire.return_value = ctx

        with (
            patch("auth.decode_token", fake_decode),
            patch("database.pg_pool", pool),
        ):
            user = await get_current_user(token="fake.jwt", role_override="sysadmin")
        assert user.role == "consultant"

    @pytest.mark.asyncio
    async def test_no_override_leaves_role_intact(self):
        from auth import get_current_user

        async def fake_decode(_token):
            return {
                "oid": "fake-oid-789",
                "preferred_username": "cpl@example.com",
                "name": "CPL",
                "roles": ["cpl"],
            }

        conn = AsyncMock()
        conn.fetchrow.return_value = {
            "id": 3,
            "email": "cpl@example.com",
            "full_name": "CPL",
            "username": None,
            "name": "CPL",
            "role": "cpl",
            "is_active": True,
            "created_at": datetime(2026, 1, 1),
            "oid": "fake-oid-789",
        }
        ctx = AsyncMock()
        ctx.__aenter__.return_value = conn
        ctx.__aexit__.return_value = None
        pool = MagicMock()
        pool.acquire.return_value = ctx

        with (
            patch("auth.decode_token", fake_decode),
            patch("database.pg_pool", pool),
        ):
            user = await get_current_user(token="fake.jwt", role_override=None)
        assert user.role == "cpl"
