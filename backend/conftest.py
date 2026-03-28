"""Root conftest — set environment variables before any test module imports main.py."""

import os

import pytest

os.environ.setdefault("NEO4J_PASSWORD", "test")
os.environ.setdefault("NEO4J_USER", "neo4j")
os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("POSTGRES_HOST", "localhost")


def pytest_collection_modifyitems(config, items):
    """Auto-mark tests under tests/integration/ with the 'integration' marker."""
    for item in items:
        if "integration" in str(item.fspath):
            item.add_marker(pytest.mark.integration)
