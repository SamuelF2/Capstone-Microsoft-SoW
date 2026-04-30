@cli.command("ingest-deals")
@click.option("--data-dir", default=str(DATA_DIR), show_default=True)
def ingest_deals(data_dir: str):
    """Ingest synthetic deal CSV data into Neo4j as DealContext nodes."""
    from sow_kg.ingest_deal_data import ingest_deal_data
    driver = get_driver()
    ingest_deal_data(driver, Path(data_dir))
    driver.close()


@cli.command("deals-summary")
def deals_summary():
    """Print aggregate deal analytics across all DealContext nodes."""
    from sow_kg.deal_queries import get_deals_summary
    driver = get_driver()
    result = get_deals_summary(driver)

    t = Table(title="Deal Analytics — Totals")
    t.add_column("Metric")
    t.add_column("Value", justify="right")
    totals = result["totals"]
    t.add_row("Total deals",      str(totals.get("total_deals", 0)))
    t.add_row("Total revenue",    f"${totals.get('total_revenue', 0):,.0f}")
    t.add_row("Avg revenue",      f"${totals.get('avg_revenue', 0):,.0f}")
    t.add_row("Avg margin",       f"{totals.get('avg_margin', 0):.1f}%")
    t.add_row("Avg satisfaction", f"{totals.get('avg_satisfaction', 0):.2f}/5.0")
    console.print(t)

    t2 = Table(title="By Outcome")
    t2.add_column("Outcome")
    t2.add_column("Count",   justify="right")
    t2.add_column("Avg Revenue", justify="right")
    t2.add_column("Avg Margin",  justify="right")
    t2.add_column("Avg Sat",     justify="right")
    for r in result["by_outcome"]:
        t2.add_row(
            r["outcome"] or "unknown",
            str(r["count"]),
            f"${r['avg_revenue']:,.0f}" if r["avg_revenue"] else "—",
            f"{r['avg_margin']:.1f}%" if r["avg_margin"] else "—",
            f"{r['avg_satisfaction']:.2f}" if r["avg_satisfaction"] else "—",
        )
    console.print(t2)

    t3 = Table(title="By Industry")
    t3.add_column("Industry")
    t3.add_column("Count",   justify="right")
    t3.add_column("Avg Revenue", justify="right")
    t3.add_column("Avg Margin",  justify="right")
    for r in result["by_industry"]:
        t3.add_row(
            r["industry"] or "unknown",
            str(r["count"]),
            f"${r['avg_revenue']:,.0f}" if r["avg_revenue"] else "—",
            f"{r['avg_margin']:.1f}%" if r["avg_margin"] else "—",
        )
    console.print(t3)

    if result["risk_patterns"]:
        t4 = Table(title="Risk Patterns in At-Risk/Amended Deals")
        t4.add_column("Banned Phrase", style="red")
        t4.add_column("Occurrences",   justify="right")
        for r in result["risk_patterns"]:
            t4.add_row(r["phrase"], str(r["occurrences"]))
        console.print(t4)

    driver.close()


@cli.command("deal-risk")
@click.option("--project-id", required=True)
def deal_risk(project_id: str):
    """Show risk profile for a deal — banned phrases, missing sections, status history, risk score."""
    from sow_kg.deal_queries import get_deal_risk_profile
    driver = get_driver()
    result = get_deal_risk_profile(driver, project_id)

    console.print(Panel.fit(
        f"[bold]Risk Profile[/] — {project_id}\n"
        f"Risk Score: [{'red' if result['risk_score'] > 0.6 else 'yellow' if result['risk_score'] > 0.3 else 'green'}]{result['risk_score']:.3f}[/]",
        title="Deal Risk",
    ))

    if result["banned_phrases"]:
        t = Table(title="Banned Phrases")
        t.add_column("Section")
        t.add_column("Phrase", style="red")
        t.add_column("Severity")
        for r in result["banned_phrases"]:
            t.add_row(r.get("section", ""), r.get("phrase", ""), r.get("severity", ""))
        console.print(t)

    if result["missing_sections"]:
        t2 = Table(title="Missing Required Sections")
        t2.add_column("Section", style="red")
        t2.add_column("Rule")
        for r in result["missing_sections"]:
            t2.add_row(r.get("missing_section", ""), r.get("rule", ""))
        console.print(t2)

    if result["status_history"]:
        t3 = Table(title="Status History")
        t3.add_column("Period")
        t3.add_column("Scope")
        t3.add_column("Financial")
        t3.add_column("Timeline")
        for r in result["status_history"]:
            def color(s):
                return f"[{'green' if s=='Green' else 'yellow' if s=='Yellow' else 'red'}]{s}[/]"
            t3.add_row(
                r.get("period", ""),
                color(r.get("scope", "")),
                color(r.get("financial", "")),
                color(r.get("timeline", "")),
            )
        console.print(t3)

    driver.close()


@cli.command("link-deal")
@click.option("--sow-id",     required=True)
@click.option("--project-id", required=True)
def link_deal(sow_id: str, project_id: str):
    """Link a SOW node to a DealContext node."""
    from sow_kg.deal_queries import link_sow_to_deal_context
    driver = get_driver()
    link_sow_to_deal_context(driver, sow_id, project_id)
    console.print(f"[green]Linked[/] [cyan]{sow_id}[/] → [cyan]{project_id}[/]")
    driver.close()
