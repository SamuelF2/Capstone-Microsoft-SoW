"""
Neo4j connection and schema initialization for SOW Knowledge Graph.
"""

from neo4j import GraphDatabase
from dotenv import load_dotenv
import os

load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")


def get_driver():
    return GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


SCHEMA_QUERIES = [
    # Node uniqueness constraints
    "CREATE CONSTRAINT sow_id IF NOT EXISTS FOR (n:SOW) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT party_name IF NOT EXISTS FOR (n:Party) REQUIRE n.name IS UNIQUE",
    "CREATE CONSTRAINT methodology_name IF NOT EXISTS FOR (n:Methodology) REQUIRE n.name IS UNIQUE",
    "CREATE CONSTRAINT esap_level_id IF NOT EXISTS FOR (n:EsapLevel) REQUIRE n.level_id IS UNIQUE",
    "CREATE CONSTRAINT approval_stage_id IF NOT EXISTS FOR (n:ApprovalStage) REQUIRE n.stage_id IS UNIQUE",
    "CREATE CONSTRAINT persona_role IF NOT EXISTS FOR (n:Persona) REQUIRE n.role IS UNIQUE",
    "CREATE CONSTRAINT banned_phrase_text IF NOT EXISTS FOR (n:BannedPhrase) REQUIRE n.phrase IS UNIQUE",
    "CREATE CONSTRAINT rule_id IF NOT EXISTS FOR (n:Rule) REQUIRE n.rule_id IS UNIQUE",
    "CREATE CONSTRAINT checklist_item_id IF NOT EXISTS FOR (n:ChecklistItem) REQUIRE n.item_id IS UNIQUE",
    "CREATE CONSTRAINT term_text IF NOT EXISTS FOR (n:Term) REQUIRE n.text IS UNIQUE",
    "CREATE CONSTRAINT clause_type_id IF NOT EXISTS FOR (n:ClauseType) REQUIRE n.type_id IS UNIQUE",

    # Full-text indexes for semantic search
    "CREATE FULLTEXT INDEX sow_content IF NOT EXISTS FOR (n:SOW) ON EACH [n.title, n.executive_summary]",
    "CREATE FULLTEXT INDEX section_content IF NOT EXISTS FOR (n:Section) ON EACH [n.content]",
    "CREATE FULLTEXT INDEX deliverable_content IF NOT EXISTS FOR (n:Deliverable) ON EACH [n.title, n.acceptance_criteria]",
    "CREATE FULLTEXT INDEX risk_content IF NOT EXISTS FOR (n:Risk) ON EACH [n.description, n.mitigation]",

    # Range index for numeric queries (deal value, margin for risk prediction)
    "CREATE INDEX sow_deal_value IF NOT EXISTS FOR (n:SOW) ON (n.deal_value)",
    "CREATE INDEX sow_margin IF NOT EXISTS FOR (n:SOW) ON (n.estimated_margin)",
    "CREATE INDEX risk_severity IF NOT EXISTS FOR (n:Risk) ON (n.severity)",

    # Indexes for incremental embedding
    # embed_hash lets enrich.py skip nodes whose content hasn't changed
    "CREATE INDEX section_embed_hash    IF NOT EXISTS FOR (n:Section)     ON (n.embed_hash)",
    "CREATE INDEX deliverable_embed_hash IF NOT EXISTS FOR (n:Deliverable) ON (n.embed_hash)",
    "CREATE INDEX risk_embed_hash       IF NOT EXISTS FOR (n:Risk)        ON (n.embed_hash)",
    "CREATE INDEX rule_embed_hash       IF NOT EXISTS FOR (n:Rule)        ON (n.embed_hash)",
    "CREATE INDEX clausetype_embed_hash IF NOT EXISTS FOR (n:ClauseType)  ON (n.embed_hash)",
]


def init_schema(driver):
    with driver.session() as session:
        for query in SCHEMA_QUERIES:
            try:
                session.run(query)
            except Exception as e:
                # Constraints may already exist on re-runs — safe to skip
                print(f"  [schema] skipped (already exists): {e}")
