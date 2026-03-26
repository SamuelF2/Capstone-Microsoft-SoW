"""
SOW Knowledge Graph CLI

Commands:
    ingest              Ingest rules and documents (md/json/docx/pdf) into Neo4j
    validate            Run rule-based validation against a SOW
    risks               Show risk register and rule-triggered risks for a SOW
    similar             Find SOWs with overlapping clause types
    summary             Print graph node and relationship counts
    approval            Determine ESAP level and approval chain for a deal
    checklist           Print review checklist for a persona
    enrich              Generate and write vector embeddings to Neo4j
    search              Semantic similarity search across embedded nodes
    schema-proposals    List schema evolution proposals from LLM ingestion
    review-proposal     Accept, reject, or tag a schema proposal
    promote-proposals   Auto-promote proposals above an evidence threshold
"""

import click
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from datetime import datetime, timezone

from sow_kg.db import get_driver, init_schema
from sow_kg.ingest_json import ingest_all_json
from sow_kg.ingest import ingest_file, ingest_directory, get_banned_phrases
from sow_kg.enrich import run_enrichment, semantic_search
from sow_kg.queries import (
    validate_sow,
    find_similar_sows,
    get_approval_chain,
    get_persona_checklist,
    get_risk_summary,
    get_rule_triggered_risks,
    print_graph_summary,
)

console = Console()
DATA_DIR = Path(__file__).parent.parent / "Data"


@click.group()
def cli():
    """SOW Knowledge Graph — authoring assistant and risk engine."""


@cli.command()
@click.option("--data-dir", default=str(DATA_DIR), show_default=True)
@click.option("--file", default=None, help="Single file path (md/json/docx/pdf)")
@click.option("--type", "doc_type", default=None, type=click.Choice(["sow", "guide"]))
@click.option("--clear", is_flag=True)
def ingest(data_dir: str, file: str, doc_type: str, clear: bool):
    """Ingest rules and documents into Neo4j."""
    data_path = Path(data_dir)
    driver = get_driver()

    console.print(Panel.fit(
        f"[bold]SOW Knowledge Graph Ingestion[/]\nSource: [cyan]{file or data_path}[/]",
        title="SOW-KG",
    ))

    if clear:
        console.print("[yellow]Clearing graph[/]")
        with driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
        console.print("[green]Cleared[/]")

    console.print("\n[bold]Initializing schema[/]")
    init_schema(driver)
    console.print("[green]Schema ready[/]")

    ingest_all_json(driver, data_path)

    banned = get_banned_phrases(driver)

    if file:
        path = Path(file)
        if not path.exists():
            console.print(f"[red]File not found: {path}[/]")
            driver.close()
            return
        ingest_file(driver, path, doc_type=doc_type, banned_phrases=banned)
    else:
        ingest_directory(driver, data_path, banned_phrases=banned)

    console.print()
    print_graph_summary(driver)
    driver.close()


@cli.command()
@click.option("--sow-id", required=True)
def validate(sow_id: str):
    """Run rule-based validation against a SOW."""
    driver = get_driver()
    results = validate_sow(driver, sow_id)

    console.print(Panel.fit(f"[bold]Validation Report[/] — {sow_id}", title="SOW-KG"))

    if results["banned_phrases"]:
        t = Table(title="Banned Phrases Found")
        t.add_column("Section")
        t.add_column("Phrase", style="red")
        t.add_column("Severity")
        t.add_column("Suggestion", style="dim")
        for r in results["banned_phrases"]:
            t.add_row(r["section"], r["phrase"], r["severity"], r["suggestion"])
        console.print(t)
    else:
        console.print("[green]No banned phrases[/]")

    if results["missing_sections"]:
        t = Table(title="Missing Required Sections")
        t.add_column("Section", style="red")
        t.add_column("Error")
        for r in results["missing_sections"]:
            t.add_row(r["missing_section"], r["error"])
        console.print(t)
    else:
        console.print("[green]All required sections present[/]")

    n_missing_ac = len(results["deliverables_missing_ac"])
    n_missing_mit = len(results["risks_without_mitigation"])

    if n_missing_ac:
        console.print(f"[red]{n_missing_ac} deliverable(s) missing acceptance criteria[/]")
    else:
        console.print("[green]All deliverables have acceptance criteria[/]")

    if n_missing_mit:
        console.print(f"[red]{n_missing_mit} risk(s) without mitigation[/]")
    else:
        console.print("[green]All risks have mitigation plans[/]")

    if results["missing_methodology_keywords"]:
        console.print("[yellow]Missing methodology keywords:[/]")
        for r in results["missing_methodology_keywords"]:
            console.print(f"  - '{r['missing_keyword']}' (required for {r['methodology']})")

    driver.close()


