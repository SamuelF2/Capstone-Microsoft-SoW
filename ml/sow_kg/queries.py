"""
Pre-built Cypher queries for SOW authoring assistance and risk analysis.
Primary read interface for the knowledge graph.
"""

from neo4j import Driver
from rich.console import Console
from rich.table import Table

console = Console()


def validate_sow(driver: Driver, sow_id: str) -> dict:
    """
    Run all rule-based validations against a SOW.
    Returns a structured report of violations and passes.
    """
    results = {}

    with driver.session() as session:
        results["banned_phrases"] = session.run(
            """
            MATCH (s:SOW {id: $sow_id})-[:HAS_SECTION]->(sec:Section)
                  -[:CONTAINS_BANNED_PHRASE]->(b:BannedPhrase)
            RETURN sec.heading AS section,
                   b.phrase    AS phrase,
                   b.severity  AS severity,
                   b.suggestion AS suggestion
            ORDER BY b.severity DESC
        """,
            sow_id=sow_id,
        ).data()

        results["missing_sections"] = session.run(
            """
            MATCH (ct:ClauseType)-[:VALIDATED_BY]->(r:Rule)
            WHERE r.category = 'required-section' AND r.required = true
            AND NOT EXISTS {
                MATCH (s:SOW {id: $sow_id})-[:HAS_SECTION]->(sec:Section)
                      -[:INSTANCE_OF]->(ct)
            }
            RETURN ct.display_name AS missing_section, r.description AS error
        """,
            sow_id=sow_id,
        ).data()

        results["deliverables_missing_ac"] = session.run(
            """
            MATCH (s:SOW {id: $sow_id})-[:HAS_DELIVERABLE]->(d:Deliverable)
            WHERE d.has_ac = false OR d.acceptance_criteria IS NULL
                  OR d.acceptance_criteria = ''
            RETURN d.title AS deliverable
        """,
            sow_id=sow_id,
        ).data()

        results["risks_without_mitigation"] = session.run(
            """
            MATCH (s:SOW {id: $sow_id})-[:HAS_RISK]->(r:Risk)
            WHERE r.has_mitigation = false
            RETURN r.description AS risk, r.severity AS severity
            ORDER BY
              CASE r.severity
                WHEN 'critical' THEN 1 WHEN 'high'   THEN 2
                WHEN 'medium'   THEN 3 WHEN 'low'    THEN 4
                ELSE 5 END
        """,
            sow_id=sow_id,
        ).data()

        results["missing_methodology_keywords"] = session.run(
            """
            MATCH (s:SOW {id: $sow_id})-[:USES_METHODOLOGY]->(m:Methodology)
                  -[:REQUIRES_KEYWORD]->(t:Term)
            WHERE NOT EXISTS {
                MATCH (s)-[:HAS_SECTION]->(sec:Section)
                WHERE toLower(sec.content) CONTAINS toLower(t.text)
            }
            RETURN t.text AS missing_keyword, m.name AS methodology
        """,
            sow_id=sow_id,
        ).data()

        results["ac_banned_phrases"] = session.run(
            """
            MATCH (s:SOW {id: $sow_id})-[:HAS_DELIVERABLE]->(d:Deliverable)
                  -[:CONTAINS_BANNED_PHRASE]->(b:BannedPhrase)
            RETURN d.title AS deliverable, b.phrase AS phrase,
                   b.severity AS severity, b.suggestion AS suggestion
            ORDER BY b.severity DESC
        """,
            sow_id=sow_id,
        ).data()

    return results


def find_similar_sows(driver: Driver, sow_id: str, limit: int = 5) -> list[dict]:
    """Find SOWs with overlapping clause types, ranked by shared count."""
    with driver.session() as session:
        return session.run(
            """
            MATCH (s:SOW {id: $sow_id})-[:HAS_SECTION]->(sec:Section)
                  -[:INSTANCE_OF]->(ct:ClauseType)
                  <-[:INSTANCE_OF]-(sec2:Section)<-[:HAS_SECTION]-(s2:SOW)
            WHERE s2.id <> $sow_id
            WITH s2, count(DISTINCT ct) AS shared_clauses
            ORDER BY shared_clauses DESC
            LIMIT $limit
            RETURN s2.title AS title, s2.id AS id,
                   s2.methodology AS methodology,
                   shared_clauses, s2.outcome AS outcome
        """,
            sow_id=sow_id,
            limit=limit,
        ).data()


