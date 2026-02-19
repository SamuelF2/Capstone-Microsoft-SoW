# Contoso Inc-AgenticAI-RFP v5 10032025Final

Augmented RFP Response Generation

Prepared for:

#### Gallagher

Prepared by:

Microsoft Industry Solutions

Date: 9/22/2025

Version: 4.0

This Statement of Work (SOW) and any exhibits, appendices, schedules, and attachments to it are made pursuant to Work Order (WO) UCF3257-493331-636155 and describes the work to be performed (“Services”) by Microsoft (“us,” “we”) for Contoso Inc & Co. (“Contoso Inc”, ”Gallagher”, “Customer,” “you,” “your”) relating to RFP Generation with agentic AI and Copilot Studio (“engagement”).

This SOW and the associated WO expire 30 days after their publication date (date Microsoft submits to Contoso Inc) unless signed by both parties or formally extended in writing by Microsoft.

# Introduction

Gallagher, a leading advisory, assurance, and tax firm, has been at the forefront of providing innovative solutions to its clients for over a century. With a strong focus on leveraging advanced technologies, including AI and data analytics, Gallagher aims to streamline and enhance its RFP response process.

Traditionally, completing routine RFP tasks, identifying insights, providing personalized client responses, and collaborating across teams have relied on manual hand-offs, siloed data, and time-consuming processes. To help Gallagher Business Divisions (GGB/GBS/GRE) achieve their RFP objectives of efficiency, improved win rates, and faster turnaround times, Gallagher and Microsoft have agreed to automate routine RFP tasks. This initiative aims to reduce manual hand-offs and enhance team collaboration using agentic AI and M365 Copilot, with a feedback loop for continuous improvement.

This agentic approach establishes a solid foundation for high-value solutions by standardizing RFP workflows and streamlining the RFP response process by leveraging AI-driven solutions across various Gallagher Business Divisions (GGB/GBS/Re), to enhance efficiency, improve win rates, and achieve faster turnaround times in meeting RFP objectives.

# Engagement overview

This engagement makes use of a capacity-based agile delivery model. Microsoft will provide Gallagher with a delivery team staffed as defined in the Engagement Organization section and the Enterprise Services Work Order (ESWO). If additional capacity and/or skills are needed to deliver the desired engagement objectives or if additional engagement objectives need to be defined, the change management process will be followed.

The delivery team will follow recommended agile practices (described further in the Delivery Approach section) as Microsoft collaborates with Gallagher to leverage AI to optimize the RFP response process for Gallagher Business Divisions (GGB/GBS/Re).

Customer goals

Customer goals related to this engagement are listed below. They are provided for business context for the engagement and are not statements of accountability or of Services to be performed by Microsoft. The engagement outcomes and Services to be performed are described within this section and within the remainder of this SOW.

| Goal | Description |
| --- | --- |
| Improve efficiency by reducing the RFP response cycle from weeks to days. | Microsoft and Gallagher will work collaboratively to implement an extensible framework and solution to reduce the time from RFP intake to submission by streamlining workflows, automating document tagging, and integrating AI-driven orchestration. The goal is to use automation so that routine tasks (e.g. extracting requirements, assembling boilerplate answers) happen in minutes or hours instead of days. Ultimately, this efficiency means Gallagher can respond to clients faster, improving client satisfaction and competitiveness. |
| Improve proposal quality and win rate | Microsoft and Gallagher will work on the goal and co-create solutions to increase the win rate of RFPs by delivering more compelling, consistent, and client-focused responses. Gallagher wants the new process to produce “gold standard” proposals at scale, meaning each proposal should be thorough, well-tailored, and error-free. By injecting AI-driven improvements (like suggesting better wording or including relevant insights), the aim is to differentiate Gallagher’s responses and demonstrate a competitive edge. |
| Increase RFP Throughput Without Additional Manual Effort | Microsoft and Gallagher will co-create solutions to automate repetitive and low-value tasks in the RFP response process to allow teams to handle more RFPs without increasing headcount or workload.  By offloading repetitive tasks to AI, the sales enablement and bid teams can process more RFPs in parallel or tackle larger bids without sacrificing quality. The goal is to remove the previous cap on RFP volume – for instance, if each Sales Enablement manager could manage 2–3 RFPs concurrently before, they might handle significantly more once automation is in place. In concrete terms, Gallagher expects to “do more with less”, enabling growth (more bids submitted) without immediately needing additional staff. |
| Enable content reuse and effective knowledge management | Microsoft and Gallagher will work on the goal to address the core pain point - the inability to easily reuse past proposal content and answers across teams. The goal is to establish a central, well-organized content library (in SharePoint) that houses past RFP Q\&A, templates, and collateral for all divisions. This knowledge repository will be indexed and made easily searchable by AI. When a new RFP comes in, the team (and the AI) should be able to quickly find relevant historical answers instead of starting from scratch. Moreover, the system should support continuous knowledge improvement: as new or improved answers are developed, they get fed back into the repository. This ensures the knowledge base stays current and employees can trust that they’re getting the latest, best answer when the AI retrieves content. |
| Leverage internal expertise and personalize response | Microsoft and Gallagher will work to co-create solutions to better capture and incorporate Gallagher’s industry expertise, data analytics, and unique insights into each RFP response. Previously, valuable knowledge (for instance, a great answer crafted by an expert for one client) might stay trapped in one document. Going forward, the proposed AI solution should help surface the collective expertise of the organization. It will enable the team to provide more personalized answers by drawing on relevant case studies, benchmark data, or thought leadership content that Gallagher has, but that might not have been readily accessible before. The aim is to enhance proposals with valuable content Gallagher has or can develop, making them more appealing to clients. |
| Maintain consistency in tone, branding, and output | Microsoft and Gallagher will work on the clear goal to enforce a uniform voice and terminology in all proposal material. This means incorporating Gallagher’s brand guidelines and approved messaging into the AI’s output style. The proposed solution should include guardrails so that the tone, formatting, and terminology align with Gallagher’s standards on every RFP response. This goal extends to visual consistency as well: proposals (often delivered as Word or PowerPoint documents) should adhere to corporate design standards. |
| Improve cross-team collaboration and reduce handoffs | Microsoft and Gallagher will work on agentic process to foster better collaboration and transparency. This involves centralizing the workflow (e.g. through Teams and SharePoint) so that everyone – sales enablement, subject matter experts, content managers, and designers – works from the same platform and sees the same up-to-date information. By automating notifications and integrating steps, the proposed solution will aim to remove friction between teams. Making the multi-person effort of RFP response feel like a cohesive, well-orchestrated collaboration |
| Build a foundation for maintainability and future extensibility | Microsoft and Gallagher will co-create an enterprise-grade system that is sustainable long-term and can grow. The process should be well-documented, secure, and maintainable by their IT and business teams after initial deployment. This goal translates into technical design requirements: modularity, configuration, and use of standard platforms to ensure the solution can be updated and scaled without a complete rebuild. In essence, to invest in future-proof architecture that will serve as a digital RFP hub for years to come. |

