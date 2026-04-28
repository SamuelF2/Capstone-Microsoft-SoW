"""
Per-SoW roles and collaborators router — /api/sow/{sow_id}/roles and
/api/sow/{sow_id}/collaborators

Endpoints
---------
  GET    /api/sow/{sow_id}/roles                      List SoW-scoped roles
  POST   /api/sow/{sow_id}/roles                      Create a SoW-scoped role
  PATCH  /api/sow/{sow_id}/roles/{role_key}            Update a SoW-scoped role
  DELETE /api/sow/{sow_id}/roles/{role_key}            Delete a SoW-scoped role

  GET    /api/sow/{sow_id}/collaborators               List collaborators
  POST   /api/sow/{sow_id}/collaborators               Add a collaborator
  PATCH  /api/sow/{sow_id}/collaborators/{user_id}     Change collaborator role
  DELETE /api/sow/{sow_id}/collaborators/{user_id}     Remove a collaborator
"""

from __future__ import annotations

import json

import database
from auth import CurrentUser
from fastapi import APIRouter, HTTPException, status
from models import (
    CollaboratorAdd,
    CollaboratorResponse,
    CollaboratorUpdate,
    SoWRoleCreate,
    SoWRoleDefinition,
    SoWRoleUpdate,
)
from utils.db_helpers import require_collaborator, require_sow_manager, seed_collaboration
from pydantic import BaseModel

router = APIRouter(prefix="/api/sow", tags=["sow-roles"])

_PROTECTED_ROLES = {"sow-manager", "reviewer", "viewer"}


# ── SoW Role endpoints ────────────────────────────────────────────────────────


