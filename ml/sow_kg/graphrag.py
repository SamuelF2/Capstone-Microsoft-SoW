from __future__ import annotations
import logging
from dataclasses import dataclass, field
from typing import Optional
from neo4j import Driver
logger = logging.getLogger(__name__)

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

SCORE_THRESHOLDS = {
    "section":    0.55,
    "rule":       0.50,
    "clausetype": 0.50,
}

MAX_ANCHOR_SECTIONS  = 8
MAX_ANCHOR_RULES     = 4
MAX_ANCHOR_CLAUSES   = 4
MAX_TRAVERSAL_NODES  = 50
MAX_CROSS_SOW        = 5


@dataclass
class DealContext:
    sow_id:      Optional[str]   = None
    methodology: Optional[str]   = None
    deal_value:  Optional[float] = None
    industry:    Optional[str]   = None


@dataclass
class RetrievedContext:
    query:            str
    deal_context:     DealContext
    sections:         list[dict] = field(default_factory=list)
    rules:            list[dict] = field(default_factory=list)
    banned_phrases:   list[dict] = field(default_factory=list)
    risks:            list[dict] = field(default_factory=list)
    deliverables:     list[dict] = field(default_factory=list)
    similar_sections: list[dict] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not any([
            self.sections, self.rules, self.banned_phrases,
            self.risks, self.deliverables, self.similar_sections,
        ])

    def to_prompt_context(self) -> str:
        parts: list[str] = []

        dc = self.deal_context
        meta_parts = []
        if dc.methodology:
            meta_parts.append(f"methodology={dc.methodology}")
        if dc.deal_value:
            meta_parts.append(f"deal_value=${dc.deal_value:,.0f}")
        if dc.industry:
            meta_parts.append(f"industry={dc.industry}")
        if meta_parts:
            parts.append(f"[Deal Context: {', '.join(meta_parts)}]")

        if self.sections:
            parts.append("## Relevant SOW Sections")
            for s in self.sections:
                heading  = s.get("heading", "")
                stype    = s.get("section_type", "")
                content  = (s.get("content") or "")[:600]
                conf     = s.get("llm_confidence")
                tag      = f" [{stype}]" if stype and stype != "other" else ""
                conf_tag = f" (conf={conf:.2f})" if conf else ""
                parts.append(f"### {heading}{tag}{conf_tag}\n{content}")

        if self.rules:
            parts.append("## Applicable Validation Rules")
            for r in self.rules:
                sev  = (r.get("severity") or "").upper()
                desc = r.get("description", "")
                cat  = r.get("category", "")
                parts.append(f"- [{sev}] {desc} (category: {cat})")

        if self.banned_phrases:
            parts.append("## Banned Phrases")
            for b in self.banned_phrases:
                parts.append(f"- \"{b.get('phrase')}\" → {b.get('suggestion', 'avoid this term')}")

        if self.risks:
            parts.append("## Identified Risks")
            for r in self.risks:
                sev     = (r.get("severity") or "medium").upper()
                desc    = r.get("description", "")
                mit     = r.get("mitigation", "")
                mit_str = f" | mitigation: {mit}" if mit else " | no mitigation documented"
                parts.append(f"- [{sev}] {desc}{mit_str}")

        if self.deliverables:
            parts.append("## Deliverables")
            for d in self.deliverables:
                title  = d.get("title", "")
                ac     = d.get("acceptance_criteria", "")
                ac_str = f" | AC: {ac}" if ac else " | no acceptance criteria"
                parts.append(f"- {title}{ac_str}")

        if self.similar_sections:
            parts.append("## Sections from Similar Deals")
            for s in self.similar_sections:
                heading = s.get("heading", "")
                sow     = s.get("sow_title", "")
                meth    = s.get("methodology", "")
                content = (s.get("content") or "")[:400]
                meta    = f" [{meth}]" if meth else ""
                parts.append(f"### {heading} (from {sow}{meta})\n{content}")

        return "\n\n".join(parts)


def _load_deal_context(driver: Driver, sow_id: str) -> DealContext:
    with driver.session() as session:
        row = session.run(
            """
            MATCH (s:SOW {id: $sow_id})
            OPTIONAL MATCH (s)-[:USES_METHODOLOGY]->(m:Methodology)
            RETURN s.deal_value  AS deal_value,
                   s.industry    AS industry,
                   m.name        AS methodology
            LIMIT 1
            """,
            sow_id=sow_id,
        ).single()
    if not row:
        return DealContext(sow_id=sow_id)
    return DealContext(
        sow_id=sow_id,
        methodology=row["methodology"],
        deal_value=row["deal_value"],
        industry=row["industry"],
    )


