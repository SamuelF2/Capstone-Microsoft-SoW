from __future__ import annotations

import logging
from dataclasses import dataclass, field

from neo4j import Driver

logger = logging.getLogger(__name__)
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@dataclass
class RetrievedContext:
    query: str
    sow_id: str | None
    sections: list[dict] = field(default_factory=list)
    rules: list[dict] = field(default_factory=list)
    banned_phrases: list[dict] = field(default_factory=list)
    risks: list[dict] = field(default_factory=list)
    deliverables: list[dict] = field(default_factory=list)
    similar_sections: list[dict] = field(default_factory=list)
    methodology: str | None = None
    schema_proposals: list[dict] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not any(
            [
                self.sections,
                self.rules,
                self.banned_phrases,
                self.risks,
                self.deliverables,
                self.similar_sections,
            ]
        )

    def to_prompt_context(self) -> str:
        parts: list[str] = []

        if self.methodology:
            parts.append(f"[Methodology: {self.methodology}]")

        if self.sections:
            parts.append("## Relevant SOW Sections")
            for s in self.sections:
                heading = s.get("heading", "")
                stype = s.get("section_type", "")
                content = s.get("content", "")[:600]
                conf = s.get("llm_confidence", "")
                tag = f" [{stype}]" if stype and stype != "other" else ""
                conf_tag = f" (confidence: {conf:.2f})" if conf else ""
                parts.append(f"### {heading}{tag}{conf_tag}\n{content}")

        if self.rules:
            parts.append("## Applicable Validation Rules")
            for r in self.rules:
                sev = r.get("severity", "")
                desc = r.get("description", "")
                cat = r.get("category", "")
                parts.append(f"- [{sev.upper()}] {desc} (category: {cat})")

        if self.banned_phrases:
            parts.append("## Banned Phrases in Scope")
            for b in self.banned_phrases:
                parts.append(f'- "{b.get("phrase")}" → {b.get("suggestion", "avoid this term")}')

        if self.risks:
            parts.append("## Identified Risks")
            for r in self.risks:
                sev = r.get("severity", "medium").upper()
                desc = r.get("description", "")
                mit = r.get("mitigation", "")
                mit_str = f" | mitigation: {mit}" if mit else " | no mitigation documented"
                parts.append(f"- [{sev}] {desc}{mit_str}")

        if self.deliverables:
            parts.append("## Deliverables")
            for d in self.deliverables:
                title = d.get("title", "")
                ac = d.get("acceptance_criteria", "")
                ac_str = f" | AC: {ac}" if ac else " | no acceptance criteria"
                parts.append(f"- {title}{ac_str}")

        if self.similar_sections:
            parts.append("## Relevant Sections from Similar SOWs")
            for s in self.similar_sections:
                heading = s.get("heading", "")
                sow = s.get("sow_title", "")
                content = s.get("content", "")[:400]
                parts.append(f"### {heading} (from {sow})\n{content}")

        return "\n\n".join(parts)


def retrieve(
    driver: Driver,
    model,
    query: str,
    sow_id: str | None = None,
    top_k: int = 5,
    hop_depth: int = 2,
) -> RetrievedContext:
    query_vec = model.encode(query, normalize_embeddings=True).tolist()
    ctx = RetrievedContext(query=query, sow_id=sow_id)

    anchor_section_ids = _vector_search_sections(driver, query_vec, sow_id, top_k)
    anchor_rule_ids = _vector_search_rules(driver, query_vec, top_k=3)
    anchor_clause_ids = _vector_search_clauses(driver, query_vec, top_k=3)

    if not anchor_section_ids and not anchor_rule_ids:
        return ctx

    all_section_ids = set(anchor_section_ids)
    all_rule_ids = set(anchor_rule_ids)
    all_banned_ids: set[str] = set()
    all_risk_ids: set[str] = set()
    all_deliverable_ids: set[str] = set()

    for depth in range(hop_depth):
        new_section_ids, new_rule_ids, new_banned_ids, new_risk_ids, new_deliverable_ids = (
            _expand_from_sections(driver, list(all_section_ids), sow_id)
        )
        new_rule_ids |= _expand_from_clauses(driver, anchor_clause_ids)

        all_section_ids |= new_section_ids
        all_rule_ids |= new_rule_ids
        all_banned_ids |= new_banned_ids
        all_risk_ids |= new_risk_ids
        all_deliverable_ids |= new_deliverable_ids

        if depth == 0:
            anchor_section_ids = list(new_section_ids)

    ctx.sections = _fetch_sections(driver, list(all_section_ids)[: top_k * 2])
    ctx.rules = _fetch_rules(driver, list(all_rule_ids)[:12])
    ctx.banned_phrases = _fetch_banned_phrases(driver, list(all_banned_ids))
    ctx.risks = _fetch_risks(driver, list(all_risk_ids)[:8])
    ctx.deliverables = _fetch_deliverables(driver, list(all_deliverable_ids)[:6])
    ctx.methodology = _get_methodology(driver, sow_id) if sow_id else None
    ctx.similar_sections = _fetch_cross_sow_sections(driver, anchor_section_ids, sow_id, limit=3)

    return ctx


