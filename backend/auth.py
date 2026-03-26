"""
Authentication utilities.

Responsibilities:
  - Password hashing / verification   (passlib + bcrypt)
  - JWT creation / decoding           (python-jose)
  - FastAPI dependency: get_current_user

Usage in a route:
    @router.get("/me")
    async def me(user=Depends(get_current_user)):
        ...
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

import database
from config import JWT_ALGORITHM, JWT_SECRET_KEY, JWT_TOKEN_EXPIRE_MINUTES
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from models import TokenData, UserResponse
from passlib.context import CryptContext

# ── Password hashing ─────────────────────────────────────────────────────────

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash of *password*."""
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    return _pwd_context.verify(plain, hashed)


# ── JWT ──────────────────────────────────────────────────────────────────────

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Encode *data* into a signed JWT with an expiry claim."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta if expires_delta else timedelta(minutes=JWT_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> TokenData:
    """Decode and validate *token*; raise 401 on failure."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id: int | None = payload.get("sub")
        email: str | None = payload.get("email")
        if user_id is None:
            raise credentials_exc
        return TokenData(user_id=int(user_id), email=email)
    except JWTError as err:
        raise credentials_exc from err


# ── FastAPI dependency ────────────────────────────────────────────────────────


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserResponse:
    """Resolve the Bearer token to a UserResponse.

    Inject via ``Depends(get_current_user)`` on any protected route.
    """
    token_data = decode_token(token)

    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, full_name, role, is_active, created_at
            FROM users
            WHERE id = $1
            """,
            token_data.user_id,
        )

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = UserResponse(**dict(row))

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    return user


CurrentUser = Annotated[UserResponse, Depends(get_current_user)]


async def get_current_active_user(current_user: CurrentUser) -> UserResponse:
    """Alias that makes role-checking easier to extend later."""
    return current_user
