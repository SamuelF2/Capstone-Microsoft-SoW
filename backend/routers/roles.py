"""
Roles router — /api/roles/...

CRUD for role_definitions. System roles can have their display_name,
description, and permissions edited but cannot be deleted or have their
role_key changed. Custom roles are fully editable and deletable.

Endpoints
---------
GET    /api/roles              List all role definitions
GET    /api/roles/{role_key}   Get a single role definition
POST   /api/roles              Create a custom role (system-admin only)
PATCH  /api/roles/{role_key}   Update a role's display name/description/permissions
DELETE /api/roles/{role_key}   Delete a custom role (system roles are protected)
"""

from __future__ import annotations

import json

import database
from auth import CurrentUser
from fastapi import APIRouter, HTTPException, status
from models import RoleCreate, RoleDefinition, RoleUpdate

router = APIRouter(prefix="/api/roles", tags=["roles"])


def _require_admin(current_user) -> None:
    if (current_user.role or "").lower() != "system-admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system admins can manage roles",
        )


@router.get("", response_model=list[RoleDefinition], summary="List all role definitions")
async def list_roles(current_user: CurrentUser) -> list[RoleDefinition]:
    async with database.pg_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM role_definitions ORDER BY is_system DESC, display_name"
        )
    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("permissions"), str):
            d["permissions"] = json.loads(d["permissions"])
        result.append(RoleDefinition(**d))
    return result


@router.get("/{role_key}", response_model=RoleDefinition, summary="Get a single role definition")
async def get_role(role_key: str, current_user: CurrentUser) -> RoleDefinition:
    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM role_definitions WHERE role_key = $1", role_key
        )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    d = dict(row)
    if isinstance(d.get("permissions"), str):
        d["permissions"] = json.loads(d["permissions"])
    return RoleDefinition(**d)


@router.get(
    "/me/role",
    summary="Get the current user's role from the database",
)
async def get_my_role(current_user: CurrentUser) -> dict:
    """Returns the role as stored in the database, not from the JWT."""
    return {"role": current_user.role, "user_id": current_user.id}


@router.post(
    "",
    response_model=RoleDefinition,
    status_code=status.HTTP_201_CREATED,
    summary="Create a custom role (system-admin only)",
)
async def create_role(payload: RoleCreate, current_user: CurrentUser) -> RoleDefinition:
    _require_admin(current_user)
    async with database.pg_pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM role_definitions WHERE role_key = $1", payload.role_key
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Role '{payload.role_key}' already exists",
            )
        row = await conn.fetchrow(
            """
            INSERT INTO role_definitions (role_key, display_name, description, permissions, is_system, created_by)
            VALUES ($1, $2, $3, $4::jsonb, FALSE, $5)
            RETURNING *
            """,
            payload.role_key,
            payload.display_name,
            payload.description,
            json.dumps(payload.permissions),
            current_user.id,
        )
    d = dict(row)
    if isinstance(d.get("permissions"), str):
        d["permissions"] = json.loads(d["permissions"])
    return RoleDefinition(**d)


@router.patch(
    "/{role_key}",
    response_model=RoleDefinition,
    summary="Update a role's display name, description, or permissions",
)
async def update_role(
    role_key: str, payload: RoleUpdate, current_user: CurrentUser
) -> RoleDefinition:
    _require_admin(current_user)
    async with database.pg_pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM role_definitions WHERE role_key = $1", role_key
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        updates = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not updates:
            d = dict(existing)
            if isinstance(d.get("permissions"), str):
                d["permissions"] = json.loads(d["permissions"])
            return RoleDefinition(**d)

        if "permissions" in updates:
            updates["permissions"] = json.dumps(updates["permissions"])

        updates["updated_at"] = "NOW()"
        set_parts = []
        params = []
        for i, (col, val) in enumerate(updates.items()):
            if val == "NOW()":
                set_parts.append(f"{col} = NOW()")
            else:
                params.append(val)
                cast = "::jsonb" if col == "permissions" else ""
                set_parts.append(f"{col} = ${len(params)}{cast}")

        params.append(role_key)
        row = await conn.fetchrow(
            f"UPDATE role_definitions SET {', '.join(set_parts)} WHERE role_key = ${len(params)} RETURNING *",
            *params,
        )
    d = dict(row)
    if isinstance(d.get("permissions"), str):
        d["permissions"] = json.loads(d["permissions"])
    return RoleDefinition(**d)


@router.delete(
    "/{role_key}",
    status_code=status.HTTP_200_OK,
    summary="Delete a custom role (system roles are protected)",
)
async def delete_role(role_key: str, current_user: CurrentUser) -> dict:
    _require_admin(current_user)
    async with database.pg_pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT is_system FROM role_definitions WHERE role_key = $1", role_key
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        if existing["is_system"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="System roles cannot be deleted. You can edit their display name and permissions.",
            )

        users_with_role = await conn.fetchval(
            "SELECT count(*) FROM users WHERE role = $1", role_key
        )
        if users_with_role:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Role '{role_key}' is assigned to {users_with_role} user(s) and cannot be deleted",
            )

        await conn.execute("DELETE FROM role_definitions WHERE role_key = $1", role_key)
    return {"deleted": role_key}
