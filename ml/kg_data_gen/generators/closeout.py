"""Generate Project Close Out records — synthesized from execution data."""

import random

from config import CSAT_RANGE, SEED
from llm_client import generate_closeout_text

rng = random.Random(SEED + 6)


def generate_closeouts(
    deals: list[dict],
    staffing_plans: list[dict],
    staffing_actuals: list[dict],
    status_reports: list[dict],
) -> list[dict]:
    """Generate closeout records for projects that have ended."""
    rows = []

    # Aggregate planned vs actual hours per project
    planned_hours = {}
    for sp in staffing_plans:
        planned_hours.setdefault(sp["project_id"], 0)
        planned_hours[sp["project_id"]] += sp["total_hours"]

    actual_hours = {}
    for sa in staffing_actuals:
        actual_hours.setdefault(sa["project_id"], 0)
        if sa["actual_hours"] is not None:
            actual_hours[sa["project_id"]] += sa["actual_hours"]

    # Aggregate planned vs actual revenue per project
    planned_rev = {}
    for sp in staffing_plans:
        planned_rev.setdefault(sp["project_id"], 0)
        planned_rev[sp["project_id"]] += sp["labor_revenue"]

    actual_rev = {}
    for sa in staffing_actuals:
        actual_rev.setdefault(sa["project_id"], 0)
        if sa["actual_revenue"] is not None:
            actual_rev[sa["project_id"]] += sa["actual_revenue"]

    # Compute overall health from status reports
    project_rags = {}
    for sr in status_reports:
        project_rags.setdefault(sr["project_id"], [])
        statuses = [
            sr["scope_status"],
            sr["resourcing_status"],
            sr["timeline_status"],
            sr["financial_status"],
        ]
        project_rags[sr["project_id"]].append(statuses)

    for deal in deals:
        pid = deal["project_id"]
        ph = planned_hours.get(pid, 1)
        ah = actual_hours.get(pid, 0)
        pr = planned_rev.get(pid, 1)
        ar = actual_rev.get(pid, 0)

        hours_var = (ah - ph) / max(1, ph)
        budget_var = (ar - pr) / max(1, pr)

        # Determine overall health from RAG history
        rags = project_rags.get(pid, [])
        red_count = sum(1 for period in rags for s in period if s == "Red")
        yellow_count = sum(1 for period in rags for s in period if s == "Yellow")
        total_statuses = max(1, sum(len(period) for period in rags))
        red_pct = red_count / total_statuses

        if red_pct > 0.20:
            overall_health = "Challenged"
        elif red_pct > 0.05 or yellow_count / total_statuses > 0.30:
            overall_health = "At Risk"
        else:
            overall_health = "Healthy"

        # CSAT correlated with health
        base_csat = rng.uniform(*CSAT_RANGE)
        if overall_health == "Challenged":
            csat = round(max(1.0, base_csat - rng.uniform(0.5, 1.5)), 1)
        elif overall_health == "At Risk":
            csat = round(max(2.0, base_csat - rng.uniform(0.2, 0.7)), 1)
        else:
            csat = round(min(5.0, base_csat + rng.uniform(0, 0.3)), 1)

        ctx = {
            "project_name": deal["project_name"],
            "project_type": deal["_archetype"]["type"],
            "customer_name": deal["customer_name"],
            "industry": deal["customer_industry"],
            "deal_terms": deal["deal_terms"],
            "deal_type": deal["deal_type"],
            "start_date": deal["start_date"],
            "end_date": deal["end_date"],
            "final_budget_variance_pct": budget_var,
            "final_hours_variance_pct": hours_var,
            "csat": csat,
            "overall_health": overall_health,
        }
        text = generate_closeout_text(ctx)

        rows.append(
            {
                "project_id": pid,
                "start_date": deal["start_date"],
                "end_date": deal["end_date"],
                "project_outcomes": text.get("project_outcomes", ""),
                "lessons_learned": text.get("lessons_learned", ""),
                "customer_satisfaction": csat,
            }
        )

    return rows