Engagement objectives

This engagement will focus on the engagement objectives described below which will be prioritized based on agreement between Microsoft and Contoso Inc. The target sprints are listed for each phase and map to the timeline in Section 3.4. By the nature of agile delivery, engagement objectives are not always achieved. Microsoft and Contoso Inc will regularly review engagement priorities and work together to achieve the most valuable outcomes during this engagement. The agile delivery approach (described in the Delivery approach section) allows Contoso Inc to continually adapt the direction of the solution.

| Phase | Objective areas | Desired outcomes | Assumptions |
| --- | --- | --- | --- |
| Baseline Requirements & Planning  (Sprint 0) | Confirm business goals/objectives & key results (“OKRs”), pain points, and Copilot capabilities Confirm non-production MVP scope, gather initial requirements, align stakeholders, and create project plan. Confirm Augmented RFP use cases across Gallagher divisions. Select GRE use case for UX prototype Review conceptual UX mockups. | Shared understanding of the client's Gallagher’s vision, needs, and expectations for the engagement Initial Product Backlog with initial prioritized user stories. UX prototype. A validation of the user experience and functionality of the prototype | Key stakeholders are available and engaged.  GRE division selected for initial UX prototype.  Use case prioritization based on “business value” x “complexity” matrix. |
| Build non-production MVP for one business division (GRE) (Sprint 1-5) | Conduct design sprint to establish foundational solution architecture and roadmap  Select capabilities to pilot; continue UX mockups as necessary for other business divisions (GGB and GBS) Conduct responsible AI assessment Ready tenant and build selected Copilot capabilities Build and configure Copilot capabilities; integrate with SharePoint. Extending Copilots using custom agents and Agentic AI if necessary. Develop and deploy one custom M365 agent with additional Custom sub-agents which may include, but are not limited to Orchestration agent, Librarian agent, Thought Leadership agent, Guardrail agent, and Proofing Agent. Final agents and their capabilities will be determined during this phase. Current design is in Section 7.1 Launch pilot for GRE division; gather feedback and refine. | Solution design aligned with business needs and roadmap. Responsible AI assessment completed with mitigation strategies. Integrated architecture with SharePoint and Microsoft Copilots. Security review completed and recommended mitigations identified. Functional Copilot agents supporting Augmented RFP workflow. Copilot Studio agents to leverage AI search capabilities, particularly Azure AI Search, to enhance their knowledge and functionality.  A non-production pilot demonstrating Copilot capabilities and collecting feedback. | GRE pilot group is defined and licensed appropriately. Azure resources, integration endpoints: The team will have access to all required Azure resources and integration endpoints (such as AI Foundry, Azure Search, and development environments) at the start of the engagement. Data required for the project will be available in the proper location (e.g., SharePoint) when needed, and any necessary data migration for the other divisions is out of scope and will be handled by the client. Copilot Studio licenses are provisioned if needed. Any delays in access to these environments or resources may impact the project timeline. Gallagher completes all enablement, pilot, and testing prep. Gallagher is responsible for third-party system components. Subject matter experts (SME)s will participate in the security design review. Gallagher leads UAT, including all planning and coordination activities, e.g. writing test scenarios, setting up testing tools, identifying participants, etc. Microsoft will advise only. Accuracy and quality of the responses is subject to data quality and AI model confidence score Non-production MVP roles include Sales Enablement team. |
| Scale Non-production MVP across other business divisions (GGB and GBS) (Sprint 6-9) | Refine roadmap and define Non-production MVP scope for broader launch Reusable patterns and agents developed in the Non-production MVP phase will be utilized in this phase. Establish testing strategy and approach Plan and execute prioritized sprint-based expansion beyond GRE.  Build extensibility features Support UAT and enablement across divisions. | Non-production MVP scope aligned with roadmap and capacity. UAT validates solution readiness and informs backlog. Extended Copilot capabilities meet business and technical goals. | Build & Pilot phase assumptions apply. Non-production MVP access extended for GGB and GBS divisions. Roles include Sales Enablement team, RFP team, Bid manager. Data residency requirements outside the USA are not within the scope. |
| Post Non-production Scale Phase (Sprint 9) | Develop additional features and extensions. Support diverse outputs and client templates Enhance response quality and visual presentation. | Generate responses in Word, Excel, and client-specific templates. Tailored, persuasive RFPs using internal and external data. | Additional features and extensions developed post Non-production MVP should be specifically tied to the two business units: Gallagher Benefit Services (GBS) and Gallagher Global Brokerage (GGB), unless otherwise specified via a change request. |
| Data Protection Questionnaire (DPQ) | Conduct discovery of Gallagher’s data protection environment for engagement delivery. Complete a Microsoft-internal data protection questionnaire (DPQ) that provides a view of current issues and compliance requirements that may be required according to applicable data protection requirements. The DPQ covers data discovery, classification, and the applicability of security controls. | Conduct discovery of Gallagher’s baseline data protection requirements through completion of a data protection questionnaire (DPQ). Identify the applicable issues and compliance requirements that may arise, based solely on the information provided by Gallagher as part of the DPQ. | Customer to provide Microsoft with a baseline understanding of Gallagher’s relevant data protection requirements. Customer to provide inputs for data classification to determine personal, sensitive personal, confidential, and highly confidential data. |
| Solution security design review | Review and assess the solution architecture for design-related security issues.  Recommend mitigations for identified design-related security issues. | Perform a review of solution design to identify architecture-level security issues and create security findings report. | Customer will provide Microsoft with Gallagher’s relevant security policy documentation. Customer’s Subject Matter Experts (SME)s will participate in the security design review. |

