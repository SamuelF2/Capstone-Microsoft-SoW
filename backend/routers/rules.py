"""
Rules router  —  /api/rules

Read-only endpoint that serves the combined business rules (banned phrases,
required elements, ESAP workflow, methodology alignment) from the JSON
configuration files in ``Data/rules/``.

The files are loaded once and cached in memory since they don't change at
runtime.
"""

from __future__ import annotations

import json
import os
from typing import Any

from auth import CurrentUser
from config import RULES_DIR
from fastapi import APIRouter

router = APIRouter(prefix="/api/rules", tags=["rules"])

_rules_cache: dict[str, Any] | None = None


def _load_rules() -> dict[str, Any]:
    global _rules_cache
    if _rules_cache is not None:
        return _rules_cache

    def _read(rel_path: str) -> dict:
        full = os.path.join(RULES_DIR, rel_path)
        if os.path.isfile(full):
            with open(full) as f:
                return json.load(f)
        return {}

    _rules_cache = {
        "bannedPhrases": _read("compliance/banned-phrases.json"),
        "requiredElements": _read("compliance/required-elements.json"),
        "esapWorkflow": _read("workflow/esap-workflow.json"),
        "methodologyAlignment": _read("methodology/methodology-alignment.json"),
    }
    return _rules_cache


@router.get(
    "",
    summary="Get all business rules",
)
async def get_rules(current_user: CurrentUser) -> dict[str, Any]:
    """Return the combined business-logic rules that drive quality checking,
    ESAP workflow, and methodology alignment.  Cached after first load.
    """
    return _load_rules()
