from __future__ import annotations

import csv
import hashlib
import logging
from collections import defaultdict
from pathlib import Path

from neo4j import Driver
from rich.console import Console

console = Console()
logger = logging.getLogger(__name__)


def _stable_id(*parts: str) -> str:
    return hashlib.md5(":".join(parts).encode()).hexdigest()[:8]


def _safe_float(val: str) -> float | None:
    try:
        return float(val) if val.strip() else None
    except (ValueError, AttributeError):
        return None


def _load_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _derive_outcome(satisfaction: float | None, scope: str, financial: str, timeline: str) -> str:
    if satisfaction is None:
        return "unknown"
    if satisfaction >= 4.5 and all(s == "Green" for s in [scope, financial, timeline]):
        return "clean"
    if satisfaction < 3.5 or financial == "Red" or timeline == "Red":
        return "at_risk"
    return "amended"


def _compute_budget_totals(budget_rows: list[dict]) -> dict[str, dict]:
    totals: dict[str, dict] = defaultdict(lambda: {"revenue": 0.0, "cost": 0.0, "expenses": 0.0})
    for row in budget_rows:
        pid = row["project_id"]
        usd = _safe_float(row["usd"]) or 0.0
        comp = row["budget_component"]
        if comp == "Fees Revenue":
            totals[pid]["revenue"] += usd
        elif comp == "Fees Cost":
            totals[pid]["cost"] += usd
        elif comp == "Expenses Revenue":
            totals[pid]["expenses"] += usd
    for pid, t in totals.items():
        t["margin_pct"] = (
            round((t["revenue"] - t["cost"]) / t["revenue"] * 100, 2) if t["revenue"] > 0 else 0.0
        )
    return dict(totals)


def _latest_status(status_rows: list[dict]) -> dict[str, dict]:
    latest: dict[str, dict] = {}
    for row in status_rows:
        pid = row["project_id"]
        if pid not in latest or row["period_ending_date"] > latest[pid]["period_ending_date"]:
            latest[pid] = row
    return latest


def _staffing_summary(staffing_rows: list[dict]) -> dict[str, dict]:
    summary: dict[str, dict] = defaultdict(
        lambda: {"roles": set(), "total_hours": 0.0, "total_revenue": 0.0}
    )
    for row in staffing_rows:
        pid = row["project_id"]
        summary[pid]["roles"].add(row["resource"])
        summary[pid]["total_hours"] += _safe_float(row["total_hours"]) or 0.0
        summary[pid]["total_revenue"] += _safe_float(row["labor_revenue"]) or 0.0
    return {pid: {**v, "roles": sorted(v["roles"])} for pid, v in summary.items()}