def _vector_search_sections(
    driver: Driver, query_vec: list[float], sow_id: str | None, top_k: int
) -> list[str]:
    cypher = """
        CALL db.index.vector.queryNodes('section_embeddings', $k, $vec)
        YIELD node, score
        WHERE score > 0.55
        {sow_filter}
        RETURN node.id AS id
    """
    sow_filter = "AND (node)-[:HAS_SECTION|<-[:HAS_SECTION]]-(:SOW {id: $sow_id})" if sow_id else ""
    cypher = cypher.format(sow_filter=sow_filter)

    with driver.session() as session:
        rows = session.run(cypher, k=top_k, vec=query_vec, sow_id=sow_id).data()
    return [r["id"] for r in rows if r["id"]]


def _vector_search_rules(driver: Driver, query_vec: list[float], top_k: int) -> list[str]:
    with driver.session() as session:
        rows = session.run(
            "CALL db.index.vector.queryNodes('rule_embeddings', $k, $vec) YIELD node, score WHERE score > 0.5 RETURN node.rule_id AS id",
            k=top_k,
            vec=query_vec,
        ).data()
    return [r["id"] for r in rows if r["id"]]


def _vector_search_clauses(driver: Driver, query_vec: list[float], top_k: int) -> list[str]:
    with driver.session() as session:
        rows = session.run(
            "CALL db.index.vector.queryNodes('clausetype_embeddings', $k, $vec) YIELD node, score WHERE score > 0.5 RETURN node.type_id AS id",
            k=top_k,
            vec=query_vec,
        ).data()
    return [r["id"] for r in rows if r["id"]]


def _expand_from_sections(
    driver: Driver,
    section_ids: list[str],
    sow_id: str | None,
) -> tuple[set, set, set, set, set]:
    if not section_ids:
        return set(), set(), set(), set(), set()

    with driver.session() as session:
        rows = session.run(
            """
            UNWIND $ids AS sid
            MATCH (sec:Section {id: sid})
            OPTIONAL MATCH (sec)-[:INSTANCE_OF]->(ct:ClauseType)-[:VALIDATED_BY]->(r:Rule)
            OPTIONAL MATCH (sec)-[:CONTAINS_BANNED_PHRASE]->(b:BannedPhrase)
            OPTIONAL MATCH (sow:SOW)-[:HAS_SECTION]->(sec)
            OPTIONAL MATCH (sow)-[:HAS_RISK]->(risk:Risk)
            OPTIONAL MATCH (sow)-[:HAS_DELIVERABLE]->(d:Deliverable)
            OPTIONAL MATCH (ct)<-[:INSTANCE_OF]-(neighbor:Section)<-[:HAS_SECTION]-(sow)
            WHERE neighbor.id <> sid
            RETURN
                collect(DISTINCT r.rule_id)   AS rule_ids,
                collect(DISTINCT b.phrase)    AS banned_ids,
                collect(DISTINCT risk.id)     AS risk_ids,
                collect(DISTINCT d.id)        AS deliverable_ids,
                collect(DISTINCT neighbor.id) AS neighbor_section_ids
            """,
            ids=section_ids,
        ).single()

    if not rows:
        return set(), set(), set(), set(), set()

    return (
        set(filter(None, rows["neighbor_section_ids"])),
        set(filter(None, rows["rule_ids"])),
        set(filter(None, rows["banned_ids"])),
        set(filter(None, rows["risk_ids"])),
        set(filter(None, rows["deliverable_ids"])),
    )


