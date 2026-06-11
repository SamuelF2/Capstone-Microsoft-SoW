# Project History-based Risk Mitigation Recommendations
**Status: INCOMPLETE** | Feature Branch: `feature/risk-mitigation-enhancement`

## 1. Objectives
Implement a more robust alternative for identifying similar historical projects and then generate risk mitigations based on the risks, mitigations, and project impacts encountered on these similar projects.

## 2. Enhancement Scope Summary
* Enhance KG ingestion pipeline to create: a new `AggregateContext` property, a new `AggregateContextEmbedding` property on the Project node, and create a new Neo4j vector index on the `Project.AggregateContextEmbedding`.
* Add a new, alternative project similarity search approach in AI Recommendation Pipeline that: Creates `AggregateContext` and then `AggregateContextEmbedding` for the new/draft SOW. Performs a nearest neighbor search against the `Project.AggregateContextEmbedding` Vector index in the KG.
* Enhance navigation of risk & outcome related nodes of similar historical projects to gather content for LLM to make risk mitigation recommendations.
* Enhance risk mitigation recommendations prompt for LLM to provide detailed historical risk/mitigation analysis instructions. ([See Appendix A: LLM Prompt Template](#appendix-a-llm-prompt-template))

## 3. System Requirements
* **Graph Connectivity:** The ingestion pipeline must reliably establish `[:HAS_SOW]` relationships between SOW documents and Project nodes to prevent orphaned nodes and enable deep traversal.
* **Stable Enrichment:** The enrichment query must aggregate context using a stable, guaranteed schema (Core Project fields + SOW Content) to avoid database warnings regarding missing dynamic labels.
* **Query-Time Retrieval (Late Binding):** Historical analysis must be fetched dynamically at runtime via graph traversal rather than pre-aggregating volatile data into the Project node, ensuring the LLM receives the most current data.
* **Fault Tolerance:** The application UI and LLM orchestrator must degrade gracefully (no tracebacks/crashes) when schema data is missing, properties are `null`, or graph traversals yield zero similar projects.

## 4. Design & Architecture Changes

### 4.1 Graph Enrichment & Embeddings (`enrich.py`)
Optimized the vector embedding pipeline for GraphRAG similarity queries.
* Registered `project_aggregate_embeddings` in the `VECTOR_INDEXES` list.
* Restructured the `AggregateContext` query to utilize a "Stable Schema" approach. The script now safely aggregates `project_name`, `deal_type`, `total_revenue`, and linked SOW content into the `AggregateContextEmbedding`.
* Removed speculative `OPTIONAL MATCH` calls for missing node types (e.g., `StaffingPlan`) to eliminate Neo4j DBMS `01N50/01N51` unrecognized label/relationship warnings.

### 4.2 Query-Time Context Retrieval (`sow_kg/graphrag.py`)
Replaced the deprecated `graph_rag.py` with an updated, feature-rich version handling deep traversals.
* Engineered `_vector_search_project_risks()` to perform KNN vector similarity searches against the new `project_aggregate_embeddings` index.
* Implemented a highly nested Cypher traversal to fetch and array-aggregate chronological `StatusReport` data and sum-aggregate `BudgetEntry` actuals vs. planned limits.
* Added direct property extraction from the Project node for `actual_end_date`, `project_outcomes`, `customer_satisfaction`, and `lessons_learned`.
* Updated `to_prompt_context()` to dynamically construct and inject the `[HISTORICAL PROJECT RISKS & CLOSE-OUT DATA]` serialization block into the LLM context string.

### 4.3 System Stability & Defensive Programming (`main_new.py` & `assist.py`)
Addressed numerous P0 crash blockers to ensure a robust command-line experience.
* **P0 Fix:** Replaced unsafe object attribute access (`draft_data.project_name`) with defensive dictionary `.get()` methods when generating the query embedding.
* **P0 Fix:** Resolved `UnboundLocalError` by establishing a safe default string for the `answer` variable in the LLM execution pipeline.
* **P1 Fix:** Mitigated `AttributeError: 'NoneType' object has no attribute 'upper'` within the CLI rendering logic by applying inline coalescing (`(r.get("severity") or "").upper()`).
* **Refactor:** Safely handled the migration of the `methodology` property into the nested `DealContext` dataclass wrapper.

### 4.4 LLM Prompt Engineering & Routing (`llm_gen.py`)
Connected the new historical context directly to the LLM generation layer.
* Implemented conditional context fetching: `main_new.py` triggers the deep historical traversal exclusively when the query exhibits risk-related intent (e.g., "Generate a risk mitigation plan").
* Aligned the system prompt generation to instruct the LLM to adopt the persona of a "Senior Project Risk Manager".
* Enforced strict output formatting, commanding the LLM to yield a Rationale, Execution Strategy, and Contingency for every proposed mitigation based exclusively on the retrieved historical project data.

## 5. Gaps / Tasks To Be Completed
* **Ingestion / Mapping:** SOW and Project nodes are not automatically linked during the ingestion process when filenames like `sow_5c6d1729` fail Regex matching (`PROJ-\d{4}`). This forces developers to manually link nodes in Neo4j via Cypher to prevent orphaned SOWs. A centralized mapping logic or configuration file (e.g., CSV) is required to establish robust, automated production ingestion.
* **Schema Standardization:** Standardize nomenclature for `StaffingPlan` and `Budget` nodes across the database to allow their future inclusion in the primary `enrich.py` pre-aggregation without throwing Neo4j DBMS warnings.
* **Template Parity:** While Budget Actuals and Status Reports were successfully joined to the query, "Staffing Actuals by Period" requires further schema validation. Adding full staffing actual arrays requires an additional nested aggregation in the Cypher traversal to achieve 100% parity with the prompt template.

## 6. Testing & Validation Strategy
To ensure the enhancements operate seamlessly across the GraphRAG pipeline, validation should be performed across the three primary application layers: Data Enrichment, Context Retrieval, and LLM Generation. 

### 6.1 Enrichment & Vector Index Validation
**Objective:** Verify that the `AggregateContext` is successfully compiling and that the Neo4j vector index is actively accepting the embeddings without schema warnings.
* **Execution:** Run the enrichment pipeline via the CLI:
  `uv run python main_new.py enrich --force`
* **Success Criteria:** 1. The console output confirms `project_aggregate_embeddings` is initialized and ready for semantic search.
  2. The process completes without triggering Neo4j DBMS warnings (`01N50` / `01N51`) regarding missing `StaffingPlan` or `HAS_CONTEXT` labels.

### 6.2 Context Retrieval & Serialization Test (`--context-only`)
**Objective:** Validate the deep graph traversal (`graphrag.py`) and the system stability fixes (`main_new.py`) without incurring LLM API costs.
* **Execution:** Run a mock assist command utilizing the CLI's isolation flag:
  `uv run python main_new.py assist "Generate a risk mitigation plan" --sow-id PROJ-0001 --context-only`
* **Success Criteria:**
  1. **No Tracebacks:** The script executes fully without throwing `UnboundLocalError` or `AttributeError`.
  2. **Data Integrity:** The console output displays the raw context block. Locate the `[HISTORICAL PROJECT RISKS & CLOSE-OUT DATA]` section and ensure variables like `Close-out`, `CSAT`, `Actuals`, and `Status Timeline` are populated correctly rather than displaying array memory references or "None".

### 6.3 Graceful Degradation (Null Handling) Test
**Objective:** Ensure the application UI handles missing graph data safely (specifically null severities).
* **Execution:** Run the assist command against a project known to have incomplete rule severity data, or execute a broad query:
  `uv run python main_new.py assist "What are the rules?" --sow-id PROJ-0001 --context-only`
* **Success Criteria:** The CLI renders the "Applicable Rules" and "Risks" Rich terminal tables cleanly. Blank or `null` severities in the database render as empty spaces in the table rather than crashing the application with a `NoneType object has no attribute 'upper'` error.

### 6.4 End-to-End LLM Generation & Persona Routing
**Objective:** Verify that the LLM generation layer (`llm_gen.py`) correctly identifies the risk intent, receives the historical context, and adheres to the strict persona prompt instructions.
* **Execution:** Run a live completion request:
  `uv run python main_new.py assist "Analyze this project's risks and provide a mitigation plan." --sow-id PROJ-0001`
* **Success Criteria:**
  1. **Routing:** The console metadata confirms `similar_projects_found` is > 0.
  2. **Formatting:** The LLM's response strictly adheres to the "Senior Project Risk Manager" persona. 
  3. **Output Structure:** The generated mitigations explicitly include the three mandated sub-sections: *Rationale*, *Execution Strategy*, and *Contingency*, actively referencing the historical project data pulled from the graph.

---

## Appendix A: LLM Prompt Template

```text
# ROLE OVERVIEW
Your role is to perform QA reviews of draft project proposals for proposed consulting projects. Your goal is to identify risks and propose risk mitigation-focused edits to the draft project proposal based on analysis of risks, issues, and outcomes encountered on similar historical consulting projects. You may also leverage your general knowledge of technology consulting project implementation and risk management to make recommendations.

# INPUTS
Draft Project Proposal
Draft SOW
Draft Project Overview (@Phuong, aka, “Deal Overview” file, “Project” node)
Draft Staffing plan
Draft Budget
@Phuong – even though the Cocoon app does not capture c & d yet, let’s generate these and ingest in your experiment notebook.

Similar Historical Projects
Original SOW
Project Overview
Project Close Out Report
Status Reports by Period
Staffing Actuals by Period
Budget Actuals by Period

# OUTPUTS
A list of Key Risks requiring mitigation for the Draft Project Proposal For each Key Risk, list:
Risk Title (short)
Risk Description
Risk Source, either
the [Project#] + [Name], or
“General Knowledge” meaning your general knowledge of technology consulting project implementations based on your training.

A list of Key Risk Mitigation recommendations for the Draft Project Proposal
For each Key Risk Mitigation Actions, list:
Risk Title (short)
Risk Mitigation Title (short)
Note: you may recommend multiple Risk Mitigations for the same Risk 
Document Change Targets, including: 
“SOW”

# INPUT:  SIMILAR HISTORICAL PROJECTS
## [PROJECT #]-[PROJECT NAME]   @Phuong – iterate entire section for each similar project

### ORIGINAL SOW
[inject draft sow content here – pull from Neo4J SOW node]

### PROJECT OVERVIEW
[inject historical project overview content here – pull from Neo4J Project node. Properties include:  Deal Terms, Deal Type, Customer ID, Customer Name, Customer Location, Customer Industry, Deal Signature Date, Planned Start Date, Planned End Date

### PROJECT CLOSE OUT REPORT
[inject historical project Close Out content here – pull from Neo4J Project node. Properties include: Actual Start Date, Actual End Date, Project Outcomes, Lessons Learned, Customer Satisfaction]

### STATUS REPORTS BY PERIOD
[inject historical project status reports here.  Could be a table with rows by period ending date just like status report csv file, or could be flattened…your call.  But pull from Neo4J Status Report nodes.] 

### STAFFING ACTUALS BY PERIOD
[inject historical project staffing actuals here.  Could be a table with rows just like staffing actuals csv file, or could be flattened…your call.  but pull from multiple Neo4J nodes that were decomposed from the original staffing actuals csv file] 

### BUDGET ACTUALS BY PERIOD
[inject historical project budget actuals here.  Could be a table with rows just like csv file, or could be flattened…your call.  but pull and aggregate from multiple Neo4J nodes that were decomposed from the original budget actuals csv file]
