"""Generate Deal Overview records — the root entity all others depend on."""

import random
from datetime import timedelta

from config import (
    CUSTOMERS,
    NUM_PROJECTS,
    PROJECT_ARCHETYPES,
    PROJECT_DATE_RANGE_END,
    PROJECT_DATE_RANGE_START,
    SEED,
)

rng = random.Random(SEED)

# Naming patterns: "{Verb} {Noun} {Archetype}" or "{Customer short} {Archetype}"
_VERBS = ["Enterprise", "Strategic", "Global", "Accelerated", "Unified", "Next-Gen", "Integrated"]
_NOUNS = [
    "Platform",
    "Solution",
    "Initiative",
    "Program",
    "Transformation",
    "Modernization",
    "Engagement",
]


def _generate_project_name(customer_name: str, archetype_type: str) -> str:
    short = customer_name.split()[0]
    verb = rng.choice(_VERBS)
    noun = rng.choice(_NOUNS)
    return f"{short} {verb} {archetype_type} {noun}"


def generate_deal_overviews() -> list[dict]:
    """Return list of deal overview dicts. Some are Change Orders referencing earlier New deals."""
    deals = []
    date_range_days = (PROJECT_DATE_RANGE_END - PROJECT_DATE_RANGE_START).days

    # Track which customers have had a "New" deal so we can create Change Orders
    customer_new_deals = {}

    for i in range(NUM_PROJECTS):
        project_id = f"PROJ-{i + 1:04d}"
        customer = rng.choice(CUSTOMERS)
        archetype = rng.choice(PROJECT_ARCHETYPES)

        # ~25% chance of Change Order if customer already has a New deal
        is_change_order = customer["id"] in customer_new_deals and rng.random() < 0.25
        deal_type = "Change Order" if is_change_order else "New"
        deal_terms = rng.choice(["Fixed", "Time & Material"])

        # Duration from archetype range
        min_m, max_m = archetype["duration_months"]
        duration_months = rng.randint(min_m, max_m)

        # Generate dates
        sig_offset = rng.randint(0, max(1, date_range_days - duration_months * 30 - 30))
        sig_date = PROJECT_DATE_RANGE_START + timedelta(days=sig_offset)
        start_date = sig_date + timedelta(days=rng.randint(7, 30))
        end_date = start_date + timedelta(days=duration_months * 30)

        # Clamp end date
        if end_date > PROJECT_DATE_RANGE_END + timedelta(days=180):
            end_date = PROJECT_DATE_RANGE_END + timedelta(days=rng.randint(0, 90))

        name = _generate_project_name(customer["name"], archetype["type"])

        deal = {
            "project_id": project_id,
            "project_name": name,
            "deal_terms": deal_terms,
            "deal_type": deal_type,
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "customer_location": customer["location"],
            "customer_industry": customer["industry"],
            "deal_signature_date": sig_date.isoformat(),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            # carry archetype metadata for downstream generators
            "_archetype": archetype,
            "_duration_months": duration_months,
        }
        deals.append(deal)

        if deal_type == "New":
            customer_new_deals[customer["id"]] = project_id

    return deals
