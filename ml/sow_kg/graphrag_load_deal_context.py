def _load_deal_context(driver: Driver, sow_id: str) -> DealContext:
    with driver.session() as session:
        row = session.run(
            """
            MATCH (s:SOW {id: $sow_id})
            OPTIONAL MATCH (s)-[:HAS_CONTEXT]->(dc:DealContext)
            OPTIONAL MATCH (s)-[:USES_METHODOLOGY]->(m:Methodology)
            RETURN
                coalesce(dc.total_revenue, s.deal_value)  AS deal_value,
                coalesce(dc.industry, s.industry)         AS industry,
                coalesce(dc.deal_terms, null)             AS deal_terms,
                coalesce(dc.outcome, s.outcome)           AS outcome,
                dc.project_id                             AS project_id,
                m.name                                    AS methodology
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
