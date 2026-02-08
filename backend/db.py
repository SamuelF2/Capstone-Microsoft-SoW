"""ArangoDB connection management for the Cocoon project."""

import os

from arango import ArangoClient


def get_db():
    """Connect to the Cocoon ArangoDB database."""
    client = ArangoClient(hosts=os.getenv("ARANGO_URL", "http://localhost:8529"))

    # Connect to cocoon database
    db = client.db(
        os.getenv("ARANGO_DB", "cocoon"),
        username=os.getenv("ARANGO_USER", "root"),
        password=os.getenv("ARANGO_PASSWORD", "cocoon_dev_2026"),
    )
    return db


def get_system_db():
    """Connect to the _system database (for admin tasks)."""
    client = ArangoClient(hosts=os.getenv("ARANGO_URL", "http://localhost:8529"))
    return client.db(
        "_system",
        username=os.getenv("ARANGO_USER", "root"),
        password=os.getenv("ARANGO_PASSWORD", "cocoon_dev_2026"),
    )
