"""Generate Budget records — aggregated from Staffing Plan with expenses and risk reserve."""

import random

from config import EXPENSE_PCT_OF_REVENUE, RISK_RESERVE_PCT, SEED

rng = random.Random(SEED + 2)


def generate_budgets(deals: list[dict], staffing_plans: list[dict]) -> list[dict]:
    """Derive budget rows from staffing plan aggregations."""
    rows = []

    # Pre-aggregate staffing by (project_id, year)
    agg = {}
    for sp in staffing_plans:
        key = (sp["project_id"], sp["year"])
        if key not in agg:
            agg[key] = {"revenue": 0, "cost": 0}
        agg[key]["revenue"] += sp["labor_revenue"]
        agg[key]["cost"] += sp["labor_cost"]

    deal_lookup = {d["project_id"]: d for d in deals}

    for (pid, year), totals in sorted(agg.items()):
        deal = deal_lookup[pid]
        fees_rev = round(totals["revenue"], 2)
        fees_cost = round(totals["cost"], 2)
        fees_margin = round(fees_rev - fees_cost, 2)

        # Expenses (travel, etc.)
        exp_pct = rng.uniform(*EXPENSE_PCT_OF_REVENUE)
        exp_cost = round(fees_rev * exp_pct, 2)
        exp_rev = exp_cost  # pass-through
        exp_margin = 0.0

        # Risk reserve (Fixed Fee only)
        if deal["deal_terms"] == "Fixed":
            rr_pct = rng.uniform(*RISK_RESERVE_PCT)
            rr_rev = round(fees_rev * rr_pct, 2)
            rr_cost = rr_rev
            rr_margin = 0.0
        else:
            rr_rev = rr_cost = rr_margin = 0.0

        total_rev = round(fees_rev + exp_rev + rr_rev, 2)
        total_cost = round(fees_cost + exp_cost + rr_cost, 2)
        total_margin = round(total_rev - total_cost, 2)

        components = [
            ("Fees Revenue", fees_rev),
            ("Fees Cost", fees_cost),
            ("Fees Margin", fees_margin),
            ("Expenses Revenue", exp_rev),
            ("Expenses Cost", exp_cost),
            ("Expenses Margin", exp_margin),
            ("Risk Reserve - Revenue", rr_rev),
            ("Risk Reserve - Cost", rr_cost),
            ("Risk Reserve - Margin", rr_margin),
            ("Total Revenue", total_rev),
            ("Total Cost", total_cost),
            ("Total Margin", total_margin),
        ]

        for comp, usd in components:
            rows.append(
                {
                    "project_id": pid,
                    "year": year,
                    "budget_component": comp,
                    "usd": usd,
                }
            )

    return rows
