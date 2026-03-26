"""
Need to fix the ingestion process
Some soltuions:
    1. Async LLM calls - Instead of waiting for each section sequentially fire all sections with
    workers
    2, Batch the prompts - Instead of 1 LLM call per section send 5-10 sections per call
    3. Different model for ingestion - use a non-reasoning model for ingestion
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

from neo4j import Driver
from rich.console import Console

from .extract import extract_document
from .llm_client import (
    classify_section,
    extract_deliverables_llm,
    extract_entities,
    extract_risks_llm,
)
from .schema_evolution import process_proposals

console = Console()
logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".md", ".json", ".docx", ".pdf"}

PROCESS_PREFIXES = {
    "identify",
    "analyze",
    "analyse",
    "plan and",
    "track and",
    "escalate",
    "control",
    "monitor",
    "review the",
    "active issue",
}

SECTION_MAP = [
    ("areas in scope", "scope"),
    ("targeted scope", "scope"),
    ("general project scope", "scope"),
    ("project objectives and scope", "scope"),
    ("engagement overview", "scope"),
    ("customer desired business", "scope"),
    ("customer goals and engagement", "scope"),
    ("goals and engagement outcomes", "scope"),
    ("project scope", "scope"),
    ("out of scope", "outOfScope"),
    ("exclusion", "outOfScope"),
    ("project artifact", "deliverables"),
    ("deliverable", "deliverables"),
    ("work product", "deliverables"),
    ("backlog item acceptance", "deliverables"),
    ("sprint process", "approach"),
    ("scrum approach", "approach"),
    ("delivery approach", "approach"),
    ("delivery overview", "approach"),
    ("delivery sprint", "approach"),
    ("engagement initiation", "approach"),
    ("product baseline planning", "approach"),
    ("baseline planning", "approach"),
    ("testing and defect", "approach"),
    ("customer responsibilities", "customerResponsibilities"),
    ("responsibilities and engagement", "customerResponsibilities"),
    ("customer staffing", "customerResponsibilities"),
    ("responsibilities", "customerResponsibilities"),
    ("engagement assumption", "assumptions"),
    ("project assumption", "assumptions"),
    ("scope assumption", "assumptions"),
    ("technical assumption", "assumptions"),
    ("risk and issue", "risks"),
    ("risk register", "risks"),
    ("engagement completion", "supportTransitionPlan"),
    ("support transition", "supportTransitionPlan"),
    ("completion and definition of done", "supportTransitionPlan"),
    ("engagement staffing", "staffing"),
    ("project staffing", "staffing"),
    ("project capacity", "staffing"),
    ("feature team", "staffing"),
    ("project organization", "staffing"),
    ("engagement organization", "staffing"),
    ("executive summary", "executiveSummary"),
    ("introduction", "introduction"),
    ("change management", "changeManagement"),
    ("escalation", "governance"),
    ("engagement communication", "governance"),
    ("project communication", "governance"),
    ("governance", "governance"),
    ("timeline", "milestones"),
    ("milestone", "milestones"),
    ("billing", "billing"),
    ("payment", "billing"),
]


def _stable_id(text: str, prefix: str = "") -> str:
    h = hashlib.md5(text.encode()).hexdigest()[:8]
    return f"{prefix}_{h}" if prefix else h


def _detect_methodology(content: str) -> str:
    c = content.lower()
    scores = {
        "agile": sum(
            c.count(k) for k in ["sprint", "backlog", "scrum", "iteration", "product owner"]
        ),
        "waterfall": sum(
            c.count(k) for k in ["phase gate", "requirements phase", "design phase", "uat"]
        ),
        "sure-step-365": sum(
            c.count(k) for k in ["sure step", "fit-gap", "dynamics", "diagnostic phase"]
        ),
        "cloud-adoption": sum(
            c.count(k)
            for k in ["landing zone", "migration wave", "azure caf", "workload assessment"]
        ),
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "unknown"


def _heuristic_section_type(heading: str) -> str:
    h = heading.lower().rstrip(".")
    for key, stype in SECTION_MAP:
        if key in h:
            return stype
    return "other"


def _classify(heading: str, content_preview: str) -> dict:
    try:
        result = classify_section(heading, content_preview)
        if result.get("type"):
            return result
    except Exception as e:
        logger.debug(f"LLM classification failed for '{heading}': {e}")
    return {
        "type": _heuristic_section_type(heading),
        "confidence": 0.6,
        "new_type": None,
        "reasoning": "heuristic",
    }


def _is_sow(raw_text: str) -> bool:
    lower = raw_text.lower()
    signals = sum(
        1
        for kw in [
            "statement of work",
            "in scope",
            "out of scope",
            "acceptance criteria",
            "customer responsibilities",
            "deliverable",
            "prepared for",
            "prepared by",
        ]
        if kw in lower
    )
    return signals >= 3


def _check_banned_phrases(content: str, banned: list[dict]) -> list[str]:
    lower = content.lower()
    return [bp["phrase"] for bp in banned if bp.get("phrase", "").lower() in lower]


def _write_entities(
    driver: Driver, extracted: dict, filename: str, parent_id: str, parent_label: str
):
    id_map: dict[str, str] = {}

    for entity in extracted.get("entities", []):
        if float(entity.get("confidence", 0)) < 0.5:
            continue
        label = entity.get("label", "Term")
        name = entity.get("name", "").strip()
        if not label or not name:
            continue

        node_id = _stable_id(f"{label}:{name}:{filename}", "dyn")
        props = {k: str(v)[:500] for k, v in entity.get("properties", {}).items() if v is not None}
        props.update({"name": name[:200], "source_doc": filename})

        try:
            with driver.session() as session:
                session.run(
                    f"MERGE (n:{label} {{dynamic_id: $nid}}) SET n += $props",
                    nid=node_id,
                    props=props,
                )
                session.run(
                    f"MATCH (p:{parent_label} {{id: $pid}}) MATCH (n:{label} {{dynamic_id: $nid}}) MERGE (p)-[:CONTAINS_ENTITY]->(n)",
                    pid=parent_id,
                    nid=node_id,
                )
            id_map[name] = node_id
        except Exception as e:
            logger.debug(f"Entity write failed {label}:{name}: {e}")

    for rel in extracted.get("relationships", []):
        if float(rel.get("confidence", 0)) < 0.6:
            continue
        from_id = id_map.get(rel.get("from_name", ""))
        to_id = id_map.get(rel.get("to_name", ""))
        if not from_id or not to_id:
            continue
        rel_type = re.sub(
            r"[^A-Z0-9_]", "_", rel.get("type", "RELATED_TO").upper().replace(" ", "_")
        )
        from_label = rel.get("from_label", "Term")
        to_label = rel.get("to_label", "Term")
        try:
            with driver.session() as session:
                session.run(
                    f"MATCH (a:{from_label} {{dynamic_id: $aid}}) MATCH (b:{to_label} {{dynamic_id: $bid}}) MERGE (a)-[r:{rel_type}]->(b)",
                    aid=from_id,
                    bid=to_id,
                )
        except Exception as e:
            logger.debug(f"Relationship write failed: {e}")


def _write_section(
    driver: Driver, sec: dict, sow_id: str, filename: str, banned_phrases: list[dict]
):
    sec_id = _stable_id(sow_id + sec["heading"], "sec")
    classification = _classify(sec["heading"], sec["content"][:300])
    section_type = classification["type"]

    if section_type == "other" and classification.get("new_type"):
        new_type = classification["new_type"]
        conf = classification["confidence"]
        with driver.session() as session:
            session.run(
                "MERGE (p:SchemaProposal {proposal_id: $pid}) SET p.kind='section_type', p.label=$label, p.confidence=$conf, p.source_doc=$src, p.accepted=$acc, p.usage_count=coalesce(p.usage_count,0)+1",
                pid=_stable_id(new_type, "prop"),
                label=new_type,
                conf=conf,
                src=filename,
                acc=conf >= 0.8,
            )

    with driver.session() as session:
        session.run(
            """
            MERGE (sec:Section {id: $sid})
            SET sec.heading=$heading, sec.section_type=$stype, sec.content=$content,
                sec.char_count=$cc, sec.level=$level, sec.llm_confidence=$conf, sec.llm_reasoning=$reason
            WITH sec MATCH (s:SOW {id: $sow_id}) MERGE (s)-[:HAS_SECTION]->(sec)
            """,
            sid=sec_id,
            heading=sec["heading"],
            stype=section_type,
            content=sec["content"][:2000],
            cc=sec["char_count"],
            level=sec["level"],
            conf=classification["confidence"],
            reason=classification.get("reasoning", "")[:200],
            sow_id=sow_id,
        )
        if section_type != "other":
            session.run(
                "MATCH (sec:Section {id: $sid}) MERGE (ct:ClauseType {type_id: $tid}) MERGE (sec)-[:INSTANCE_OF]->(ct)",
                sid=sec_id,
                tid=section_type,
            )

    for phrase in _check_banned_phrases(sec["content"], banned_phrases):
        with driver.session() as session:
            session.run(
                "MATCH (sec:Section {id: $sid}) MATCH (b:BannedPhrase {phrase: $phrase}) MERGE (sec)-[:CONTAINS_BANNED_PHRASE]->(b)",
                sid=sec_id,
                phrase=phrase,
            )

    try:
        extracted = extract_entities(sec["heading"], sec["content"])
        _write_entities(driver, extracted, filename, sec_id, "Section")
        if extracted.get("proposed_schema"):
            process_proposals(driver, extracted["proposed_schema"], filename, sec["heading"])
    except Exception as e:
        logger.debug(f"Entity extraction error '{sec['heading']}': {e}")

    if section_type == "risks":
        try:
            risks = extract_risks_llm(sec["content"])
        except Exception:
            risks = []
        for risk in risks:
            if float(risk.get("confidence", 1.0)) < 0.5:
                continue
            if any(risk["description"].lower().startswith(p) for p in PROCESS_PREFIXES):
                continue
            risk_id = _stable_id(sow_id + risk["description"], "risk")
            with driver.session() as session:
                session.run(
                    """
                    MERGE (r:Risk {id: $rid})
                    SET r.description=$desc, r.severity=$sev, r.mitigation=$mit,
                        r.has_mitigation=$hm, r.category=$cat, r.confidence=$conf
                    WITH r MATCH (s:SOW {id: $sow_id}) MERGE (s)-[:HAS_RISK]->(r)
                    """,
                    rid=risk_id,
                    sow_id=sow_id,
                    desc=risk["description"][:500],
                    sev=risk.get("severity", "medium"),
                    mit=risk.get("mitigation", "")[:500],
                    hm=risk.get("has_mitigation", False),
                    cat=risk.get("category", "Delivery"),
                    conf=float(risk.get("confidence", 1.0)),
                )

    if section_type == "deliverables":
        try:
            deliverables = extract_deliverables_llm(sec["content"])
        except Exception:
            deliverables = []
        for deliv in deliverables:
            if float(deliv.get("confidence", 1.0)) < 0.5:
                continue
            d_id = _stable_id(sow_id + deliv["title"], "del")
            with driver.session() as session:
                session.run(
                    """
                    MERGE (d:Deliverable {id: $did})
                    SET d.title=$title, d.description=$desc, d.acceptance_criteria=$ac,
                        d.has_ac=$hac, d.confidence=$conf
                    WITH d MATCH (s:SOW {id: $sow_id}) MERGE (s)-[:HAS_DELIVERABLE]->(d)
                    """,
                    did=d_id,
                    sow_id=sow_id,
                    title=deliv["title"][:200],
                    desc=deliv.get("description", "")[:500],
                    ac=deliv.get("acceptance_criteria", "")[:500],
                    hac=deliv.get("has_ac", False),
                    conf=float(deliv.get("confidence", 1.0)),
                )
            if deliv.get("has_ac"):
                for phrase in _check_banned_phrases(
                    deliv.get("acceptance_criteria", ""), banned_phrases
                ):
                    with driver.session() as session:
                        session.run(
                            "MATCH (d:Deliverable {id: $did}) MATCH (b:BannedPhrase {phrase: $phrase}) MERGE (d)-[:CONTAINS_BANNED_PHRASE]->(b)",
                            did=d_id,
                            phrase=phrase,
                        )


def _write_sow(driver: Driver, doc: dict, banned_phrases: list[dict]):
    filename = doc["filename"]
    sow_id = _stable_id(filename, "sow")
    methodology = _detect_methodology(doc["raw_text"])

    console.print(
        f"  [dim]→ SOW:[/] [yellow]{filename}[/] | methodology=[cyan]{methodology}[/] | sections={len(doc['sections'])}"
    )

    with driver.session() as session:
        session.run(
            "MERGE (s:SOW {id: $sid}) SET s.title=$title, s.filename=$fn, s.methodology=$meth, s.char_count=$cc, s.format=$fmt, s.source='ingested'",
            sid=sow_id,
            title=doc["title"],
            fn=filename,
            meth=methodology,
            cc=len(doc["raw_text"]),
            fmt=doc["metadata"].get("format", "unknown"),
        )
        session.run(
            "MATCH (s:SOW {id: $sid}) MERGE (m:Methodology {method_id: $mid}) MERGE (s)-[:USES_METHODOLOGY]->(m)",
            sid=sow_id,
            mid=methodology,
        )

    for sec in doc["sections"]:
        _write_section(driver, sec, sow_id, filename, banned_phrases)

    console.print(f"    [dim]✓ {len(doc['sections'])} sections[/]")


def _write_guide(driver: Driver, doc: dict):
    filename = doc["filename"]
    console.print(f"  [dim]→ Guide:[/] [blue]{filename}[/] | sections={len(doc['sections'])}")

    for sec in doc["sections"]:
        if sec["char_count"] < 80:
            continue

        ct_id = _stable_id(filename + sec["heading"], "guide")
        classification = _classify(sec["heading"], sec["content"][:300])

        with driver.session() as session:
            session.run(
                "MERGE (ct:ClauseType {type_id: $tid}) SET ct.display_name=$heading, ct.description=$content, ct.source=$fn, ct.section_type=$stype, ct.is_reference=true",
                tid=ct_id,
                heading=sec["heading"][:200],
                content=sec["content"][:2000],
                fn=filename,
                stype=classification["type"],
            )

        try:
            extracted = extract_entities(sec["heading"], sec["content"])
            _write_entities(driver, extracted, filename, ct_id, "ClauseType")
            if extracted.get("proposed_schema"):
                process_proposals(driver, extracted["proposed_schema"], filename, sec["heading"])
        except Exception as e:
            logger.debug(f"Guide entity extraction error: {e}")

        terms = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b", sec["content"])
        with driver.session() as session:
            for term in list(set(terms))[:20]:
                session.run(
                    "MERGE (t:Term {text: $text}) WITH t MATCH (ct:ClauseType {type_id: $tid}) MERGE (ct)-[:MENTIONS_TERM]->(t)",
                    text=term,
                    tid=ct_id,
                )


def ingest_file(
    driver: Driver,
    path: Path,
    doc_type: str | None = None,
    banned_phrases: list[dict] | None = None,
):
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {path.suffix}")
    doc = extract_document(path)
    resolved_type = doc_type or ("sow" if _is_sow(doc["raw_text"]) else "guide")
    if resolved_type == "sow":
        _write_sow(driver, doc, banned_phrases or [])
    else:
        _write_guide(driver, doc)


def ingest_directory(driver: Driver, data_dir: Path, banned_phrases: list[dict] | None = None):
    console.rule("[bold]Document Ingestion")

    sow_dir = data_dir / "sow-md"
    guide_dir = data_dir / "SOW Guides MD"
    sow_count = guide_count = 0

    if sow_dir.exists():
        for f in sorted(sow_dir.iterdir()):
            if f.suffix.lower() in SUPPORTED_EXTENSIONS:
                ingest_file(driver, f, doc_type="sow", banned_phrases=banned_phrases)
                sow_count += 1

    if guide_dir.exists():
        for f in sorted(guide_dir.iterdir()):
            if f.suffix.lower() in SUPPORTED_EXTENSIONS:
                ingest_file(driver, f, doc_type="guide", banned_phrases=banned_phrases)
                guide_count += 1

    for f in sorted(data_dir.iterdir()):
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS:
            doc = extract_document(f)
            if _is_sow(doc["raw_text"]):
                _write_sow(driver, doc, banned_phrases or [])
                sow_count += 1
            else:
                _write_guide(driver, doc)
                guide_count += 1

    console.print(
        f"\n[bold green]✓ {sow_count} SOW documents, {guide_count} guide documents ingested[/]"
    )


def get_banned_phrases(driver: Driver) -> list[dict]:
    with driver.session() as session:
        return session.run(
            "MATCH (b:BannedPhrase) RETURN b.phrase AS phrase, b.severity AS severity, b.suggestion AS suggestion"
        ).data()
