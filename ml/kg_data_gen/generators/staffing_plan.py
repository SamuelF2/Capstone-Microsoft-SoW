"""Generate Staffing Plan records — team composition derived from deal archetype."""

import random
from datetime import date

from config import ROLE_CATALOG, SEED, TEAM_TEMPLATES

rng = random.Random(SEED + 1)


def _get_rate(role: str) -> tuple[float, float]:
    """Return (bill_rate, cost_rate) for a role."""
    desc, rate_range, cost_pct, is_offshore = ROLE_CATALOG[role]
    bill = round(rng.uniform(rate_range[0], rate_range[1]), 2)
    cost = round(bill * cost_pct, 2)
    return bill, cost


def generate_staffing_plans(deals: list[dict]) -> list[dict]:
    """Generate staffing plan rows for each deal. Returns flat list of records."""
    rows = []

    for deal in deals:
        archetype = deal["_archetype"]
        template_key = archetype["roles_template"]
        size = archetype["size"]
        project_id = deal["project_id"]

        start = date.fromisoformat(deal["start_date"])
        end = date.fromisoformat(deal["end_date"])

        # Get the team template
        team = TEAM_TEMPLATES[template_key][size]

        # Determine which calendar years this project spans
        years = list(range(start.year, end.year + 1))

        for role, count, weekly_hrs_range in team:
            for _instance in range(count):
                bill_rate, cost_rate = _get_rate(role)
                desc = ROLE_CATALOG[role][0]

                for year in years:
                    # Calculate months active in this year
                    year_start = max(start, date(year, 1, 1))
                    year_end = min(end, date(year, 12, 31))
                    if year_start > year_end:
                        continue
                    active_weeks = max(1, (year_end - year_start).days // 7)

                    # Weekly hours with some variance
                    avg_weekly = rng.uniform(weekly_hrs_range[0], weekly_hrs_range[1])
                    total_hours = round(avg_weekly * active_weeks, 1)

                    labor_revenue = round(bill_rate * total_hours, 2)
                    labor_cost = round(cost_rate * total_hours, 2)
                    labor_margin = round(labor_revenue - labor_cost, 2)

                    rows.append(
                        {
                            "project_id": project_id,
                            "year": year,
                            "resource": role,
                            "role_description": desc,
                            "bill_rate": bill_rate,
                            "cost_rate": cost_rate,
                            "total_hours": total_hours,
                            "labor_revenue": labor_revenue,
                            "labor_cost": labor_cost,
                            "labor_margin": labor_margin,
                        }
                    )

    return rows
