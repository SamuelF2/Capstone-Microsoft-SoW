"""
Auth router  —  /api/auth/...

Endpoints:
  POST /api/auth/logout  — Acknowledge logout (MSAL handles token cleanup client-side)
  GET  /api/auth/me      — Return the currently authenticated user
"""

from __future__ import annotations

from auth import CurrentUser
from fastapi import APIRouter
from models import UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Logout ────────────────────────────────────────────────────────────────────


@router.post(
    "/logout",
    status_code=200,
    summary="Log out",
)
async def logout(current_user: CurrentUser) -> dict:
    """Acknowledge logout. MSAL handles token cleanup client-side."""
    return {"message": f"User {current_user.email} logged out successfully"}


# ── Me ────────────────────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Return the currently authenticated user",
)
async def me(current_user: CurrentUser) -> UserResponse:
    """Return the authenticated user's profile."""
    return current_user
