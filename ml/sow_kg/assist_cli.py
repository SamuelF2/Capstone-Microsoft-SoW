@cli.command()
@click.argument("query")
@click.option("--sow-id", default=None)
@click.option("--top-k", default=5, show_default=True)
@click.option("--hop-depth", default=2, show_default=True)
@click.option("--context-only", is_flag=True, help="Return retrieved subgraph without calling LLM")
def assist(query: str, sow_id: str, top_k: int, hop_depth: int, context_only: bool):
    """Context-aware SOW authoring assistant powered by GraphRAG."""
    from sentence_transformers import SentenceTransformer

    from sow_kg.assist import assist as _assist
    from sow_kg.graphrag import retrieve

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

        dc = ctx.deal_context
        if dc.methodology:
            console.print(f"[dim]Methodology:[/] [cyan]{dc.methodology}[/]")
        if dc.deal_value:
            console.print(f"[dim]Deal Value:[/] [cyan]${dc.deal_value:,.0f}[/]")
        console.print()

        if ctx.sections:
            t = Table(title="Retrieved Sections")
            t.add_column("Heading")
            t.add_column("Type", style="dim")
            t.add_column("Conf", justify="right")
            t.add_column("Preview")
            for s in ctx.sections:
                conf = f"{s.get('llm_confidence', 0):.2f}" if s.get("llm_confidence") else "—"
                t.add_row(
                    s.get("heading", ""),
                    s.get("section_type", ""),
                    conf,
                    (s.get("content") or "")[:80],
                )
            console.print(t)

        if ctx.rules:
            t = Table(title="Applicable Rules")
            t.add_column("Severity")
            t.add_column("Category")
            t.add_column("Description")
            for r in ctx.rules:
                t.add_row(
                    (r.get("severity") or "").upper(),
                    r.get("category", ""),
                    (r.get("description") or "")[:80],
                )
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
                t.add_row((r.get("severity") or "").upper(), (r.get("description") or "")[:100])
            console.print(t)

        if ctx.similar_sections:
            t = Table(title="Similar Sections from Other Deals")
            t.add_column("Heading")
            t.add_column("SOW")
            t.add_column("Methodology", style="dim")
            for s in ctx.similar_sections:
                t.add_row(s.get("heading", ""), s.get("sow_title", ""), s.get("methodology", ""))
            console.print(t)

        driver.close()
        return

    result = _assist(driver, model, query, sow_id=sow_id, top_k=top_k, hop_depth=hop_depth)
    console.print(Panel(result["answer"], title="[bold cyan]Assistant[/]", border_style="cyan"))

    c = result["context"]
    console.print(
        f"\n[dim]{c['sections_used']} sections · {c['rules_applied']} rules · "
        f"{c['banned_phrases_found']} banned phrases · {c['risks_surfaced']} risks · "
        f"methodology: {c['methodology'] or 'unknown'}[/]"
    )
    driver.close()
