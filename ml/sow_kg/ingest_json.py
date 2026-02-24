"""
Ingest structured JSON rule files into the SOW Knowledge Graph.

Sources:
  - banned-phrases.json        BannedPhrase nodes + Rule nodes
  - esap-workflow.json         EsapLevel, ApprovalStage, Persona nodes + edges
  - review-checklists.json     Persona, ChecklistItem nodes + edges
  - methodology-alignment.json Methodology, Term, Requirement nodes + edges
  - required-elements.json     Rule nodes (required section/deliverable rules)
"""

import json
import hashlib
from pathlib import Path
from neo4j import Driver
from rich.console import Console

console = Console()


def _load(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def _rule_id(prefix: str, *parts: str) -> str:
    """
    Safe, stable rule ID. Hashes variable-length parts so long strings and
    special characters never break the uniqueness constraint.
    """
    body = "_".join(str(p) for p in parts)
    digest = hashlib.md5(body.encode()).hexdigest()[:10]
    return f"{prefix}_{digest}"



def ingest_banned_phrases(driver: Driver, path: Path):
    data = _load(path)
    console.print("[bold cyan]Ingesting banned phrases[/]")

    with driver.session() as session:
        for bp in data.get("bannedPhrases", []):
            rule_id = _rule_id("bp", bp["phrase"])
            session.run("""
                MERGE (b:BannedPhrase {phrase: $phrase})
                SET b.severity   = $severity,
                    b.reason     = $reason,
                    b.suggestion = $suggestion,
                    b.category   = $category,
                    b.source     = 'banned-phrases.json'

                MERGE (r:Rule {rule_id: $rule_id})
                SET r.description = $reason,
                    r.severity    = $severity,
                    r.category    = $category,
                    r.is_regex    = false,
                    r.source      = 'banned-phrases.json'

                MERGE (b)-[:DEFINED_BY]->(r)
            """,
                phrase=bp["phrase"],
                severity=bp["severity"],
                reason=bp["reason"],
                suggestion=bp.get("suggestion", ""),
                category=bp.get("category", ""),
                rule_id=rule_id,
            )

        for i, pat in enumerate(data.get("additionalPatterns", [])):
            rule_id = _rule_id("bp_pattern", str(i), pat["pattern"])
            session.run("""
                MERGE (r:Rule {rule_id: $rule_id})
                SET r.pattern     = $pattern,
                    r.description = $description,
                    r.severity    = $severity,
                    r.category    = $category,
                    r.is_regex    = true,
                    r.source      = 'banned-phrases.json'
            """,
                rule_id=rule_id,
                pattern=pat["pattern"],
                description=pat.get("description", ""),
                severity=pat["severity"],
                category=pat.get("category", ""),
            )

    console.print(
        f"  [green][/] {len(data.get('bannedPhrases', []))} banned phrases + "
        f"{len(data.get('additionalPatterns', []))} regex patterns"
    )


def ingest_esap_workflow(driver: Driver, path: Path):
    data = _load(path)
    console.print("[bold cyan]Ingesting ESAP workflow[/]")

    with driver.session() as session:
        # EsapLevel nodes
        for level_id, level in data["esapLevels"].items():
            session.run("""
                MERGE (e:EsapLevel {level_id: $level_id})
                SET e.name   = $name,
                    e.source = 'esap-workflow.json'
            """, level_id=level_id, name=level["name"])

            for trigger in level["triggers"]:
                rule_id = _rule_id("esap_trigger", level_id, trigger["condition"])
                session.run("""
                    MATCH (e:EsapLevel {level_id: $level_id})
                    MERGE (r:Rule {rule_id: $rule_id})
                    SET r.condition   = $condition,
                        r.description = $description,
                        r.category    = 'esap-trigger',
                        r.is_regex    = false,
                        r.source      = 'esap-workflow.json'
                    MERGE (r)-[:TRIGGERS]->(e)
                """,
                    level_id=level_id,
                    rule_id=rule_id,
                    condition=trigger["condition"],
                    description=trigger["description"],
                )

            for approver in level["requiredApprovers"]:
                session.run("""
                    MATCH (e:EsapLevel {level_id: $level_id})
                    MERGE (p:Persona {role: $role})
                    ON CREATE SET p.source = 'esap-workflow.json'
                    MERGE (e)-[:REQUIRES_APPROVER {stage: $stage, required: $required, reason: $reason}]->(p)
                """,
                    level_id=level_id,
                    role=approver["role"],
                    stage=approver["stage"],
                    required=approver["required"],
                    reason=approver["reason"],
                )

            for check in level.get("additionalChecks", []):
                rule_id = _rule_id("esap_check", level_id, check)
                session.run("""
                    MATCH (e:EsapLevel {level_id: $level_id})
                    MERGE (r:Rule {rule_id: $rule_id})
                    SET r.description = $check,
                        r.category    = 'additional-check',
                        r.is_regex    = false,
                        r.source      = 'esap-workflow.json'
                    MERGE (e)-[:HAS_ADDITIONAL_CHECK]->(r)
                """, level_id=level_id, rule_id=rule_id, check=check)

        # ApprovalStage nodes
        stage_order = list(data["workflowStages"].keys())
        for stage_id, stage in data["workflowStages"].items():
            session.run("""
                MERGE (s:ApprovalStage {stage_id: $stage_id})
                SET s.name        = $name,
                    s.description = $description,
                    s.source      = 'esap-workflow.json'
            """, stage_id=stage_id, name=stage["name"], description=stage["description"])

            for criterion in stage.get("exitCriteria", []):
                rule_id = _rule_id("exit", stage_id, criterion)
                session.run("""
                    MATCH (s:ApprovalStage {stage_id: $stage_id})
                    MERGE (r:Rule {rule_id: $rule_id})
                    SET r.description = $criterion,
                        r.category    = 'exit-criterion',
                        r.is_regex    = false,
                        r.source      = 'esap-workflow.json'
                    MERGE (s)-[:HAS_EXIT_CRITERION]->(r)
                """, stage_id=stage_id, rule_id=rule_id, criterion=criterion)

            for gate in stage.get("gatingRules", []):
                rule_id = _rule_id("gate", stage_id, gate["rule"])
                session.run("""
                    MATCH (s:ApprovalStage {stage_id: $stage_id})
                    MERGE (r:Rule {rule_id: $rule_id})
                    SET r.description = $rule,
                        r.is_blocker  = $blocker,
                        r.condition   = $condition,
                        r.category    = 'gating-rule',
                        r.is_regex    = false,
                        r.source      = 'esap-workflow.json'
                    MERGE (s)-[:GATED_BY]->(r)
                """,
                    stage_id=stage_id,
                    rule_id=rule_id,
                    rule=gate["rule"],
                    blocker=gate.get("blocker", False),
                    condition=gate.get("condition", ""),
                )

        # PRECEDES chain (draft -> internal review -> drm approval)
        terminal = {"approved", "finalized", "rejected"}
        non_terminal = [s for s in stage_order if s not in terminal]
        for i in range(len(non_terminal) - 1):
            session.run("""
                MATCH (a:ApprovalStage {stage_id: $from_id})
                MATCH (b:ApprovalStage {stage_id: $to_id})
                MERGE (a)-[:PRECEDES]->(b)
            """, from_id=non_terminal[i], to_id=non_terminal[i + 1])

    console.print(
        f"  [green][/] {len(data['esapLevels'])} ESAP levels, "
        f"{len(data['workflowStages'])} approval stages"
    )


# ---------------------------------------------------------------------------
# review-checklists.json
# ---------------------------------------------------------------------------

def ingest_review_checklists(driver: Driver, path: Path):
    data = _load(path)
    console.print("[bold cyan]Ingesting review checklists[/]")
    total_items = 0

    with driver.session() as session:
        for role, persona_data in data["personas"].items():
            session.run("""
                MERGE (p:Persona {role: $role})
                SET p.display_name  = $display_name,
                    p.review_stage  = $review_stage,
                    p.focus_areas   = $focus_areas,
                    p.source        = 'review-checklists.json'
            """,
                role=role,
                display_name=persona_data["displayName"],
                review_stage=persona_data["reviewStage"],
                focus_areas=persona_data.get("focusAreas", []),
            )

            if persona_data["reviewStage"] not in ("none", ""):
                session.run("""
                    MATCH (p:Persona {role: $role})
                    MATCH (s:ApprovalStage {stage_id: $stage_id})
                    MERGE (p)-[:REVIEWS_AT]->(s)
                """, role=role, stage_id=persona_data["reviewStage"])

            for item in persona_data.get("checklist", []):
                session.run("""
                    MERGE (c:ChecklistItem {item_id: $item_id})
                    SET c.text      = $text,
                        c.required  = $required,
                        c.category  = $category,
                        c.help_text = $help_text,
                        c.source    = 'review-checklists.json'
                    WITH c
                    MATCH (p:Persona {role: $role})
                    MERGE (p)-[:HAS_CHECKLIST_ITEM]->(c)
                """,
                    item_id=item["id"],
                    text=item["text"],
                    required=item["required"],
                    category=item.get("category", ""),
                    help_text=item.get("helpText", ""),
                    role=role,
                )
                total_items += 1

    console.print(f"  [green][/] {len(data['personas'])} personas, {total_items} checklist items")



def ingest_methodology_alignment(driver: Driver, path: Path):
    data = _load(path)
    console.print("[bold cyan]Ingesting methodology alignment[/]")

    with driver.session() as session:
        for method_id, method in data["methodologies"].items():
            # MERGE on the constrained key (method_id), not name
            session.run("""
                MERGE (m:Methodology {method_id: $method_id})
                SET m.name                = $name,
                    m.min_approach_length = $min_length,
                    m.source              = 'methodology-alignment.json'
            """,
                method_id=method_id,
                name=method["name"],
                min_length=method["approachRequirements"].get("minLength", 0),
            )

            for kw in method.get("requiredKeywords", []):
                session.run("""
                    MATCH (m:Methodology {method_id: $method_id})
                    MERGE (t:Term {text: $text})
                    ON CREATE SET t.is_milestone = false
                    MERGE (m)-[:REQUIRES_KEYWORD]->(t)
                """, method_id=method_id, text=kw)

            for phrase in method["approachRequirements"].get("mustInclude", []):
                rule_id = _rule_id("method_must", method_id, phrase)
                session.run("""
                    MATCH (m:Methodology {method_id: $method_id})
                    MERGE (r:Rule {rule_id: $rule_id})
                    SET r.description = $phrase,
                        r.category    = 'must-include',
                        r.is_regex    = false,
                        r.source      = 'methodology-alignment.json'
                    MERGE (m)-[:REQUIRES_CONTENT]->(r)
                """, method_id=method_id, rule_id=rule_id, phrase=phrase)

            for resp in method.get("customerResponsibilities", []):
                session.run("""
                    MATCH (m:Methodology {method_id: $method_id})
                    MERGE (req:Requirement {text: $text})
                    ON CREATE SET req.source = 'methodology-alignment.json'
                    MERGE (m)-[:REQUIRES_CUSTOMER_RESPONSIBILITY]->(req)
                """, method_id=method_id, text=resp)

            for warning in method.get("warnings", []):
                rule_id = _rule_id("method_warn", method_id, warning["condition"])
                session.run("""
                    MATCH (m:Methodology {method_id: $method_id})
                    MERGE (r:Rule {rule_id: $rule_id})
                    SET r.condition   = $condition,
                        r.description = $message,
                        r.severity    = $severity,
                        r.category    = 'methodology-warning',
                        r.is_regex    = false,
                        r.source      = 'methodology-alignment.json'
                    MERGE (m)-[:HAS_WARNING]->(r)
                """,
                    method_id=method_id,
                    rule_id=rule_id,
                    condition=warning["condition"],
                    message=warning["message"],
                    severity=warning["severity"],
                )

            for milestone in method["deliverableFormat"].get("preferredMilestones", []):
                session.run("""
                    MATCH (m:Methodology {method_id: $method_id})
                    MERGE (t:Term {text: $text})
                    SET t.is_milestone = true
                    MERGE (m)-[:PREFERS_MILESTONE]->(t)
                """, method_id=method_id, text=milestone)

    console.print(f"  [green][/] {len(data['methodologies'])} methodologies")


def ingest_required_elements(driver: Driver, path: Path):
    data = _load(path)
    console.print("[bold cyan]Ingesting required elements[/]")

    with driver.session() as session:
        for section in data["requiredSections"]:
            type_id = section["section"]
            rule_id = _rule_id("req_section", type_id)
            session.run("""
                MERGE (ct:ClauseType {type_id: $type_id})
                SET ct.display_name = $display_name,
                    ct.description  = $description,
                    ct.source       = 'required-elements.json'

                MERGE (r:Rule {rule_id: $rule_id})
                SET r.description = $error_message,
                    r.required    = $required,
                    r.min_length  = $min_length,
                    r.min_items   = $min_items,
                    r.allows_na   = $allows_na,
                    r.category    = 'required-section',
                    r.is_regex    = false,
                    r.source      = 'required-elements.json'

                MERGE (ct)-[:VALIDATED_BY]->(r)
            """,
                type_id=type_id,
                rule_id=rule_id,
                display_name=section["displayName"],
                description=section["description"],
                error_message=section.get("errorMessage", ""),
                required=section.get("required", True),
                min_length=section.get("minLength", 0),
                min_items=section.get("minItems", 0),
                allows_na=section.get("allowNA", False),
            )

            for elem in section.get("requiredElements", []):
                elem_rule_id = _rule_id("req_elem", type_id, elem)
                session.run("""
                    MATCH (ct:ClauseType {type_id: $type_id})
                    MERGE (r:Rule {rule_id: $rule_id})
                    SET r.description = $elem,
                        r.category    = 'required-element',
                        r.is_regex    = false,
                        r.source      = 'required-elements.json'
                    MERGE (ct)-[:REQUIRES_ELEMENT]->(r)
                """, type_id=type_id, rule_id=elem_rule_id, elem=elem)

        ac = data["deliverableRequirements"]["acceptanceCriteria"]
        session.run("""
            MERGE (r:Rule {rule_id: 'deliverable_acceptance_criteria'})
            SET r.description   = $error_message,
                r.required      = $required,
                r.min_length    = $min_length,
                r.category      = 'acceptance-criteria',
                r.is_regex      = false,
                r.source        = 'required-elements.json',
                r.good_examples = $good_examples,
                r.bad_examples  = $bad_examples
        """,
            error_message=ac["errorMessage"],
            required=ac["required"],
            min_length=ac["minLength"],
            good_examples=ac.get("goodExamples", []),
            bad_examples=ac.get("badExamples", []),
        )

        for term in ac.get("forbiddenVagueTerms", []):
            session.run("""
                MERGE (b:BannedPhrase {phrase: $phrase})
                SET b.category = 'vague-acceptance-criteria',
                    b.severity = 'error'
                WITH b
                MATCH (r:Rule {rule_id: 'deliverable_acceptance_criteria'})
                MERGE (r)-[:FORBIDS]->(b)
            """, phrase=term)

        risk_req = data["riskRequirements"]
        session.run("""
            MERGE (r:Rule {rule_id: 'risk_severity_required'})
            SET r.description    = $error_message,
                r.allowed_values = $allowed_values,
                r.category       = 'risk-validation',
                r.is_regex       = false,
                r.source         = 'required-elements.json'
        """,
            error_message=risk_req["severity"]["errorMessage"],
            allowed_values=risk_req["severity"]["allowedValues"],
        )

    console.print(
        f"  [green][/] {len(data['requiredSections'])} required sections, "
        f"{len(ac.get('forbiddenVagueTerms', []))} forbidden acceptance terms"
    )



def ingest_all_json(driver: Driver, data_dir: Path):
    """Run all JSON ingestion in dependency order."""
    console.rule("[bold]JSON Rules Ingestion")

    rules_dir = data_dir / "rules"

    file_map = {
        "banned-phrases.json":        ingest_banned_phrases,
        "required-elements.json":     ingest_required_elements,
        "methodology-alignment.json": ingest_methodology_alignment,
        "esap-workflow.json":         ingest_esap_workflow,
        "review-checklists.json":     ingest_review_checklists,
    }

    all_json = {p.name: p for p in rules_dir.rglob("*.json")}
    for p in data_dir.glob("*.json"):
        all_json.setdefault(p.name, p)

    for filename, fn in file_map.items():
        candidate = all_json.get(filename)
        if not candidate:
            console.print(f"  [yellow][/] {filename} not found, skipping")
            continue
        fn(driver, candidate)

    console.print("\n[bold green] All JSON rules ingested[/]")
