from datetime import UTC, datetime


@cli.command("schema-proposals")
@click.option(
    "--status",
    default="all",
    type=click.Choice(["all", "pending", "accepted", "rejected", "promoted", "evaluated"]),
)
@click.option("--kind", default=None, type=click.Choice(["node", "edge", "section_type"]))
def schema_proposals(status: str, kind: str):
    """List schema evolution proposals."""
    driver = get_driver()

    filters = []
    if status == "pending":
        filters.append(
            "p.accepted = false AND coalesce(p.rejected, false) = false AND coalesce(p.promoted, false) = false"
        )
    elif status == "accepted":
        filters.append("p.accepted = true AND coalesce(p.promoted, false) = false")
    elif status == "rejected":
        filters.append("coalesce(p.rejected, false) = true")
    elif status == "promoted":
        filters.append("p.promoted = true")
    elif status == "evaluated":
        filters.append("p.eval_score IS NOT NULL")
    if kind:
        filters.append(f"p.kind = '{kind}'")

    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    with driver.session() as session:
        rows = session.run(
            f"""
            MATCH (p:SchemaProposal)
            {where}
            OPTIONAL MATCH (p)-[:PROPOSED_FROM]->(sec:Section)
            WITH p, count(sec) AS linked_sections
            RETURN p.proposal_id AS pid, p.kind AS kind, p.label AS label,
                   p.confidence AS confidence, p.accepted AS accepted,
                   p.rejected AS rejected, p.promoted AS promoted,
                   p.usage_count AS uses, p.source_doc AS source,
                   p.promoted_nodes AS pnodes, p.promoted_edges AS pedges,
                   p.eval_score AS eval_score, p.eval_recommendation AS eval_rec,
                   linked_sections
            ORDER BY p.usage_count DESC, p.confidence DESC
            """
        ).data()

    t = Table(title=f"Schema Proposals [{status}]")
    t.add_column("ID", style="dim")
    t.add_column("Kind")
    t.add_column("Label", style="cyan")
    t.add_column("Conf", justify="right")
    t.add_column("Uses", justify="right")
    t.add_column("Linked", justify="right")
    t.add_column("Eval", justify="right")
    t.add_column("Status")
    t.add_column("Source", style="dim")

    for r in rows:
        if r.get("promoted"):
            status_str = f"[green]promoted[/] ({r.get('pnodes', 0)}n {r.get('pedges', 0)}e)"
        elif r.get("rejected"):
            status_str = "[red]rejected[/]"
        elif r.get("accepted"):
            status_str = "[yellow]accepted[/]"
        else:
            status_str = "[dim]pending[/]"

        eval_str = f"{r['eval_score']:.2f} ({r['eval_rec']})" if r.get("eval_score") else "—"

        t.add_row(
            (r["pid"] or "")[:12],
            r["kind"] or "",
            r["label"] or "",
            f"{r['confidence']:.2f}" if r["confidence"] else "?",
            str(r["uses"] or 0),
            str(r["linked_sections"] or 0),
            eval_str,
            status_str,
            (r["source"] or "")[:30],
        )
    console.print(t)
    driver.close()