## Technology requirements

The products and technology listed in the following table are required for the engagement. Contoso Inc is responsible for obtaining all licenses, products, or subscriptions. This list is subject to change based on adjustments made to desired outcomes or direction of the engagement.

| Product and technology item | Version | Ready by |
| --- | --- | --- |
| Microsoft Azure subscription | Not applicable | Start of engagement |
| Microsoft Azure DevOps | Not applicable | Start of engagement |
| Copilot Studio | Tenant license | Start of engagement |
| Microsoft 365 subscription or Office 365 subscription | Microsoft 365 F1, F3, E1, E3, or E5 or Office 365 F3, E1, E3, or E5 | Start of engagement |
| Copilot for Microsoft 365 | Not applicable | Start of engagement |
| M365 Graph Connectors | Not applicable | Start of engagement |
| Microsoft Visual Studio | Not Applicable | Start of engagement |
| Microsoft Azure AI Foundry,  Azure AI Search | Not applicable | Start of engagement |
| Azure Storge Account | Not applicable | Start of engagement |
| Microsoft Data Science Toolkit | Latest version, where applicable | Start of engagement |
| Power CAT Copilot Studio Kit | Latest version, where applicable | Start of engagement |
| Microsoft 365, Microsoft Teams | Not applicable | Start of engagement |

## Environment requirements

Contoso Inc will supply and maintain all environments used for the development and delivery lifecycle during this engagement. Contoso Inc will obtain the required Azure subscriptions and provide Microsoft with administrative control to build the development and test environments, as needed.

| Environment | Location | Responsible for configuration and maintenance | Subscription ownership | Ready by |
| --- | --- | --- | --- | --- |
| Development | Microsoft Cloud | Microsoft or Customer | Microsoft or Customer | Start of engagement |
| Test | Microsoft Cloud | Microsoft or Customer | Microsoft or Customer | Start of engagement |

Exclusions

Any area not explicitly included in the sections above, describing the outcomes and requirements, will not be provided by Microsoft during this engagement. Exclusions from the Services provided by Microsoft for this engagement include the following.

| Area | Description | Description |
| --- | --- | --- |
| Product licenses and subscriptions | Product licenses (Microsoft or non-Microsoft) and cloud service subscriptions are not included, unless otherwise noted in the Technology requirements section. | Product licenses (Microsoft or non-Microsoft) and cloud service subscriptions are not included, unless otherwise noted in the Technology requirements section. |
| Hardware | Microsoft will not provide hardware for this engagement. | Microsoft will not provide hardware for this engagement. |
| Client | Deployment and configuration of client software is out of scope for the project. | Deployment and configuration of client software is out of scope for the project. |
| Product bugs and upgrades | Product upgrades, bugs, and design change requests for Microsoft products. | Product upgrades, bugs, and design change requests for Microsoft products. |
| Organizational redesign | Designing or redesigning Contoso Inc’s functional organization is not included. |
| Branding | Microsoft will not create or design any graphical elements or corporate branding elements related to this engagement. | Microsoft will not create or design any graphical elements or corporate branding elements related to this engagement. |
| User communications | Microsoft will not manage any direct user communications associated with the engagement. |
| In-Class training | Formal in-class user training or the creation of custom training materials. |
| Governance and regulatory compliance | Microsoft will not be responsible for assessment or review of governance or regulatory compliance. |
| Deployment, installation, configuration, and testing | The following items are not included: Deployment and/or configuration of new Azure environments. Installation, configuration, and testing of non-Microsoft software other than software identified as within scope. Testing and configuration of applications and services outside of those required to support the deployment of the solution. On-premises software or hardware installation, this includes software such as Microsoft Data Integration Runtime |
| Network and storage | Troubleshooting or remediation of existing network and storage systems is not in scope. |
| Data Cleansing | Data Cleansing is out of scope. |
| Data Quality | Any data quality issues, remediation and the resulting additional effort are out of scope. These issues include but are not limited to: Duplicate rows Missing or empty data column Variable size schema (i.e. inconsistent or unexpected number of columns) Inconsistent timestamps Unexpected data types (i.e. Character strings in numeric columns) Unresolved lookups |
| Data migration | Data migration activities are not in scope for this project. |
| Machine learning | Training or fine-tuning of models using customer data is out of scope. |
| Process reengineering | Redesign or re-engineering of Contoso Inc’s business processes is not included. |
| Organizational design | Designing - or redesigning – Contoso Inc’s functional organization. |
| Application security code review | Security code review of an application or applications outside of the current projects scope. |
| System integration | Modifications to third-party systems or external interfaces to support integration are not in scope for this project. |
| Information security policies | Creation of Information security policies or application development security policies is out of scope. | Creation of Information security policies or application development security policies is out of scope. |
| Application security code review | Security review will not be conducted for any application or applications outside the scope of this engagement. | Security review will not be conducted for any application or applications outside the scope of this engagement. |
| Comprehensive security and compliance assessment, mitigation, or implementation | Microsoft security and compliance review is limited to the scope of features within this engagement and is intended to target the commercially reasonable context of this application in view of Contoso Inc’s information security, compliance, and data privacy policies.  A complete or comprehensive security and compliance assessment for Contoso Inc marketplace and technology environment is out of scope, along with mitigation or security solutions not explicitly included in the scope of the engagement per the Engagement objectives section. | Microsoft security and compliance review is limited to the scope of features within this engagement and is intended to target the commercially reasonable context of this application in view of Contoso Inc’s information security, compliance, and data privacy policies.  A complete or comprehensive security and compliance assessment for Contoso Inc marketplace and technology environment is out of scope, along with mitigation or security solutions not explicitly included in the scope of the engagement per the Engagement objectives section. |
| Regulatory Standards | Attestation/Certification of the application solution to any regulatory standards. | Attestation/Certification of the application solution to any regulatory standards. |

# Definitions and acronyms

The following table lists terms, initialisms, and acronyms used in this document.

