"""
Reads text content from Neo4j nodes, generates 384-dim embeddings using
sentence-transformers/all-MiniLM-L6-v2, and writes them back as vector
properties that Neo4j's native vector index can query.

Node types embedded:
  Section      -> content
  Deliverable  -> title + acceptance_criteria
  Risk         -> description + mitigation
  Rule         -> description + condition
  ClauseType   -> display_name + description

Usage:
    uv run python main.py enrich
    uv run python main.py enrich --force       # re-embed even if hash unchanged
    uv run python main.py enrich --batch-size 32
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Generator
from datetime import UTC, datetime

from neo4j import Driver
from rich.console import Console
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

console = Console()

EMBED_DIM = 384
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

VECTOR_INDEXES = [
    ("section_embeddings", "Section", "embedding"),
    ("deliverable_embeddings", "Deliverable", "embedding"),
    ("risk_embeddings", "Risk", "embedding"),
    ("rule_embeddings", "Rule", "embedding"),
    ("clausetype_embeddings", "ClauseType", "embedding"),
    ("project_aggregate_embeddings", "Project", "AggregateContextEmbedding"),
]

# Queries return id + text only hashing is done in Python
NODE_TEXT_QUERIES = {
    "Section": """
        MATCH (n:Section)
        WHERE ($force OR n.embedding IS NULL OR n.embed_hash IS NULL)
        RETURN n.id AS id,
               coalesce(n.content, '') AS text
        ORDER BY n.id
    """,
    "Deliverable": """
        MATCH (n:Deliverable)
        WHERE ($force OR n.embedding IS NULL OR n.embed_hash IS NULL)
        RETURN n.id AS id,
               coalesce(n.title, '') + ' ' + coalesce(n.acceptance_criteria, '') AS text
        ORDER BY n.id
    """,
    "Risk": """
        MATCH (n:Risk)
        WHERE ($force OR n.embedding IS NULL OR n.embed_hash IS NULL)
        RETURN n.id AS id,
               coalesce(n.description, '') + ' ' + coalesce(n.mitigation, '') AS text
        ORDER BY n.id
    """,
    "Rule": """
        MATCH (n:Rule)
        WHERE ($force OR n.embedding IS NULL OR n.embed_hash IS NULL)
        RETURN n.rule_id AS id,
               coalesce(n.description, '') + ' ' + coalesce(n.condition, '') AS text
        ORDER BY n.rule_id
    """,
    "ClauseType": """
        MATCH (n:ClauseType)
        WHERE ($force OR n.embedding IS NULL OR n.embed_hash IS NULL)
        RETURN n.type_id AS id,
               coalesce(n.display_name, '') + ' ' + coalesce(n.description, '') AS text
        ORDER BY n.type_id
    """,
    "Project": """
        MATCH (n:Project)
        WHERE ($force OR n.AggregateContextEmbedding IS NULL OR n.embed_hash IS NULL)

        // 1. Customer Context
        OPTIONAL MATCH (n)-[:HAS_PROJECT]-(c:Customer)
        WITH n,
             collect(DISTINCT coalesce(c._id, '')) AS c_ids,
             collect(DISTINCT coalesce(c.customer_name, '')) AS c_names,
             collect(DISTINCT coalesce(c.customer_location, '')) AS c_locations,
             collect(DISTINCT coalesce(c.customer_industry, '')) AS c_industries

        // 2. Budget Context
        OPTIONAL MATCH (n)-[:HAS_BUDGET_ENTRY]-(b:BudgetEntry)
        WITH n, c_ids, c_names, c_locations, c_industries,
             sum(CASE WHEN toLower(b.budget_component) CONTAINS 'revenue' THEN toFloat(b.usd) ELSE 0.0 END) AS total_revenue,
             sum(CASE WHEN toLower(b.budget_component) CONTAINS 'margin'  THEN toFloat(b.usd) ELSE 0.0 END) AS total_margin

        // 3. SOW Context (Fixed: Linking via filename containing the project_id)
        OPTIONAL MATCH (sow:SOW)-[:HAS_SECTION]->(sec:Section)
        WHERE toLower(sow.filename) CONTAINS toLower(n.project_id)
        WITH n, c_ids, c_names, c_locations, c_industries, total_revenue, total_margin,
             collect(DISTINCT coalesce(sec.content, '')) AS sow_sections

        // 4. Calculate Planned Duration and Margin %
        WITH *,
             CASE
                WHEN n.start_date IS NOT NULL AND n.end_date IS NOT NULL
                THEN toString(duration.inDays(date(n.start_date), date(n.end_date)).days) + ' days'
                ELSE 'Unknown'
             END AS planned_duration,
             CASE
                WHEN total_revenue > 0 THEN toString(round((total_margin / total_revenue) * 100, 2)) + '%'
                ELSE '0%'
             END AS margin_pct

        // 5. Assemble the final string
        RETURN n.project_id AS id,
               'Project: ' + coalesce(n.project_name, n.project_id, '') +
               ' | Deal Type: ' + coalesce(n.deal_type, 'N/A') +
               ' | Deal Terms: ' + coalesce(n.deal_terms, 'N/A') +
               ' | Planned Duration: ' + planned_duration +
               ' | Total Revenue: $' + toString(total_revenue) +
               ' | Total Margin %: ' + margin_pct +
               ' | Customer IDs: ' + reduce(acc='', x IN [id IN c_ids WHERE id <> ''] | acc + x + ', ') +
               ' | Customers: ' + reduce(acc='', x IN [name IN c_names WHERE name <> ''] | acc + x + ', ') +
               ' | Locations: ' + reduce(acc='', x IN [loc IN c_locations WHERE loc <> ''] | acc + x + ', ') +
               ' | Industries: ' + reduce(acc='', x IN [ind IN c_industries WHERE ind <> ''] | acc + x + ', ') +
               ' | SOW Content: ' + reduce(acc='', x IN [s IN sow_sections WHERE s <> ''] | acc + x + ' ') AS text
        ORDER BY n.project_id
    """,
}

WRITE_QUERIES = {
    "Section": "MATCH (n:Section {id: $id})           SET n.embedding = $vec, n.embed_hash = $hash, n.embedded_at = $ts",
    "Deliverable": "MATCH (n:Deliverable {id: $id})        SET n.embedding = $vec, n.embed_hash = $hash, n.embedded_at = $ts",
    "Risk": "MATCH (n:Risk {id: $id})               SET n.embedding = $vec, n.embed_hash = $hash, n.embedded_at = $ts",
    "Rule": "MATCH (n:Rule {rule_id: $id})          SET n.embedding = $vec, n.embed_hash = $hash, n.embedded_at = $ts",
    "ClauseType": "MATCH (n:ClauseType {type_id: $id})    SET n.embedding = $vec, n.embed_hash = $hash, n.embedded_at = $ts",
    "Project": """
        MATCH (n:Project {project_id: $id})
        SET n.AggregateContext = $text,
            n.AggregateContextEmbedding = $vec,
            n.embed_hash = $hash,
            n.embedded_at = $ts
    """,
}


def _content_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def ensure_vector_indexes(driver: Driver) -> None:
    console.print("[bold]Setting up vector indexes[/]")
    with driver.session() as session:
        for index_name, label, prop in VECTOR_INDEXES:
            try:
                session.run(f"""
                    CREATE VECTOR INDEX {index_name} IF NOT EXISTS
                    FOR (n:{label}) ON (n.{prop})
                    OPTIONS {{
                        indexConfig: {{
                            `vector.dimensions`: {EMBED_DIM},
                            `vector.similarity_function`: 'cosine'
                        }}
                    }}
                """)
                console.print(f"  [green][/] {index_name} ({label}.{prop})")
            except Exception as e:
                console.print(f"  [yellow][/] {index_name}: {e}")


def validate_vector_indexes(driver):
    """Automatically verifies that all vector indexes are online and fully populated."""
    print("\nValidating vector index health...")
    with driver.session() as session:
        result = session.run(
            "SHOW INDEXES YIELD name, type, state, populationPercent WHERE type = 'VECTOR'"
        )

        all_healthy = True
        for record in result:
            name = record["name"]
            state = record["state"]
            pop = record["populationPercent"]

            if state != "ONLINE" or pop != 100.0:
                print(
                    f"❌ CRITICAL WARNING: Index '{name}' is unhealthy (State: {state}, Pop: {pop}%)"
                )
                all_healthy = False
            else:
                print(f"✅ {name}: ONLINE & 100% Populated")

        if not all_healthy:
            print("\nWARNING: One or more indexes failed validation. Check Neo4j database.")
        else:
            print("\nAll vector indexes validated successfully!")


def _batched(items: list, size: int) -> Generator[list, None, None]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _load_model():
    try:
        from sentence_transformers import SentenceTransformer

        console.print(f"  Loading [cyan]{MODEL_NAME}[/]")
        model = SentenceTransformer(MODEL_NAME)
        console.print("  [green][/] Model loaded")
        return model
    except ImportError:
        console.print("[red]sentence-transformers not installed.[/]")
        console.print("Run: [bold]uv add sentence-transformers[/]")
        raise


def enrich_label(
    driver: Driver,
    model,
    label: str,
    batch_size: int = 64,
    force: bool = False,
) -> dict:
    read_query = NODE_TEXT_QUERIES[label]
    write_query = WRITE_QUERIES[label]
    ts = datetime.now(UTC).isoformat()

    with driver.session() as session:
        rows = session.run(read_query, force=force).data()

    if not rows:
        return {"total": 0, "embedded": 0, "skipped": 0}

    # Compute content hash in Python
    for row in rows:
        row["content_hash"] = _content_hash(row["text"])

    rows = [r for r in rows if r["text"].strip()]
    total = len(rows)

    embedded = 0
    with Progress(
        SpinnerColumn(),
        TextColumn(f"  [cyan]{label}[/] {{task.description}}"),
        BarColumn(),
        TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("embedding", total=total)

        for batch in _batched(rows, batch_size):
            texts = [r["text"] for r in batch]

            vecs = model.encode(
                texts,
                batch_size=batch_size,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )

            with driver.session() as session:
                for row, vec in zip(batch, vecs, strict=True):
                    session.run(
                        write_query,
                        id=row["id"],
                        text=row["text"],
                        vec=vec.tolist(),
                        hash=row["content_hash"],
                        ts=ts,
                    )
                    embedded += 1

            progress.advance(task, len(batch))

    return {"total": total, "embedded": embedded, "skipped": 0}


def run_enrichment(driver: Driver, batch_size: int = 64, force: bool = False) -> None:
    """
    Orchestrates the vector embedding process for the knowledge graph.

    Populates 'AggregateContextEmbedding' on Project nodes and other embeddings
    for Section, Risk, and Deliverable nodes to enable semantic GraphRAG traversal.
    """
    ensure_vector_indexes(driver)
    console.print()

    model = _load_model()
    console.print()

    total_embedded = 0
    t0 = time.time()

    for label in NODE_TEXT_QUERIES:
        stats = enrich_label(driver, model, label, batch_size=batch_size, force=force)
        n = stats["embedded"]
        total_embedded += n
        if n > 0:
            console.print(f"  [green][/] {label}: {n} nodes embedded")
        else:
            console.print(f"  [dim]–[/] {label}: all up to date")

    elapsed = time.time() - t0
    console.print()
    console.print(
        f"[bold green] Enrichment complete[/] — "
        f"{total_embedded} embeddings written in {elapsed:.1f}s"
    )
    console.print()
    console.print("[dim]Vector indexes ready for semantic search:[/]")
    for idx, label, prop in VECTOR_INDEXES:
        console.print(f"  [cyan]{idx}[/]  ({label}.{prop})")


def semantic_search(
    driver: Driver,
    model,
    query: str,
    index_name: str,
    top_k: int = 5,
) -> list[dict]:
    query_vec = model.encode(query, normalize_embeddings=True).tolist()

    with driver.session() as session:
        rows = session.run(
            """
            CALL db.index.vector.queryNodes($index_name, $top_k, $query_vec)
            YIELD node, score
            RETURN score, properties(node) AS props
            ORDER BY score DESC
        """,
            index_name=index_name,
            top_k=top_k,
            query_vec=query_vec,
        ).data()

    for row in rows:
        row["props"].pop("embedding", None)

    return rows
