"""
Ingest SoW CSV files into the knowledge graph.

"""

import hashlib

from rich.console import Console

console = Console()


def _stable_id(text: str, prefix: str = "") -> str:
    """Generate a stable short ID from content."""
    h = hashlib.md5(text.encode()).hexdigest()[:8]
    return f"{prefix}_{h}" if prefix else h


def ingest_csv():
    pass