@cli.command("review-proposal")
@click.option("--id", "proposal_id", required=True)
@click.option("--accept", "action", flag_value="accept")
@click.option("--reject", "action", flag_value="reject")
@click.option("--promote", "action", flag_value="promote")
@click.option("--tag", multiple=True)
@click.option("--note", default=None)
@click.option("--reviewed-by", default="human", show_default=True)
def review_proposal(proposal_id: str, action: str, tag: tuple, note: str, reviewed_by: str):
    """Accept, reject, tag, or promote a schema proposal."""
    if not action and not tag and not note:
        console.print("[red]Specify --accept, --reject, --promote, or at least --tag / --note[/]")
        return

    driver = get_driver()
    ts = datetime.now(UTC).isoformat()

    with driver.session() as session:
        existing = session.run(
            "MATCH (p:SchemaProposal {proposal_id: $pid}) RETURN p.label AS label, p.accepted AS accepted",
            pid=proposal_id,
        ).single()

    if not existing:
        console.print(f"[red]Proposal {proposal_id} not found[/]")
        driver.close()
        return

    if action == "promote":
        if not existing["accepted"]:
            console.print("[red]Proposal must be accepted before promoting. Use --accept first.[/]")
            driver.close()
            return
        from sow_kg.schema_evolution import promote_proposal

        result = promote_proposal(driver, proposal_id)
        if result["promoted"]:
            console.print(
                f"[green]Promoted[/] [cyan]{existing['label']}[/] → "
                f"{result.get('nodes_written', 0)} nodes, {result.get('edges_written', 0)} edges"
            )
            if result.get("note"):
                console.print(f"[yellow]Note:[/] {result['note']}")
        else:
            console.print(f"[yellow]Not promoted:[/] {result.get('reason', 'unknown')}")
        driver.close()
        return

    set_parts = ["p.reviewed_by=$reviewed_by", "p.reviewed_at=$ts"]
    params: dict = {"pid": proposal_id, "reviewed_by": reviewed_by, "ts": ts}

    if action == "accept":
        set_parts += ["p.accepted=true", "p.rejected=false"]
    elif action == "reject":
        set_parts += ["p.accepted=false", "p.rejected=true"]
    if tag:
        set_parts.append("p.tags=$tags")
        params["tags"] = list(tag)
    if note:
        set_parts.append("p.note=$note")
        params["note"] = note

    with driver.session() as session:
        session.run(
            f"MATCH (p:SchemaProposal {{proposal_id: $pid}}) SET {', '.join(set_parts)}",
            **params,
        )

    action_str = f"[green]{action}ed[/]" if action else "[dim]updated[/]"
    tag_str = f" tags={list(tag)}" if tag else ""
    console.print(f"  {action_str} [cyan]{existing['label']}[/]{tag_str}")
    driver.close()


@cli.command("promote-proposals")
@click.option("--min-evidence", default=3, show_default=True)
@click.option("--min-confidence", default=0.75, show_default=True)
@click.option("--dry-run", is_flag=True)
def promote_proposals(min_evidence: int, min_confidence: float, dry_run: bool):
    """Batch promote accepted proposals meeting evidence and composite score thresholds."""
    from sow_kg.schema_evolution import promote_batch

    driver = get_driver()
    results = promote_batch(
        driver, min_evidence=min_evidence, min_confidence=min_confidence, dry_run=dry_run
    )

    if not results:
        console.print("[dim]No candidates meet the promotion threshold[/]")
        driver.close()
        return

    t = Table(title=f"{'[DRY RUN] ' if dry_run else ''}Promotion Results")
    t.add_column("Label", style="cyan")
    t.add_column("Kind")
    t.add_column("Score", justify="right")
    t.add_column("Nodes", justify="right")
    t.add_column("Edges", justify="right")
    t.add_column("Result")

    for r in results:
        if r.get("dry_run"):
            result_str = "[dim]would promote[/]"
        elif r.get("promoted"):
            result_str = "[green]promoted[/]"
        else:
            result_str = f"[yellow]skipped[/] {r.get('reason', '')[:40]}"

        t.add_row(
            r.get("label", ""),
            r.get("kind", ""),
            f"{r.get('score', 0):.2f}",
            str(r.get("nodes_written", "—")),
            str(r.get("edges_written", "—")),
            result_str,
        )
    console.print(t)
    driver.close()