| Term/acronym | Description |
| --- | --- |
| Backlog | The set of epics, features, and user stories that are prioritized and assigned to resources during sprints to direct the effort of the feature teams to work toward Contoso Inc outcomes and desired business value. |
| BWBM | Black and white box monitoring. Blackbox monitoring: testing externally visible behavior as a user would see it. Whitebox monitoring: monitoring based on metrics exposed by the internals of the system, including logs, interfaces (like the Java virtual machine profiling interface), or an HTTP handler that emits internal statistics. |
| Gallagher | Contoso Inc |
| GRE | Gallagher Reinsurance |
| GGB | Gallagher Global Brokerage |
| GBS | Gallagher Benefit Services |
| CPM | Consulting product manager. The role assigned to lead a feature team. Responsibilities are outlined in the Feature team section of this document. |
| DOD | Definition of Done |
| DOR | Definition of Ready |
| Informal knowledge transfer | The exchange of information between Microsoft staff and Contoso Inc staff as they work together on the engagement. |
| OKRs | Objectives and key results. A set of measurable goals and metrics used to track progress toward reaching valued business outcomes. |
| ORC | Operational readiness criteria. Criteria used in the review where customers have a base set of monitors, logs, runbooks, user acceptance testing (UAT), security, and scans needed to place a service into use (“production readiness review”). Services deemed business critical also include availability and reliability measurements (availability and serviceability, at a higher level). |
| PBI | Product backlog item. An item tracked in DevOps. Also known as a “work item.” Typically, these items can be individual tasks, stories, epics, features, or other custom items as defined for a particular engagement. |
| Product increment | Depending on the type of engagement, a “product increment” can be any combination of the following (but not limited to): documentation of standards, policies, and procedures; landing zones; security templates; operational playbooks; or user stories completed within a sprint. |
| SLI | Service Level Indicator |
| SLO | Service Level Objective |
| SME | Subject matter expert. A person with specific knowledge or expertise in a particular area. For example, a security SME, or database SME. |
| SOW | Statement of Work |
| Sprint planning | A single meeting held at the start of each sprint to review and assign PBIs that meet DOR and will be delivered during the sprint. In some exceptional cases, planning may extend past the first day. The consulting product manager (CPM) and feature team will attend, along with key stakeholders. |
| Sprint retrospective | A single meeting held at the end of each sprint to give the feature team an opportunity to review its performance and implement improvements for subsequent sprints. Identified improvements can be enacted during subsequent sprints. The feature team will attend with key stakeholders, if desired. |
| Sprint review | A single meeting held at the end of each sprint to evaluate the progress and update the product backlog, if needed. The CPM and feature team will attend along with key stakeholders. |
| UAT | User acceptance testing |

# Delivery approach, completion, and timeline

Delivery approach

