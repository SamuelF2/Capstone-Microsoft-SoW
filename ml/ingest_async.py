"""
Async parallel ingestion orchestrator for the SOW Knowledge Graph.

Scope
-----
This module handles INCREMENTAL ingestion of new project data only.
Rules, guidelines, and reference vocabulary (JSON rules files, guide markdown)
are static — they are seeded once via seed_kg.py and assumed to already
exist in the graph.  Re-running them here would be wasted work.

Architecture
------------
The ingestion pipeline has two distinct phases that MUST be respected:

  Phase 1 — Foundation  (sequential, dependency-ordered)
    CSV:  deal_overview → project_closeout     (creates Project + Customer nodes
                                                that every other CSV FK-references)

  Phase 2 — Parallel    (all remaining files concurrently)
    CSV:  budget, budget_actuals_fcst, staffing_plan,
          staffing_actuals_fcst, status_report
    Documents: SOW files in .md, .json, .docx, or .pdf format
               (guide documents belong in seed_kg.py)

Why two phases?
  Neo4j MERGE semantics guarantee idempotency, but MATCH statements in
  relationship queries will silently produce no edges if the referenced node
  doesn't exist yet.  Running foundation CSV files first eliminates that hazard.

Banned phrases for document validation are fetched live from the graph
(seeded by seed_kg.py) rather than re-ingested from JSON on every run.

Concurrency model
-----------------
  • Each ingest task runs in a ThreadPoolExecutor worker so the blocking
    neo4j-driver calls don't stall the event loop.
  • asyncio.gather(*tasks, return_exceptions=True) fans out all Phase 2
    tasks simultaneously; failures are collected and reported rather than
    crashing the whole run.
  • A semaphore (MAX_WORKERS) caps how many threads hit Neo4j at once,
    protecting the bolt connection pool.
  • A per-file content hash (SHA-256 of raw bytes) is persisted in a
    lightweight JSON sidecar (.ingest_cache.json).  Files whose hash
    hasn't changed since the last run are skipped entirely — huge speed-up
    on incremental loads.

Usage
-----
    # Programmatic
    import asyncio
    from sow_kg.ingest_async import ingest_async
    asyncio.run(ingest_async("/data/sow", clear=False))

    # CLI shortcut
    python -m sow_kg.ingest_async --data-dir /data/sow [--clear] [--no-cache]
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from neo4j import Driver, GraphDatabase
from rich.console import Console
from rich.table import Table
from sow_kg.extract import extract_document
from sow_kg.ingest import ingest_file
from sow_kg.ingest_csv import (
    create_constraints,
    ingest_budget,
    ingest_budget_actuals_fcst,
    ingest_deal_overview,
    ingest_project_closeout,
    ingest_staffing_actuals_fcst,
    ingest_staffing_plan,
    ingest_status_report,
)

log = logging.getLogger(__name__)
console = Console()

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

MAX_WORKERS: int = 8  # thread-pool ceiling (tune to bolt pool size)
CACHE_FILE: str = ".ingest_cache.json"

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------


@dataclass
class TaskResult:
    name: str
    success: bool
    elapsed: float
    error: str | None = None
    skipped: bool = False


@dataclass
class IngestReport:
    total: int = 0
    succeeded: int = 0
    skipped: int = 0
    failed: int = 0
    elapsed: float = 0.0
    results: list[TaskResult] = field(default_factory=list)

    def add(self, r: TaskResult) -> None:
        self.results.append(r)
        self.total += 1
        if r.skipped:
            self.skipped += 1
        elif r.success:
            self.succeeded += 1
        else:
            self.failed += 1

    def print(self) -> None:
        table = Table(title="Ingest Summary", show_lines=True)
        table.add_column("File", style="cyan", no_wrap=True)
        table.add_column("Status", justify="center")
        table.add_column("Time (s)", justify="right")
        table.add_column("Error", style="red")

        for r in sorted(self.results, key=lambda x: x.name):
            if r.skipped:
                status = "[yellow]SKIP[/]"
            elif r.success:
                status = "[green]OK[/]"
            else:
                status = "[red]FAIL[/]"
            table.add_row(
                r.name,
                status,
                f"{r.elapsed:.2f}",
                r.error or "",
            )

        console.print(table)
        console.print(
            f"\n[bold]Total:[/] {self.total}  "
            f"[green]OK: {self.succeeded}[/]  "
            f"[yellow]Skip: {self.skipped}[/]  "
            f"[red]Fail: {self.failed}[/]  "
            f"Wall time: {self.elapsed:.1f}s"
        )


# ---------------------------------------------------------------------------
# Content-hash cache  (skip unchanged files on incremental runs)
# ---------------------------------------------------------------------------


class IngestCache:
    """
    Persist SHA-256 hashes of ingested files in a JSON sidecar.
    Thread-safe for reads; writes are serialised through a lock.
    """

    def __init__(self, data_dir: Path, enabled: bool = True):
        self._path = data_dir / CACHE_FILE
        self._enabled = enabled
        self._lock = asyncio.Lock()
        self._cache: dict[str, str] = {}

        if enabled and self._path.exists():
            try:
                self._cache = json.loads(self._path.read_text())
            except Exception:
                self._cache = {}

    @staticmethod
    def _hash(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def is_stale(self, path: Path) -> bool:
        """Return True if the file is new or has changed since last ingest."""
        if not self._enabled:
            return True
        return self._cache.get(str(path)) != self._hash(path)

    async def mark_done(self, path: Path) -> None:
        if not self._enabled:
            return
        async with self._lock:
            self._cache[str(path)] = self._hash(path)
            self._path.write_text(json.dumps(self._cache, indent=2))


# ---------------------------------------------------------------------------
# Task wrapper  (runs a blocking ingest fn in a thread, tracks timing)
# ---------------------------------------------------------------------------


async def _run_task(
    name: str,
    fn: Callable,
    args: tuple,
    executor: ThreadPoolExecutor,
    semaphore: asyncio.Semaphore,
    cache: IngestCache,
    path: Path | None = None,
) -> TaskResult:
    """
    Execute *fn(*args)* in a thread-pool worker, guarded by *semaphore*.
    Skips execution if *path* is provided and the cache says it's unchanged.
    """
    if path and not cache.is_stale(path):
        return TaskResult(name=name, success=True, elapsed=0.0, skipped=True)

    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()
    try:
        async with semaphore:
            await loop.run_in_executor(executor, lambda: fn(*args))
        elapsed = time.perf_counter() - t0
        if path:
            await cache.mark_done(path)
        return TaskResult(name=name, success=True, elapsed=elapsed)
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        log.exception("Task %s failed", name)
        return TaskResult(name=name, success=False, elapsed=elapsed, error=str(exc))


# ---------------------------------------------------------------------------
# Document file discovery helpers (supports .md, .json, .docx, .pdf)
# ---------------------------------------------------------------------------

_SOW_SIGNALS = [
    "statement of work",
    "in scope",
    "out of scope",
    "acceptance criteria",
    "customer responsibilities",
    "deliverable",
    "prepared for",
    "prepared by",
]


def _is_sow(path: Path) -> bool:
    """
    Detect whether a file is a SOW by checking for keyword signals.

    Supports markdown, JSON, DOCX, and PDF files via extract_document.
    Returns False on any extraction error rather than failing loudly.
    """
    try:
        doc = extract_document(path)
        content = doc["raw_text"].lower()
        return sum(1 for kw in _SOW_SIGNALS if kw in content) >= 3
    except Exception as e:
        log.debug(f"SOW detection failed for {path.name}: {e}")
        return False


def _collect_sow_tasks(
    data_dir: Path,
    driver: Driver,
    banned_phrases: list[dict],
    executor: ThreadPoolExecutor,
    semaphore: asyncio.Semaphore,
    cache: IngestCache,
) -> list[asyncio.Task]:
    """
    Build one async task per SOW document file.

    Supports .md, .json, .docx, and .pdf files. ingest_file from ingest.py
    is a blocking synchronous function that handles all these formats via
    extract_document, so it is dispatched via _run_task into the
    ThreadPoolExecutor exactly the same way CSV ingestors are — one thread
    per file, guarded by the semaphore.

    Guide documents are excluded — they belong to the one-time seed_kg.py run.
    SOW detection for root-level files uses keyword signal heuristic that
    works across all supported file formats.
    """
    tasks = []

    def _sow_task(path: Path) -> asyncio.Task:
        return asyncio.ensure_future(
            _run_task(
                f"sow:{path.name}",
                ingest_file,
                (driver, path, "sow", banned_phrases),
                executor,
                semaphore,
                cache,
                path=path,
            )
        )

    sow_dir = data_dir / "sow-md"
    if sow_dir.exists():
        for f in sorted(sow_dir.iterdir()):
            if f.suffix.lower() in {".md", ".json", ".docx", ".pdf"}:
                tasks.append(_sow_task(f))

    for f in sorted(data_dir.iterdir()):
        if f.is_file() and _is_sow(f) and f.suffix.lower() in {".md", ".json", ".docx", ".pdf"}:
            tasks.append(_sow_task(f))

    return tasks


# ---------------------------------------------------------------------------
# Banned-phrase helper  (needed by document ingestion tasks in Phase 2)
# ---------------------------------------------------------------------------


def _fetch_banned_phrases(driver: Driver) -> list[dict]:
    with driver.session() as session:
        result = session.run("MATCH (b:BannedPhrase) RETURN b.phrase AS phrase")
        return [{"phrase": r["phrase"]} for r in result]


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


async def ingest_async(
    data_dir: str | Path,
    *,
    neo4j_uri: str = "bolt://localhost:7687",
    neo4j_user: str = "neo4j",
    neo4j_password: str = "password",
    clear: bool = False,
    use_cache: bool = True,
    max_workers: int = MAX_WORKERS,
) -> IngestReport:
    """
    Two-phase async parallel ingestion pipeline.

    Parameters
    ----------
    data_dir        : Root directory that contains csv/, rules/, sow-md/, etc.
    neo4j_uri       : Bolt URI for the Neo4j instance.
    neo4j_user      : Neo4j username.
    neo4j_password  : Neo4j password.
    clear           : If True, wipe all graph data before ingesting.
    use_cache       : If True, skip files whose content hash is unchanged.
    max_workers     : Max concurrent worker threads hitting Neo4j.

    Returns
    -------
    IngestReport    : Structured summary of every task's outcome.
    """
    data_dir = Path(data_dir)
    report = IngestReport()
    wall_start = time.perf_counter()

    driver: Driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
    cache = IngestCache(data_dir, enabled=use_cache)
    semaphore = asyncio.Semaphore(max_workers)

    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="kg-ingest") as executor:
        # ── Optional graph clear ────────────────────────────────────────────
        if clear:
            console.print("[bold red]⚠  Clearing all graph data …[/]")
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                executor,
                lambda: driver.session().__enter__().run("MATCH (n) DETACH DELETE n"),
            )
            cache._cache.clear()  # invalidate cache on full clear
            console.print("[red]✓  Graph cleared[/]")

        # ── Schema constraints (idempotent, fast) ───────────────────────────
        console.rule("[bold]Phase 0 — Constraints")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(executor, lambda: create_constraints(driver))

        # ── Resolve CSV paths ────────────────────────────────────────────────
        all_csv: dict[str, Path] = {p.name: p for p in data_dir.glob("*.csv")}

        # ════════════════════════════════════════════════════════════════════
        # PHASE 1 — Foundation files  (sequential)
        # ════════════════════════════════════════════════════════════════════
        console.rule("[bold]Phase 1 — Foundation (sequential)")

        phase1_csv = [
            ("deal_overview.csv", ingest_deal_overview),
            ("project_closeout.csv", ingest_project_closeout),
        ]

        for filename, fn in phase1_csv:
            path = all_csv.get(filename)
            if not path:
                console.print(f"  [yellow]⚠[/]  {filename} not found, skipping")
                continue
            result = await _run_task(
                filename,
                fn,
                (driver, path),
                executor,
                semaphore,
                cache,
                path=path,
            )
            report.add(result)
            _log_result(result)

        # ════════════════════════════════════════════════════════════════════
        # PHASE 2 — Parallel ingestion
        # ════════════════════════════════════════════════════════════════════
        console.rule("[bold]Phase 2 — Parallel ingestion")

        # Fetch banned phrases live from the graph (seeded by seed_kg.py)
        banned_phrases = await loop.run_in_executor(executor, lambda: _fetch_banned_phrases(driver))
        console.print(f"  [dim]Loaded {len(banned_phrases)} banned phrases from graph[/]")

        phase2_csv = [
            ("budget.csv", ingest_budget),
            ("budget_actuals_fcst.csv", ingest_budget_actuals_fcst),
            ("staffing_plan.csv", ingest_staffing_plan),
            ("staffing_actuals_fcst.csv", ingest_staffing_actuals_fcst),
            ("status_report.csv", ingest_status_report),
        ]

        parallel_tasks: list[asyncio.Task] = []

        for filename, fn in phase2_csv:
            path = all_csv.get(filename)
            if not path:
                console.print(f"  [yellow]⚠[/]  {filename} not found, skipping")
                continue
            parallel_tasks.append(
                asyncio.ensure_future(
                    _run_task(filename, fn, (driver, path), executor, semaphore, cache, path=path)
                )
            )

        # SOW documents (.md, .json, .docx, .pdf) — guide docs are handled by seed_kg.py
        parallel_tasks.extend(
            _collect_sow_tasks(data_dir, driver, banned_phrases, executor, semaphore, cache)
        )

        if parallel_tasks:
            results = await asyncio.gather(*parallel_tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, BaseException):
                    # Shouldn't happen since _run_task catches internally,
                    # but guard anyway.
                    report.add(TaskResult(name="unknown", success=False, elapsed=0.0, error=str(r)))
                else:
                    report.add(r)
                    _log_result(r)
        else:
            console.print("  [yellow]No Phase 2 files found.[/]")

    # ── Final report ────────────────────────────────────────────────────────
    report.elapsed = time.perf_counter() - wall_start
    console.rule("[bold]Ingest Complete")
    report.print()

    driver.close()
    return report


# ---------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------


def _log_result(r: TaskResult) -> None:
    if r.skipped:
        console.print(f"  [yellow]–[/]  {r.name} [dim](unchanged, skipped)[/]")
    elif r.success:
        console.print(f"  [green]✓[/]  {r.name} [dim]({r.elapsed:.2f}s)[/]")
    else:
        console.print(f"  [red]✗[/]  {r.name}  [red]{r.error}[/]")


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="SOW KG async parallel ingestion")
    p.add_argument("--data-dir", default="data", help="Root data directory")
    p.add_argument("--uri", default="bolt://localhost:7687")
    p.add_argument("--user", default="neo4j")
    p.add_argument("--password", default="password")
    p.add_argument("--clear", action="store_true", help="Wipe graph before ingesting")
    p.add_argument("--no-cache", action="store_true", help="Ignore content-hash cache")
    p.add_argument(
        "--workers",
        type=int,
        default=MAX_WORKERS,
        help=f"Max parallel workers (default {MAX_WORKERS})",
    )
    return p.parse_args()


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    args = _parse_args()
    asyncio.run(
        ingest_async(
            data_dir=args.data_dir,
            neo4j_uri=args.uri,
            neo4j_user=args.user,
            neo4j_password=args.password,
            clear=args.clear,
            use_cache=not args.no_cache,
            max_workers=args.workers,
        )
    )