def get_required_customer_responsibilities(driver: Driver, methodology: str) -> list[str]:
    with driver.session() as session:
        rows = session.run(
            """
            MATCH (m:Methodology {method_id: $method_id})
                  -[:REQUIRES_CUSTOMER_RESPONSIBILITY]->(req:Requirement)
            RETURN req.text AS responsibility
        """,
            method_id=methodology,
        ).data()
        return [r["responsibility"] for r in rows]


def get_persona_checklist(driver: Driver, role: str) -> list[dict]:
    with driver.session() as session:
        return session.run(
            """
            MATCH (p:Persona {role: $role})-[:HAS_CHECKLIST_ITEM]->(c:ChecklistItem)
            RETURN c.item_id AS id, c.text AS item,
                   c.required AS required, c.category AS category,
                   c.help_text AS help_text
            ORDER BY c.required DESC, c.category
        """,
            role=role,
        ).data()


def get_approval_chain(driver: Driver, deal_value: float, margin: float) -> dict:
    if deal_value > 5_000_000 or margin < 10:
        level_id = "type-1"
    elif deal_value > 1_000_000 or margin < 15:
        level_id = "type-2"
    else:
        level_id = "type-3"

    with driver.session() as session:
        approvers = session.run(
            """
            MATCH (e:EsapLevel {level_id: $level_id})-[rel:REQUIRES_APPROVER]->(p:Persona)
            RETURN e.name AS esap_level, p.role AS approver,
                   p.display_name AS display_name,
                   rel.stage AS stage, rel.required AS required,
                   rel.reason AS reason
            ORDER BY rel.stage, rel.required DESC
        """,
            level_id=level_id,
        ).data()

        stages = session.run("""
            MATCH (a:ApprovalStage)-[:PRECEDES]->(b:ApprovalStage)
            RETURN a.stage_id AS from_stage, b.stage_id AS to_stage,
                   a.name AS from_name, b.name AS to_name
            ORDER BY a.stage_id
        """).data()

    return {"level_id": level_id, "approvers": approvers, "stages": stages}


def get_risk_summary(driver: Driver, sow_id: str) -> list[dict]:
    with driver.session() as session:
        return session.run(
            """
            MATCH (s:SOW {id: $sow_id})-[:HAS_RISK]->(r:Risk)
            RETURN r.description    AS description,
                   r.severity       AS severity,
                   r.has_mitigation AS has_mitigation,
                   r.mitigation     AS mitigation
            ORDER BY
              CASE r.severity
                WHEN 'critical' THEN 1 WHEN 'high'   THEN 2
                WHEN 'medium'   THEN 3 WHEN 'low'    THEN 4
                ELSE 5 END
        """,
            sow_id=sow_id,
        ).data()


def get_rule_triggered_risks(driver: Driver, sow_id: str) -> list[dict]:
    with driver.session() as session:
        return session.run(
            """
            MATCH (s:SOW {id: $sow_id})-[:HAS_SECTION]->(sec:Section)
                  -[:CONTAINS_BANNED_PHRASE]->(b:BannedPhrase)
                  -[:DEFINED_BY]->(r:Rule)
            RETURN sec.heading   AS section,
                   b.phrase      AS trigger,
                   r.description AS reason,
                   b.severity    AS severity,
                   b.suggestion  AS suggestion
            ORDER BY b.severity DESC
        """,
            sow_id=sow_id,
        ).data()


def print_graph_summary(driver: Driver):
    with driver.session() as session:
        counts = session.run("""
            MATCH (n)
            RETURN labels(n)[0] AS label, count(n) AS count
            ORDER BY count DESC
        """).data()

        rel_counts = session.run("""
            MATCH ()-[r]->()
            RETURN type(r) AS rel_type, count(r) AS count
            ORDER BY count DESC
            LIMIT 20
        """).data()

    node_table = Table(title="Knowledge Graph — Node Counts", show_header=True)
    node_table.add_column("Node Type", style="cyan")
    node_table.add_column("Count", justify="right", style="green")
    for row in counts:
        if row["label"]:
            node_table.add_row(row["label"], str(row["count"]))
    console.print(node_table)

    rel_table = Table(title="Knowledge Graph — Relationship Counts", show_header=True)
    rel_table.add_column("Relationship", style="yellow")
    rel_table.add_column("Count", justify="right", style="green")
    for row in rel_counts:
        rel_table.add_row(row["rel_type"], str(row["count"]))
    console.print(rel_table)