@cli.command()
def summary():
    """Print graph node and relationship counts."""
    driver = get_driver()
    print_graph_summary(driver)
    driver.close()


@cli.command()
@click.option("--value", required=True, type=float)
@click.option("--margin", required=True, type=float)
def approval(value: float, margin: float):
    """Determine ESAP level and approval chain for a deal."""
    driver = get_driver()
    result = get_approval_chain(driver, value, margin)

    console.print(Panel.fit(
        f"Deal Value: [cyan]${value:,.0f}[/]  |  Margin: [cyan]{margin}%[/]\n"
        f"ESAP Level: [bold yellow]{result['level_id'].upper()}[/]",
        title="Deal Approval Chain",
    ))

    t = Table()
    t.add_column("Stage")
    t.add_column("Approver")
    t.add_column("Required")
    t.add_column("Reason", style="dim")
    for a in result["approvers"]:
        t.add_row(a["stage"], a["display_name"], "Yes" if a["required"] else "No", a["reason"])
    console.print(t)
    driver.close()


@cli.command()
@click.option("--role", required=True, type=click.Choice([
    "solution-architect", "delivery-manager", "cpl", "cdp", "sqa-reviewer",
]))
def checklist(role: str):
    """Print review checklist for a persona."""
    driver = get_driver()
    items = get_persona_checklist(driver, role)

    t = Table(title=f"Review Checklist — {role}")
    t.add_column("ID")
    t.add_column("Required")
    t.add_column("Category")
    t.add_column("Item")
    for item in items:
        t.add_row(item["id"], "Required" if item["required"] else "Optional", item["category"], item["item"])
    console.print(t)
    driver.close()


@cli.command()
@click.option("--sow-id", required=True)
def risks(sow_id: str):
    """Show risk register and rule-triggered risks for a SOW."""
    driver = get_driver()
    risks_data = get_risk_summary(driver, sow_id)
    triggered = get_rule_triggered_risks(driver, sow_id)

    if risks_data:
        t = Table(title="Risk Register")
        t.add_column("Severity")
        t.add_column("Mitigated")
        t.add_column("Description")
        t.add_column("Mitigation", style="dim")
        for r in risks_data:
            t.add_row(
                r["severity"].upper(),
                "Yes" if r["has_mitigation"] else "No",
                r["description"][:80],
                (r["mitigation"] or "")[:80],
            )
        console.print(t)

    if triggered:
        t2 = Table(title="Rule-Triggered Risks")
        t2.add_column("Section")
        t2.add_column("Trigger", style="red")
        t2.add_column("Severity")
        t2.add_column("Suggestion", style="dim")
        for r in triggered:
            t2.add_row(r["section"], r["trigger"], r["severity"], r["suggestion"])
        console.print(t2)

    if not risks_data and not triggered:
        console.print("[green]No risks found[/]")
    driver.close()


@cli.command()
@click.option("--sow-id", required=True)
def similar(sow_id: str):
    """Find SOWs with overlapping clause types."""
    driver = get_driver()
    results = find_similar_sows(driver, sow_id)

    t = Table(title=f"SOWs Similar to {sow_id}")
    t.add_column("Title")
    t.add_column("Methodology")
    t.add_column("Shared Clauses", justify="right")
    t.add_column("Outcome")
    for r in results:
        t.add_row(r["title"], r["methodology"], str(r["shared_clauses"]), r["outcome"] or "unlabeled")
    console.print(t)
    driver.close()


@cli.command()
@click.option("--batch-size", default=64, show_default=True)
@click.option("--force", is_flag=True)
def enrich(batch_size: int, force: bool):
    """Generate and write vector embeddings to Neo4j."""
    driver = get_driver()
    run_enrichment(driver, batch_size=batch_size, force=force)
    driver.close()


@cli.command()
@click.argument("query")
@click.option("--index", default="section_embeddings", show_default=True, type=click.Choice([
    "section_embeddings", "deliverable_embeddings",
    "risk_embeddings", "rule_embeddings", "clausetype_embeddings",
]))
@click.option("--top-k", default=5, show_default=True)
def search(query: str, index: str, top_k: int):
    """Semantic similarity search across embedded nodes."""
    from sentence_transformers import SentenceTransformer

    driver = get_driver()
    console.print(f"\n[bold]Query:[/] [cyan]{query}[/]")
    console.print(f"[dim]Index:[/] {index}  |  top-k: {top_k}\n")

    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    results = semantic_search(driver, model, query, index, top_k=top_k)

    t = Table(title=f"Results — {index}")
    t.add_column("Score", justify="right", style="green")
    t.add_column("ID", style="dim")
    t.add_column("Preview")
    for r in results:
        props = r["props"]
        preview = (props.get("content") or props.get("description") or
                   props.get("title") or props.get("display_name") or "")
        node_id = props.get("id") or props.get("rule_id") or props.get("type_id") or ""
        t.add_row(f"{r['score']:.4f}", node_id, preview[:120])
    console.print(t)
    driver.close()


