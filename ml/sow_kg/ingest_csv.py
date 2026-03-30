"""
Ingest structured CSV files into the SOW Knowledge Graph.

Sources:
  - deal_overview.csv          Project nodes, Customer nodes + HAS_PROJECT edges
  - project_closeout.csv       Closeout properties merged onto Project nodes
  - budget.csv                 BudgetEntry nodes + category/metric vocabulary
  - budget_actuals_fcst.csv    BudgetActualEntry nodes per period
  - staffing_plan.csv          StaffingPlanEntry nodes per role/year
  - staffing_actuals_fcst.csv  StaffingActualEntry nodes per person/period
  - status_report.csv          StatusReport nodes per period
"""

import csv
import hashlib
import re
from pathlib import Path
from typing import Any

from neo4j import Driver
from rich.console import Console

console = Console()

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_CATEGORIES = ["Risk Reserve", "Fees", "Expenses", "Total"]
_METRICS = ["Revenue", "Cost", "Margin"]

BATCH_SIZE = 500


def _load(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _coerce(v: str | None) -> Any:
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip()
    try:
        return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        pass
    return s


def _stable_id(prefix: str, *parts: str) -> str:
    """
    Safe, stable node ID. Hashes variable-length parts so long strings and
    special characters never break uniqueness constraints.
    """
    body = "_".join(str(p) for p in parts)
    digest = hashlib.md5(body.encode()).hexdigest()[:10]
    return f"{prefix}_{digest}"


def _split_component(raw: str) -> tuple[str, str]:
    """Split 'Fees Revenue' or 'Risk Reserve - Cost' into (category, metric)."""
    cleaned = re.sub(r"\s*[-–]\s*", " ", raw).strip()
    category = ""
    for cat in _CATEGORIES:
        if cleaned.startswith(cat):
            category = cat
            remainder = cleaned[len(cat) :].strip()
            break
    else:
        remainder = cleaned
    metric = next((m for m in _METRICS if remainder == m), "")
    return category or cleaned, metric


def _batches(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _merge_nodes(session, label: str, rows: list[dict]) -> int:
    """UNWIND-MERGE a batch of nodes by _id. Returns count created."""
    q = (
        f"UNWIND $rows AS row "
        f"MERGE (n:{label} {{_id: row._id}}) "
        "ON CREATE SET n += row, n._created = true "
        "ON MATCH  SET n += row, n._created = false "
        "RETURN sum(CASE WHEN n._created THEN 1 ELSE 0 END) AS created"
    )
    record = session.run(q, rows=rows).single()
    return int(record["created"]) if record else 0


def _merge_edges(session, src_label: str, dst_label: str, rel_type: str, pairs: list[dict]) -> int:
    """UNWIND-MERGE a batch of relationships. Returns count created."""
    q = (
        f"UNWIND $pairs AS p "
        f"MATCH (a:{src_label} {{_id: p.src}}) "
        f"MATCH (b:{dst_label} {{_id: p.dst}}) "
        f"MERGE (a)-[r:{rel_type}]->(b) "
        "ON CREATE SET r._created = true "
        "ON MATCH  SET r._created = false "
        "RETURN sum(CASE WHEN r._created THEN 1 ELSE 0 END) AS created"
    )
    record = session.run(q, pairs=pairs).single()
    return int(record["created"]) if record else 0


def _flush_nodes(session, label: str, nodes: dict[str, dict]) -> tuple[int, int]:
    """Write {_id: props} dict to Neo4j in batches. Returns (created, merged)."""
    rows = [{"_id": k, **v} for k, v in nodes.items()]
    created = 0
    for batch in _batches(rows, BATCH_SIZE):
        n = _merge_nodes(session, label, batch)
        created += n
    merged = len(rows) - created
    return created, merged


def _flush_edges(session, src_label: str, dst_label: str, rel_type: str, pairs: list[dict]) -> int:
    """Write edge pairs to Neo4j in batches. Returns count created."""
    created = 0
    for batch in _batches(pairs, BATCH_SIZE):
        created += _merge_edges(session, src_label, dst_label, rel_type, batch)
    return created


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

CONSTRAINTS: list[tuple[str, str]] = [
    ("Project", "_id"),
    ("Customer", "_id"),
    ("Period", "_id"),
    ("BudgetEntry", "_id"),
    ("BudgetActualEntry", "_id"),
    ("BudgetCategory", "_id"),
    ("BudgetMetric", "_id"),
    ("Role", "_id"),
    ("Person", "_id"),
    ("StaffingPlanEntry", "_id"),
    ("StaffingActualEntry", "_id"),
    ("StatusReport", "_id"),
]


def create_constraints(driver: Driver):
    """Create uniqueness constraints for every node label (idempotent)."""
    with driver.session() as session:
        for label, prop in CONSTRAINTS:
            name = f"unique_{label.lower()}_{prop.lstrip('_')}"
            session.run(
                f"CREATE CONSTRAINT {name} IF NOT EXISTS FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE"
            )


# ---------------------------------------------------------------------------
# Per-file ingestors
# ---------------------------------------------------------------------------


def ingest_deal_overview(driver: Driver, path: Path):
    rows = _load(path)
    console.print("[bold cyan]Ingesting deal overview[/]")

    customers: dict[str, dict] = {}
    projects: dict[str, dict] = {}
    edges: list[dict] = []

    for row in rows:
        pid = row["project_id"].strip()
        cid = row["customer_id"].strip()
        if not pid:
            continue

        customers[cid] = {
            "customer_id": cid,
            "customer_name": _coerce(row.get("customer_name")),
            "customer_location": _coerce(row.get("customer_location")),
            "customer_industry": _coerce(row.get("customer_industry")),
            "source": "deal_overview.csv",
        }
        projects[pid] = {
            "project_id": pid,
            "project_name": _coerce(row.get("project_name")),
            "deal_terms": _coerce(row.get("deal_terms")),
            "deal_type": _coerce(row.get("deal_type")),
            "deal_signature_date": _coerce(row.get("deal_signature_date")),
            "start_date": _coerce(row.get("start_date")),
            "end_date": _coerce(row.get("end_date")),
            "source": "deal_overview.csv",
        }
        edges.append({"src": cid, "dst": pid})

    with driver.session() as session:
        cc, cm = _flush_nodes(session, "Customer", customers)
        pc, pm = _flush_nodes(session, "Project", projects)
        ec = _flush_edges(session, "Customer", "Project", "HAS_PROJECT", edges)

    console.print(
        f"  [green]✓[/] {len(rows)} rows → "
        f"{cc} customers created, {pc} projects created, {ec} edges"
    )


def ingest_project_closeout(driver: Driver, path: Path):
    rows = _load(path)
    console.print("[bold cyan]Ingesting project closeout[/]")

    projects: dict[str, dict] = {}

    for row in rows:
        pid = row["project_id"].strip()
        if not pid:
            continue
        projects[pid] = {
            "project_id": pid,
            "project_outcomes": _coerce(row.get("project_outcomes")),
            "lessons_learned": _coerce(row.get("lessons_learned")),
            "customer_satisfaction": _coerce(row.get("customer_satisfaction")),
            "closeout_start_date": _coerce(row.get("start_date")),
            "closeout_end_date": _coerce(row.get("end_date")),
            "source": "project_closeout.csv",
        }

    with driver.session() as session:
        _, merged = _flush_nodes(session, "Project", projects)

    console.print(
        f"  [green]✓[/] {len(rows)} rows → "
        f"closeout properties merged onto {merged} existing projects"
    )


def ingest_budget(driver: Driver, path: Path):
    rows = _load(path)
    console.print("[bold cyan]Ingesting budget[/]")

    categories: dict[str, dict] = {}
    metrics: dict[str, dict] = {}
    entries: dict[str, dict] = {}
    e_proj, e_cat, e_met = [], [], []

    for row in rows:
        pid = row["project_id"].strip()
        year = row["year"].strip()
        comp = row["budget_component"].strip()
        if not pid or not comp:
            continue

        cat, metric = _split_component(comp)
        categories[cat] = {"name": cat, "source": "budget.csv"}
        metrics[metric] = {"name": metric, "source": "budget.csv"}

        eid = _stable_id("budget", pid, year, comp)
        entries[eid] = {
            "project_id": pid,
            "year": _coerce(year),
            "budget_component": comp,
            "usd": _coerce(row.get("usd")),
            "source": "budget.csv",
        }
        e_proj.append({"src": pid, "dst": eid})
        e_cat.append({"src": eid, "dst": cat})
        e_met.append({"src": eid, "dst": metric})

    with driver.session() as session:
        _flush_nodes(session, "BudgetCategory", categories)
        _flush_nodes(session, "BudgetMetric", metrics)
        ec, _ = _flush_nodes(session, "BudgetEntry", entries)
        _flush_edges(session, "Project", "BudgetEntry", "HAS_BUDGET_ENTRY", e_proj)
        _flush_edges(session, "BudgetEntry", "BudgetCategory", "OF_CATEGORY", e_cat)
        _flush_edges(session, "BudgetEntry", "BudgetMetric", "OF_METRIC", e_met)

    console.print(
        f"  [green]✓[/] {len(rows)} rows → "
        f"{ec} budget entries, {len(categories)} categories, {len(metrics)} metrics"
    )


def ingest_budget_actuals_fcst(driver: Driver, path: Path):
    rows = _load(path)
    console.print("[bold cyan]Ingesting budget actuals / forecast[/]")

    periods: dict[str, dict] = {}
    categories: dict[str, dict] = {}
    metrics: dict[str, dict] = {}
    entries: dict[str, dict] = {}
    e_proj, e_per, e_cat, e_met = [], [], [], []

    for row in rows:
        pid = row["project_id"].strip()
        period = row["period_ending_date"].strip()
        comp = row["budget_component"].strip()
        if not pid or not period or not comp:
            continue

        cat, metric = _split_component(comp)
        per_id = _stable_id("period", pid, period)
        eid = _stable_id("baf", pid, period, comp)

        periods[per_id] = {
            "project_id": pid,
            "period_ending_date": period,
            "source": "budget_actuals_fcst.csv",
        }
        categories[cat] = {"name": cat, "source": "budget_actuals_fcst.csv"}
        metrics[metric] = {"name": metric, "source": "budget_actuals_fcst.csv"}
        entries[eid] = {
            "project_id": pid,
            "year": _coerce(row.get("year")),
            "budget_component": comp,
            "usd_planned": _coerce(row.get("usd_planned")),
            "actuals_usd": _coerce(row.get("actuals_usd")),
            "forecast_usd": _coerce(row.get("forecast_usd")),
            "source": "budget_actuals_fcst.csv",
        }
        e_proj.append({"src": pid, "dst": eid})
        e_per.append({"src": eid, "dst": per_id})
        e_cat.append({"src": eid, "dst": cat})
        e_met.append({"src": eid, "dst": metric})

    with driver.session() as session:
        _flush_nodes(session, "Period", periods)
        _flush_nodes(session, "BudgetCategory", categories)
        _flush_nodes(session, "BudgetMetric", metrics)
        ec, _ = _flush_nodes(session, "BudgetActualEntry", entries)
        _flush_edges(session, "Project", "BudgetActualEntry", "HAS_BUDGET_ACTUAL", e_proj)
        _flush_edges(session, "BudgetActualEntry", "Period", "IN_PERIOD", e_per)
        _flush_edges(session, "BudgetActualEntry", "BudgetCategory", "OF_CATEGORY", e_cat)
        _flush_edges(session, "BudgetActualEntry", "BudgetMetric", "OF_METRIC", e_met)

    console.print(f"  [green]✓[/] {len(rows)} rows → {ec} entries across {len(periods)} periods")


def ingest_staffing_plan(driver: Driver, path: Path):
    rows = _load(path)
    console.print("[bold cyan]Ingesting staffing plan[/]")

    roles: dict[str, dict] = {}
    entries: dict[str, dict] = {}
    e_proj, e_role = [], []

    for row in rows:
        pid = row["project_id"].strip()
        year = row["year"].strip()
        role = row["resource"].strip()
        if not pid or not role:
            continue

        roles[role] = {"name": role, "source": "staffing_plan.csv"}

        eid = _stable_id("sp", pid, year, role)
        entries[eid] = {
            "project_id": pid,
            "year": _coerce(year),
            "role": role,
            "role_description": _coerce(row.get("role_description")),
            "bill_rate": _coerce(row.get("bill_rate")),
            "cost_rate": _coerce(row.get("cost_rate")),
            "total_hours": _coerce(row.get("total_hours")),
            "labor_revenue": _coerce(row.get("labor_revenue")),
            "labor_cost": _coerce(row.get("labor_cost")),
            "labor_margin": _coerce(row.get("labor_margin")),
            "source": "staffing_plan.csv",
        }
        e_proj.append({"src": pid, "dst": eid})
        e_role.append({"src": eid, "dst": role})

    with driver.session() as session:
        _flush_nodes(session, "Role", roles)
        ec, _ = _flush_nodes(session, "StaffingPlanEntry", entries)
        _flush_edges(session, "Project", "StaffingPlanEntry", "HAS_STAFFING_PLAN", e_proj)
        _flush_edges(session, "StaffingPlanEntry", "Role", "FOR_ROLE", e_role)

    console.print(f"  [green]✓[/] {len(rows)} rows → {ec} plan entries, {len(roles)} roles")


def ingest_staffing_actuals_fcst(driver: Driver, path: Path):
    rows = _load(path)
    console.print("[bold cyan]Ingesting staffing actuals / forecast[/]")

    periods: dict[str, dict] = {}
    roles: dict[str, dict] = {}
    persons: dict[str, dict] = {}
    entries: dict[str, dict] = {}
    e_proj, e_per, e_role, e_person = [], [], [], []

    for row in rows:
        pid = row["project_id"].strip()
        period = row["period_ending_date"].strip()
        role = row["resource"].strip()
        name = row.get("resource_name", "").strip()
        if not pid or not period or not role:
            continue

        per_id = _stable_id("period", pid, period)
        person_id = _stable_id("person", name) if name else _stable_id("person", role, "unknown")
        eid = _stable_id("saf", pid, period, role, person_id)

        periods[per_id] = {
            "project_id": pid,
            "period_ending_date": period,
            "source": "staffing_actuals_fcst.csv",
        }
        roles[role] = {"name": role, "source": "staffing_actuals_fcst.csv"}
        persons[person_id] = {
            "name": name or f"Unknown ({role})",
            "source": "staffing_actuals_fcst.csv",
        }
        entries[eid] = {
            "project_id": pid,
            "year": _coerce(row.get("year")),
            "role": role,
            "resource_name": name,
            "bill_rate": _coerce(row.get("bill_rate")),
            "cost_rate": _coerce(row.get("cost_rate")),
            "actual_hours": _coerce(row.get("actual_hours")),
            "actual_revenue": _coerce(row.get("actual_revenue")),
            "actual_cost": _coerce(row.get("actual_cost")),
            "actual_margin": _coerce(row.get("actual_margin")),
            "fcst_hours": _coerce(row.get("fcst_hours")),
            "fcst_revenue": _coerce(row.get("fcst_revenue")),
            "fcst_cost": _coerce(row.get("fcst_cost")),
            "fcst_margin": _coerce(row.get("fcst_margin")),
            "source": "staffing_actuals_fcst.csv",
        }
        e_proj.append({"src": pid, "dst": eid})
        e_per.append({"src": eid, "dst": per_id})
        e_role.append({"src": eid, "dst": role})
        e_person.append({"src": eid, "dst": person_id})

    with driver.session() as session:
        _flush_nodes(session, "Period", periods)
        _flush_nodes(session, "Role", roles)
        _flush_nodes(session, "Person", persons)
        ec, _ = _flush_nodes(session, "StaffingActualEntry", entries)
        _flush_edges(session, "Project", "StaffingActualEntry", "HAS_STAFFING_ACTUAL", e_proj)
        _flush_edges(session, "StaffingActualEntry", "Period", "IN_PERIOD", e_per)
        _flush_edges(session, "StaffingActualEntry", "Role", "FOR_ROLE", e_role)
        _flush_edges(session, "StaffingActualEntry", "Person", "ASSIGNED_TO", e_person)

    console.print(
        f"  [green]✓[/] {len(rows)} rows → "
        f"{ec} entries, {len(persons)} people, {len(periods)} periods"
    )


def ingest_status_report(driver: Driver, path: Path):
    rows = _load(path)
    console.print("[bold cyan]Ingesting status reports[/]")

    periods: dict[str, dict] = {}
    reports: dict[str, dict] = {}
    e_proj, e_per = [], []

    for row in rows:
        pid = row["project_id"].strip()
        period = row["period_ending_date"].strip()
        if not pid or not period:
            continue

        per_id = _stable_id("period", pid, period)
        report_id = _stable_id("sr", pid, period)

        periods[per_id] = {
            "project_id": pid,
            "period_ending_date": period,
            "source": "status_report.csv",
        }
        reports[report_id] = {
            "project_id": pid,
            "year": _coerce(row.get("year")),
            "period_ending_date": period,
            "scope_status": _coerce(row.get("scope_status")),
            "resourcing_status": _coerce(row.get("resourcing_status")),
            "timeline_status": _coerce(row.get("timeline_status")),
            "financial_status": _coerce(row.get("financial_status")),
            "accomplishments": _coerce(row.get("accomplishments")),
            "plans": _coerce(row.get("plans")),
            "risks": _coerce(row.get("risks")),
            "issues": _coerce(row.get("issues")),
            "changes": _coerce(row.get("changes")),
            "source": "status_report.csv",
        }
        e_proj.append({"src": pid, "dst": report_id})
        e_per.append({"src": report_id, "dst": per_id})

    with driver.session() as session:
        _flush_nodes(session, "Period", periods)
        ec, _ = _flush_nodes(session, "StatusReport", reports)
        _flush_edges(session, "Project", "StatusReport", "HAS_STATUS_REPORT", e_proj)
        _flush_edges(session, "StatusReport", "Period", "IN_PERIOD", e_per)

    console.print(
        f"  [green]✓[/] {len(rows)} rows → {ec} status reports across {len(periods)} periods"
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

# Ingestion order matters: Project/Customer must exist before detail files
_FILE_MAP = {
    "deal_overview.csv": ingest_deal_overview,
    "project_closeout.csv": ingest_project_closeout,
    "budget.csv": ingest_budget,
    "budget_actuals_fcst.csv": ingest_budget_actuals_fcst,
    "staffing_plan.csv": ingest_staffing_plan,
    "staffing_actuals_fcst.csv": ingest_staffing_actuals_fcst,
    "status_report.csv": ingest_status_report,
}


def ingest_all_csv(driver: Driver, data_dir: Path):
    """Run all CSV ingestion in dependency order."""
    console.rule("[bold]CSV Project Data Ingestion")

    create_constraints(driver)

    all_csv = {p.name: p for p in data_dir.glob("*.csv")}

    for filename, fn in _FILE_MAP.items():
        candidate = all_csv.get(filename)
        if not candidate:
            console.print(f"  [yellow]⚠[/] {filename} not found, skipping")
            continue
        fn(driver, candidate)

    console.print("\n[bold green]✓ All CSV project data ingested[/]")
