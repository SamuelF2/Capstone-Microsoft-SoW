"""Generate Staffing Actuals + Forecast records — period-level execution data with variance."""

import random
from datetime import date, timedelta

from config import HOURS_VARIANCE_PCT, RATE_VARIANCE_PCT, SEED, STATUS_REPORT_FREQ_WEEKS

rng = random.Random(SEED + 4)

# Fake resource names for realism
_FIRST_NAMES = [
    "James",
    "Sarah",
    "Michael",
    "Emily",
    "David",
    "Jessica",
    "Robert",
    "Ashley",
    "Daniel",
    "Amanda",
    "Christopher",
    "Stephanie",
    "Matthew",
    "Jennifer",
    "Andrew",
    "Lauren",
    "Joshua",
    "Nicole",
    "Ryan",
    "Megan",
    "Kevin",
    "Rachel",
    "Brian",
    "Priya",
    "Rajesh",
    "Ananya",
    "Vikram",
    "Meera",
    "Arjun",
    "Deepa",
    "Wei",
    "Lin",
    "Jun",
    "Yuki",
    "Hiro",
    "Seo-yeon",
    "Min-jun",
    "Carlos",
    "Maria",
    "Diego",
    "Sofia",
    "Pedro",
    "Ana",
]
_LAST_NAMES = [
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
    "Anderson",
    "Taylor",
    "Thomas",
    "Moore",
    "Jackson",
    "White",
    "Harris",
    "Martin",
    "Thompson",
    "Robinson",
    "Clark",
    "Sharma",
    "Patel",
    "Kumar",
    "Gupta",
    "Singh",
    "Reddy",
    "Nair",
    "Chen",
    "Wang",
    "Li",
    "Kim",
    "Tanaka",
    "Park",
    "Yamamoto",
    "Santos",
    "Reyes",
    "Cruz",
    "Torres",
    "Morales",
    "Gomez",
]


def _random_name() -> str:
    return f"{rng.choice(_FIRST_NAMES)} {rng.choice(_LAST_NAMES)}"


def generate_staffing_actuals(
    deals: list[dict],
    staffing_plans: list[dict],
    reference_date: date | None = None,
) -> list[dict]:
    """
    Generate period-level staffing actuals and forecasts.
    reference_date determines the cutoff: periods before it get actuals, after get forecasts.
    Defaults to midpoint of all project timelines.
    """
    rows = []

    if reference_date is None:
        reference_date = date(2025, 1, 1)

    # Group staffing plan by project
    plan_by_project: dict[str, list[dict]] = {}
    for sp in staffing_plans:
        plan_by_project.setdefault(sp["project_id"], []).append(sp)

    deal_lookup = {d["project_id"]: d for d in deals}

    # Assign persistent resource names per (project, role, instance)
    name_cache: dict[tuple, str] = {}

    for pid, plan_rows in plan_by_project.items():
        deal = deal_lookup[pid]
        start = date.fromisoformat(deal["start_date"])
        end = date.fromisoformat(deal["end_date"])

        # Deduplicate roles: group by (role, bill_rate) to identify unique resource slots
        role_slots: dict[tuple, list[dict]] = {}
        for pr in plan_rows:
            key = (pr["resource"], pr["bill_rate"], pr["cost_rate"])
            role_slots.setdefault(key, []).append(pr)

        # For each role slot, generate period-level records
        for (role, bill_rate, cost_rate), slot_plans in role_slots.items():
            # Assign a name to this resource
            name_key = (pid, role, bill_rate)
            if name_key not in name_cache:
                name_cache[name_key] = _random_name()
            resource_name = name_cache[name_key]

            desc = slot_plans[0]["role_description"]

            # Calculate total planned hours across all years for this slot
            total_planned_hours = sum(sp["total_hours"] for sp in slot_plans)
            total_weeks = max(1, (end - start).days // 7)
            planned_weekly_hours = total_planned_hours / total_weeks

            # Generate period-by-period
            period_date = start + timedelta(weeks=STATUS_REPORT_FREQ_WEEKS)

            while period_date <= end:
                year = period_date.year
                weeks_in_period = STATUS_REPORT_FREQ_WEEKS
                planned_period_hours = round(planned_weekly_hours * weeks_in_period, 1)

                is_past = period_date <= reference_date

                if is_past:
                    # Actuals with variance
                    var = rng.uniform(*HOURS_VARIANCE_PCT)
                    actual_hours = round(max(0, planned_period_hours * (1 + var)), 1)
                    rate_var = rng.uniform(*RATE_VARIANCE_PCT)
                    actual_bill = round(bill_rate * (1 + rate_var), 2)
                    actual_cost = round(cost_rate * (1 + rate_var), 2)

                    actual_rev = round(actual_bill * actual_hours, 2)
                    actual_cost_total = round(actual_cost * actual_hours, 2)
                    actual_margin = round(actual_rev - actual_cost_total, 2)

                    rows.append(
                        {
                            "project_id": pid,
                            "year": year,
                            "period_ending_date": period_date.isoformat(),
                            "resource": role,
                            "role_description": desc,
                            "resource_name": resource_name,
                            "bill_rate": actual_bill,
                            "cost_rate": actual_cost,
                            "actual_hours": actual_hours,
                            "actual_revenue": actual_rev,
                            "actual_cost": actual_cost_total,
                            "actual_margin": actual_margin,
                            "fcst_hours": None,
                            "fcst_revenue": None,
                            "fcst_cost": None,
                            "fcst_margin": None,
                        }
                    )
                else:
                    # Forecast (closer to plan, slight adjustments)
                    fcst_var = rng.uniform(-0.10, 0.10)
                    fcst_hours = round(max(0, planned_period_hours * (1 + fcst_var)), 1)
                    fcst_rev = round(bill_rate * fcst_hours, 2)
                    fcst_cost_total = round(cost_rate * fcst_hours, 2)
                    fcst_margin = round(fcst_rev - fcst_cost_total, 2)

                    rows.append(
                        {
                            "project_id": pid,
                            "year": year,
                            "period_ending_date": period_date.isoformat(),
                            "resource": role,
                            "role_description": desc,
                            "resource_name": resource_name,
                            "bill_rate": bill_rate,
                            "cost_rate": cost_rate,
                            "actual_hours": None,
                            "actual_revenue": None,
                            "actual_cost": None,
                            "actual_margin": None,
                            "fcst_hours": fcst_hours,
                            "fcst_revenue": fcst_rev,
                            "fcst_cost": fcst_cost_total,
                            "fcst_margin": fcst_margin,
                        }
                    )

                period_date += timedelta(weeks=STATUS_REPORT_FREQ_WEEKS)

    return rows