@cli.command("schema-proposals")
@click.option("--status", default="all", type=click.Choice(["all", "pending", "accepted", "rejected"]))
@click.option("--kind", default=None, type=click.Choice(["node", "edge", "section_type"]))
def schema_proposals(status: str, kind: str):
    """List schema evolution proposals from LLM ingestion."""
    driver = get_driver()

    filters = []
    if status == "pending":
        filters.append("p.accepted = false AND coalesce(p.rejected, false) = false")
    elif status == "accepted":
        filters.append("p.accepted = true")
    elif status == "rejected":
        filters.append("p.rejected = true")
    if kind:
        filters.append(f"p.kind = '{kind}'")

    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    with driver.session() as session:
        rows = session.run(f"""
            MATCH (p:SchemaProposal)
            {where}
            RETURN p.proposal_id AS pid, p.kind AS kind, p.label AS label,
                   p.confidence AS confidence, p.accepted AS accepted,
                   p.rejected AS rejected, p.tags AS tags,
                   p.source_doc AS source, p.usage_count AS uses,
                   p.reviewed_by AS reviewed_by, p.description AS description
            ORDER BY p.confidence DESC, p.usage_count DESC
        """).data()

    t = Table(title=f"Schema Proposals [{status}]")
    t.add_column("ID", style="dim")
    t.add_column("Kind")
    t.add_column("Label", style="cyan")
    t.add_column("Conf", justify="right")
    t.add_column("Uses", justify="right")
    t.add_column("Status")
    t.add_column("Tags", style="dim")
    t.add_column("Source", style="dim")

    for r in rows:
        if r.get("rejected"):
            status_str = "[red]rejected[/]"
        elif r.get("accepted"):
            status_str = "[green]accepted[/]"
        else:
            status_str = "[yellow]pending[/]"
        tags = ", ".join(r["tags"] or []) if r.get("tags") else ""
        t.add_row(
            (r["pid"] or "")[:12],
            r["kind"] or "",
            r["label"] or "",
            f"{r['confidence']:.2f}" if r["confidence"] else "?",
            str(r["uses"] or 0),
            status_str,
            tags,
            (r["source"] or "")[:35],
        )
    console.print(t)
    driver.close()


@cli.command("review-proposal")
@click.option("--id", "proposal_id", required=True, help="Proposal ID (from schema-proposals)")
@click.option("--accept", "action", flag_value="accept")
@click.option("--reject", "action", flag_value="reject")
@click.option("--tag", multiple=True, help="Add tags (repeatable: --tag compliance --tag financial)")
@click.option("--note", default=None, help="Reviewer note")
@click.option("--reviewed-by", default="human", show_default=True)
def review_proposal(proposal_id: str, action: str, tag: tuple, note: str, reviewed_by: str):
    """Accept, reject, or tag a schema proposal."""
    if not action and not tag and not note:
        console.print("[red]Specify --accept, --reject, or at least --tag / --note[/]")
        return

    driver = get_driver()
    ts = datetime.now(timezone.utc).isoformat()

    with driver.session() as session:
        existing = session.run(
            "MATCH (p:SchemaProposal {proposal_id: $pid}) RETURN p.label AS label",
            pid=proposal_id,
        ).single()

        if not existing:
            console.print(f"[red]Proposal {proposal_id} not found[/]")
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

        session.run(f"MATCH (p:SchemaProposal {{proposal_id: $pid}}) SET {', '.join(set_parts)}", **params)

    label = existing["label"]
    action_str = f"[green]{action}ed[/]" if action else "[dim]tagged[/]"
    tag_str = f" tags={list(tag)}" if tag else ""
    console.print(f"  {action_str} proposal [cyan]{label}[/]{tag_str}")
    driver.close()


