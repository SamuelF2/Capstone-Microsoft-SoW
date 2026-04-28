"""
Authentication utilities — Microsoft Entra ID.

Validates Entra-issued JWTs using Microsoft's JWKS (public keys).
Auto-creates users in the local database on first sign-in.

Usage in a route:
    @router.get("/me")
    async def me(user=Depends(get_current_user)):
        ...
"""

from __future__ import annotations

import logging
import time
from typing import Annotated

import database
import httpx
from config import AZURE_AD_CLIENT_ID, AZURE_AD_JWKS_URL
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from models import UserResponse

logger = logging.getLogger(__name__)

# ── Entra ID JWKS (RS256) ───────────────────────────────────────────────────

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="", auto_error=False)

_jwks_cache: dict = {}
_jwks_cache_expiry: float = 0
_JWKS_CACHE_DURATION = 3600  # 1 hour


async def _get_jwks(force_refresh: bool = False) -> dict:
    """Fetch and cache Microsoft's JWKS (public signing keys).

    Re-fetches if the cache is stale or if *force_refresh* is True
    (e.g. when a token's kid is not found in the cached keys).
    """
    global _jwks_cache, _jwks_cache_expiry

    if not force_refresh and time.time() < _jwks_cache_expiry and _jwks_cache:
        return _jwks_cache

    async with httpx.AsyncClient() as client:
        response = await client.get(AZURE_AD_JWKS_URL)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_expiry = time.time() + _JWKS_CACHE_DURATION

    return _jwks_cache


async def _find_rsa_key(token: str) -> dict:
    """Match the token's kid to a key in the JWKS. Refreshes cache on miss."""
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    # Try cached keys first
    jwks = await _get_jwks()
    for key in jwks.get("keys", []):
        if key["kid"] == kid:
            return key

    # kid not found — Microsoft may have rotated keys; refresh and retry
    jwks = await _get_jwks(force_refresh=True)
    for key in jwks.get("keys", []):
        if key["kid"] == kid:
            return key

    return {}


async def decode_token(token: str) -> dict:
    """Validate a Microsoft Entra-issued RS256 JWT and return its claims.

    Validates: signature (RS256 via JWKS), audience, expiry.
    Does NOT validate issuer — intentional for /common multi-tenant authority
    where each tenant has a different issuer value. Security relies on
    signature + audience + expiry validation.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        rsa_key = await _find_rsa_key(token)
        if not rsa_key:
            raise credentials_exc

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=AZURE_AD_CLIENT_ID,
            options={
                "verify_iss": False,  # /common tokens have varying issuers
                "verify_aud": True,
                "verify_exp": True,
            },
        )
        return payload

    except JWTError as err:
        logger.warning("JWT validation failed: %s", err)
        raise credentials_exc from err


# ── FastAPI dependency ────────────────────────────────────────────────────────


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserResponse:
    """Resolve the Bearer token to a UserResponse.

    1. Validate the Entra JWT
    2. Extract user claims (oid, email, name, roles)
    3. Upsert the user in the local database (create on first login)
    4. Return UserResponse
    """
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = await decode_token(token)

    oid = claims.get("oid")
    if not oid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required 'oid' claim",
        )

    email = claims.get("preferred_username") or claims.get("email", "")
    name = claims.get("name", "")
    roles = claims.get("roles", [])
    role = roles[0].lower() if roles else "consultant"

    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (oid, email, full_name, name, role, is_active)
            VALUES ($1, $2, $3, $3, $4, TRUE)
            ON CONFLICT (oid) DO UPDATE SET
                email      = EXCLUDED.email,
                full_name  = EXCLUDED.full_name,
                name       = EXCLUDED.name,
                updated_at = NOW()
                -- role is intentionally NOT updated here so manual role
                -- assignments (e.g. via PATCH /api/users/me/role) persist
                -- across logins. The JWT role claim is only used on first insert.
            RETURNING id, email, full_name, username, name, role, is_active, created_at, oid
            """,
            oid,
            email,
            name,
            role,
        )

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upsert user",
        )

    user = UserResponse(**dict(row))

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    return user


CurrentUser = Annotated[UserResponse, Depends(get_current_user)]
