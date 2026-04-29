"""Role display name lookups shared across routers and services.

Centralizes the mapping from internal role keys (e.g. "solution-architect") to
human-readable labels (e.g. "Solution Architect"). Previously this dict was
duplicated in workflow_engine.py, review.py, and sow.py with subtly different
shapes; importing from here keeps them in lockstep.
"""

from __future__ import annotations

import database

ROLE_DISPLAY_NAMES: dict[str, str] = {
    "solution-architect": "Solution Architect",
    "sqa-reviewer": "SQA Reviewer",
    "cpl": "Customer Practice Lead",
    "cdp": "Customer Delivery Partner",
    "delivery-manager": "Delivery Manager",
    "consultant": "Consultant",
    "system-admin": "System Admin",
    # Microsoft Default Workflow roles
    "solution-reviewer": "Solution Reviewer",
    "responsible-ai-lead": "Responsible AI Lead",
    "global-dev-lead": "Global Dev Lead",
    "shared-services-lead": "Shared Services Lead",
    "ux-services-lead": "UX Services Lead",
    "acm-services-lead": "ACM Services Lead",
    "data-ai-services-lead": "Data & AI Services Lead",
    "industry-solutions-lead": "Industry Solutions Lead",
}


def humanize_role(role_key: str | None) -> str:
    """Return a friendly label for a role key.

    Falls back to a Title-Cased version of the key (with hyphens replaced by
    spaces) for any role not in the canonical map, so brand-new roles still
    render reasonably without code changes.
    """
    if not role_key:
        return ""
    return ROLE_DISPLAY_NAMES.get(role_key) or role_key.replace("-", " ").title()


async def humanize_role_async(role_key: str | None) -> str:
    """DB-backed role display name lookup. Use this in async contexts."""
    if not role_key:
        return ""
    try:
        async with database.pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT display_name FROM role_definitions WHERE role_key = $1", role_key
            )
        if row:
            return row["display_name"]
    except Exception:
        pass
    # Fallback to static map for startup/degraded scenarios
    return humanize_role(role_key)