@router.get(
    "/{sow_id}/roles",
    response_model=list[SoWRoleDefinition],
    summary="List all roles defined for a SoW",
)
async def list_sow_roles(sow_id: int, current_user: CurrentUser) -> list[SoWRoleDefinition]:
    async with database.pg_pool.acquire() as conn:
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        rows = await conn.fetch(
            "SELECT * FROM sow_role_definitions WHERE sow_id = $1 ORDER BY created_at",
            sow_id,
        )
    return [
        SoWRoleDefinition(
            id=r["id"],
            sow_id=r["sow_id"],
            role_key=r["role_key"],
            display_name=r["display_name"],
            description=r["description"],
            permissions=r["permissions"] if isinstance(r["permissions"], list)
                else json.loads(r["permissions"]),
            created_by=r["created_by"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.post(
    "/{sow_id}/roles",
    response_model=SoWRoleDefinition,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new role for a SoW (sow-manager only)",
)
async def create_sow_role(
    sow_id: int,
    payload: SoWRoleCreate,
    current_user: CurrentUser,
) -> SoWRoleDefinition:
    async with database.pg_pool.acquire() as conn:
        await require_sow_manager(conn, sow_id=sow_id, user_id=current_user.id)

        existing = await conn.fetchval(
            "SELECT 1 FROM sow_role_definitions WHERE sow_id = $1 AND role_key = $2",
            sow_id,
            payload.role_key,
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Role '{payload.role_key}' already exists on this SoW",
            )

        row = await conn.fetchrow(
            """
            INSERT INTO sow_role_definitions
                (sow_id, role_key, display_name, description, permissions, created_by)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            RETURNING *
            """,
            sow_id,
            payload.role_key,
            payload.display_name,
            payload.description,
            json.dumps(payload.permissions),
            current_user.id,
        )

    return SoWRoleDefinition(
        id=row["id"],
        sow_id=row["sow_id"],
        role_key=row["role_key"],
        display_name=row["display_name"],
        description=row["description"],
        permissions=row["permissions"] if isinstance(row["permissions"], list)
            else json.loads(row["permissions"]),
        created_by=row["created_by"],
        created_at=row["created_at"],
    )


@router.patch(
    "/{sow_id}/roles/{role_key}",
    response_model=SoWRoleDefinition,
    summary="Update a SoW-scoped role (sow-manager only)",
)
async def update_sow_role(
    sow_id: int,
    role_key: str,
    payload: SoWRoleUpdate,
    current_user: CurrentUser,
) -> SoWRoleDefinition:
    async with database.pg_pool.acquire() as conn:
        await require_sow_manager(conn, sow_id=sow_id, user_id=current_user.id)

        existing = await conn.fetchrow(
            "SELECT * FROM sow_role_definitions WHERE sow_id = $1 AND role_key = $2",
            sow_id,
            role_key,
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        updates = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not updates:
            return SoWRoleDefinition(
                id=existing["id"],
                sow_id=existing["sow_id"],
                role_key=existing["role_key"],
                display_name=existing["display_name"],
                description=existing["description"],
                permissions=existing["permissions"] if isinstance(existing["permissions"], list)
                    else json.loads(existing["permissions"]),
                created_by=existing["created_by"],
                created_at=existing["created_at"],
            )

        set_parts = []
        params = []
        for col, val in updates.items():
            params.append(json.dumps(val) if col == "permissions" else val)
            cast = "::jsonb" if col == "permissions" else ""
            set_parts.append(f"{col} = ${len(params)}{cast}")

        set_parts.append("updated_at = NOW()")
        params.extend([sow_id, role_key])

        row = await conn.fetchrow(
            f"""
            UPDATE sow_role_definitions
            SET    {', '.join(set_parts)}
            WHERE  sow_id = ${len(params) - 1} AND role_key = ${len(params)}
            RETURNING *
            """,
            *params,
        )

    return SoWRoleDefinition(
        id=row["id"],
        sow_id=row["sow_id"],
        role_key=row["role_key"],
        display_name=row["display_name"],
        description=row["description"],
        permissions=row["permissions"] if isinstance(row["permissions"], list)
            else json.loads(row["permissions"]),
        created_by=row["created_by"],
        created_at=row["created_at"],
    )


@router.delete(
    "/{sow_id}/roles/{role_key}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a SoW-scoped role (sow-manager only, protected roles cannot be deleted)",
)
async def delete_sow_role(
    sow_id: int,
    role_key: str,
    current_user: CurrentUser,
) -> None:
    if role_key in _PROTECTED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{role_key}' is a protected role and cannot be deleted",
        )

    async with database.pg_pool.acquire() as conn:
        await require_sow_manager(conn, sow_id=sow_id, user_id=current_user.id)

        existing = await conn.fetchval(
            "SELECT 1 FROM sow_role_definitions WHERE sow_id = $1 AND role_key = $2",
            sow_id,
            role_key,
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        # Block deletion if any collaborators currently hold this role
        in_use = await conn.fetchval(
            "SELECT count(*) FROM collaboration WHERE sow_id = $1 AND role = $2",
            sow_id,
            role_key,
        )
        if in_use:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Role '{role_key}' is assigned to {in_use} collaborator(s) and cannot be deleted",
            )

        await conn.execute(
            "DELETE FROM sow_role_definitions WHERE sow_id = $1 AND role_key = $2",
            sow_id,
            role_key,
        )


# ── Collaborator endpoints ────────────────────────────────────────────────────


@router.get(
    "/{sow_id}/collaborators",
    response_model=list[CollaboratorResponse],
    summary="List all collaborators on a SoW with their roles",
)
async def list_collaborators(sow_id: int, current_user: CurrentUser) -> list[CollaboratorResponse]:
    async with database.pg_pool.acquire() as conn:
        await require_collaborator(conn, sow_id=sow_id, user_id=current_user.id)
        rows = await conn.fetch(
            """
            SELECT u.id AS user_id, u.email, u.full_name,
                   c.role AS role_key, c.created_at AS added_at
            FROM   collaboration c
            JOIN   users u ON u.id = c.user_id
            WHERE  c.sow_id = $1
            ORDER  BY c.created_at
            """,
            sow_id,
        )
    return [CollaboratorResponse(**dict(r)) for r in rows]


@router.post(
    "/{sow_id}/collaborators",
    response_model=CollaboratorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a collaborator to a SoW (sow-manager only)",
)
async def add_collaborator(
    sow_id: int,
    payload: CollaboratorAdd,
    current_user: CurrentUser,
) -> CollaboratorResponse:
    async with database.pg_pool.acquire() as conn:
        await require_sow_manager(conn, sow_id=sow_id, user_id=current_user.id)

        # Verify user exists
        user_row = await conn.fetchrow(
            "SELECT id, email, full_name FROM users WHERE id = $1", payload.user_id
        )
        if not user_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        # Verify role exists on this SoW
        role_exists = await conn.fetchval(
            "SELECT 1 FROM sow_role_definitions WHERE sow_id = $1 AND role_key = $2",
            sow_id,
            payload.role_key,
        )
        if not role_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role '{payload.role_key}' does not exist on this SoW",
            )

        # Check if already a collaborator
        already = await conn.fetchval(
            "SELECT 1 FROM collaboration WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            payload.user_id,
        )
        if already:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a collaborator on this SoW",
            )

        await seed_collaboration(conn, sow_id=sow_id, user_id=payload.user_id, role=payload.role_key)

        row = await conn.fetchrow(
            """
            SELECT u.id AS user_id, u.email, u.full_name,
                   c.role AS role_key, c.created_at AS added_at
            FROM   collaboration c
            JOIN   users u ON u.id = c.user_id
            WHERE  c.sow_id = $1 AND c.user_id = $2
            """,
            sow_id,
            payload.user_id,
        )

    return CollaboratorResponse(**dict(row))


@router.patch(
    "/{sow_id}/collaborators/{user_id}",
    response_model=CollaboratorResponse,
    summary="Change a collaborator's SoW role (sow-manager only)",
)
async def update_collaborator_role(
    sow_id: int,
    user_id: int,
    payload: CollaboratorUpdate,
    current_user: CurrentUser,
) -> CollaboratorResponse:
    async with database.pg_pool.acquire() as conn:
        await require_sow_manager(conn, sow_id=sow_id, user_id=current_user.id)

        # Cannot change your own role
        if user_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own SoW role",
            )

        existing = await conn.fetchval(
            "SELECT 1 FROM collaboration WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            user_id,
        )
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Collaborator not found"
            )

        role_exists = await conn.fetchval(
            "SELECT 1 FROM sow_role_definitions WHERE sow_id = $1 AND role_key = $2",
            sow_id,
            payload.role_key,
        )
        if not role_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role '{payload.role_key}' does not exist on this SoW",
            )

        row = await conn.fetchrow(
            """
            UPDATE collaboration SET role = $1
            WHERE  sow_id = $2 AND user_id = $3
            RETURNING *
            """,
            payload.role_key,
            sow_id,
            user_id,
        )

        user_row = await conn.fetchrow(
            "SELECT id AS user_id, email, full_name FROM users WHERE id = $1", user_id
        )

    return CollaboratorResponse(
        user_id=user_row["user_id"],
        email=user_row["email"],
        full_name=user_row["full_name"],
        role_key=row["role"],
        added_at=row["created_at"],
    )


