"""
SOW Knowledge Graph — CLI entry point.

Usage:
    uv run python main.py ingest  --data-dir ./data
    uv run python main.py validate --sow-id <id>
    uv run python main.py summary
    uv run python main.py approval --value 3000000 --margin 12
    uv run python main.py checklist --role solution-architect
"""

import asyncio
from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from sow_kg.db import get_driver, init_schema
from sow_kg.enrich import run_enrichment, semantic_search
from sow_kg.ingest_async import MAX_WORKERS, ingest_async
from sow_kg.ingest_json import ingest_all_json
from sow_kg.ingest_markdown import ingest_all_markdown
from sow_kg.queries import (
    find_similar_sows,
    get_approval_chain,
    get_persona_checklist,
    get_risk_summary,
    get_rule_triggered_risks,
    print_graph_summary,
    validate_sow,
)

console = Console()
DATA_DIR = Path(__file__).parent.parent / "Data"


@click.group()
def cli():
    """SOW Knowledge Graph — authoring assistant and risk engine."""
    pass


@cli.command()
@click.option("--data-dir", default=str(DATA_DIR), help="Directory containing source files")
@click.option("--clear", is_flag=True, help="Clear all graph data before ingesting")
@click.option("--no-cache", is_flag=True, help="Re-ingest all files even if unchanged")
@click.option(
    "--workers",
    default=MAX_WORKERS,
    show_default=True,
    help="Max parallel worker threads (tune to Neo4j bolt pool size)",
)
def ingest(data_dir: str, clear: bool, workers: int, no_cache: bool):
    """Ingest all JSON rules and markdown documents into Neo4j."""
    data_path = Path(data_dir)
    driver = get_driver()

    console.print(
        Panel.fit(
            f"[bold]SOW Knowledge Graph Ingestion[/]\nSource: [cyan]{data_path}[/]", title="SOW-KG"
        )
    )

    if clear:
        console.print("[yellow]Clearing all graph data[/]")
        with driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
        console.print("[green]Cleared[/]")

    console.print("\n[bold]Initializing schema[/]")
    init_schema(driver)
    console.print("[green]Schema ready[/]")

    ingest_all_json(driver, data_path)
    with driver.session() as session:
        banned_phrases = session.run(
            "MATCH (b:BannedPhrase) RETURN b.phrase AS phrase, b.severity AS severity"
        ).data()

    ingest_all_markdown(driver, data_path, banned_phrases)

    report = asyncio.run(
        ingest_async(
            data_dir=data_path,
            clear=clear,
            use_cache=not no_cache,
            max_workers=workers,
        )
    )

    # Surface any failures prominently after the ingest summary table
    if report.failed:
        console.print(
            "\n[bold red]⚠  {report.failed} file(s) failed — check output above for details[/]"
        )

    console.print("\n")
    print_graph_summary(driver)
    driver.close()


@cli.command()
@click.option("--sow-id", required=True, help="SOW node ID to validate")
def validate(sow_id: str):
    """Run all rule-based validations against a SOW."""
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

    if results["deliverables_missing_ac"]:
        console.print(
            f"[red]{len(results['deliverables_missing_ac'])} deliverable(s) missing acceptance criteria[/]"
        )
    else:
        console.print("[green]All deliverables have acceptance criteria[/]")

    if results["risks_without_mitigation"]:
        console.print(
            f"[red]{len(results['risks_without_mitigation'])} risk(s) without mitigation[/]"
        )
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
@click.option("--value", required=True, type=float, help="Deal value in USD")
@click.option("--margin", required=True, type=float, help="Estimated margin percent")
def approval(value: float, margin: float):
    """Determine ESAP level and required approval chain for a deal."""
    driver = get_driver()
    result = get_approval_chain(driver, value, margin)

    console.print(
        Panel.fit(
            f"Deal Value: [cyan]${value:,.0f}[/]  |  Margin: [cyan]{margin}%[/]\n"
            f"ESAP Level: [bold yellow]{result['level_id'].upper()}[/]",
            title="Deal Approval Chain",
        )
    )

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
@click.option(
    "--role",
    required=True,
    type=click.Choice(["solution-architect", "delivery-manager", "cpl", "cdp", "sqa-reviewer"]),
)
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
        req = "Required" if item["required"] else "Optional"
        t.add_row(item["id"], req, item["category"], item["item"])
    console.print(t)
    driver.close()


@cli.command()
@click.option("--sow-id", required=True)
def risks(sow_id: str):
    """Show risk summary and rule-triggered risks for a SOW."""
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
    """Find similar SOWs by shared clause types."""
    driver = get_driver()
    results = find_similar_sows(driver, sow_id)

    t = Table(title=f"SOWs Similar to {sow_id}")
    t.add_column("Title")
    t.add_column("Methodology")
    t.add_column("Shared Clauses", justify="right")
    t.add_column("Outcome")
    for r in results:
        t.add_row(
            r["title"], r["methodology"], str(r["shared_clauses"]), r["outcome"] or "unlabeled"
        )
    console.print(t)
    driver.close()


@cli.command()
@click.option("--batch-size", default=64, show_default=True, help="Nodes per encode batch")
@click.option("--force", is_flag=True, help="Re-embed all nodes even if already embedded")
def enrich(batch_size: int, force: bool):
    """Generate embeddings and write vector indexes to Neo4j."""
    driver = get_driver()
    run_enrichment(driver, batch_size=batch_size, force=force)
    driver.close()


@cli.command()
@click.argument("query")
@click.option(
    "--index",
    default="section_embeddings",
    type=click.Choice(
        [
            "section_embeddings",
            "deliverable_embeddings",
            "risk_embeddings",
            "rule_embeddings",
            "clausetype_embeddings",
        ]
    ),
    show_default=True,
    help="Which vector index to search",
)
@click.option("--top-k", default=5, show_default=True, help="Number of results")
def search(query: str, index: str, top_k: int):
    """Semantic similarity search across embedded nodes.

    Example:\n
        uv run python main.py search "cloud migration acceptance criteria" --index deliverable_embeddings
    """
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
        score = f"{r['score']:.4f}"
        props = r["props"]
        preview = (
            props.get("content")
            or props.get("description")
            or props.get("title")
            or props.get("display_name")
            or props.get("text")
            or ""
        )
        node_id = props.get("id") or props.get("rule_id") or props.get("type_id") or ""
        t.add_row(score, node_id, preview[:120])

    console.print(t)
    driver.close()


if __name__ == "__main__":
    cli()
