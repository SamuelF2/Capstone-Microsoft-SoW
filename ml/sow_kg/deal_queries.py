from __future__ import annotations

from neo4j import Driver


def get_deal_context(driver: Driver, project_id: str) -> dict | None:
    with driver.session() as session:
        row = session.run(
            """
            MATCH (dc:DealContext {project_id: $pid})
            OPTIONAL MATCH (dc)-[:FOR_CUSTOMER]->(c:Customer)-[:IN_INDUSTRY]->(i:Industry)
            OPTIONAL MATCH (dc)-[:HAD_ROLE]->(r:StaffingRole)
            RETURN dc,
                   c.name     AS customer_name,
                   i.name     AS industry,
                   collect(DISTINCT r.name) AS roles
            """,
            pid=project_id,
        ).single()
    if not row:
        return None
    return {**dict(row["dc"]), "roles": row["roles"]}


def get_similar_deals(
    driver: Driver,
    project_id: str,
    limit: int = 5,
) -> list[dict]:
    with driver.session() as session:
        return session.run(
            """
            MATCH (dc:DealContext {project_id: $pid})-[:FOR_CUSTOMER]->(c:Customer)-[:IN_INDUSTRY]->(i:Industry)
            MATCH (i)<-[:IN_INDUSTRY]-(c2:Customer)<-[:FOR_CUSTOMER]-(dc2:DealContext)
            WHERE dc2.project_id <> $pid
            WITH dc2, dc,
                 abs(dc2.total_revenue - dc.total_revenue) AS revenue_delta,
                 CASE WHEN dc2.deal_terms = dc.deal_terms THEN 1 ELSE 0 END AS terms_match
            ORDER BY terms_match DESC, revenue_delta ASC
            LIMIT $limit
            RETURN dc2.project_id      AS project_id,
                   dc2.project_name    AS project_name,
                   dc2.industry        AS industry,
                   dc2.deal_terms      AS deal_terms,
                   dc2.total_revenue   AS total_revenue,
                   dc2.margin_pct      AS margin_pct,
                   dc2.outcome         AS outcome,
                   dc2.customer_satisfaction AS satisfaction,
                   dc2.staffing_roles  AS roles
            """,
            pid=project_id,
            limit=limit,
        ).data()


def get_deals_summary(driver: Driver) -> dict:
    with driver.session() as session:
        stats = session.run(
            """
            MATCH (dc:DealContext)
            RETURN
                count(dc)                         AS total_deals,
                avg(dc.total_revenue)             AS avg_revenue,
                sum(dc.total_revenue)             AS total_revenue,
                avg(dc.margin_pct)                AS avg_margin,
                avg(dc.customer_satisfaction)     AS avg_satisfaction,
                collect(DISTINCT dc.outcome)      AS outcomes,
                collect(DISTINCT dc.industry)     AS industries,
                collect(DISTINCT dc.deal_terms)   AS deal_terms
            """
        ).single()

        by_outcome = session.run(
            """
            MATCH (dc:DealContext)
            RETURN dc.outcome AS outcome, count(dc) AS count,
                   avg(dc.total_revenue) AS avg_revenue,
                   avg(dc.margin_pct) AS avg_margin,
                   avg(dc.customer_satisfaction) AS avg_satisfaction
            ORDER BY count DESC
            """
        ).data()

        by_industry = session.run(
            """
            MATCH (dc:DealContext)
            RETURN dc.industry AS industry, count(dc) AS count,
                   avg(dc.total_revenue) AS avg_revenue,
                   avg(dc.margin_pct) AS avg_margin
            ORDER BY count DESC
            """
        ).data()

        risk_patterns = session.run(
            """
            MATCH (dc:DealContext)
            WHERE dc.outcome IN ['at_risk', 'amended']
            MATCH (dc)<-[:HAS_CONTEXT]-(s:SOW)-[:HAS_SECTION]->(sec:Section)
                  -[:CONTAINS_BANNED_PHRASE]->(b:BannedPhrase)
            RETURN b.phrase AS phrase, count(*) AS occurrences
            ORDER BY occurrences DESC
            LIMIT 10
            """
        ).data()

    return {
        "totals": dict(stats),
        "by_outcome": by_outcome,
        "by_industry": by_industry,
        "risk_patterns": risk_patterns,
    }


