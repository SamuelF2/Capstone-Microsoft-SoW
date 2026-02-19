# SOW Drafting Guidance & Deal Review Standards

---

## Document Introduction

- SOW content guidance
- Key focus areas by project type
- Using lessons learned to mitigate risks
- Other SOW review items and resources

---

## Agenda

- SOW content guidance
- Key focus areas by project type
- Using lessons learned to mitigate risks
- Other SOW review items and resources

---

## SOW Content Guidance

### Fundamentals
### Solution
### Special Scenarios
### Compliance

---

### 1. SOW Content Fundamentals

|   | Scope Management: Ensure delivery scope is mutually accepted, defined, measurable, traceable, and agreed with the customer. Ensure level of complexity (user stories, requirements) has been reviewed with the customer and meets expectations and is clearly stated in the SOW/proposal. Ensure traceability between scope and final acceptance criteria. Ensure we have capacity and capability to deliver against the scope. |
|:-:|:-:|
|   | Schedule: Ensure proposed schedule is viable and Microsoft can deliver on proposed milestones in line with WBS, effort estimates, and staffing plan. |
|   | Customer Dependencies: Verify that customer dependencies/obligations/deliverables are reflected in SOW. Providing test data/conducting data migration and providing right SMEs are some examples. Ensure alignment between scope and business value outcomes. |
|   | Project management and governance processes: Ensure PM and governance processes are well-defined to measure, manage, and control delivery work including stakeholder engagement, sponsorship, steering. Highly recommended to have internal agreement and ICA (Internal Collaboration Agreement) where there is an internal dependency on other MSFT business units. This content is not in the SOW, but important to hold. |
|   | Consumption: Ensure proposed project plan, outcomes, milestones in SOW support the consumption plan. Estimate for consumption (ACR/MAU) and identify potential blockers. Note: Consumption info is not in the SOW by design. |

---

### 1. SOW Content Fundamentals (continued)

|   | Acceptance Criteria: Ensure key customer acceptance criteria (technical/functional) exist. Define deliverable acceptance process and invoice approval processes in SOW. Example for Acceptance Criteria: Allowable # of S1/S2 defects for go-live. |
|:-:|:-:|
|   | Transition to Support: Review operations and support plan for transitioning solution to operation. Clarify who is providing support (MSFT/GSI/customer). Ensure customer is onboard with support plan/approach and RACI. Clarify whether Customer has incident/problem/change management process/skills and infrastructure to transition to ops/support. |
|   | Methodology/SDM: Ensure compliance with predefined methodologies (SureStep, Agile, etc.). Align governance activities/deliverables with SDM outputs. Estimate should align with delivery methodology. |
|   | Resourcing: Review current resource mix and identify any critical/high demand resources impacting successful delivery. Make sure right level of GDC resource mix exists. SOW should specify key customer roles/resources and their responsibilities. Ensure resourcing aligns with Deal Estimation Standards. |
|   | Sold Margin: Manage SOW staffing and other variables to yield the target margin. If below target, challenge the team to adjust SOW content, staffing mix, pricing. If above target, negotiate with room but try to avoid reducing price. Ensure customer has sufficient budget for all packages and uses purchase orders. |

---

### 2. SOW Solution Scenario Specific

|   | Solution Quality Governance: Verify alignment between customer requirements and proposed solution, technical/functional assumptions. Plan and budget for technical governance: performance, scalability, architecture, extensibility. No commitment to SLAs from Microsoft. Ensure team budgets for Solution Quality Governance TQA during delivery. |
|:-:|:-:|
|   | Test Strategy & Test Coverage: Estimate effort/resources for unit/functional/E2E testing. Confirm reasonable Dev vs. Test effort ratio. Customer is responsible for test scripts, test environments, test data. Acceptance criteria for testing should be covered (e.g., zero S1/S2 defects for go live). |
|   | ADO: Customer agrees to use ADO; mutually accessible for product backlog, RAID log, burn rate, progress, test execution, defect resolution, delivery insights. If using Jira or other, ensure accessibility and team skill match. Factor in additional technical governance if not using standard ADO. |
|   | Agile Methodology: Validate customer maturity for agile, understanding of Capacity-based delivery. Define key business outcomes. Customer must fulfill dependencies and empower key roles (Product Owner, App/Business Owners). Document funding dependencies. |
|   | ISV: Ensure ISV is fit for purpose and vetted, with latest PG certification and roadmap. Scope, RACI for ISV/MSFT/customer must be defined. Plan B if ISV fails. Ensure understanding of architecture/integration with ISV. |