def ingest_deal_data(driver: Driver, data_dir: Path):
    """
    Ingest synthetic deal CSVs into Neo4j as DealContext nodes.

    Creates:
      DealContext     — one per project, core deal metadata
      Customer        — one per unique customer
      Industry        — one per unique industry
      StaffingRole    — one per unique role
      StatusSnapshot  — one per status period (scope/financial/timeline health)

    Relationships:
      (SOW)-[:HAS_CONTEXT]->(DealContext)
      (DealContext)-[:FOR_CUSTOMER]->(Customer)
      (Customer)-[:IN_INDUSTRY]->(Industry)
      (DealContext)-[:HAD_ROLE]->(StaffingRole)
      (DealContext)-[:HAS_STATUS]->(StatusSnapshot)
    """
    console.rule("[bold]Deal Data Ingestion")

    deal_overview = _load_csv(data_dir / "deal_overview.csv")
    budget_rows = _load_csv(data_dir / "budget.csv")
    closeout_rows = _load_csv(data_dir / "project_closeout.csv")
    status_rows = _load_csv(data_dir / "status_report.csv")
    staffing_rows = _load_csv(data_dir / "staffing_plan.csv")

    budget_totals = _compute_budget_totals(budget_rows)
    latest_statuses = _latest_status(status_rows)
    staffing = _staffing_summary(staffing_rows)
    closeout = {r["project_id"]: r for r in closeout_rows}

    written = 0
    for deal in deal_overview:
        pid = deal["project_id"]

        budget = budget_totals.get(pid, {})
        status = latest_statuses.get(pid, {})
        co = closeout.get(pid, {})
        staff = staffing.get(pid, {})

        satisfaction = _safe_float(co.get("customer_satisfaction", ""))
        outcome = _derive_outcome(
            satisfaction,
            status.get("scope_status", ""),
            status.get("financial_status", ""),
            status.get("timeline_status", ""),
        )

        revenue = budget.get("revenue", 0.0)
        margin_pct = budget.get("margin_pct", 0.0)
        industry = deal["customer_industry"]
        customer = deal["customer_name"]

        with driver.session() as session:
            session.run(
                """
                MERGE (dc:DealContext {project_id: $pid})
                SET dc.project_name        = $project_name,
                    dc.deal_terms          = $deal_terms,
                    dc.deal_type           = $deal_type,
                    dc.customer_id         = $customer_id,
                    dc.customer_name       = $customer_name,
                    dc.customer_location   = $customer_location,
                    dc.industry            = $industry,
                    dc.deal_signature_date = $sig_date,
                    dc.start_date          = $start_date,
                    dc.end_date            = $end_date,
                    dc.total_revenue       = $revenue,
                    dc.margin_pct          = $margin_pct,
                    dc.outcome             = $outcome,
                    dc.customer_satisfaction = $satisfaction,
                    dc.total_hours         = $total_hours,
                    dc.scope_status        = $scope_status,
                    dc.financial_status    = $financial_status,
                    dc.timeline_status     = $timeline_status,
                    dc.staffing_roles      = $roles,
                    dc.lessons_learned     = $lessons,
                    dc.project_outcomes    = $proj_outcomes
                """,
                pid=pid,
                project_name=deal["project_name"],
                deal_terms=deal["deal_terms"],
                deal_type=deal["deal_type"],
                customer_id=deal["customer_id"],
                customer_name=customer,
                customer_location=deal["customer_location"],
                industry=industry,
                sig_date=deal["deal_signature_date"],
                start_date=deal["start_date"],
                end_date=deal["end_date"],
                revenue=revenue,
                margin_pct=margin_pct,
                outcome=outcome,
                satisfaction=satisfaction,
                total_hours=staff.get("total_hours", 0.0),
                scope_status=status.get("scope_status", ""),
                financial_status=status.get("financial_status", ""),
                timeline_status=status.get("timeline_status", ""),
                roles=staff.get("roles", []),
                lessons=co.get("lessons_learned", "")[:1000],
                proj_outcomes=co.get("project_outcomes", "")[:1000],
            )

            session.run(
                """
                MERGE (c:Customer {customer_id: $cid})
                SET c.name     = $name,
                    c.location = $location
                WITH c
                MATCH (dc:DealContext {project_id: $pid})
                MERGE (dc)-[:FOR_CUSTOMER]->(c)
                """,
                cid=deal["customer_id"],
                name=customer,
                location=deal["customer_location"],
                pid=pid,
            )

            session.run(
                """
                MERGE (i:Industry {name: $industry})
                WITH i
                MATCH (c:Customer {customer_id: $cid})
                MERGE (c)-[:IN_INDUSTRY]->(i)
                """,
                industry=industry,
                cid=deal["customer_id"],
            )

            for role in staff.get("roles", []):
                session.run(
                    """
                    MERGE (r:StaffingRole {name: $role})
                    WITH r
                    MATCH (dc:DealContext {project_id: $pid})
                    MERGE (dc)-[:HAD_ROLE]->(r)
                    """,
                    role=role,
                    pid=pid,
                )

        written += 1
        console.print(
            f"  [dim]→[/] [cyan]{pid}[/] {deal['project_name'][:50]} | "
            f"industry=[yellow]{industry}[/] | outcome=[{'green' if outcome == 'clean' else 'red'}]{outcome}[/] | "
            f"${revenue:,.0f} {margin_pct:.1f}%"
        )

    _write_status_snapshots(driver, status_rows)

    console.print(f"\n[bold green]✓ {written} DealContext nodes written[/]")
    _print_summary(driver)


def _write_status_snapshots(driver: Driver, status_rows: list[dict]):
    for row in status_rows:
        pid = row["project_id"]
        snap_id = _stable_id(pid, row["period_ending_date"])

        with driver.session() as session:
            session.run(
                """
                MERGE (ss:StatusSnapshot {snapshot_id: $snap_id})
                SET ss.project_id      = $pid,
                    ss.period_ending   = $period,
                    ss.scope_status    = $scope,
                    ss.resourcing_status = $resourcing,
                    ss.timeline_status = $timeline,
                    ss.financial_status = $financial,
                    ss.risks           = $risks,
                    ss.issues          = $issues
                WITH ss
                MATCH (dc:DealContext {project_id: $pid})
                MERGE (dc)-[:HAS_STATUS]->(ss)
                """,
                snap_id=snap_id,
                pid=pid,
                period=row["period_ending_date"],
                scope=row["scope_status"],
                resourcing=row["resourcing_status"],
                timeline=row["timeline_status"],
                financial=row["financial_status"],
                risks=row.get("risks", "")[:500],
                issues=row.get("issues", "")[:500],
            )


def _print_summary(driver: Driver):
    with driver.session() as session:
        stats = session.run(
            """
            MATCH (dc:DealContext)
            RETURN
                count(dc) AS deals,
                avg(dc.total_revenue) AS avg_revenue,
                avg(dc.margin_pct) AS avg_margin,
                avg(dc.customer_satisfaction) AS avg_satisfaction,
                collect(DISTINCT dc.outcome) AS outcomes,
                collect(DISTINCT dc.industry) AS industries
            """
        ).single()

    from rich.table import Table

    t = Table(title="Deal Data Summary")
    t.add_column("Metric")
    t.add_column("Value")
    t.add_row("Total deals", str(stats["deals"]))
    t.add_row("Avg revenue", f"${stats['avg_revenue']:,.0f}" if stats["avg_revenue"] else "—")
    t.add_row("Avg margin", f"{stats['avg_margin']:.1f}%" if stats["avg_margin"] else "—")
    t.add_row(
        "Avg satisfaction",
        f"{stats['avg_satisfaction']:.2f}/5.0" if stats["avg_satisfaction"] else "—",
    )
    t.add_row("Outcomes", ", ".join(sorted(filter(None, stats["outcomes"]))))
    t.add_row("Industries", ", ".join(sorted(filter(None, stats["industries"]))))
    console.print(t)