def retrieve(
    driver:     Driver,
    model,
    query:      str,
    sow_id:     Optional[str] = None,
    top_k:      int = 5,
    hop_depth:  int = 2,
) -> RetrievedContext:
    query_vec = model.encode(query, normalize_embeddings=True).tolist()

    deal_ctx = _load_deal_context(driver, sow_id) if sow_id else DealContext(sow_id=sow_id)
    ctx = RetrievedContext(query=query, deal_context=deal_ctx)

    anchor_section_ids = _vector_search(
        driver, query_vec, "section_embeddings", "id",
        score_threshold=SCORE_THRESHOLDS["section"],
        top_k=min(top_k, MAX_ANCHOR_SECTIONS),
        sow_id=sow_id,
    )
    anchor_rule_ids = _vector_search(
        driver, query_vec, "rule_embeddings", "rule_id",
        score_threshold=SCORE_THRESHOLDS["rule"],
        top_k=MAX_ANCHOR_RULES,
    )
    anchor_clause_ids = _vector_search(
        driver, query_vec, "clausetype_embeddings", "type_id",
        score_threshold=SCORE_THRESHOLDS["clausetype"],
        top_k=MAX_ANCHOR_CLAUSES,
    )

    if not anchor_section_ids and not anchor_rule_ids:
        return ctx

    all_section_ids   = set(anchor_section_ids)
    all_rule_ids      = set(anchor_rule_ids)
    all_banned_ids:   set[str] = set()
    all_risk_ids:     set[str] = set()
    all_deliverable_ids: set[str] = set()

    all_rule_ids |= _expand_clauses_to_rules(driver, anchor_clause_ids)

    for _ in range(hop_depth):
        if len(all_section_ids) + len(all_rule_ids) > MAX_TRAVERSAL_NODES:
            break

        new_sections, new_rules, new_banned, new_risks, new_deliverables = (
            _expand_from_sections(driver, list(all_section_ids), deal_ctx)
        )
        all_section_ids   |= new_sections
        all_rule_ids      |= new_rules
        all_banned_ids    |= new_banned
        all_risk_ids      |= new_risks
        all_deliverable_ids |= new_deliverables

    ctx.sections       = _fetch_sections(driver, list(all_section_ids)[:top_k * 2])
    ctx.rules          = _fetch_rules(driver, list(all_rule_ids)[:12])
    ctx.banned_phrases = _fetch_banned_phrases(driver, list(all_banned_ids))
    ctx.risks          = _fetch_risks(driver, list(all_risk_ids)[:8])
    ctx.deliverables   = _fetch_deliverables(driver, list(all_deliverable_ids)[:6])
    ctx.similar_sections = _fetch_cross_deal_sections(
        driver, list(anchor_section_ids), deal_ctx, limit=MAX_CROSS_SOW,
    )

    return ctx


def _vector_search(
    driver:          Driver,
    query_vec:       list[float],
    index_name:      str,
    id_field:        str,
    score_threshold: float,
    top_k:           int,
    sow_id:          Optional[str] = None,
) -> list[str]:
    with driver.session() as session:
        rows = session.run(
            f"""
            CALL db.index.vector.queryNodes($index_name, $k, $vec)
            YIELD node, score
            WHERE score > $threshold
              AND ($sow_id IS NULL OR (node)<-[:HAS_SECTION]-(:SOW {{id: $sow_id}}))
            RETURN node.{id_field} AS id
            """,
            index_name=index_name, k=top_k, vec=query_vec,
            threshold=score_threshold, sow_id=sow_id,
        ).data()
    return [r["id"] for r in rows if r["id"]]

def _expand_clauses_to_rules(driver: Driver, clause_ids: list[str]) -> set[str]:
    if not clause_ids:
        return set()
    with driver.session() as session:
        row = session.run(
            "UNWIND $ids AS cid MATCH (ct:ClauseType {type_id: cid})-[:VALIDATED_BY]->(r:Rule) RETURN collect(DISTINCT r.rule_id) AS ids",
            ids=clause_ids,
        ).single()
    return set(filter(None, row["ids"])) if row else set()