@cli.command("eval-proposals")
@click.option("--status", default="pending", type=click.Choice(["pending", "accepted", "all"]))
@click.option("--min-confidence", default=0.60, show_default=True)
@click.option("--limit", default=50, show_default=True)
def eval_proposals(status: str, min_confidence: float, limit: int):
    """
    Run LLM evaluation on schema proposals.
    Scores coherence, novelty, groundedness, and utility.
    Auto-accepts proposals with recommendation=promote,
    auto-rejects with recommendation=reject.
    """
    from sow_kg.proposal_eval import evaluate_batch

    driver = get_driver()
    console.print(
        f"[bold]Evaluating {status} proposals (min_conf={min_confidence}, limit={limit})[/]"
    )

    results = evaluate_batch(driver, min_confidence=min_confidence, status=status, limit=limit)

    t = Table(title="Evaluation Results")
    t.add_column("Label", style="cyan")
    t.add_column("Score", justify="right")
    t.add_column("Rec")
    t.add_column("Coherence", justify="right")
    t.add_column("Novelty", justify="right")
    t.add_column("Grounded", justify="right")
    t.add_column("Utility", justify="right")
    t.add_column("Reasoning", style="dim")

    for r in results:
        if r.get("error"):
            t.add_row(r.get("proposal_id", "?"), "error", "", "", "", "", "", r["error"][:40])
            continue

        rec = r.get("recommendation", "")
        rec_str = (
            "[green]promote[/]"
            if rec == "promote"
            else "[red]reject[/]"
            if rec == "reject"
            else "[yellow]review[/]"
        )
        bd = r.get("breakdown", {})
        t.add_row(
            r.get("label", ""),
            f"{r.get('eval_score', 0):.2f}",
            rec_str,
            f"{bd.get('coherence', 0):.2f}",
            f"{bd.get('novelty', 0):.2f}",
            f"{bd.get('groundedness', 0):.2f}",
            f"{bd.get('utility', 0):.2f}",
            r.get("reasoning", "")[:50],
        )
    console.print(t)

    promoted = sum(1 for r in results if r.get("recommendation") == "promote")
    rejected = sum(1 for r in results if r.get("recommendation") == "reject")
    console.print(
        f"\n[dim]Evaluated {len(results)} proposals · "
        f"[green]{promoted} promoted[/] · [red]{rejected} rejected[/] · "
        f"{len(results) - promoted - rejected} flagged for review[/]"
    )
    driver.close()


@cli.command("eval-summary")
def eval_summary():
    """Print aggregate evaluation statistics across all evaluated proposals."""
    from sow_kg.proposal_eval import get_eval_summary

    driver = get_driver()
    result = get_eval_summary(driver)

    stats = result["stats"]
    t = Table(title="Proposal Evaluation Summary")
    t.add_column("Metric")
    t.add_column("Value", justify="right")
    t.add_row("Evaluated", str(stats.get("evaluated", 0)))
    t.add_row("Avg score", f"{stats.get('avg_score', 0):.2f}" if stats.get("avg_score") else "—")
    t.add_row(
        "Avg coherence",
        f"{stats.get('avg_coherence', 0):.2f}" if stats.get("avg_coherence") else "—",
    )
    t.add_row(
        "Avg novelty", f"{stats.get('avg_novelty', 0):.2f}" if stats.get("avg_novelty") else "—"
    )
    t.add_row(
        "Avg groundedness",
        f"{stats.get('avg_groundedness', 0):.2f}" if stats.get("avg_groundedness") else "—",
    )
    t.add_row(
        "Avg utility", f"{stats.get('avg_utility', 0):.2f}" if stats.get("avg_utility") else "—"
    )
    t.add_row("Promote", str(stats.get("n_promote", 0)))
    t.add_row("Review", str(stats.get("n_review", 0)))
    t.add_row("Reject", str(stats.get("n_reject", 0)))
    console.print(t)

    if result["top_proposals"]:
        t2 = Table(title="Top Proposals by Eval Score")
        t2.add_column("Label", style="cyan")
        t2.add_column("Kind")
        t2.add_column("Score", justify="right")
        t2.add_column("Rec")
        t2.add_column("Reasoning", style="dim")
        for r in result["top_proposals"]:
            rec = r.get("recommendation", "")
            rec_str = (
                "[green]promote[/]"
                if rec == "promote"
                else "[red]reject[/]"
                if rec == "reject"
                else "[yellow]review[/]"
            )
            t2.add_row(
                r.get("label", ""),
                r.get("kind", ""),
                f"{r.get('score', 0):.2f}",
                rec_str,
                (r.get("reasoning") or "")[:60],
            )
        console.print(t2)

    driver.close()