def _expand_from_clauses(driver: Driver, clause_ids: list[str]) -> set[str]:
    if not clause_ids:
        return set()
    with driver.session() as session:
        rows = session.run(
            "UNWIND $ids AS cid MATCH (ct:ClauseType {type_id: cid})-[:VALIDATED_BY]->(r:Rule) RETURN collect(DISTINCT r.rule_id) AS rule_ids",
            ids=clause_ids,
        ).single()
    return set(filter(None, rows["rule_ids"])) if rows else set()


def _fetch_sections(driver: Driver, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    with driver.session() as session:
        return session.run(
            "UNWIND $ids AS sid MATCH (s:Section {id: sid}) RETURN s.id AS id, s.heading AS heading, s.section_type AS section_type, s.content AS content, s.llm_confidence AS llm_confidence ORDER BY s.section_type",
            ids=ids,
        ).data()


def _fetch_rules(driver: Driver, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    with driver.session() as session:
        rows = session.run(
            "UNWIND $ids AS rid MATCH (r:Rule {rule_id: rid}) RETURN r.rule_id AS rule_id, r.description AS description, r.severity AS severity, r.category AS category",
            ids=ids,
        ).data()
    return sorted(rows, key=lambda r: SEVERITY_ORDER.get(r.get("severity", "low"), 3))


def _fetch_banned_phrases(driver: Driver, phrases: list[str]) -> list[dict]:
    if not phrases:
        return []
    with driver.session() as session:
        return session.run(
            "UNWIND $phrases AS p MATCH (b:BannedPhrase {phrase: p}) RETURN b.phrase AS phrase, b.suggestion AS suggestion, b.severity AS severity",
            phrases=phrases,
        ).data()


def _fetch_risks(driver: Driver, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    with driver.session() as session:
        rows = session.run(
            "UNWIND $ids AS rid MATCH (r:Risk {id: rid}) RETURN r.id AS id, r.description AS description, r.severity AS severity, r.mitigation AS mitigation, r.has_mitigation AS has_mitigation",
            ids=ids,
        ).data()
    return sorted(rows, key=lambda r: SEVERITY_ORDER.get(r.get("severity", "low"), 3))


def _fetch_deliverables(driver: Driver, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    with driver.session() as session:
        return session.run(
            "UNWIND $ids AS did MATCH (d:Deliverable {id: did}) RETURN d.id AS id, d.title AS title, d.description AS description, d.acceptance_criteria AS acceptance_criteria, d.has_ac AS has_ac",
            ids=ids,
        ).data()


def _get_methodology(driver: Driver, sow_id: str) -> str | None:
    with driver.session() as session:
        row = session.run(
            "MATCH (s:SOW {id: $sow_id})-[:USES_METHODOLOGY]->(m:Methodology) RETURN m.name AS name LIMIT 1",
            sow_id=sow_id,
        ).single()
    return row["name"] if row else None


def _fetch_cross_sow_sections(
    driver: Driver,
    anchor_ids: list[str],
    exclude_sow_id: str | None,
    limit: int,
) -> list[dict]:
    if not anchor_ids:
        return []
    with driver.session() as session:
        return session.run(
            """
            UNWIND $anchor_ids AS aid
            MATCH (anchor:Section {id: aid})-[:INSTANCE_OF]->(ct:ClauseType)
                  <-[:INSTANCE_OF]-(other:Section)<-[:HAS_SECTION]-(sow:SOW)
            WHERE ($exclude IS NULL OR sow.id <> $exclude)
              AND other.id <> aid
              AND other.char_count > 100
            RETURN DISTINCT other.heading AS heading, other.content AS content,
                   sow.title AS sow_title, ct.type_id AS section_type
            LIMIT $limit
            """,
            anchor_ids=anchor_ids,
            exclude=exclude_sow_id,
            limit=limit,
        ).data()
