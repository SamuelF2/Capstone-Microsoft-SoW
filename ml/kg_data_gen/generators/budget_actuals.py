"""Generate Budget Actuals + Forecast records — aggregated from staffing actuals."""

import random

from config import SEED

rng = random.Random(SEED + 5)


def generate_budget_actuals(
    deals: list[dict],
    staffing_actuals: list[dict],
    budgets: list[dict],
) -> list[dict]:
    """Derive period-level budget actuals/forecasts from staffing actuals."""
    rows = []
    deal_lookup = {d["project_id"]: d for d in deals}

    # Pre-index original budget expense/risk ratios per (project, year)
    budget_ratios = {}
    for b in budgets:
        key = (b["project_id"], b["year"])
        if key not in budget_ratios:
            budget_ratios[key] = {}
        budget_ratios[key][b["budget_component"]] = b["usd"]

    # Aggregate staffing actuals by (project, year, period)
    agg: dict[tuple, dict] = {}
    for sa in staffing_actuals:
        key = (sa["project_id"], sa["year"], sa["period_ending_date"])
        if key not in agg:
            agg[key] = {
                "actual_rev": 0,
                "actual_cost": 0,
                "fcst_rev": 0,
                "fcst_cost": 0,
                "is_actual": False,
                "is_fcst": False,
            }
        if sa["actual_hours"] is not None:
            agg[key]["actual_rev"] += sa["actual_revenue"]
            agg[key]["actual_cost"] += sa["actual_cost"]
            agg[key]["is_actual"] = True
        if sa["fcst_hours"] is not None:
            agg[key]["fcst_rev"] += sa["fcst_revenue"]
            agg[key]["fcst_cost"] += sa["fcst_cost"]
            agg[key]["is_fcst"] = True

    for (pid, year, period_date), totals in sorted(agg.items()):
        deal = deal_lookup[pid]
        is_fixed = deal["deal_terms"] == "Fixed"

        # Get budget ratios for expense/risk percentages
        bkey = (pid, year)
        br = budget_ratios.get(bkey, {})
        planned_fees_rev = br.get("Fees Revenue", 1)
        planned_exp = br.get("Expenses Cost", 0)
        planned_rr = br.get("Risk Reserve - Revenue", 0)
        exp_ratio = planned_exp / max(1, planned_fees_rev)
        rr_ratio = planned_rr / max(1, planned_fees_rev) if is_fixed else 0

        # Number of periods in this year (estimate for proportioning)
        periods_in_year = sum(1 for k in agg if k[0] == pid and k[1] == year)

        def _build_components(
            fees_rev,
            fees_cost,
            label_actual,
            label_fcst,
            _exp_ratio=exp_ratio,
            _rr_ratio=rr_ratio,
            _is_fixed=is_fixed,
        ):
            fees_margin = round(fees_rev - fees_cost, 2)
            exp_cost = round(fees_rev * _exp_ratio * rng.uniform(0.8, 1.2), 2)
            exp_rev = exp_cost
            rr_rev = round(fees_rev * _rr_ratio, 2) if _is_fixed else 0.0
            rr_cost = rr_rev
            total_rev = round(fees_rev + exp_rev + rr_rev, 2)
            total_cost = round(fees_cost + exp_cost + rr_cost, 2)
            total_margin = round(total_rev - total_cost, 2)

            return [
                ("Fees Revenue", fees_rev),
                ("Fees Cost", fees_cost),
                ("Fees Margin", fees_margin),
                ("Expenses Revenue", exp_rev),
                ("Expenses Cost", exp_cost),
                ("Expenses Margin", 0.0),
                ("Risk Reserve - Revenue", rr_rev),
                ("Risk Reserve - Cost", rr_cost),
                ("Risk Reserve - Margin", 0.0),
                ("Total Revenue", total_rev),
                ("Total Cost", total_cost),
                ("Total Margin", total_margin),
            ]

        # Planned (proportioned from annual budget)
        planned_rev_period = round(br.get("Total Revenue", 0) / max(1, periods_in_year), 2)
        planned_cost_period = round(br.get("Total Cost", 0) / max(1, periods_in_year), 2)

        if totals["is_actual"]:
            components = _build_components(
                round(totals["actual_rev"], 2),
                round(totals["actual_cost"], 2),
                "actuals",
                "forecast",
            )
            for comp, val in components:
                rows.append(
                    {
                        "project_id": pid,
                        "year": year,
                        "period_ending_date": period_date,
                        "budget_component": comp,
                        "usd_planned": round(
                            planned_rev_period if "Revenue" in comp else planned_cost_period, 2
                        )
                        if "Total" in comp
                        else None,
                        "actuals_usd": val,
                        "forecast_usd": None,
                    }
                )
        else:
            components = _build_components(
                round(totals["fcst_rev"], 2),
                round(totals["fcst_cost"], 2),
                "actuals",
                "forecast",
            )
            for comp, val in components:
                rows.append(
                    {
                        "project_id": pid,
                        "year": year,
                        "period_ending_date": period_date,
                        "budget_component": comp,
                        "usd_planned": None,
                        "actuals_usd": None,
                        "forecast_usd": val,
                    }
                )

    return rows
