"""Tests for Entra ID authentication: decode_token and get_current_user.

Uses locally-generated RSA keys to create test JWTs — never calls Microsoft.
"""

from __future__ import annotations

import time
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization

# ── RSA key pair (generated once per module) ────────────────────────────────
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_key = _private_key.public_key()

# PEM for python-jose to sign tokens
_private_pem = _private_key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
)

# JWK dict for the mocked JWKS endpoint
_public_numbers = _public_key.public_numbers()


def _int_to_base64url(n: int) -> str:
    """Encode an integer as unpadded base64url (for JWK fields)."""
    import base64

    byte_len = (n.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(n.to_bytes(byte_len, "big")).rstrip(b"=").decode()


_TEST_KID = "test-kid-001"
_TEST_CLIENT_ID = "test-client-id-000"

_jwk_public = {
    "kty": "RSA",
    "use": "sig",
    "kid": _TEST_KID,
    "n": _int_to_base64url(_public_numbers.n),
    "e": _int_to_base64url(_public_numbers.e),
}

_JWKS_RESPONSE = {"keys": [_jwk_public]}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_token(
    claims: dict | None = None,
    *,
    expired: bool = False,
    kid: str = _TEST_KID,
) -> str:
    """Create a signed RS256 JWT with sensible defaults."""
    now = int(time.time())
    payload = {
        "oid": "entra-oid-abc",
        "preferred_username": "alice@contoso.com",
        "name": "Alice Contoso",
        "aud": _TEST_CLIENT_ID,
        "iss": "https://login.microsoftonline.com/tenant/v2.0",
        "iat": now - 60,
        "exp": (now - 120) if expired else (now + 3600),
        "nbf": now - 60,
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, _private_pem, algorithm="RS256", headers={"kid": kid})


def _make_token_wrong_key(**kwargs) -> str:
    """Create a JWT signed with a DIFFERENT private key (signature mismatch)."""
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    now = int(time.time())
    payload = {
        "oid": "entra-oid-abc",
        "preferred_username": "alice@contoso.com",
        "name": "Alice Contoso",
        "aud": _TEST_CLIENT_ID,
        "iss": "https://login.microsoftonline.com/tenant/v2.0",
        "iat": now - 60,
        "exp": now + 3600,
        "nbf": now - 60,
    }
    payload.update(kwargs)
    return jwt.encode(payload, other_pem, algorithm="RS256", headers={"kid": _TEST_KID})


# ── Mock JWKS fetch ──────────────────────────────────────────────────────────


def _patch_jwks_and_client_id():
    """Return a combined patch context that mocks the JWKS HTTP call and client ID."""
    import auth

    # Reset cache so every test starts fresh
    auth._jwks_cache = {}
    auth._jwks_cache_expiry = 0

    mock_response = MagicMock()
    mock_response.json.return_value = _JWKS_RESPONSE
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    return (
        patch("auth.httpx.AsyncClient", return_value=mock_client),
        patch("auth.AZURE_AD_CLIENT_ID", _TEST_CLIENT_ID),
    )


# ── decode_token tests ───────────────────────────────────────────────────────


class TestDecodeToken:
    """Unit tests for auth.decode_token — validates RS256 JWTs against JWKS."""

    @pytest.mark.asyncio
    async def test_valid_token_returns_claims(self):
        from auth import decode_token

        token = _make_token()
        p1, p2 = _patch_jwks_and_client_id()
        with p1, p2:
            claims = await decode_token(token)

        assert claims["oid"] == "entra-oid-abc"
        assert claims["preferred_username"] == "alice@contoso.com"
        assert claims["name"] == "Alice Contoso"

    @pytest.mark.asyncio
    async def test_expired_token_raises_401(self):
        from auth import decode_token
        from fastapi import HTTPException

        token = _make_token(expired=True)
        p1, p2 = _patch_jwks_and_client_id()
        with p1, p2, pytest.raises(HTTPException) as exc_info:
            await decode_token(token)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_signature_raises_401(self):
        from auth import decode_token
        from fastapi import HTTPException

        token = _make_token_wrong_key()
        p1, p2 = _patch_jwks_and_client_id()
        with p1, p2, pytest.raises(HTTPException) as exc_info:
            await decode_token(token)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_audience_raises_401(self):
        from auth import decode_token
        from fastapi import HTTPException

        token = _make_token(claims={"aud": "wrong-client-id"})
        p1, p2 = _patch_jwks_and_client_id()
        with p1, p2, pytest.raises(HTTPException) as exc_info:
            await decode_token(token)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_unknown_kid_triggers_jwks_refresh(self):
        from auth import decode_token

        token = _make_token(kid="unknown-kid-999")
        p1, p2 = _patch_jwks_and_client_id()
        with p1 as mock_client_cls, p2:
            from fastapi import HTTPException

            # Token's kid doesn't match our JWKS key, so decode should fail
            # after refreshing the cache
            with pytest.raises(HTTPException) as exc_info:
                await decode_token(token)

            assert exc_info.value.status_code == 401
            # Verify JWKS was fetched twice (initial + refresh)
            mock_instance = mock_client_cls.return_value
            assert mock_instance.get.call_count == 2


# ── get_current_user tests (missing oid + upsert) ────────────────────────────


class TestGetCurrentUserOidValidation:
    """Verify that tokens without an oid claim are rejected."""

    @pytest.mark.asyncio
    async def test_missing_oid_raises_401(self):
        from auth import get_current_user
        from fastapi import HTTPException

        # We patch decode_token to return claims without oid,
        # since the real decode_token would succeed (oid is not checked there)
        claims_without_oid = {
            "preferred_username": "alice@contoso.com",
            "name": "Alice",
            "aud": _TEST_CLIENT_ID,
        }
        with (
            patch("auth.decode_token", new_callable=AsyncMock, return_value=claims_without_oid),
            pytest.raises(HTTPException) as exc_info,
        ):
            await get_current_user(token="fake-token")

        assert exc_info.value.status_code == 401
        assert "oid" in exc_info.value.detail.lower()


class TestUserUpsert:
    """Verify first-login creates a user and second login returns existing."""

    @pytest.mark.asyncio
    async def test_first_login_creates_user(self):
        import database
        from auth import get_current_user

        claims = {
            "oid": "new-user-oid",
            "preferred_username": "bob@contoso.com",
            "name": "Bob Builder",
            "roles": [],
        }

        # Mock the DB row returned by INSERT ... RETURNING
        fake_row = {
            "id": 42,
            "email": "bob@contoso.com",
            "full_name": "Bob Builder",
            "username": None,
            "name": "Bob Builder",
            "role": "consultant",
            "is_active": True,
            "created_at": datetime(2026, 1, 1),
            "oid": "new-user-oid",
        }

        conn = AsyncMock()
        conn.fetchrow.return_value = fake_row
        ctx = AsyncMock()
        ctx.__aenter__.return_value = conn
        ctx.__aexit__.return_value = None

        with (
            patch("auth.decode_token", new_callable=AsyncMock, return_value=claims),
            patch.object(database, "pg_pool", MagicMock()),
        ):
            database.pg_pool.acquire.return_value = ctx
            user = await get_current_user(token="fake-token")

        assert user.id == 42
        assert user.email == "bob@contoso.com"
        assert user.oid == "new-user-oid"
        assert user.role == "consultant"
        # Verify the INSERT was called
        conn.fetchrow.assert_called_once()
        sql = conn.fetchrow.call_args[0][0]
        assert "INSERT INTO users" in sql
        assert "ON CONFLICT (oid) DO UPDATE" in sql

    @pytest.mark.asyncio
    async def test_second_login_returns_existing_user(self):
        import database
        from auth import get_current_user

        claims = {
            "oid": "existing-oid",
            "preferred_username": "carol@contoso.com",
            "name": "Carol Existing",
            "roles": ["admin"],
        }

        # Simulate the upsert returning the existing row (updated_at changes)
        existing_row = {
            "id": 7,
            "email": "carol@contoso.com",
            "full_name": "Carol Existing",
            "username": "carol",
            "name": "Carol Existing",
            "role": "admin",
            "is_active": True,
            "created_at": datetime(2025, 6, 1),
            "oid": "existing-oid",
        }

        conn = AsyncMock()
        conn.fetchrow.return_value = existing_row
        ctx = AsyncMock()
        ctx.__aenter__.return_value = conn
        ctx.__aexit__.return_value = None

        with (
            patch("auth.decode_token", new_callable=AsyncMock, return_value=claims),
            patch.object(database, "pg_pool", MagicMock()),
        ):
            database.pg_pool.acquire.return_value = ctx
            user = await get_current_user(token="fake-token")

        assert user.id == 7
        assert user.oid == "existing-oid"
        assert user.role == "admin"

    @pytest.mark.asyncio
    async def test_inactive_user_raises_403(self):
        import database
        from auth import get_current_user
        from fastapi import HTTPException

        claims = {
            "oid": "inactive-oid",
            "preferred_username": "dan@contoso.com",
            "name": "Dan Inactive",
            "roles": [],
        }

        inactive_row = {
            "id": 99,
            "email": "dan@contoso.com",
            "full_name": "Dan Inactive",
            "username": None,
            "name": "Dan Inactive",
            "role": "consultant",
            "is_active": False,
            "created_at": datetime(2026, 1, 1),
            "oid": "inactive-oid",
        }

        conn = AsyncMock()
        conn.fetchrow.return_value = inactive_row
        ctx = AsyncMock()
        ctx.__aenter__.return_value = conn
        ctx.__aexit__.return_value = None

        with (
            patch("auth.decode_token", new_callable=AsyncMock, return_value=claims),
            patch.object(database, "pg_pool", MagicMock()),
            pytest.raises(HTTPException) as exc_info,
        ):
            database.pg_pool.acquire.return_value = ctx
            await get_current_user(token="fake-token")

        assert exc_info.value.status_code == 403
