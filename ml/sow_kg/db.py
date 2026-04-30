from __future__ import annotations

import os

from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")


def get_driver():
    return GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


SCHEMA_QUERIES = [
    "CREATE CONSTRAINT sow_id               IF NOT EXISTS FOR (n:SOW)            REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT party_name           IF NOT EXISTS FOR (n:Party)           REQUIRE n.name IS UNIQUE",
    "CREATE CONSTRAINT methodology_name     IF NOT EXISTS FOR (n:Methodology)     REQUIRE n.name IS UNIQUE",
    "CREATE CONSTRAINT esap_level_id        IF NOT EXISTS FOR (n:EsapLevel)       REQUIRE n.level_id IS UNIQUE",
    "CREATE CONSTRAINT approval_stage_id    IF NOT EXISTS FOR (n:ApprovalStage)   REQUIRE n.stage_id IS UNIQUE",
    "CREATE CONSTRAINT persona_role         IF NOT EXISTS FOR (n:Persona)         REQUIRE n.role IS UNIQUE",
    "CREATE CONSTRAINT banned_phrase_text   IF NOT EXISTS FOR (n:BannedPhrase)    REQUIRE n.phrase IS UNIQUE",
    "CREATE CONSTRAINT rule_id              IF NOT EXISTS FOR (n:Rule)            REQUIRE n.rule_id IS UNIQUE",
    "CREATE CONSTRAINT checklist_item_id    IF NOT EXISTS FOR (n:ChecklistItem)   REQUIRE n.item_id IS UNIQUE",
    "CREATE CONSTRAINT term_text            IF NOT EXISTS FOR (n:Term)            REQUIRE n.text IS UNIQUE",
    "CREATE CONSTRAINT clause_type_id       IF NOT EXISTS FOR (n:ClauseType)      REQUIRE n.type_id IS UNIQUE",

    "CREATE CONSTRAINT deal_context_id      IF NOT EXISTS FOR (n:DealContext)     REQUIRE n.project_id IS UNIQUE",
    "CREATE CONSTRAINT customer_id          IF NOT EXISTS FOR (n:Customer)        REQUIRE n.customer_id IS UNIQUE",
    "CREATE CONSTRAINT industry_name        IF NOT EXISTS FOR (n:Industry)        REQUIRE n.name IS UNIQUE",
    "CREATE CONSTRAINT staffing_role_name   IF NOT EXISTS FOR (n:StaffingRole)    REQUIRE n.name IS UNIQUE",
    "CREATE CONSTRAINT status_snapshot_id   IF NOT EXISTS FOR (n:StatusSnapshot)  REQUIRE n.snapshot_id IS UNIQUE",

    "CREATE FULLTEXT INDEX sow_content          IF NOT EXISTS FOR (n:SOW)         ON EACH [n.title, n.executive_summary]",
    "CREATE FULLTEXT INDEX section_content      IF NOT EXISTS FOR (n:Section)     ON EACH [n.content]",
    "CREATE FULLTEXT INDEX deliverable_content  IF NOT EXISTS FOR (n:Deliverable) ON EACH [n.title, n.acceptance_criteria]",
    "CREATE FULLTEXT INDEX risk_content         IF NOT EXISTS FOR (n:Risk)        ON EACH [n.description, n.mitigation]",
    "CREATE FULLTEXT INDEX deal_context_content IF NOT EXISTS FOR (n:DealContext) ON EACH [n.project_name, n.project_outcomes, n.lessons_learned]",

    "CREATE INDEX sow_deal_value        IF NOT EXISTS FOR (n:SOW)          ON (n.deal_value)",
    "CREATE INDEX sow_margin            IF NOT EXISTS FOR (n:SOW)          ON (n.estimated_margin)",
    "CREATE INDEX risk_severity         IF NOT EXISTS FOR (n:Risk)         ON (n.severity)",
    "CREATE INDEX deal_revenue          IF NOT EXISTS FOR (n:DealContext)  ON (n.total_revenue)",
    "CREATE INDEX deal_outcome          IF NOT EXISTS FOR (n:DealContext)  ON (n.outcome)",
    "CREATE INDEX deal_industry         IF NOT EXISTS FOR (n:DealContext)  ON (n.industry)",
    "CREATE INDEX deal_satisfaction     IF NOT EXISTS FOR (n:DealContext)  ON (n.customer_satisfaction)",
    "CREATE INDEX status_period         IF NOT EXISTS FOR (n:StatusSnapshot) ON (n.period_ending)",

    "CREATE INDEX section_embed_hash        IF NOT EXISTS FOR (n:Section)     ON (n.embed_hash)",
    "CREATE INDEX deliverable_embed_hash    IF NOT EXISTS FOR (n:Deliverable) ON (n.embed_hash)",
    "CREATE INDEX risk_embed_hash           IF NOT EXISTS FOR (n:Risk)        ON (n.embed_hash)",
    "CREATE INDEX rule_embed_hash           IF NOT EXISTS FOR (n:Rule)        ON (n.embed_hash)",
    "CREATE INDEX clausetype_embed_hash     IF NOT EXISTS FOR (n:ClauseType)  ON (n.embed_hash)",
]


def init_schema(driver):
    with driver.session() as session:
        for query in SCHEMA_QUERIES:
            try:
                session.run(query)
            except Exception as e:
                print(f"  [schema] skipped: {e}")
