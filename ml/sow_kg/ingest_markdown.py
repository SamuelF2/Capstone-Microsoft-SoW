"""
Ingest markdown SOW documents and guide files into the SOW Knowledge Graph.

SOW documents (contoso-agile-sow.md, SOW-AGILE.md, etc.)
  -> SOW nodes, Section nodes, Deliverable nodes, Risk nodes, Party nodes

Guide documents (SOW_Writing_Guide, Risk Framework, etc.)
  -> ClauseType nodes, Rule nodes, Term nodes (reference/knowledge layer)
"""

import re
import hashlib
from pathlib import Path
from neo4j import Driver
from rich.console import Console

console = Console()



def _stable_id(text: str, prefix: str = "") -> str:
    """Generate a stable short ID from content."""
    h = hashlib.md5(text.encode()).hexdigest()[:8]
    return f"{prefix}_{h}" if prefix else h


def _detect_methodology(content: str) -> str:
    """Infer methodology from document content."""
    content_lower = content.lower()
    scores = {
        "agile":          sum(content_lower.count(kw) for kw in ["sprint", "backlog", "scrum", "iteration", "product owner"]),
        "waterfall":      sum(content_lower.count(kw) for kw in ["phase gate", "requirements phase", "design phase", "uat"]),
        "sure-step-365":  sum(content_lower.count(kw) for kw in ["sure step", "fit-gap", "dynamics", "diagnostic phase"]),
        "cloud-adoption": sum(content_lower.count(kw) for kw in ["landing zone", "migration wave", "azure caf", "workload assessment"]),
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "unknown"


def _extract_sections(content: str) -> list[dict]:
    """
    Split markdown into sections by H2/H3 headers.
    Returns list of {heading, level, content, section_type}.
    """
    # First match wins
    SECTION_MAP = [
        # Scope
        ("areas in scope",                    "scope"),
        ("targeted scope",                    "scope"),
        ("general project scope",             "scope"),
        ("project objectives and scope",      "scope"),
        ("engagement overview",               "scope"),
        ("customer desired business",         "scope"),
        ("customer goals and engagement",     "scope"),
        ("goals and engagement outcomes",     "scope"),
        ("project scope",                     "scope"),
        # Out of scope
        ("out of scope",                      "outOfScope"),
        ("exclusion",                         "outOfScope"),
        # Deliverables
        ("project artifact",                  "deliverables"),
        ("deliverable",                       "deliverables"),
        ("work product",                      "deliverables"),
        ("backlog item acceptance",           "deliverables"),
        # Approach
        ("sprint process",                    "approach"),
        ("scrum approach",                    "approach"),
        ("delivery approach",                 "approach"),
        ("delivery overview",                 "approach"),
        ("delivery sprint",                   "approach"),
        ("engagement initiation",             "approach"),
        ("product baseline planning",         "approach"),
        ("baseline planning",                 "approach"),
        ("testing and defect",                "approach"),
        # Customer responsibilities
        ("customer responsibilities",         "customerResponsibilities"),
        ("responsibilities",                  "customerResponsibilities"),
        ("customer staffing",                 "customerResponsibilities"),
        ("responsibilities and engagement",   "customerResponsibilities"),
        # Assumptions — specific first so "engagement assumption" beats "engagement"
        ("engagement assumption",             "assumptions"),
        ("project assumption",                "assumptions"),
        ("scope assumption",                  "assumptions"),
        ("technical assumption",              "assumptions"),
        # Risks
        ("risk and issue",                    "risks"),
        ("risk register",                     "risks"),
        # Support / transition
        ("engagement completion",             "supportTransitionPlan"),
        ("support transition",                "supportTransitionPlan"),
        ("completion and definition of done", "supportTransitionPlan"),
        # Staffing
        ("engagement staffing",               "staffing"),
        ("project staffing",                  "staffing"),
        ("project capacity",                  "staffing"),
        ("feature team",                      "staffing"),
        ("project organization",              "staffing"),
        ("engagement organization",           "staffing"),
        # Intro / summary
        ("executive summary",                 "executiveSummary"),
        ("introduction",                      "introduction"),
        # Governance
        ("change management",                 "changeManagement"),
        ("escalation",                        "governance"),
        ("engagement communication",          "governance"),
        ("project communication",             "governance"),
        ("governance",                        "governance"),
        # Misc
        ("timeline",                          "milestones"),
        ("milestone",                         "milestones"),
        ("billing",                           "billing"),
        ("payment",                           "billing"),
    ]

    sections = []
    # Include H1 headings (# level) — many SOWs use H1 for major sections
    pattern = re.compile(r"^(#{1,4})\s+(.+)$", re.MULTILINE)
    matches = list(pattern.finditer(content))

    for i, match in enumerate(matches):
        heading = match.group(2).strip()
        level   = len(match.group(1))
        start   = match.end()
        end     = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        body    = content[start:end].strip()

        section_type = "other"
        heading_lower = heading.lower().rstrip(".")  # strip trailing period e.g. "Customer responsibilities."
        for key, stype in SECTION_MAP:
            if key in heading_lower:
                section_type = stype
                break

        if body:
            sections.append({
                "heading":      heading,
                "level":        level,
                "content":      body,
                "section_type": section_type,
                "char_count":   len(body),
            })

    return sections


def _extract_risks(content: str) -> list[dict]:
    """
    Extract risks from:
      - Markdown tables with a severity column
      - Bullet lists prefixed with severity keyword
      - Prose bullet lists (infer medium severity)
    """
    risks = []
    seen = set()

    # Table: any table with a severity column
    table_rows = re.findall(r"^\|(.+)\|$", content, re.MULTILINE)
    headers = []
    for row in table_rows:
        cells = [c.strip() for c in row.split("|")]
        if not headers:
            headers = [c.lower() for c in cells]
            continue
        if set(cells) <= {"-", "---", "----", ""}:
            continue

        def col(names):
            for n in names:
                for i, h in enumerate(headers):
                    if n in h and i < len(cells):
                        return cells[i]
            return ""

        desc = col(["risk", "description", "issue", "concern"])
        sev  = col(["severity", "priority", "impact", "level"])
        mit  = col(["mitigation", "response", "action", "owner"])

        if not desc or desc.lower() in ("risk", "description", "issue", ""):
            continue
        key = desc.lower()[:60]
        if key in seen:
            continue
        seen.add(key)

        # Normalise severity
        sev_norm = "medium"
        for level in ["critical", "high", "medium", "low"]:
            if level in sev.lower():
                sev_norm = level
                break

        risks.append({
            "description":    desc,
            "severity":       sev_norm,
            "mitigation":     mit,
            "has_mitigation": len(mit) > 5,
        })

    # Bullet: - **High** - description  or  - Identify – ...
    bullet_sev = re.compile(
        r"^[-*]\s*\*{0,2}(low|medium|high|critical)\*{0,2}[:\s\-–]+(.{10,})",
        re.IGNORECASE | re.MULTILINE,
    )
    for m in bullet_sev.finditer(content):
        key = m.group(2).lower()[:60]
        if key in seen:
            continue
        seen.add(key)
        risks.append({
            "description":    m.group(2).strip(),
            "severity":       m.group(1).lower(),
            "mitigation":     "",
            "has_mitigation": False,
        })

    # Prose bullets — each bullet is a risk step/item (infer medium)
    PROCESS_PREFIXES = {
        "identify", "analyze", "analyse", "plan and", "track and",
        "escalate", "control", "monitor", "review the", "active issue",
    }
    if not risks:
        prose = re.findall(r"^[-*]\s+(.{20,200})$", content, re.MULTILINE)
        for p in prose[:10]:
            if any(p.lower().startswith(pp) for pp in PROCESS_PREFIXES):
                continue
            key = p.lower()[:60]
            if key in seen:
                continue
            seen.add(key)
            risks.append({
                "description":    p.strip(),
                "severity":       "medium",
                "mitigation":     "",
                "has_mitigation": False,
            })

    return risks


def _extract_deliverables(content: str) -> list[dict]:
    """
    Extract deliverables from pipe tables (2- or 3-column).
    Falls back to bullet lists if no table found.
    """
    deliverables = []
    seen = set()

    SKIP_TITLES = {"name", "deliverable", "work product", "title", "output", "item", ""}

    table_rows = re.findall(r"^\|(.+)\|$", content, re.MULTILINE)
    headers = []
    for row in table_rows:
        cells = [c.strip() for c in row.split("|")]
        if not headers:
            headers = [c.lower() for c in cells]
            continue
        if set(cells) <= {"-", "---", "----", ""}:
            continue

        def col(names):
            for n in names:
                for i, h in enumerate(headers):
                    if n in h and i < len(cells):
                        return cells[i]
            return ""

        title = col(["name", "deliverable", "work product", "title", "output"])
        desc  = col(["description", "detail", "content", "summary"])
        ac    = col(["acceptance", "criteria", "required", "sign"])

        if title.lower() in SKIP_TITLES:
            continue
        key = title.lower()[:60]
        if key in seen:
            continue
        seen.add(key)
        deliverables.append({
            "title":               title,
            "description":         desc,
            "acceptance_criteria": ac,
            "has_ac":              len(ac) > 10,
        })

    # Bullet fallback
    if not deliverables:
        bullets = re.findall(r"^[-*]\s+\**(.{10,120}?)\**\s*$", content, re.MULTILINE)
        for b in bullets:
            key = b.lower()[:60]
            if key in seen:
                continue
            seen.add(key)
            deliverables.append({
                "title":               b.strip(),
                "description":         "",
                "acceptance_criteria": "",
                "has_ac":              False,
            })

    return deliverables


def _check_banned_phrases(content: str, banned: list[dict]) -> list[str]:
    """Return list of banned phrases found in content."""
    found = []
    content_lower = content.lower()
    for bp in banned:
        if bp["phrase"].lower() in content_lower:
            found.append(bp["phrase"])
    return found



_KNOWN_SOW_FILES = {
    "contoso-agile-sow.md",
    "SOW-AGILE.md",
    "contoso-agentic-ai-rfp.md",
}

_KNOWN_GUIDE_FILES = {
    "SOW_Writing_Guide_Formatted.md",
    "SOW_Drafting_Guidance___Deal_Review_Standards.md",
    "RISK_ASSESSMENT_AND_MITIGATION_FRAMEWORK.md",
    "Fixed-Capacity-Agile-Deal-Shaping-Guidelines.md",
    "Deal_Approval_in_MCEM_for_ISD_-_Formatted.md",
    "SDMPlus_MCEM_ISD_Chrysalis_Analysis.md",
    "FixedCapacitySupplementalTermsEnterpriseServicesWorkOrderv9_0_WW__ENG__Feb2024_.md",
    "SOWFRAGMENT-DELCOMPRIVCYSECURITYv2_0_WW__English__Dec2021_.md",
    "contoso-data-strategy.md",
    "contoso-data-estate-modern.md",
    "contoso-data-analytics-platform.md",
    "Deal_Approval_in_MCEM_for_ISD.md",
}


def ingest_sow_document(driver: Driver, path: Path, banned_phrases: list[dict]):
    """Parse a SOW markdown file and write all nodes/edges to Neo4j."""
    content  = path.read_text(encoding="utf-8", errors="replace")
    filename = path.name
    sow_id   = _stable_id(filename, "sow")

    methodology = _detect_methodology(content)
    sections    = _extract_sections(content)
    title       = filename.replace(".md", "").replace("_", " ")

    # Try to get title from first H1
    h1 = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if h1:
        title = h1.group(1).strip()

    console.print(f"  [dim]→ SOW:[/] [yellow]{filename}[/] | methodology=[cyan]{methodology}[/] | sections={len(sections)}")

    with driver.session() as session:
        # SOW node
        session.run("""
            MERGE (s:SOW {id: $sow_id})
            SET s.title        = $title,
                s.filename     = $filename,
                s.methodology  = $methodology,
                s.char_count   = $char_count,
                s.outcome      = null,
                s.source       = 'markdown-sow'
        """,
            sow_id=sow_id, title=title, filename=filename,
            methodology=methodology, char_count=len(content),
        )

        # Link to Methodology node
        session.run("""
            MATCH (s:SOW {id: $sow_id})
            MERGE (m:Methodology {method_id: $method_id})
            MERGE (s)-[:USES_METHODOLOGY]->(m)
        """, sow_id=sow_id, method_id=methodology)

        # Section nodes
        for sec in sections:
            sec_id = _stable_id(sow_id + sec["heading"], "sec")
            session.run("""
                MERGE (sec:Section {id: $sec_id})
                SET sec.heading      = $heading,
                    sec.section_type = $section_type,
                    sec.content      = $content,
                    sec.char_count   = $char_count,
                    sec.level        = $level
                WITH sec
                MATCH (s:SOW {id: $sow_id})
                MERGE (s)-[:HAS_SECTION]->(sec)
            """,
                sec_id=sec_id, heading=sec["heading"], section_type=sec["section_type"],
                content=sec["content"][:2000],  # cap for Neo4j property size
                char_count=sec["char_count"], level=sec["level"], sow_id=sow_id,
            )

            # Link Section to ClauseType if it maps to a known section
            if sec["section_type"] != "other":
                session.run("""
                    MATCH (sec:Section {id: $sec_id})
                    MERGE (ct:ClauseType {type_id: $type_id})
                    MERGE (sec)-[:INSTANCE_OF]->(ct)
                """, sec_id=sec_id, type_id=sec["section_type"])

            # Check for banned phrases in this section
            found_banned = _check_banned_phrases(sec["content"], banned_phrases)
            for phrase in found_banned:
                session.run("""
                    MATCH (sec:Section {id: $sec_id})
                    MATCH (b:BannedPhrase {phrase: $phrase})
                    MERGE (sec)-[:CONTAINS_BANNED_PHRASE]->(b)
                """, sec_id=sec_id, phrase=phrase)

            # Extract risks from risk sections
            if sec["section_type"] == "risks":
                risks = _extract_risks(sec["content"])
                for risk in risks:
                    risk_id = _stable_id(sow_id + risk["description"], "risk")
                    session.run("""
                        MERGE (r:Risk {id: $risk_id})
                        SET r.description    = $description,
                            r.severity       = $severity,
                            r.mitigation     = $mitigation,
                            r.has_mitigation = $has_mitigation,
                            r.confidence     = 1.0
                        WITH r
                        MATCH (s:SOW {id: $sow_id})
                        MERGE (s)-[:HAS_RISK]->(r)
                    """,
                        risk_id=risk_id, sow_id=sow_id,
                        description=risk["description"][:500],
                        severity=risk["severity"],
                        mitigation=risk["mitigation"][:500],
                        has_mitigation=risk["has_mitigation"],
                    )

            # Extract deliverables
            if sec["section_type"] == "deliverables":
                deliverables = _extract_deliverables(sec["content"])
                for deliv in deliverables:
                    d_id = _stable_id(sow_id + deliv["title"], "del")
                    session.run("""
                        MERGE (d:Deliverable {id: $d_id})
                        SET d.title              = $title,
                            d.description        = $description,
                            d.acceptance_criteria = $ac,
                            d.has_ac             = $has_ac
                        WITH d
                        MATCH (s:SOW {id: $sow_id})
                        MERGE (s)-[:HAS_DELIVERABLE]->(d)
                    """,
                        d_id=d_id, sow_id=sow_id,
                        title=deliv["title"][:200],
                        description=deliv["description"][:500],
                        ac=deliv["acceptance_criteria"][:500],
                        has_ac=deliv["has_ac"],
                    )

                    # Check acceptance criteria for banned phrases
                    if deliv["has_ac"]:
                        found = _check_banned_phrases(deliv["acceptance_criteria"], banned_phrases)
                        for phrase in found:
                            session.run("""
                                MATCH (d:Deliverable {id: $d_id})
                                MATCH (b:BannedPhrase {phrase: $phrase})
                                MERGE (d)-[:CONTAINS_BANNED_PHRASE]->(b)
                            """, d_id=d_id, phrase=phrase)


def ingest_guide_document(driver: Driver, path: Path):
    """
    Parse a guide/reference markdown file.
    These don't become SOW nodes — they enrich ClauseType and Rule nodes
    with reference content and link Term nodes for semantic search.
    """
    content  = path.read_text(encoding="utf-8", errors="replace")
    filename = path.name
    sections = _extract_sections(content)

    console.print(f"  [dim]→ Guide:[/] [blue]{filename}[/] | sections={len(sections)}")

    with driver.session() as session:
        for sec in sections:
            if sec["section_type"] in ("other",) and sec["char_count"] < 100:
                continue  # skip tiny/noise sections

            ct_id = _stable_id(filename + sec["heading"], "guide")
            session.run("""
                MERGE (ct:ClauseType {type_id: $type_id})
                SET ct.display_name  = $heading,
                    ct.description   = $content,
                    ct.source        = $filename,
                    ct.is_reference  = true
            """,
                type_id=ct_id,
                heading=sec["heading"][:200],
                content=sec["content"][:2000],
                filename=filename,
            )

            # Extract capitalized terms as Term nodes (rough NLP-free extraction)
            terms = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b", sec["content"])
            unique_terms = set(terms)
            for term in list(unique_terms)[:20]:  # cap per section
                session.run("""
                    MERGE (t:Term {text: $text})
                    WITH t
                    MATCH (ct:ClauseType {type_id: $type_id})
                    MERGE (ct)-[:MENTIONS_TERM]->(t)
                """, text=term, type_id=ct_id)



def ingest_all_markdown(driver: Driver, data_dir: Path, banned_phrases: list[dict]):
    """Ingest all markdown files, SOWs then guides."""
    console.rule("[bold]Markdown Document Ingestion")

    sow_dir   = data_dir / "sow-md"
    guide_dir = data_dir / "SOW Guides MD"

    sow_count   = 0
    guide_count = 0

    if sow_dir.exists():
        for md in sorted(sow_dir.glob("*.md")):
            ingest_sow_document(driver, md, banned_phrases)
            sow_count += 1

    if guide_dir.exists():
        for md in sorted(guide_dir.glob("*.md")):
            ingest_guide_document(driver, md)
            guide_count += 1

    for md in sorted(data_dir.glob("*.md")):
        content = md.read_text(errors="replace")
        sow_signals = sum(1 for kw in [
            "statement of work", "in scope", "out of scope",
            "acceptance criteria", "customer responsibilities",
            "deliverable", "prepared for", "prepared by",
        ] if kw in content.lower())
        if sow_signals >= 3:
            ingest_sow_document(driver, md, banned_phrases)
            sow_count += 1
        else:
            ingest_guide_document(driver, md)
            guide_count += 1

    console.print(f"\n[bold green] {sow_count} SOW documents, {guide_count} guide documents ingested[/]")