This engagement uses an agile approach based on the scrum framework (http://scrumguides.org) for delivery.

During baseline planning, Microsoft and Contoso Inc will work together to elaborate and refine the product backlog to the level necessary to plan an initial product release for future delivery sprints.

### Sprint process

Microsoft will undertake an iterative delivery approach that is based on a fixed-capacity, fixed-duration, variable-scope process known as the scrum process. The goal of each sprint is a product increment that can be released into a non-production environment. The key tenets are as follows:

- Joint ownership of decisions
- Short implementation units (sprints)
- Prioritization of business objectives in a product backlog
- Time-bound planning for each sprint
- Emphasis on the remaining work
- Sprints that produce a working solution
- Sprint demonstrations that are time-restricted and have regular checkpoints.
- An automated approach to build, deployment and configuration of the solution
- Regular retrospective meetings that may be used for course correction

At the end of each sprint, the Microsoft project manager, CPM, Customer product owner, and applicable Customer decision makers will review the progress made against the objectives to determine if any adjustments need to be made using the change management process.

Due to the fixed-capacity, fixed-duration nature of the delivery, at the conclusion of the engagement, some backlog items may not be completed. The Microsoft team will rely on Contoso Inc to keep an updated and prioritized set of objectives so that the most important backlog items can be completed during the engagement to support the most important outcomes.

### Engagement initiation

At the beginning of the engagement, the following prerequisites must be completed. These tasks must be completed before envisioning, baseline planning, and delivery sprints begin.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Conduct a pre-initiation call or meeting to initiate team formation and communicate expectations.  Document the engagement launch prerequisites.  Track the status of launch prerequisites and adjust the start date for product baseline planning accordingly.  Conduct a detailed walk-through of the SOW with Contoso Inc to agree on an initial engagement schedule and approach.  Help Contoso Inc identify the required roles, stakeholders, and names for the initial feature teams.  Initiate orientation of Microsoft resources into Contoso Inc environment |
| Customer activities The activities to be performed by Contoso Inc | Attend and participate in the pre-initiation call.  Assign engagement initiation and launch prerequisite responsibilities to accountable Customer leadership and establish target completion dates.  Attend the engagement initiation and complete the launch of prerequisites.  Staff the engagement with the required Customer personnel in the time frames agreed upon in the pre-initiation call.  Own and complete any orientation requirements for Microsoft resources within Contoso Inc environment. |

### Baseline planning

During baseline planning, the feature team will construct the initial product backlog for implementing the baseline solution, a high-level architecture and an initial release plan. At the completion of this exercise, the outcomes, assumptions, and dependencies will be verified.

Should there be any material deviations from the initial estimated capacity and/or skills, these and their implications will be discussed. The impact of such changes will be addressed through the change management process.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Work with Contoso Inc to identify the stakeholders and SMEs that will function as a feature team.  Collaborate with Contoso Inc to:  Determine sprint duration and sprint capacity.  Review the desired outcomes and define OKRs.  Create a problem statement by defining the goal for the overall solution.  Create vision statements by defining functional or behavioral requirements for the overall solution.  Define personas and user journeys by determining how users currently operate, and how they plan to operate going forward.  Define epics and features by creating a workstream broken down into subtopics and action items.  Collaborate with the CPM to create a proposed backlog, including non-functional requirements for the first release and a set of user stories ready for sizing, design, and development.  Identify impediments to efficient development, including areas that require more elaboration, like proofs of concept or other architectural discovery tasks. |
| Customer activities The activities to be performed by Contoso Inc | Determine who is responsible for environment setup and operations.  Identify a solution owner or sponsor who is empowered to make business prioritization decisions and act as a single point of contact for questions about requirements.  Identify Contoso Inc team members who will be available for the duration of the engagement.  Allocate roles to be filled by Contoso Inc.  Attend and participate in the workshop sessions to define the user stories.  Provide updated background information, documentation, and business requirements.  Help remove any impediments.  Define UAT process.  Identify all security procedures and policies that the Microsoft team must comply with and follow. |
| Key assumptions | Customer representatives (especially the sponsor) will be available throughout the duration of baseline planning. Key roles, such as product owners and business and technical SMEs, are available and knowledgeable about key business scenarios, processes, and systems that are part of the Employee Experience vision. The backlog will be refined during baseline planning, which may result in changes to the overall scope and changes to required skills and/or capacity. |

### Delivery sprints

Each delivery sprint will last no longer than two weeks. The final duration for sprints will be determined in collaboration with Contoso Inc during Product Baseline Planning. A typical list of activities is provided below. Microsoft and Contoso Inc will review delivered outcomes after every sprint to determine whether updates are needed to the backlog or outcomes.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | The following activities will be performed during each delivery sprint: On the first day of the sprint, conduct sprint planning.  Determine whether sufficient information is available for each user story or PBI. An item will be flagged if more clarification is needed. If clarification is not provided, it may be deferred to later sprints.  Determine whether the PBIs assigned to a sprint can be completed within that sprint based on available capacity and interdependencies with other PBIs.  Conduct and participate in daily scrum meetings.  Work collaboratively to design and plan for the implementation of the PBIs.  Create and perform unit, functional, and system tests.  Identify impediments to engagement delivery progress and how production incidents will be factored into delivery.  Regularly update the remaining effort estimate for PBIs based on the development progress, dependencies, and architectural constraints or needs.  Explore external dependencies and determine approaches to handle mismatches in SLOs.  Review and refine the risk list.  Mark PBIs completed that meet the defined DOD (done by the CPM).  Provide PBI completion and capacity burn down analysis in a weekly cadence to refine PBI assignments and help to optimize engineering resources.  At the end of a sprint, conduct a sprint review and sprint retrospective.  Conduct discovery of Gallagher’s baseline data protection requirements through completion of a data protection questionnaire (DPQ). Identify the applicable issues and compliance requirements that may arise, based solely on the information provided by Gallagher as part of the DPQ.  Perform a review of solution design to identify architecture-level security issues and create security findings report. |
| Customer activities The activities to be performed by Contoso Inc | Attend and participate in daily scrum meetings.  Help refine PBIs and provide timely clarifications.  Provide updated background information, documentation, and business requirements.  Collaborate with Microsoft to update the product backlog for future sprints.  Help remove any impediments.  Support the Microsoft team with deployments to the agreed-upon environments.  Conduct UAT on completed PBIs according to the UAT cycle defined in the release plan.  Identify repetitive items that can be handled via automation.  Attend sprint reviews and provide feedback.  Provide Microsoft with access to Gallagher’s security policy, standards, and/or practices documentation relevant to the application scope. Provide Microsoft with access to Contoso Inc’s architecture or integration documents and security policy recommendations.  Attend data classification sessions, if applicable, and provide input. Attend information gathering and design review sessions Review product in each integration or sprint for conformance to customer’s market and/or operational requirements. |
| Key assumptions | Customer representatives, especially the product owner and sponsor, will be available throughout the duration of the sprint. The backlog will be continually refined in each sprint, which may result in changes to overall scope and changes to required skills and/or capacity. |

### Testing and defect remediation

Testing

The following types of testing are included in the engagement:

| Test type | Description | Responsibility | Responsibility | Responsibility |
| --- | --- | --- | --- | --- |
| Test type | Description | Has responsibility for testing? | Provides test data and test cases | Provides guidance and support |
| Unit Testing | Perform unit testing on any new code development done by Microsoft and validate code quality, technical use case, error handling. | Feature team | Customer | Microsoft |
| Functional testing | Tests performed by a feature team within a delivery sprint to validate that the product features function in accordance with the acceptance criteria defined for features and PBIs. For agentic processes, this involves having a set of prompts with optimal desired outputs to compare against, which can be done in Copilot Studio Kit or Azure Foundry Evaluator. | Feature team | Customer | Microsoft |
| System testing | Tests performed to validate that the deployed solution operates as designed, across functionality delivered by feature team. | Microsoft | Customer | Customer |
| UAT | Tests the user functionality of key real-world scenarios. UAT will be conducted over the course of the engagement according to the UAT time frames agreed upon during baseline planning (as described in the Baseline planning section). Feedback from UAT (defect or new PBIs) and other backlog items will be added to the product backlog and prioritized alongside other PBIs. | Customer | Customer | Microsoft |

Defect remediation

If possible, defects found by the feature team during a delivery sprint are fixed within the sprint itself. Defects that cannot be resolved during the sprint will be added to the product backlog. Defects found elsewhere will become part of the product backlog and be prioritized alongside other PBIs.

Outputs

Microsoft will provide the following.

| Name | Description | Acceptance required |
| --- | --- | --- |
| Scenario Description Document | A Word document or PowerPoint presentation that describes the desired business outcomes (in terms of OKRs) and anticipated business benefits for a mutually agreed AI scenario. | No |
| Initial product backlog | An initial product backlog that defines the high-level epics and features for a solution that will address the desired business outcomes for the mutually agreed AI scenario. | No |
| Initial release plan | A plan showing the desired outcomes and key features that should be delivered during the initial release of the product. | No |
| Baseline architecture description | A Word document, PowerPoint presentation, or collection of wiki pages describing the proposed solution architecture and key architecture decisions for the initial product release. The architecture described in this document will be used as a framework to guide implementation choices during delivery. | No |
| Initial user experience (UX) design | An initial UX design showing interaction designs and wireframes for key elements of the initial release. | No |
| Sprint completion report | This report lists the PBIs that have been completed during the sprint, any planned work that was not completed, and any engagement risks or problems. This report is produced as an output of each sprint. | No |
| Security Findings | When required to obtain direction from Contoso Inc, Microsoft at its discretion, may share security findings from the review of solution design added to the project planning, risk log, or task backlog as applicable. | No |

Completion and definition of done

### Sprint completion

Sprints will end based on the calendar schedule defined during Baseline Planning. At the conclusion of each sprint, feature teams will conduct a sprint review and sprint retrospective. During the sprint review, completed work will be demonstrated. At the end of each sprint, Microsoft will provide a sprint completion report.

### Backlog item completion

Backlog items do not require formal sign-off or Customer acceptance when they are completed by the feature team.

As part of each sprint review (Delivery Sprints section), Contoso Inc will review each backlog item (user story or defects) completed in the delivery sprint and confirm whether it is considered done using the Definition of Done agreed during Engagement Baseline Planning. Each backlog item that is done will be recorded as such in Azure DevOps. The results will also be captured as part of the sprint completion report.

Items that are not considered done at the end of a sprint will be moved to the product backlog and prioritized alongside other backlog items during sprint planning.

Any defects found in a finished backlog item will be added to the product backlog as a defect and prioritized alongside the other backlog items. A finished backlog item may also prompt Contoso Inc product owner to include additional backlog items to enhance the software.

Timeline

This is a 10 sprints engagement with sprint 0 for envisioning and sprint 9 for closing. Each sprint is 2 weeks of duration.

The timeline for this engagement is relative to the engagement start date. All dates and durations provided are estimates only. The specific timeline will be finalized during baseline planning and will be updated as part of core engagement planning activities.

Microsoft will provide the Microsoft team described in the Engagement organization section for a period not to exceed 20 weeks or until the capacity defined in the WO is consumed. The Microsoft team will work on the highest-priority outcomes, specified by Contoso Inc, as described in the Engagement outcomes section.

The high-level timeline of the engagement is depicted in the following image.

During this engagement, the following resources from Gallagher will be required for the approximate time indicated below. A fuller description of customer resources can be found in Section 4.3. The baseline schedule will be finalized as part of Initiation and Planning to account for customer resource availability.

| Phase/Sprint | Executive Sponsor | Project Manager | Business Stakeholders | Release Mgmt Team | Primary Division (GRE, GGB, GBS) | Activities/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Initiation & Planning  (Sprint 0) | 2-4 hr/wk | 6-8 hr/wk | 12-16 hr/wk  (Kickoff – All Divisions Design – GRE) | - | All | Workshops, planning, orientation |
| Build MVP  (Sprints 1-5) | 2-4 hr/wk | 6-8 hr/wk | 6-8 hr/wk | As needed | GRE | Scrum, UAT, deployment, reviews |
| Scale MVP  (Sprint 6-7) | 2-4 hr/wk | 6-8 hr/wk | 6-8 hr/wk  (GRE) 12-16 hr/wk  (Design –  GGB / GBS) | As needed | GGB, GBS | Enablement, design, UAT, deployment |
| Post-Scale  (Sprint 8-9) | 2-4 hr/wk | 6-8 hr/wk | 6-8 hr/wk | As needed | - | Feature reviews, deployment |

# Engagement organization

## Engagement staffing

The role descriptions for each area in the engagement organization are shown in the roles and responsibilities table in the sections that follow. The capacity available for each Microsoft resource is specified in the WO. If more resource capacity of any role is needed, it can be added through the change management process.

## Feature team

Following the scrum model, Microsoft uses a feature team approach to deliver an engagement. All scrum roles will be represented within the feature team. This team is an autonomous and empowered unit that has all the capabilities to design, develop, test, and release features to achieve Contoso Inc outcomes. A feature team consists of a product manager, scrum master, technical lead, SMEs, and engineers with various development, test, deployment, infrastructure, security, data, and operation skills.

The roles listed below are typical and representative for feature teams, though they may differ, depending on the engagement. The skill sets of the engineers will also be different, depending on the engagement.

| Role | Responsibilities/notes | Responsible party |
| --- | --- | --- |
| CPM (an agile/scrum product owner plus additional responsibilities) | Takes responsibility for the alignment with the strategy and objectives communicated by the product council if one is present in the engagement. Manages and prioritizes the product backlog. Serves as the primary person responsible for user story/PBI backlog decisions during sprint planning. Serves as the single point of contact for decisions about PBIs and prioritization. Defines validation criteria for work items, especially user stories. Actively participates in all sprint ceremonies. Takes responsibility for planning validation testing. Serves as a member of the product council if present. | Microsoft |
| Technical lead | Partners with Contoso Inc to understand business needs and solution requirements and assists with technical governance. Helps evaluate implications of trade-off decisions to prioritize product backlog. Serves as a member of the product council. Within the scope of a feature team and for an individual product, serves as the technical person responsible for user story/PBI decisions during sprint planning and defines validation criteria for work items. Facilitates conversations between various product stakeholders so that the product managers can make informed decisions. Facilitates DevOps standardization (for example, DevOps taxonomy and DevOps principles and practices). Provides Contoso Inc with technical advice regarding the Microsoft cloud. Reviews solution architecture and design to identify design-related security issues. Reviews results of security tests performed on a working test environment. | Microsoft |
| Software consultants, data scientist, software engineer, QA, UX and information security (InfoSec) consultant | Take responsibility for design, implementation, test, and deployment following generative AI principles. Takes responsibility for writing code for assigned modules and features. Take responsibility for the quality of the code written. Participate in peer code review. Participate in all sprint reviews. Take responsibility for CI/CD processes setup  Note: The mix of feature team engineering skills may vary throughout the engagement, depending on work requirements. Conducts the solution security design review: Provide guidance and assistance to the engagement team to identify high risk configurations and recommend mitigations for the most significant risks of the solution design | Microsoft |
| Solution architect | Verify whether Microsoft-recommended practices are being followed.  Responsible for overall solution design and technical leadership.  Help provide activities and backlog items that are related to the engagement.  Reviews solution architecture and design to identify design-related security issues.  Reviews of security tests performed on a working test environment Provides inputs to Gallagher technology teams, including Release Management and Security, to support processes and internal reviews for technology in Production. | Microsoft |
| SME | Provides ongoing guidance to the Microsoft feature teams. Serves as Contoso Inc operations lead, responsible for cloud operations and governance. Takes responsibility for validating the quality and functionality of the product increment. Participates in all sprint reviews. | Customer |
| Customer Security Contact | Provide technical documentation for the contract-identified/engagement specific data protection requirements, standards and other identified Customer expectations for security and privacy. Provides access to existing Customer security policy, standards, and answers Microsoft questions on requirements. Participates in data classification sessions, if applicable. Completes post-project review, credential rotation, access removal. | Customer |

## Customer staffing

The roles listed below are typical and representative of customer roles, though they may differ, depending on the engagement.

| Role | Responsibilities/notes | Recommended Days/Week |
| --- | --- | --- |
| Customer Executive Sponsor/ Project Owner | Strategic oversight, escalation, and key decisions. Typically attends steering committee meetings and reviews major escalations. | 2-4 hours/week |
| Project Manager | Coordinates internal resources, schedules, and communications. Attend planning, status meetings, and issue resolution. | 6-8 hours/week |
| Business Stakeholders | Provide direction on business objectives and participate in UAT. Engagement peaks during planning, reviews, and UAT cycles. | 12-16 hours/week (Design / UAT) 6-8 hours/week (other sprints) |
| Release Management Team | Upon validation of non-Prod MVP deployment, Gallagher will be responsible for moving the solution to Production via its approved processes.  Microsoft will provide limited, part-time oversight and support from technical leadership resources for activities such as submitting change request details, addressing security review questions, and responding to production issues via Premier Support. | ½ time to full-time for the release weeks of each business group, depending on Gallagher’s Release process. |

# Engagement governance

The governance structure and processes the team will abide by for the engagement are described in the following sections.

## Engagement communication

In addition to the communication mechanisms built into the delivery approach, the following will be used to communicate during the engagement:

- Communication plan: This document will describe the frequency, audience, and content of communication with the team and stakeholders. Microsoft and Contoso Inc will develop it as part of engagement planning.
- Status reports: The Microsoft team will prepare and issue regular status reports to engagement stakeholders per the frequency defined in the communication plan.
- Status meetings: Per the frequency defined in the communication plan, the Microsoft team will schedule regular status meetings to review the overall engagement status, available delivery data, and open problems and risks.

## Risk and issue management

The following general procedure will be used to manage active engagement issues and risks during the engagement:

- Identify: Identify and document engagement issues (current problems) and risks (potential events that could impact the engagement).
- Analyze and prioritize: Assess the impact and determine the critical risks and issues that will be actively managed.
- Plan and schedule: Determine how to manage critical risks and assign responsibility for risk management and issue resolution.
- Track and report: Monitor and report the status of risks and issues.
- Escalate: Escalate to engagement sponsors critical issues and risks the team is unable to resolve without assistance.
- Control: Review the effectiveness of the risk and issue management actions.
Active issues and risks will be monitored and reassessed every week.

## Change management process

During the engagement, either party may request modifications to the Services described in this SOW. The agile approach, used by Microsoft, does not guarantee that all items defined in the product backlog will be completed, nor that all outcomes will be achieved. Should Contoso Inc decide to continue work after engagement completion (described in the Engagement completion section), Contoso Inc may request a change by following the process below.

Requested changes take effect only when the proposed change is agreed upon by both parties. The change management process steps are:

- The change is documented: Microsoft will document all change requests in a Microsoft change request form. The change request form includes:
- A description of the change
- The estimated effect of implementing the change
- The change is submitted: Microsoft will provide the change request form to Contoso Inc.
- The change is accepted or rejected: Contoso Inc will accept or reject the change within three business days and confirm the following to Microsoft:
- Acceptance – Contoso Inc must sign and return the change request form.
- Rejection – If Contoso Inc does not want to proceed with the change or does not provide an approval within three business days, no changes will be performed.

## Escalation path

The product managers, executive sponsors, and other designees will work closely together to manage engagement issues, risks, and change requests as described previously. Contoso Inc will provide reasonable access to the sponsor or sponsors to expedite resolution. The standard escalation path for review, approval, or dispute resolution is as follows:

- Feature team member
- Product manager and project managers

## Engagement completion

Microsoft will provide Services defined in this SOW to the extent of the fees available and the terms specified in the WO. If additional Services are required, the change management process will be followed, and the contract modified. The engagement will be considered complete when at least one of the following conditions has been met:

- All available capacity has been utilized for Services delivered.
- The term of the engagement has expired.
- All Microsoft activities and product backlog items have been completed.
- The WO has been terminated.
Due to the nature of agile delivery, not all backlog items or outcomes may be completed during the engagement. The Microsoft team will rely on the CPM in conjunction with the product council to determine priority of the product backlog so that the important backlog items can be completed during the engagement.

# Customer responsibilities and engagement assumptions

## Customer responsibilities.

Contoso Inc is responsible for:

- Providing accurate, timely, and complete information within three business days or as mutually agreed upon.
- Providing access to people, including knowledgeable Customer personnel and business users as required.
- Providing sufficient Customer resources with the requisite skills for testing during the engagement.
- Providing all requisite information to relevant external parties to obtain clearances for all personnel actively participating in the engagement, if security clearances are required.
- Providing access to systems for both onsite and remote work.
- Providing a suitable work environment when onsite presence is required.
- Managing all Customer personnel and vendors who are not managed by Microsoft.
- Managing external dependencies for related engagements or programs.
- Confirming regulatory compliance, if applicable.
- Providing standard product training for external systems as required.
- Overseeing organizational change management:
- Redesigning or re-engineering business processes.
- Designing or redesigning the functional organization.
- Planning or undertaking user communications.
- Other general Customer responsibilities.
- Contoso Inc first responder organization is responsible for initial triaging after all releases.
- Providing application support.
- Fixing bugs and troubleshooting problems that are related to applications or other third-party software, hardware products, or applications that are not explicitly mentioned as being in scope.
- Preparing documentation about processes, standards, policies, and existing guidelines.
- Designing, configuring, integrating, deploying, or fixing issues in commercially available third-party software.
- Implementing modifications to third-party systems and external interfaces to support integration.

## Engagement assumptions

The following are assumptions that apply to this engagement between Customer and Microsoft. During the engagement, the information and assumptions in this document will be validated, and if a material difference is present, this could result in Microsoft initiating a change request to cover additional work or extending the engagement duration.

- Workday:
- Local Microsoft employees will follow the standard Microsoft (or appropriate subsidiary) workday and work week.
- If Microsoft Global Delivery factories are used, then the following also apply:
- The standard workday for the offshore Microsoft factory team is between 9:30 AM and 6:30 PM India standard time, Monday through Friday, except for scheduled holidays. Limited exceptions can be made with advanced planning to support production-level changes or to address a need that requires a meeting between an offshore resource and Contoso Inc, and which cannot be accomplished during the standard workday. Exceptions will be coordinated by the program manager.
- Offshore resources that are not part of the factory will be available between 7 AM and 10 PM India standard time over an eight-hour continuous window.
- Remote work:
- The Microsoft feature team will perform Services remotely.
- Language:
- All engagement communications and documentation will be in English. Local language support and translations will be provided by Contoso Inc.
- Staffing:
- If necessary, Microsoft will make staffing changes. These may include, but are not limited to, resources and engagement roles.
- If security clearance is required, all resources will have the appropriate level of security access required to complete engagement-related efforts.
- Resource mobilization for staffing the engagement will be 2-4 weeks.
- Informal knowledge transfer:
- No formal training materials will be developed or delivered as part of this engagement. All information transfer will be through informal knowledge transfer.
- Known standards:
- Microsoft expects to use Azure DevOps, Azure Pipelines and may use GitHub for standard delivery.
- Time will be required to learn Contoso Inc tooling if there are deviations from Microsoft standards. This time has not been included in engagement estimates.
- Microsoft will use standard Azure DevOps process templates, as well as other IP designed to speed up delivery, including, but not limited to, standard work items, pipelines, and document templates.
- Other assumptions:
- In addition to engagement team members, Contoso Inc shall allow Microsoft internal systems to access the mutually accessible delivery platforms and tools used for this engagement.
- Microsoft will read, store, and share necessary delivery insights on the work artifacts and products generated as part of this engagement (for example, test cases, code base, and pipelines) that are hosted on mutually accessible delivery platforms, like Azure DevOps, Jira, and GitHub.
- Microsoft will make available to Contoso Inc all data and insights gathered during the engagement. Microsoft will purge said data and insights upon explicit Customer request or at the end of the engagement.
- Holidays, vacations, and training time have not been factored into this SOW.
- All work is to be contiguously scheduled. Any breaks in the engagement calendar must be scheduled four weeks in advance, or the time will be billed without interruption.
- Contoso Inc required compliance training for regulated industries is not included in the estimation. This includes:
- Security training
- Internal orientation
- Financial compliance training
- Healthcare compliance training
- Procedures outside of Microsoft standard compliance
- Background checks, fingerprinting, badging, and authentication
- Contoso Inc will meet the necessary requirements to help make sure the solution design meets regulatory requirements.
- During the course of the engagement under this SOW, if the requested business outcome includes Microsoft developing or deploying an AI System for or with Customer which may be considered a sensitive use, Microsoft will conduct an internal responsible AI review, to include assessment of and requirements for potential sensitive use. The outcome of the review will be discussed with Contoso Inc and Microsoft will act in compliance with its responsible AI principles, including making any required modifications. For more information about Microsoft’s responsible AI principles please refer to https://aka.ms/RAI.
- If localization support is required to support additional languages, it may be added to the product backlog.
- Azure services and technology
- Azure services and Azure-supported Microsoft technologies will be used to develop the solution.
- The components to be developed by Microsoft will be cloud hosted.
- Microsoft will not modify any existing code base that was not produced by the Microsoft delivery team.
- Azure DevOps
- Either Contoso Inc will provide a Microsoft Azure DevOps services account that is accessible by all team members, or Microsoft will provide an account (possibly with limited Customer access).

# Appendix

The following documents serve to clarify the RFP agentic solution features and functionality and are based on joint workshop designs between Gallagher and Microsoft.

## Proposed RFP Agent Design

The following table lists the primary agents planed for development, along with the respective data source, high-level input, output, and desired process efficiency.

| Agent | Librarian | Question Agent | Thought Leadership | Guardrail Agent | Proofing Agent |
| --- | --- | --- | --- | --- | --- |
| Function | Responsible for sourcing boilerplate content, such as the history of Gallagher, the number of clients, regions of operation, and types of products placed. | This agent analyzes the RFP document and generates questions that need to be addressed to ensure a comprehensive and accurate response. | Sources content related to Gallagher's expertise and thought leadership in the industry. It includes insights and analyses that demonstrate Gallagher's capabilities and innovative approaches | Dedicated to tone and compliance: checking that the draft follows the approved tone of voice, terminology, and branding guidelines. | Proofreading agent will scan the draft for any factual inconsistencies, grammatical issues, or sections that might violate Gallagher’s policies. |
| Data Sources: Structured / Unstructured | Information stored within topical folders on SharePoint. Includes un-structured and semi-structured statistical data (e.g., Gallagher company information) Intranet sites PPT, PDF, Word Docs, news articles | Question bank of previously asked questions Structured and unstructured | Pulls unstructured data stored on SharePoint sites. Pulls unstructured text from Gallagher website. | Client RFP Invite Gallagher Response | Gallagher Branding guide |
| Inputs into the RFP Process | Boiler plate responses. Formatted document. | Categorize the new question semantically | Summarized and quoted Contoso Inc thought leadership and research relevant to the RFP. | Summarized and quoted Contoso Inc thought leadership and research relevant to the RFP | Contoso Inc branding and voice are consistent throughout the response |
| Process Improvement area(s) | Increased speed, efficiency within an acceptable level of accuracy, consistent company information.   Current baseline: 1 day/person | Increase accuracy of curated content pulled by other agents. Increase overall speed. | Increased speed, efficiency within an acceptable level of accuracy, consistent company information  Current baseline: 1 day/person | Increased accuracy of response Increased response speed | Increased accuracy of response and standardized application of Contoso Inc branding. |

## Proposed Business Process Flows

The following charts show the existing current-state and planned future state following implementation of the RFP Agent.

### Current State

The RFP response process begins with intake and review of the proposal using manual tools and actuarial analytics, followed by targeted team selection based on skill alignment and availability. Proposal strategy and messaging are developed through storyboard planning and iterative sculpting, culminating in final formatting, rehearsals, and delivery of the response either virtually or in person.

### Illustrative Future State

The RFP Reimagined Journey outlines a structured five-step process from response preparation through final submission and deal desk review. It includes assembling the right response team, leveraging automation and templates for drafting, conducting targeted Q&A to refine content, and finalizing deliverables with agent alignment. This workflow emphasizes efficiency, collaboration, and quality assurance across each phase of the RFP lifecycle.
