"""Centralised configuration — reads env vars with safe defaults for testing."""

import os
import secrets

from dotenv import load_dotenv

load_dotenv()

# ── Neo4j ─────────────────────────────────────────────────────────────────────
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")

# ── PostgreSQL ────────────────────────────────────────────────────────────────
PG_USER = os.getenv("POSTGRES_USER", "")
PG_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
PG_DB = os.getenv("POSTGRES_DB", "")
PG_HOST = os.getenv("POSTGRES_HOST", "postgres")
PG_PORT = os.getenv("POSTGRES_PORT", "5432")

DATABASE_URL = f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}"

# ── JWT / Auth ────────────────────────────────────────────────────────────────
# In production, set JWT_SECRET_KEY to a long random value via environment.
# A fresh random key is generated as a fallback so tests never hard-code one.
JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
JWT_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("JWT_TOKEN_EXPIRE_MINUTES", "480"))  # 8 h

# ── File Uploads ─────────────────────────────────────────────────────────────
UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
