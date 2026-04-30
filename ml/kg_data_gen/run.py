"""
KG Synthetic Data Generator — Main Pipeline
=============================================
Generates internally-consistent project data for Neo4j knowledge graph ingestion.

Usage:
    # Template mode (no API key needed):
    python run.py

    # With Azure OpenAI for realistic text (auth via DefaultAzureCredential —
    # run `az login` first; user must have Azure AI Developer on the Foundry resource):
    export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
    export AZURE_OPENAI_DEPLOYMENT="gpt-4o-mini"
    python run.py

    # Scale up:
    NUM_PROJECTS=100 python run.py

Output:
    output/ directory with one CSV per entity type.
"""

import csv
import os
import time
from pathlib import Path

# Allow NUM_PROJECTS override via env var
if "NUM_PROJECTS" in os.environ:
    import config

    config.NUM_PROJECTS = int(os.environ["NUM_PROJECTS"])

from config import NUM_PROJECTS, USE_LLM
from generators.budget import generate_budgets
from generators.budget_actuals import generate_budget_actuals
from generators.closeout import generate_closeouts
from generators.deal_overview import generate_deal_overviews
from generators.staffing_actuals import generate_staffing_actuals
from generators.staffing_plan import generate_staffing_plans
from generators.status_reports import generate_status_reports

OUTPUT_DIR = Path("output")


def _sanitize_row(row: dict) -> dict:
    """Replace embedded newlines in string values with semicolons."""
    return {k: v.replace("\n", "; ") if isinstance(v, str) else v for k, v in row.items()}


def write_csv(filename: str, rows: list[dict]):
    """Write list of dicts to CSV, skipping internal fields (prefixed with _)."""
    if not rows:
        print(f"  [WARN] No rows for {filename}, skipping.")
        return
    fieldnames = [k for k in rows[0] if not k.startswith("_")]
    path = OUTPUT_DIR / filename
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(_sanitize_row(r) for r in rows)
    print(f"  ✓ {filename}: {len(rows)} rows")


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    mode = "LLM (Azure OpenAI)" if USE_LLM else "Template"
    print("═══ KG Data Generator ═══")
    print(f"Projects: {NUM_PROJECTS} | Text mode: {mode}\n")

    t0 = time.time()

    # Step 1: Deal Overviews (root)
    print("[1/7] Generating Deal Overviews...")
    deals = generate_deal_overviews()
    write_csv("deal_overview.csv", deals)

    # Step 2: Staffing Plans
    print("[2/7] Generating Staffing Plans...")
    staffing_plans = generate_staffing_plans(deals)
    write_csv("staffing_plan.csv", staffing_plans)

    # Step 3: Budgets (derived from staffing)
    print("[3/7] Deriving Budgets...")
    budgets = generate_budgets(deals, staffing_plans)
    write_csv("budget.csv", budgets)

    # Step 4: Status Reports (LLM text if available)
    print("[4/7] Generating Status Reports...")
    if USE_LLM:
        print("       (calling Azure OpenAI for text fields — this may take a minute)")
    status_reports = generate_status_reports(deals, staffing_plans)
    write_csv("status_report.csv", status_reports)

    # Step 5: Staffing Actuals + Forecasts
    print("[5/7] Generating Staffing Actuals + Forecasts...")
    staffing_actuals = generate_staffing_actuals(deals, staffing_plans)
    write_csv("staffing_actuals_fcst.csv", staffing_actuals)

    # Step 6: Budget Actuals + Forecasts
    print("[6/7] Deriving Budget Actuals + Forecasts...")
    budget_actuals = generate_budget_actuals(deals, staffing_actuals, budgets)
    write_csv("budget_actuals_fcst.csv", budget_actuals)

    # Step 7: Project Closeouts
    print("[7/7] Generating Project Closeouts...")
    if USE_LLM:
        print("       (calling Azure OpenAI for closeout narratives)")
    closeouts = generate_closeouts(deals, staffing_plans, staffing_actuals, status_reports)
    write_csv("project_closeout.csv", closeouts)

    elapsed = time.time() - t0
    print(f"\n═══ Done in {elapsed:.1f}s ═══")
    print(f"Output: {OUTPUT_DIR.resolve()}/")

    # Summary stats
    total_rows = (
        len(deals)
        + len(staffing_plans)
        + len(budgets)
        + len(status_reports)
        + len(staffing_actuals)
        + len(budget_actuals)
        + len(closeouts)
    )
    print(f"Total records: {total_rows:,}")
    print("\nCSV files ready for Neo4j ingestion:")
    for f in sorted(OUTPUT_DIR.glob("*.csv")):
        print(f"  → {f.name}")


if __name__ == "__main__":
    main()