@router.delete(
    "/{sow_id}/collaborators/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a collaborator from a SoW (sow-manager only)",
)
async def remove_collaborator(
    sow_id: int,
    user_id: int,
    current_user: CurrentUser,
) -> None:
    async with database.pg_pool.acquire() as conn:
        await require_sow_manager(conn, sow_id=sow_id, user_id=current_user.id)

        # Cannot remove yourself if you are the only sow-manager
        if user_id == current_user.id:
            manager_count = await conn.fetchval(
                "SELECT count(*) FROM collaboration WHERE sow_id = $1 AND role = 'sow-manager'",
                sow_id,
            )
            if manager_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot remove the only SoW manager. Assign another manager first.",
                )

        existing = await conn.fetchval(
            "SELECT 1 FROM collaboration WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            user_id,
        )
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Collaborator not found"
            )

        await conn.execute(
            "DELETE FROM collaboration WHERE sow_id = $1 AND user_id = $2",
            sow_id,
            user_id,
        )


# ── Permission endpoints ────────────────────────────────────────────────────


@router.get(
    "/{sow_id}/my-permissions",
    summary="Get the current user's permissions on a SoW",
)
async def get_my_sow_permissions(
    sow_id: int,
    current_user: CurrentUser,
) -> dict:
    """Return the current user's resolved permissions for a SoW.

    system-admin always gets ['*'].
    Looks up the user's collaboration role, then finds that role's
    permissions in sow_role_definitions.
    Falls back to [] if no role found.
    """
    # system-admin bypass
    if (current_user.role or "").lower() == "system-admin":
        return {"permissions": ["*"], "role_key": "system-admin"}

    async with database.pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT c.role AS role_key, srd.permissions
            FROM   collaboration c
            LEFT JOIN sow_role_definitions srd
                   ON srd.sow_id = c.sow_id AND srd.role_key = c.role
            WHERE  c.sow_id = $1 AND c.user_id = $2
            LIMIT  1
            """,
            sow_id,
            current_user.id,
        )

    if not row:
        return {"permissions": [], "role_key": None}

    permissions = row["permissions"]
    if isinstance(permissions, str):
        import json
        permissions = json.loads(permissions)

    return {
        "permissions": permissions or [],
        "role_key": row["role_key"],
    }


class GroupSyncPayload(BaseModel):
    group_id: str | None = None
    use_creator_group: bool = False


@router.post(
    "/{sow_id}/collaborators/sync-group",
    summary="Add Entra group members as viewers on a SoW",
)
async def sync_group_collaborators(
    sow_id: int,
    payload: GroupSyncPayload,
    current_user: CurrentUser,
) -> dict:
    """Add members of an Entra ID group as viewer collaborators on a SoW.

    Reads the group_id from the payload. If group_id is None and
    use_creator_group is True, attempts to read the creator's groups
    from their JWT claims stored on the user record.

    Currently a stub — returns a graceful degradation response when
    the App Registration groups claim is not configured, rather than
    failing the SoW creation flow.
    """
    async with database.pg_pool.acquire() as conn:
        await require_sow_manager(conn, sow_id=sow_id, user_id=current_user.id)

    # For now, return a degraded response — full implementation requires
    # the App Registration to have groupMembershipClaims enabled and
    # Microsoft Graph integration for member enumeration.
    return {
        "synced": False,
        "detail": (
            "Group sync requires Entra App Registration group claims to be enabled. "
            "Add collaborators manually via POST /api/sow/{id}/collaborators."
        ),
    }
