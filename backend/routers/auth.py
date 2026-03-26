"""
Auth router  —  /api/auth/...

Endpoints:
  POST /api/auth/register  — Create a new user account
  POST /api/auth/login     — Authenticate and receive a JWT
  POST /api/auth/logout    — Acknowledge logout (token invalidation is client-side)
  GET  /api/auth/me        — Return the currently authenticated user
"""

from __future__ import annotations

from datetime import timedelta

import database
from auth import (
    CurrentUser,
    create_access_token,
    hash_password,
    verify_password,
)
from config import JWT_TOKEN_EXPIRE_MINUTES
from fastapi import APIRouter, HTTPException, status
from models import Token, UserCreate, UserLogin, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Register ─────────────────────────────────────────────────────────────────


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(payload: UserCreate) -> UserResponse:
    """Create a new user.

    Returns the created user record (no password).
    Raises **409** if the e-mail is already registered.
    """
    async with database.pg_pool.acquire() as conn:
        existing = await conn.fetchval("SELECT id FROM users WHERE email = $1", payload.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with that e-mail already exists",
            )

        row = await conn.fetchrow(
            """
            INSERT INTO users (email, hashed_password, full_name)
            VALUES ($1, $2, $3)
            RETURNING id, email, full_name, role, is_active, created_at
            """,
            payload.email,
            hash_password(payload.password),
            payload.full_name,
        )

    return UserResponse(**dict(row))


# ── Login ─────────────────────────────────────────────────────────────────────


@router.post(
    "/login",
    response_model=Token,
    summary="Log in and receive a JWT bearer token",
)
async def login(payload: UserLogin) -> Token:
    """Authenticate with e-mail and password.

    Returns a **Token** that contains:
    - ``access_token`` — JWT to include as ``Authorization: Bearer <token>``
    - ``token_type``   — always ``"bearer"``
    - ``user``         — safe user record

    Raises **401** for invalid credentials or inactive accounts.
    """
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, full_name, role, is_active, created_at, hashed_password
            FROM users
            WHERE email = $1
            """,
            payload.email,
        )

    if row is None or not verify_password(payload.password, row["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect e-mail or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_data = dict(row)
    if not user_data["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive — contact your administrator",
        )

    access_token = create_access_token(
        data={"sub": str(user_data["id"]), "email": user_data["email"]},
        expires_delta=timedelta(minutes=JWT_TOKEN_EXPIRE_MINUTES),
    )

    user = UserResponse(
        id=user_data["id"],
        email=user_data["email"],
        full_name=user_data["full_name"],
        role=user_data["role"],
        is_active=user_data["is_active"],
        created_at=user_data["created_at"],
    )

    return Token(access_token=access_token, token_type="bearer", user=user)


# ── Logout ────────────────────────────────────────────────────────────────────


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Log out (client should discard the token)",
)
async def logout(current_user: CurrentUser) -> dict:
    """Signal a logout.

    JWT tokens are stateless — the client is responsible for discarding the
    token after this call. A server-side token blacklist can be added here
    when session revocation is required.
    """
    # TODO: persist token jti to a Redis/DB blocklist for true server-side revocation.
    return {"message": f"User {current_user.email} logged out successfully"}


# ── Me ────────────────────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Return the currently authenticated user",
)
async def me(current_user: CurrentUser) -> UserResponse:
    """Verify the token and return the associated user record."""
    return current_user
