"""Generate Status Report records — periodic reports with RAG statuses and narrative text."""

import random
from datetime import date, timedelta

from config import SEED, STATUS_REPORT_FREQ_WEEKS
from llm_client import generate_status_report_text

rng = random.Random(SEED + 3)


def _pick_rag(budget_var: float, hours_var: float, period_frac: float) -> dict:
    """Determine RAG statuses based on project health signals."""
    # Financial status driven by budget variance
    if budget_var > 0.15:
        fin = "Red"
    elif budget_var > 0.05:
        fin = "Yellow"
    else:
        fin = "Green"

    # Resourcing driven by hours variance
    if abs(hours_var) > 0.20:
        res = "Red" if hours_var > 0 else "Yellow"
    elif abs(hours_var) > 0.10:
        res = "Yellow"
    else:
        res = "Green"

    # Timeline — early periods mostly green, later periods reflect accumulated issues
    if period_frac > 0.8 and (fin == "Red" or res == "Red"):
        time = "Red"
    elif period_frac > 0.5 and (fin != "Green" or res != "Green"):
        time = "Yellow"
    else:
        time = rng.choices(["Green", "Yellow"], weights=[0.85, 0.15])[0]

    # Scope — mostly green unless financial + timeline are both bad
    if fin == "Red" and time != "Green":
        scope = rng.choices(["Yellow", "Red"], weights=[0.6, 0.4])[0]
    elif fin == "Yellow" or time == "Yellow":
        scope = rng.choices(["Green", "Yellow"], weights=[0.7, 0.3])[0]
    else:
        scope = "Green"

    return {
        "scope_status": scope,
        "resourcing_status": res,
        "timeline_status": time,
        "financial_status": fin,
    }


def generate_status_reports(deals: list[dict], staffing_plans: list[dict]) -> list[dict]:
    """Generate periodic status reports for each project."""
    rows = []

    # Pre-compute planned hours per project
    planned_hours = {}
    for sp in staffing_plans:
        planned_hours.setdefault(sp["project_id"], 0)
        planned_hours[sp["project_id"]] += sp["total_hours"]

    for deal in deals:
        pid = deal["project_id"]
        start = date.fromisoformat(deal["start_date"])
        end = date.fromisoformat(deal["end_date"])
        total_days = max(1, (end - start).days)

        # Generate reporting periods
        period_date = start + timedelta(weeks=STATUS_REPORT_FREQ_WEEKS)
        period_num = 0
        total_periods = max(1, total_days // (STATUS_REPORT_FREQ_WEEKS * 7))

        # Project-level "trajectory" — some projects go smoothly, some don't
        # This creates coherent narratives across periods
        trouble_factor = rng.uniform(0, 1)  # 0 = smooth, 1 = troubled

        cumulative_budget_var = 0.0
        cumulative_hours_var = 0.0

        while period_date <= end:
            period_num += 1
            period_frac = min(1.0, (period_date - start).days / total_days)

            # Simulate variance accumulation (troubled projects drift worse over time)
            period_budget_shock = rng.gauss(0, 0.03) + (trouble_factor * 0.02)
            period_hours_shock = rng.gauss(0, 0.04) + (trouble_factor * 0.015)
            cumulative_budget_var += period_budget_shock
            cumulative_hours_var += period_hours_shock

            # Clamp
            cumulative_budget_var = max(-0.15, min(0.35, cumulative_budget_var))
            cumulative_hours_var = max(-0.20, min(0.30, cumulative_hours_var))

            rags = _pick_rag(cumulative_budget_var, cumulative_hours_var, period_frac)

            # Determine phase label
            if period_frac < 0.15:
                phase = "initiation"
            elif period_frac < 0.4:
                phase = "planning/design"
            elif period_frac < 0.8:
                phase = "execution/build"
            else:
                phase = "testing/closeout"

            # Generate text fields
            ctx = {
                "project_name": deal["project_name"],
                "project_type": deal["_archetype"]["type"],
                "customer_name": deal["customer_name"],
                "industry": deal["customer_industry"],
                "deal_terms": deal["deal_terms"],
                "period_date": period_date.isoformat(),
                "phase": phase,
                "period_num": period_num,
                "total_periods": total_periods,
                "budget_variance_pct": cumulative_budget_var,
                "hours_variance_pct": cumulative_hours_var,
                **rags,
            }
            text_fields = generate_status_report_text(ctx)

            rows.append(
                {
                    "project_id": pid,
                    "year": period_date.year,
                    "period_ending_date": period_date.isoformat(),
                    **rags,
                    "accomplishments": text_fields.get("accomplishments", ""),
                    "plans": text_fields.get("plans", ""),
                    "risks": text_fields.get("risks", ""),
                    "issues": text_fields.get("issues", ""),
                    "changes": text_fields.get("changes", ""),
                }
            )

            period_date += timedelta(weeks=STATUS_REPORT_FREQ_WEEKS)

    return rows