def get_compliance_patterns(driver: Driver, industry: str | None = None) -> list[dict]:
    industry_filter = "AND dc.industry = $industry" if industry else ""
    with driver.session() as session:
        return session.run(
            f"""
            MATCH (dc:DealContext)<-[:HAS_CONTEXT]-(s:SOW)
            WHERE 1=1 {industry_filter}
            MATCH (ct:ClauseType)-[:VALIDATED_BY]->(r:Rule {{category: 'required-section'}})
            WHERE NOT EXISTS {{
                MATCH (s)-[:HAS_SECTION]->(sec)-[:INSTANCE_OF]->(ct)
            }}
            RETURN ct.display_name AS missing_section,
                   dc.outcome      AS outcome,
                   dc.industry     AS industry,
                   count(*)        AS frequency
            ORDER BY frequency DESC
            LIMIT 20
            """,
            industry=industry,
        ).data()


def get_deal_risk_profile(driver: Driver, project_id: str) -> dict:
    with driver.session() as session:
        banned = session.run(
            """
            MATCH (dc:DealContext {project_id: $pid})<-[:HAS_CONTEXT]-(s:SOW)
            MATCH (s)-[:HAS_SECTION]->(sec:Section)-[:CONTAINS_BANNED_PHRASE]->(b:BannedPhrase)
            RETURN b.phrase AS phrase, b.severity AS severity, sec.heading AS section
            ORDER BY b.severity
            """,
            pid=project_id,
        ).data()

        missing = session.run(
            """
            MATCH (dc:DealContext {project_id: $pid})<-[:HAS_CONTEXT]-(s:SOW)
            MATCH (ct:ClauseType)-[:VALIDATED_BY]->(r:Rule {category: 'required-section'})
            WHERE NOT EXISTS {
                MATCH (s)-[:HAS_SECTION]->(sec)-[:INSTANCE_OF]->(ct)
            }
            RETURN ct.display_name AS missing_section, r.description AS rule
            """,
            pid=project_id,
        ).data()

        statuses = session.run(
            """
            MATCH (dc:DealContext {project_id: $pid})-[:HAS_STATUS]->(ss:StatusSnapshot)
            RETURN ss.period_ending AS period, ss.scope_status AS scope,
                   ss.financial_status AS financial, ss.timeline_status AS timeline,
                   ss.risks AS risks
            ORDER BY ss.period_ending
            """,
            pid=project_id,
        ).data()

    return {
        "banned_phrases": banned,
        "missing_sections": missing,
        "status_history": statuses,
        "risk_score": _compute_risk_score(banned, missing, statuses),
    }


def _compute_risk_score(
    banned: list[dict],
    missing: list[dict],
    statuses: list[dict],
) -> float:
    score = 0.0
    score += min(len(banned) * 0.05, 0.30)
    score += min(len(missing) * 0.08, 0.40)

    if statuses:
        last = statuses[-1]
        if last.get("financial") == "Red":
            score += 0.20
        elif last.get("financial") == "Yellow":
            score += 0.10
        if last.get("timeline") == "Red":
            score += 0.15
        elif last.get("timeline") == "Yellow":
            score += 0.07

    return round(min(score, 1.0), 3)


def link_sow_to_deal_context(driver: Driver, sow_id: str, project_id: str):
    with driver.session() as session:
        session.run(
            """
            MATCH (s:SOW {id: $sow_id})
            MATCH (dc:DealContext {project_id: $pid})
            MERGE (s)-[:HAS_CONTEXT]->(dc)
            SET s.project_id = $pid,
                s.deal_value = dc.total_revenue,
                s.industry   = dc.industry,
                s.outcome    = dc.outcome
            """,
            sow_id=sow_id,
            pid=project_id,
        )
