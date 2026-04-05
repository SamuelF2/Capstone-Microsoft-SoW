"""ESAP (Engagement Sales Approval Process) classification.

Rules from Data/rules/workflow/esap-workflow.json:
  type-1: dealValue > $5M  OR  margin < 10%
  type-2: $1M < dealValue <= $5M  OR  10% <= margin < 15%
  type-3: dealValue <= $1M  AND  margin >= 15%
"""

from __future__ import annotations


def compute_esap_level(deal_value: float | None, margin: float | None) -> str:
    """Determine ESAP type from deal value and estimated margin."""
    dv = deal_value or 0
    mg = margin if margin is not None else 0

    if dv > 5_000_000 or mg < 10:
        return "type-1"
    if dv > 1_000_000 or mg < 15:
        return "type-2"
    return "type-3"