@cli.command("promote-proposals")
@click.option("--min-evidence", default=3, show_default=True, help="Min documents proposing same label")
@click.option("--min-confidence", default=0.75, show_default=True)
@click.option("--dry-run", is_flag=True)
def promote_proposals(min_evidence: int, min_confidence: float, dry_run: bool):
    """Auto-promote proposals that appear across multiple documents above confidence threshold."""
    driver = get_driver()
    ts = datetime.now(timezone.utc).isoformat()

    with driver.session() as session:
        candidates = session.run("""
            MATCH (p:SchemaProposal)
            WHERE p.accepted = false
              AND coalesce(p.rejected, false) = false
              AND p.usage_count >= $min_evidence
              AND p.confidence >= $min_conf
            RETURN p.proposal_id AS pid, p.label AS label,
                   p.kind AS kind, p.usage_count AS uses,
                   p.confidence AS confidence
            ORDER BY p.usage_count DESC, p.confidence DESC
        """, min_evidence=min_evidence, min_conf=min_confidence).data()

    if not candidates:
        console.print("[dim]No candidates meet the promotion threshold[/]")
        driver.close()
        return

    t = Table(title=f"{'[DRY RUN] ' if dry_run else ''}Promoting {len(candidates)} proposal(s)")
    t.add_column("Label", style="cyan")
    t.add_column("Kind")
    t.add_column("Evidence", justify="right")
    t.add_column("Confidence", justify="right")

    for c in candidates:
        t.add_row(c["label"], c["kind"], str(c["uses"]), f"{c['confidence']:.2f}")
    console.print(t)

    if not dry_run:
        with driver.session() as session:
            for c in candidates:
                session.run(
                    "MATCH (p:SchemaProposal {proposal_id: $pid}) SET p.accepted=true, p.reviewed_by='auto-promote', p.reviewed_at=$ts",
                    pid=c["pid"], ts=ts,
                )
        console.print(f"[bold green]✓ {len(candidates)} proposals promoted[/]")
    else:
        console.print("[dim]Dry run — no changes written[/]")

    driver.close()

@cli.command()
@click.argument("query")
@click.option("--sow-id", default=None, help="Scope context to a specific SOW")
@click.option("--top-k", default=5, show_default=True)
@click.option("--hop-depth", default=2, show_default=True, help="Graph traversal hops from anchor nodes")
@click.option("--context-only", is_flag=True, help="Print retrieved context without calling the LLM")
def assist(query: str, sow_id: str, top_k: int, hop_depth: int, context_only: bool):
    """Context-aware SOW authoring assistant powered by GraphRAG."""
    from sentence_transformers import SentenceTransformer
    from sow_kg.graph_rag import retrieve
    from sow_kg.assist import assist as _assist

    driver = get_driver()
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

    console.print(f"\n[bold]Query:[/] [cyan]{query}[/]")
    if sow_id:
        console.print(f"[dim]SOW:[/] {sow_id}")
    console.print()

    if context_only:
        ctx = retrieve(driver, model, query, sow_id=sow_id, top_k=top_k, hop_depth=hop_depth)

        if ctx.is_empty():
            console.print("[yellow]No relevant context found[/]")
            driver.close()
            return

        if ctx.methodology:
            console.print(f"[dim]Methodology:[/] [cyan]{ctx.methodology}[/]\n")

        if ctx.sections:
            t = Table(title="Retrieved Sections")
            t.add_column("Heading")
            t.add_column("Type", style="dim")
            t.add_column("Conf", justify="right")
            t.add_column("Preview")
            for s in ctx.sections:
                conf = f"{s.get('llm_confidence', 0):.2f}" if s.get("llm_confidence") else "—"
                t.add_row(s.get("heading", ""), s.get("section_type", ""), conf, (s.get("content") or "")[:80])
            console.print(t)

        if ctx.rules:
            t = Table(title="Applicable Rules")
            t.add_column("Severity")
            t.add_column("Category")
            t.add_column("Description")
            for r in ctx.rules:
                t.add_row(r.get("severity", "").upper(), r.get("category", ""), (r.get("description") or "")[:80])
            console.print(t)

        if ctx.banned_phrases:
            t = Table(title="Banned Phrases")
            t.add_column("Phrase", style="red")
            t.add_column("Suggestion", style="dim")
            for b in ctx.banned_phrases:
                t.add_row(b.get("phrase", ""), b.get("suggestion", ""))
            console.print(t)

        if ctx.risks:
            t = Table(title="Risks")
            t.add_column("Severity")
            t.add_column("Description")
            for r in ctx.risks:
                t.add_row(r.get("severity", "").upper(), (r.get("description") or "")[:100])
            console.print(t)

        driver.close()
        return

    result = _assist(driver, model, query, sow_id=sow_id, top_k=top_k, hop_depth=hop_depth)

    console.print(Panel(result["answer"], title="[bold cyan]Assistant[/]", border_style="cyan"))

    ctx_meta = result["context"]
    console.print(
        f"\n[dim]Context: {ctx_meta['sections_used']} sections · "
        f"{ctx_meta['rules_applied']} rules · "
        f"{ctx_meta['banned_phrases_found']} banned phrases · "
        f"{ctx_meta['risks_surfaced']} risks · "
        f"methodology: {ctx_meta['methodology'] or 'unknown'}[/]"
    )

    driver.close()

if __name__ == "__main__":
    cli()