def _expand_from_sections(
    driver:   Driver,
    sec_ids:  list[str],
    deal_ctx: DealContext,
) -> tuple[set, set, set, set, set]:
    if not sec_ids:
        return set(), set(), set(), set(), set()

    with driver.session() as session:
        row = session.run(
            """
            UNWIND $ids AS sid
            MATCH (sec:Section {id: sid})
            OPTIONAL MATCH (sec)-[:INSTANCE_OF]->(ct:ClauseType)-[:VALIDATED_BY]->(r:Rule)
            OPTIONAL MATCH (sec)-[:CONTAINS_BANNED_PHRASE]->(b:BannedPhrase)
            OPTIONAL MATCH (sow:SOW)-[:HAS_SECTION]->(sec)
            OPTIONAL MATCH (sow)-[:HAS_RISK]->(risk:Risk)
            OPTIONAL MATCH (sow)-[:HAS_DELIVERABLE]->(d:Deliverable)
            OPTIONAL MATCH (ct)<-[:INSTANCE_OF]-(neighbor:Section)<-[:HAS_SECTION]-(sow2:SOW)
            WHERE neighbor.id <> sid
              AND ($methodology IS NULL OR sow2.methodology = $methodology)
            RETURN
                collect(DISTINCT r.rule_id)   AS rule_ids,
                collect(DISTINCT b.phrase)    AS banned_ids,
                collect(DISTINCT risk.id)     AS risk_ids,
                collect(DISTINCT d.id)        AS deliverable_ids,
                collect(DISTINCT neighbor.id) AS neighbor_ids
            """,
            ids=sec_ids,
            methodology=deal_ctx.methodology,
        ).single()

    if not row:
        return set(), set(), set(), set(), set()

    return (
        set(filter(None, row["neighbor_ids"])),
        set(filter(None, row["rule_ids"])),
        set(filter(None, row["banned_ids"])),
        set(filter(None, row["risk_ids"])),
        set(filter(None, row["deliverable_ids"])),
    )


def _fetch_sections(driver: Driver, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    with driver.session() as session:
        return session.run(
            """
            UNWIND $ids AS sid
            MATCH (s:Section {id: sid})
            RETURN s.id AS id, s.heading AS heading, s.section_type AS section_type,
                   s.content AS content, s.llm_confidence AS llm_confidence
            ORDER BY s.section_type
            """,
            ids=ids,
        ).data()


def _fetch_rules(driver: Driver, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    with driver.session() as session:
        rows = session.run(
            """
            UNWIND $ids AS rid
            MATCH (r:Rule {rule_id: rid})
            RETURN r.rule_id AS rule_id, r.description AS description,
                   r.severity AS severity, r.category AS category
            """,
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
            """
            UNWIND $ids AS rid
            MATCH (r:Risk {id: rid})
            RETURN r.id AS id, r.description AS description, r.severity AS severity,
                   r.mitigation AS mitigation, r.has_mitigation AS has_mitigation
            """,
            ids=ids,
        ).data()
    return sorted(rows, key=lambda r: SEVERITY_ORDER.get(r.get("severity", "low"), 3))


def _fetch_deliverables(driver: Driver, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    with driver.session() as session:
        return session.run(
            """
            UNWIND $ids AS did
            MATCH (d:Deliverable {id: did})
            RETURN d.id AS id, d.title AS title, d.description AS description,
                   d.acceptance_criteria AS acceptance_criteria, d.has_ac AS has_ac
            """,
            ids=ids,
        ).data()

def _fetch_cross_deal_sections(
    driver:     Driver,
    anchor_ids: list[str],
    deal_ctx:   DealContext,
    limit:      int,
) -> list[dict]:
    if not anchor_ids:
        return []

    with driver.session() as session:
        return session.run(
            """
            UNWIND $anchor_ids AS aid
            MATCH (anchor:Section {id: aid})-[:INSTANCE_OF]->(ct:ClauseType)
                  <-[:INSTANCE_OF]-(other:Section)<-[:HAS_SECTION]-(sow2:SOW)
            WHERE other.id <> aid
              AND other.char_count > 100
              AND ($methodology IS NULL OR sow2.methodology = $methodology)
              AND ($sow_id IS NULL OR sow2.id <> $sow_id)
            RETURN DISTINCT
                other.heading    AS heading,
                other.content    AS content,
                sow2.title       AS sow_title,
                sow2.methodology AS methodology,
                ct.type_id       AS section_type
            LIMIT $limit
            """,
            anchor_ids=anchor_ids,
            methodology=deal_ctx.methodology,
            sow_id=deal_ctx.sow_id,
            limit=limit,
        ).data()