---

### 3. SOW Related Special Scenarios & Compliance

| SOW Level Special Scenarios |   |
|:-:|:-:|
|   | Unique Conditions & Requirements from Customer: Plan for and deliver to unique customer requirements (named resources, competitive restrictions, security vetting, staff vetting, language constraints, IP exclusivity). |
|   | Special Agreement: Well-scoped conditional agreements (e.g., app migration from on-prem to cloud within three years). Define risk/mitigation and contingency for ECIF, monetized risk, delays. Example: “Deal to support MACC target.” |
| SOW Level Compliance Scenarios |   |
|   | Adherence to Standards: Staffing mix must align with standards by area/workload; deviations impact margin. Apply QA Deal standards to all required deal components. |
|   | Responsible AI/GDPR/Regulation/Compliances: Team involves RAI champ to assess sensitive AI use cases. Document RAI rule, customer responsible for GDPR, comply with special conditions. |
|   | Microsoft ISD’s Business Rules & Policies: Follow business rules, policies, engage HRDD for compliance oversight if violations are observed. E.g., S2 indirect subcontracting, conflict of interest, cross-border travel limitation, tax. Global Deals must reflect rate splits in MoU setup. |

---

### 4. SOW Related Special Scenarios & Compliance

| SOW Level Special Scenarios |   |
|:-:|:-:|
|   | Data Migration and Management: If needed, specify source, data volume, migration mechanism, data growth plan, security, tasks/responsibilities, RACI, test runs, legal entities, highly sensitive data (PII), security requirements. Align SOW to Secure by Default. |
|   | Secure by Default: SOW must meet ISD business rules: Information Security Risk Assessment (ISRA) completed in Virtuoso, DCPS work package in effort estimate for Secure by Default activities. Exemptions outlined in guidance. |

---

## Key Focus Areas By Project Type

---

### Key Focus Areas: Agile Project Example

|   | Ensure customer Agile maturity, understands Capacity-based delivery. Use Customer Maturity Assessment on SDMplus. Include an Agile Coach if maturity is low. Define and agree key Business Outcomes. Engagement baseline planning in SOW should cover Definition Of Ready/Done. |
|:-:|:-:|
|   | Verify customer understands obligations for running agile project, defined in SOW: standups, backlog prioritization, approvals. Ensure empowered Product Owner, Scrum Master, Application/Business Owners. Consider Change Request/penalties for unmet dependencies. |
|   | Confirm customer and MSFT expectations for Agile/Scrum ceremonies: Sprint Planning, Stand Ups, Backlog refinement, Sprint closeout, retrospectives. Only prioritized scope delivered in sprints; feature backlog subject to current capacity. |
|   | Initial backlog existence, application discovery or requirements assessment. If no backlog, review estimate process. Consider Discovery phase for missing backlog. |
|   | Ensure team understands Non-Functional Requirements (security, reliability, performance, scalability, usability) and their impact. |

---

### Key Focus Areas: CTS Project Example

