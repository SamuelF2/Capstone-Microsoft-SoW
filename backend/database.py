"""
Shared database connection state.

Both `neo4j_driver` and `pg_pool` are set by the lifespan context in main.py
and imported by routers that need database access.
"""

from __future__ import annotations

import asyncpg
from neo4j import GraphDatabase

# Set to live instances by main.lifespan; None before startup.
neo4j_driver: GraphDatabase | None = None
pg_pool: asyncpg.Pool | None = None