|   | Confirm Application Discovery/Complexity assessment. SOW scope should specify number/apps to re-host/ re-platform/re-architect and customers’ migration method understanding. Clarify customer acceptance criteria (beyond migration). Address business continuity, disaster recovery, multi-cloud failover, authentication/access. |
|:-:|:-:|
|   | Understand customer security controls and testing. Ensure Test Approach, responsibilities, load/performance/reliability/UAT/threat model defined. Customer must provide data, responsibilities defined. |
|   | If GSI is engaged, define clear RACI, accountability, ownership (GSI/Customer/MSFT). Document multi-cloud, third-party database, integration requirements and dependencies. Visibility over GSI landscape. |
|   | Confirm customer can commit to expected migration velocity and MSFT staffing supports velocity. Migration prep, cut-over planning, first migrations after prep. Define plan for change requests if customer can’t meet dependencies for velocity. Access/security clearance requirements. |
|   | Review payment terms (# migrated apps, outcome, etc.). Include appropriate phases (Discovery, Assessment, Planning, Migration) and staffing for onshore/offshore. Document deviations from standard strategies/assumptions. |

---

### Key Focus Areas: Bus Apps Project Example

|   | Review scope assumptions for fit/gaps, integrations, reports. Solution modeling outcome must be understood by customer. Change management process for requirement/assumption changes affecting design/dev. Test Cycle defined with customer obligations for test data/scripts/environments. |
|:-:|:-:|
|   | Defect resolution process defined (S1/S2 fixed by MSFT, S3/S4 via extra capacity or CR). Data migration strategy includes customer obligations for data access, cleansing, mapping. Integration workload defined, specifying all obligations, assumptions, accessibility. |
|   | Include security architecture/best practices for whole solution, not just MSFT stack. If customer-specific security/customization, involves PG. Solution performance/E2E testing must be budgeted; MSFT not liable for specific metrics/SLA. |
|   | Review feature/product dependencies (e.g., Non-GA features) and plans to address impact. Ensure Customer Capabilities for dependencies/obligations are in SOW. |
|   | If solution has ISV, ensure vetted, meets expectations, scope/RACI defined between MSFT/Customer/ISV. ISV must have latest PG certification/support for product releases. |

---

## Using Lessons Learned to Mitigate Risks

---

### Lessons Learned to Help Mitigate Common Project Risks

- __Immediately relevant__
  - SOW scenario guidance solution-based
  - Measure mitigation effectiveness/risk monetization
  - Feeds “Smart” Risk Engine learning from delivery

- __Adapts with Change__
  - Output from Chrysalis Triage
  - Integrated with Accreditation/Playbooks

- __Easy to find/consume__
  - Lessons Learned Home Page: [https://aka.ms/qall](https://aka.ms/qall)
  - Zero barrier to entry (no search boxes)

> “I need to know about CTS for a deal I’m working on”
> “I’m implementing review feedback, what’s the latest guidance on Agile projects”
> “GenAI is brand new; guidance needed for Solution and Estimation”

---

### SOW Checklist: Risk Areas

Consider the following risk areas and work with TQA to determine impacts/mitigations:

- Solution dependent on emerging/non-GA product
- Co-innovation including product engineering group
- Solution near end of support
- Performance requirements exceed product/platform limits
- Unique/unproven integrations
- Solution complexity/maturity
- High customization
- Special staffing/skills in limited supply
- [AI or Sensitive Use Cases](https://aka.ms/askisdrai)
- Transition and support strategy post-engagement
- Customer maturity/capabilities/ability to deliver
- Past delivery history with customer
- Customer dependencies (environment setup, security approvals, testing)
- Achievability of business outcomes
- Blockers to consumption and mitigation steps
- ISV solution dependencies (features, capability/performance)
- Vetted partners and delivery history
- Binding proposals/rates for unestablished partners
- Follow [Microsoft Policies](https://microsoft.sharepoint.com/sites/mspolicy)
- Follow [ISD’s Business Rules](https://businessrules.azurewebsites.net/CommonPage/Default)
- Watch for conflicts of interest or appearance thereof
- Vet subcontractors with vendor management
- Coordinate with HRDD if required
- Work with TQA and [ISD RAI Champ](https://aka.ms/askisdrai) for assessment

---

## Other SOW Review Items and Resources

### SOW Checklist: Review Areas

_Prepare for SOW Reviews_

__KEY QUESTIONS:__ Is solution viable? Is standard methodology used to deliver?

- Solution quality governance: Align customer requirements, assumptions, plan/budget for governance
- Verify test strategy and customer testing responsibilities
- Customer must agree to use ADO and mutual artifact accessibility; ensure MSFT team support for alternatives
- Validate customer agile methodology maturity and capacity-based delivery understanding; define key business outcomes
- ISV must be vetted; define scope/RACI; Plan B for ISV failure
- __KEY QUESTION:__ Have we adhered to all relevant policies, rules, guidance, standards in structuring the deal?

- Resource mix must meet [standards](https://businessrules.azurewebsites.net/BusinessRule/03-18-006) and [QA standards](https://microsoft.sharepoint.com/teams/CSAERMQA-Programs/SitePages/QA-%26-CSAE-Standards.aspx?ga=1)
- Engage Responsible AI review for any AI impact scenarios ([Responsible AI](https://businessrules.azurewebsites.net/BusinessRule/03-18-016))
- Follow all [Microsoft Policies](https://microsoft.sharepoint.com/sites/mspolicy) and [ISD’s Business Rules](https://businessrules.azurewebsites.net/CommonPage/Default)

__NEW!__ Verify SOW aligned with consumption estimate, milestones for consumption committed
__NEW!__ Validate with GPL which [Special Conditions](https://businessrules.azurewebsites.net/BusinessRule/06-24-027) apply
__NEW!__ Complete [Responsible AI review](https://aka.ms/askisdrai) for any engagements with AI
- Collaborate with assigned architect for Complex Solutioning
- Check for SOW-related [Special Conditions](https://businessrules.azurewebsites.net/BusinessRule/06-24-027) prior to SOW finalization
- Apply lessons learned to mitigate risks ([Lessons Learned](https://aka.ms/qall))
- Confirm SOW is well-written and follows [SOW best practice](https://vldoctool.azurewebsites.net/landing/services)
- Complete [Customer Maturity Assessment](https://sdmplus2.azurewebsites.net/topics/consulting/405) if appropriate
__NEW!__ Review deal-specific reviews (Responsible AI, TQA, ORB, SRM, HRDD, etc.) [Deal Specific Reviews](https://sdmplus2.azurewebsites.net/project/1/method/33/phase/155/parentPhase/null/activity/2218?complexity=3)

__KEY QUESTIONS:__ Can we manage change in delivery? Can project be delivered as structured?

- Scope mutually accepted? Traceable? Final acceptance defined?
- Proposed schedule viable?
- Customer dependencies/deliverables reflected in SOW?
- PM and governance well defined?
- SOW aligns to consumption plan/estimation (ACR/MAU)?
- Customer acceptance criteria/process defined
- Support plan constructed and agreed
- Adherence to methodology (SureStep, Agile, etc.)
- Resource mix RACI specified
- Standard SOW templates used and customizations evaluated ([K360](https://vldoctool.azurewebsites.net/landing/services))

__KEY QUESTION:__ Have we addressed non-standard terms/special conditions?
- SOW timeline aligns to ECIF and delivery; mitigate CCCV leakage (unused capacity, early closure)
- Mitigate Non-Standard terms approved by WW Deal Desk
- Team can deliver on unique customer requirements

---

## Resources

- SOW Development
- _Get the Contract Template_
    - [Services Contracting Central](https://microsoft.sharepoint.com/teams/ContractOneforK360/SitePages/ServicesContractingHub.aspx)
    - [K360+](https://vldoctool.azurewebsites.net/landing/vldocuments)
- _Tailor the SOW Template_
    - [High-level SOW writing guidance](https://microsoft.sharepoint.com/:w:/r/teams/SolutionsPortfolio/_layouts/15/Doc.aspx?sourcedoc=%7B0C12FEBC-D0B1-4ACC-AAA1-2A954BCED232%7D&file=High-level%20SOW%20writing%20guidance%20document.docx&action=default&mobileredirect=true&DefaultItemOpen=1&share=IQG8_hIMsdDMSqqhKpVLztIyAXTyfO3RrWI9kmzz8VUseR8)
    - [SOW Writing Guide 2020](https://microsoft.sharepoint.com/:u:/t/SOWSimplification/EToq6XLcHElIuBKLVoS30pwBPxg9tKfIfWVtFblrks51tw?e=duV6vi)
    - [Fixed Capacity Agile Deal Shaping Guide](https://microsofteur.sharepoint.com/:w:/t/MCEMforISDCollateral/EfPSIlF0il5Mm502boAAAiMBy02zgjCJGawfE1mOqwoWTw?e=tsDfv5)
    - [Writing Statements of Work for Solutions](https://microsofteur.sharepoint.com/:p:/r/teams/LED/_layouts/15/Doc.aspx?sourcedoc=%7BD6A0400A-43CF-467E-A22E-753F3F28DE48%7D&file=Writing%20Statements%20of%20Work%20for%20Solutions%20-%20Knowledge%20Boost.pptx&action=edit&mobileredirect=true)
    - [Solution Estimation Playbook](https://microsoft.sharepoint.com/:b:/t/Engaging/ESXL7xvkBUtKoj1uAlBa-mkBrlZ1xENWmgwsI0JEKcM0nA?e=ejDdUY)

- _Key Standards for SOW Development_

    - [QA & CSAE Standards](https://microsoft.sharepoint.com/teams/CSAERMQA-Programs/SitePages/QA-%26-CSAE-Standards.aspx?ga=1)
    - [Consulting Operation Model](error:ppt-link-parsing-issue)
    - [Deal Estimation Standards](https://microsoft.sharepoint.com/teams/CSAERMQA-Programs/SitePages/Deal-Estimation-Standards.aspx?xsdata=MDV8MDF8fDQ2MjBkYjVkZjkxZjRiMDM5NWU5MDhkYWFhOGU5MDg1fDcyZjk4OGJmODZmMTQxYWY5MWFiMmQ3Y2QwMTFkYjQ3fDF8MHw2MzgwMDk4MjY1MTMwOTgyMTd8R29vZHxWR1ZoYlhOVFpXTjFjbWwwZVZObGNuWnBZMlY4ZXlKV0lqb2lNQzR3TGpBd01EQWlMQ0pRSWpvaVYybHVNeklpTENKQlRpSTZJazkwYUdWeUlpd2lWMVFpT2pFeGZRPT18MXxNVGs2YldWbGRHbHVaMTlOYlVrMFdsUkthRTB5UlhSYVJGSnBUWGt3TUU5WFVYZE1WMGt4V1hwcmRFMVhVbWxaZW1Sb1drUkNhVTFFV1hoQWRHaHlaV0ZrTG5ZeXx8&sdata=cDdhNytVWnFPV3JvdFdsWFpaUTUvWmtGeVc2NHk3ZG1rSXZQbm9sZVY1dz0%3D&ovuser=72f988bf-86f1-41af-91ab-2d7cd011db47%2Cchenglee%40microsoft.com&OR=Teams-HL&CT=1665385861698&clickparams=eyJBcHBOYW1lIjoiVGVhbXMtRGVza3RvcCIsIkFwcFZlcnNpb24iOiIyNy8yMjA5MTgwMDkwNyIsIkhhc0ZlZGVyYXRlZFVzZXIiOmZhbHNlfQ%3D%3D)

- _Leveraging Lessons Learned to Mitigate Risk_

    - [Lessons Learned](https://aka.ms/qall)
    - [CompassOne: Risk Assessment Help](https://nam06.safelinks.protection.outlook.com/?url=https%3A%2F%2Fcompassone.microsoft.com%2FDashboard%2FRisk%2FAssessment%23risksummary)
    - [Deal Risk Management](https://microsoft.sharepoint.com/teams/CampusCopsRiskManagement/RM/SitePages/Deal%20Risk%20Management.aspx)

- _Policy & Compliance_

    - [MS Policy](https://microsoft.sharepoint.com/sites/mspolicy)
        - [Microsoft Professional Services Policy (MPSP)](https://microsoft.sharepoint.com/sites/mspolicy/SitePages/PolicyProcedure.aspx?policyprocedureid=MSPolicy-2714)
        - [Microsoft Services Billing Policy](https://microsoft.sharepoint.com/sites/mspolicy/SitePages/PolicyProcedure.aspx?policyprocedureid=MSPOLICY-1478106006-20)
        - [Commercial Cloud Contract Value (CCCV) Policy](https://microsoft.sharepoint.com/sites/mspolicy/SitePages/PolicyProcedure.aspx?policyprocedureid=MSPolicy-2712)
        - [Services Customer Proof of Execution](https://microsoft.sharepoint.com/sites/mspolicy/SitePages/PolicyProcedure.aspx?policyprocedureid=MSPOLICY-1478106006-15) Policy
        - [Services Third-Party Policy](https://microsoft.sharepoint.com/sites/mspolicy/SitePages/PolicyProcedure.aspx?policyprocedureid=MSPolicy-2083)

- _Business Rules Related to SOW Development/Approval_
    - [Resource Mix](https://businessrules.azurewebsites.net/BusinessRule/03-18-006)
    - [Minimum Delivery Mgmt. Oversight](https://businessrules.azurewebsites.net/Guidance/Minimum-Delivery-Management-Oversight-Guidance)
    - [Setting Risk Reserve](https://businessrules.azurewebsites.net/BusinessRule/03-18-013)
    - [Responsible AI](https://businessrules.azurewebsites.net/BusinessRule/03-18-016)
    - [ISD Special Conditions](https://aka.ms/ISDSpecialConditions)
    - [Complex Business Transactions](https://businessrules.azurewebsites.net/BusinessRule/03-18-001)
    - [Complex Technical Transaction](https://businessrules.azurewebsites.net/BusinessRule/03-18-003)

    - [Microsoft Services Compliance Site](https://microsoft.sharepoint.com/teams/MicrosoftServicesCompliance)

---

## Thank You
