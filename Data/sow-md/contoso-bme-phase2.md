# Contoso Inc Contoso_Phase 2 Final

AI Driven Contract Pricing – Phase 2

Prepared for:

Building Materials Europe, a Contoso Inc Company

Prepared by:

Shyam Sridhar, Architect

Industry Solutions Delivery

Date:13 March, 2025

Version: 1.0

This Statement of Work (SOW) and any exhibits, appendices, schedules, and attachments to it are made pursuant to Work Order (WO) UCF1249-483060-619875 and describes the work to be performed (“Services”) by Microsoft (“us,” “we”) for Building Materials Europe (“Contoso Inc”, “Customer,” “you,” “your”) relating to AI Driven Contract Pricing (“engagement”).

This SOW and the associated WO expire 30 days after their publication date (date Microsoft submits to Contoso Inc) unless signed by both parties or formally extended in writing by Microsoft.

# Introduction

Building Materials Europe (Contoso Inc) is one of Europe’s leading and fast-growing business-to-business distributors for building materials. Contoso Inc provides a one-stop shop solution, mainly focusing on small to medium sized contractors and installers who are active in the residential and renovation end-markets.

Contoso Inc aims to build intelligence around their customers and competition to help define commercial strategies that improve profitability and accelerate growth.

# Engagement overview

## Customer desired objectives

The primary goal of this project is to productionize the MVP solution that leverages AI-driven insights for setting effective pricing for products and contracts. Other features of this solution will include development of an evaluation strategy that can measure the performance of the solution over time and operationalization of Machine Learning Models.​ This phase 2 of the project will primarily focus on the following areas

- Enterprise grade architecture design and development, deployment into QA, Go-Live assistance
- Smart Research Agent – enhancement and production readiness
- Smart Pricing Agent – Deploy v1, assistance with v2, MLOps framework
The Agile delivery approach (described in the Delivery approach, completion, and timeline section) allows Contoso Inc to continually adjust and adapt the engagement objectives and direction of any solution designed to reach the desired goals.

| Desired objectives | Customer Responsibilities & Assumptions |
| --- | --- |
| Phase 2 - Deploy production grade Smart Service platform in QA and assist with go-live/operationalization of the Smart Service platform MVP that leverages AI-driven insights for setting effective pricing for products and contracts, with a high percentage of relevance and accuracy to enable operational efficiency. | Customers have the responsibility of participating in the prioritization process of the backlog in accordance with their business goals and objectives, and with input from the Microsoft team. Customer will ensure solution aligns with their existing systems and processes and complies with any relevant regulations and standards. Any deployment of the solution in production is out of scope of this engagement. Microsoft will deploy the solution in QA and provide go-live guidance/advisory |

## Areas in scope

This section outlines the work and activities that will be delivered by Microsoft pursuant to the objectives set forth in this SOW.

This engagement makes use of a capacity-based agile delivery model.  Microsoft will provide Contoso Inc with a delivery team staffed as defined in section 4.2 and the associated Work Order AMDUCF12411-483060-619875-630832. The delivery team will follow recommended Agile practices (described further in section 3 of this SOW) as Microsoft collaborates with Contoso Inc to deliver the MVP solution. The delivery team will work under Contoso Inc’ product owner, who will decide on product features, scope of services to be delivered and will take decisions on the best use of Microsoft’s resources made available under this SOW.

The project may address the following areas which may be revised at any time based on direction from Contoso Inc. There may be additional scope not listed in the following list which may be delivered, as well as scope listed that are prioritized low enough that it may not be built due to capacity constraints.

By nature of agile delivery, scope is variable. When the resource labor category, capacity and/or duration of the delivery team needs to be amended to deliver the agreed backlog items, the change management process will be triggered to allow the project to change the available resources and/or capacity. Alternatively, Contoso Inc may decide to reduce the scope to remain within its budget. This approach allows Contoso Inc to continually adapt the scope and direction of the solution.

| Scope Area | Scope | Key Assumptions |
| --- | --- | --- |
| Architecture and Design | Design and implement the architecture components for the AI Pricing Agent in the Contoso Inc/BMN environments including the development of an orchestration app & API Support Contoso Inc in making the Pricing Model V1 operational and run efficiently Refine the Research Agent performance for Production Scaling Design and implement Contoso Inc Intelligence chatbot in the Contoso Inc/BMN DEV and QA environments Production go-live assistance | Contoso Inc will provide the necessary resources to deploy the solutions on QA and Prod Availability of Contoso Inc IT resources throughout the course of the project |
| Research agent | Improve scalability of research agent (utilizing Jina, Azure open ai, SERP API) and features such as adding queuing mechanisms, job management and error handling.  Improve quality of research by adding image analysis and improve quality or deep scrape in a cost-efficient fashion  Improve quality of BMN customer intelligence chatbot by adding tooling allows enrich answers with structured data from the BMN DB DWH Investigate options to modularize the research to reduce dependencies of Research Agent components   Refine & improve quality and consistency of pricing model outputs. | Contoso Inc will provide an Azure subscription with access enabled for the required Azure services. Contoso Inc will provide data which can used as examples for prompt engineering Contoso Inc will provide data that can be used to validate the output from the solution. Deployment will be done  in Dev environment and will leverage devops pipelines to promote to QA Functional Testing is Contoso Inc’s responsibility |
| Pricing Agent | Bring V1 of Pricing Model to Production Refine quality of output, model tweaking and filtering lower quality output-based feedback for Business testing Make the model ready for production; to go through relations, and tidying up the model for production (broad spectrum code competences) Document the traceability of the pricing model in term of a dataflows   Develop V2 of Pricing Model Neural networks show very promising results in first tests; more accurate predictions and ability to overcome filtered data sparsity issues Design and implement a V2 pricing model, expected required competences Execution power (general DS skills) Hyper parameter Tuning Compute optimalisation skills for faster iteration Access to experienced DS in neural nets for support Design & implement explainability & traceability tooling for the neural net Implement MLOps pipelines for managing code, data, and models to improve performance, stability, and long-term efficiency of ML systems | Contoso Inc will provide the necessary Azure Subscriptions with relevant access Contoso Inc Devs, data scientists and data engineers will be available Relevant Data pipelines are available and accessible to the Dev/Test environments |
| Project management and governance | Microsoft will support the Contoso Inc team with project management and governance through the following activities: Acting as a single point of contact for all Microsoft-related activities in the context of this project Establishing the program governance and taking responsibility for the communication plan Performing weekly and sprint reporting |  |
| Knowledge Transfer | Conduct ongoing knowledge transfer throughout the project, by working in close partnership with the Contoso Inc team. |  |

The agile delivery approach (described in the Delivery approach, completion, and timeline section) allows Customer to continually adjust and adapt the outcomes and direction of any solutions designed to reach said objectives. Microsoft will continue its efforts based on the priorities and direction provided by Customer until such time as all capacity has been consumed.

If more capacity is needed to deliver the desired outcomes or if additional outcomes need to be defined, the change management process described in this SOW will be used to increase capacity.

## Out of Scope

Areas out of scope for this project include:

| Area | Description |
| --- | --- |
| Product licenses and subscriptions | Product licenses (Microsoft or non-Microsoft) and cloud service subscriptions are not included, unless otherwise stated. |
| Hardware | Microsoft will not provide hardware for this engagement. |
| Management of non-Microsoft resources | Management of third-party or Customer resources or tasks |
| Third-party software | Design, configuration, integration, deployment, or issue resolution for commercially available third-party software |
| Product bugs  and upgrades | Product upgrades, bugs, and design change requests for Microsoft products |
| Process reengineering | Designing functional business components of the solution |
| Organizational redesign | Designing or redesigning of Customer’s functional organization |
| User communications | Microsoft will not manage any direct user communications associated with the engagement. |
| Training | Training documentation or formal in-class user training related to products or technology that includes workshops, classrooms, and training materials, unless explicitly listed as in scope in the Areas in scope section. Help-desk documentation and training. |
| Governance and regulatory compliance | Microsoft will not be responsible for building, assessing or reviewing governance or regulatory compliance. Attestation/certification of the application solution to any regulatory standards |
| Lab environment | Creation of a development or test lab environment is not included. |
| Decryption of protected content | Decryption of content that has been protected with Microsoft Information Protection or any other encryption system |
| Client software | Deployment and configuration of client software |
| Support for custom solutions | Support for any scripts, dashboards, or applications produced by Microsoft during delivery is out of scope, beyond the duration of the engagement. |
| Documentation | Producing Customer-specific reports, presentations, or meeting minutes. Architectural and technical documentation that is specific to Contoso Inc, except as explicitly defined as in scope. |
| Implementation & Configuration | Implementation and/or configuration Azure tenants are out of scope. Implementation and/or configuration of on-premises infrastructure is out of scope. |
| Application Design | Guidance related to re-designing, modernizing, or refactoring specific existing applications is out of scope. |
| Performance Testing | Any form of application performance testing |
| ChatGPT model fine-tuning | Fine-tuning of the OpenAI ChatGPT base model is out of scope. |
| Data Security | Row level security of data in Azure Cognitive Search is not in scope. If needed security trimming can be added to the filters |
| Automation Environments | Setting up Azure Dev OPS automation environment is not in scope |
| UI/UX enhancements | Any UI/UX enhancements to Link Clause IQ application |

## Technology requirements

The products and technology listed in the following table are required for the engagement. Contoso Inc is responsible for obtaining all licenses, products, or subscriptions. This list is subject to change based on adjustments made to desired outcomes or the direction of the engagement.

| Product and technology item | Version | Ready by |
| --- | --- | --- |
| Microsoft Azure subscription | Not applicable | Start of engagement |
| Azure DevOps or GitHub | Not applicable | Start of engagement |
| Azure AI Service | Not applicable | Start of engagement |
| Azure OpenAI | Not applicable | Start of engagement |
| Azure Databricks | Not applicable | Start of engagement |
| Azure App Service | Not applicable | Start of engagement |
| Azure Function Apps | Not applicable | Start of engagement |
| Azure Machine Learning | Not applicable | Start of engagement |
| Azure Storage Account | Not applicable | Start of engagement |
| Azure Key Vault | Not applicable | Start of engagement |
| Log Analytics/Application Insights | Not applicable | Start of engagement |
| Service Bus | Not applicable | Start of engagement |

## Environment requirements

Contoso Inc will supply and maintain the development environment used for the development and delivery lifecycle during this engagement. Contoso Inc will obtain the required Azure and GitHub Co-Pilot access and provide Microsoft with the Azure resource access to conduct the required development work.

| Environment | Location | Responsible for configuration and maintenance | Subscription ownership | Ready by |
| --- | --- | --- | --- | --- |
| Development and Test | Microsoft Azure | Customer | Customer | Start of engagement |
| Production | Microsoft Azure | Customer | Customer | Sprint 4 |

# Definitions and acronyms

The following table lists terms and acronyms used in this document.

| Term/acronym | Description |
| --- | --- |
| Backlog | The set of epics, features, and user stories that are prioritized and assigned to resources during sprints to direct the effort of the feature teams to work toward Customer outcomes and desired business value. |
| BWBM | Black and white box monitoring: Blackbox monitoring: testing externally visible behavior as a user would see it. Whitebox monitoring: monitoring based on metrics exposed by the internals of the system, including logs, interfaces like the Java virtual machine profiling interface, or an HTTP handler that emits internal statistics. |
| CPM | Consulting product manager. The role assigned to lead a feature team. Responsibilities are outlined in the Feature team section of this document. |
| DOD | Definition of Done |
| DOR | Definition of Ready |
| Informal knowledge transfer | The exchange of information between Microsoft staff and Customer staff as they work together on the engagement. |
| OKRs | Objectives and key results. A set of measurable goals and metrics used to track progress toward reaching valued business outcomes. |
| ORC | Operational readiness criteria. Criteria used in the review where customers have a base set of monitors, logs, runbooks, UAT, security, and scans needed to place a service into use (“PoC readiness review”).  Services deemed business critical also include availability and reliability measurements (availability and serviceability, at a higher level). |
| PBI | Product backlog item. An item tracked in DevOps. Also known as a “work item.” Typically, these items can be individual tasks, stories, epics, features, or other custom items as defined for a particular engagement. |
| Product increment | Depending on the type of engagement, a “product increment” can be any combination of the following (but not limited to): documentation of standards, policies, and procedures; landing zones; security templates; operational playbooks; or user stories completed within a sprint. |
| SLI | Service level indicator |
| SLO | Service level objective |
| SME | Subject matter expert. A person with specific knowledge or expertise in a particular area. For example, a security SME, or database SME. |
| SOW | Statement of Work |
| Sprint planning | A single meeting will be held at the start of each sprint to review and assign PBIs that meet the Definition of Ready that will be delivered during the sprint. In some exceptional cases, planning may extend past the first day. The feature team will attend, along with key stakeholders. |
| Sprint retrospective | A single meeting will be held at the end of each sprint to give the feature team an opportunity to review its performance and implement improvements for subsequent sprints. Identified improvements can be made during subsequent sprints. The feature team will attend with key stakeholders, if desired. |
| Sprint review | A single meeting will be at the end of each sprint to evaluate the progress and update the product backlog if needed. The feature team will attend along with key stakeholders. |
| UAT | User acceptance testing |
| MVP | Minimum Viable Product |
| ESWO | Enterprise Services Work Order |

# Delivery approach, completion, and timeline

This engagement uses an agile approach based on the scrum framework for delivery. The goal of each delivery sprint is a product increment that can be released to a PoC environment (see explanation of “product increment” in the Definitions and acronyms section).

The goal should be to establish release capability as soon as possible. Determine an agreeable timeline with Contoso Inc and update the timeframe above.

## Sprint process

- The current Sprint process shall be applied as per Phase 1. Sprints will run in 2-weekly cycles.
- ADO will be leveraged to manage the backlog and reporting.
- A sprint report shall be produced at the end of each sprint.
At the end of each sprint, the Project Manager and applicable Customer decision makers will review the progress made against the objectives to determine if any adjustments need to be made using the change management process.

## Engagement initiation

At the beginning of the engagement, the following tasks need to be completed before the start of product baseline planning.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Conduct a pre-initiation call or meeting to initiate team formation and communicate expectations. Document the engagement launch prerequisites. Track the status of launch prerequisites and adjust the start date for product baseline planning accordingly. Conduct a detailed walk-through of the SOW with Contoso Inc to agree on an initial engagement schedule and approach. Help Contoso Inc identify the required roles, stakeholders, and names for the initial feature teams. Initiate orientation of Microsoft resources to Contoso Inc environment |
| Customer activities The activities to be performed by Contoso Inc | Attend and participate in the pre-initiation call. Assign engagement initiation and launch prerequisite responsibilities to accountable Customer leadership and establish target completion dates. Attend the engagement initiation and complete the launch of prerequisites. Staff the engagement with the required Customer personnel in the time frames agreed upon in the pre-initiation call. Own and complete any orientation requirements for Microsoft resources within Contoso Inc environment. |

## Product baseline planning

The feature team will conduct product baseline planning during a mutually agreed-upon timeframe to construct the initial product backlog and high-level architecture. At the completion of this exercise, the outcomes, assumptions, and dependencies will be verified.

Should there be any material deviations from the initial estimated capacity, these and their implications will be discussed. Any changes will be addressed through the change management process.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Work with Contoso Inc to identify the stakeholders and subject matter experts (SMEs) that will function as a feature team. Conduct workshops as required with Customer stakeholders and SMEs. Collaborate with Contoso Inc to: Determine sprint duration and sprint capacity. Review the desired outcomes and define OKRs. Create a problem statement by defining the goal for the overall solution. Create vision statements by defining functional or behavioral requirements for the overall solution. Define personas and user journeys by determining how users currently operate, and how they plan to operate going forward. Define epics and features by creating a workstream broken down into subtopics and action items. Collaborate with the Project Manager to create a proposed backlog, including non-functional requirements for the first release, and a set of user stories ready for sizing, design, and development. Identify impediments to efficient development, including areas that require more elaboration, like proofs of concept or other architectural discovery tasks. Define a test strategy, plan, and automation pipeline for all in-scope testing defined in the Testing and defect remediation section. |
| Customer activities The activities to be performed by Contoso Inc | Determine who is responsible for environment setup and operations. Identify a solution owner or sponsor who is empowered to make business prioritization decisions and act as a single point of contact for questions about requirements. Identify Customer team members who will be available for the duration of the engagement. Allocate roles to be filled by Contoso Inc. Attend and participate in the workshop sessions to define the user stories. Provide updated background information, documentation, and business requirements. Help remove any impediments. Identify all security procedures and policies that the Microsoft team must comply with and follow. |
| Key assumptions | Customer representatives (especially the solution owner or sponsor) will be available throughout the duration of the workshop. Personnel assigned to key roles are available and knowledgeable about their product. The backlog will be refined during product baseline planning, which may result in changes to the overall scope and changes to required capacity. |

## Delivery sprints

Each delivery sprint will last no longer than two weeks. The final duration for sprints will be determined in collaboration with Contoso Inc during product baseline planning. A typical list of activities is provided below. Microsoft and Contoso Inc will review delivered outcomes after every sprint to determine whether updates are needed to the backlog or outcomes.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | On the first day of the sprint, conduct sprint planning. Determine whether sufficient information is available for each user story or product backlog item (PBI). An item will be flagged if more clarification is needed. If clarification is not provided, it may be deferred to later sprints. Determine whether the PBIs assigned to a sprint can be completed within that sprint based on available capacity and interdependencies with other PBIs. Conduct and participate in daily scrum meetings. Work collaboratively to design and plan for the implementation of the PBIs. Create and perform unit, functional, and system tests. Regularly update the remaining effort estimate for PBIs based on the development progress, dependencies, and architectural constraints or needs. Explore external dependencies and determine approaches to handle mismatches in SLOs. Review and refine the risk list. Provide PBI completion and capacity burn down analysis in a weekly cadence to refine PBI assignments and help to optimize engineering resources.  At the end of a sprint, conduct a sprint review and sprint retrospective. |
| Customer activities The activities to be performed by Contoso Inc | Attend and participate in daily scrum meetings, if necessary. Help refine PBIs and provide timely clarifications. Provide updated background information, documentation, and business requirements. Collaborate with Microsoft to update the product backlog for future sprints. Help remove any impediments. Support the Microsoft team with deployments to the agreed-upon environments. Attend Sprint reviews and provide feedback. |
| Key assumptions | Customer representatives, especially the product manager, will be available throughout the duration of the sprint. The product backlog will be updated as required in each sprint, which may result in changes to the overall scope and changes to required capacity. |

## Testing and defect remediation

Testing

The following kinds of testing are included in the engagement.

| Test type | Description | Responsibility | Responsibility | Responsibility |
| --- | --- | --- | --- | --- |
| Test type | Description | Has responsibility for testing? | Provides test data and test cases | Provides guidance and support |

| Code functions unit testing | The feature team tests the functions used in the code to determine correctness. | Microsoft | Microsoft | Customer |
| --- | --- | --- | --- | --- |
| Data validation testing | Testing to make sure the data conforms to the expected schema and distribution. | Microsoft | Customer | Customer |
| User Acceptance Testing | UAT will be conducted over the course of the project according to the UAT timeframes agreed upon during Product baseline planning. Feedback from UAT (defects or new user stories) will inform the prioritization of product backlog items. | Customer | Customer | Microsoft |

Defect remediation

If possible, defects found by the feature team during a delivery sprint are fixed within the sprint itself. Defects that cannot be resolved during the sprint will be added to the product backlog. Defects found elsewhere will be prioritized by Contoso Inc and become part of the product backlog for the feature team.

## Sprint completion

Sprints will end based on the calendar schedule defined during product baseline planning. At the conclusion of each sprint, feature teams will conduct a sprint review and sprint retrospective. During the sprint review, completed work will be demonstrated. At the end of each sprint, Microsoft will provide a sprint completion report. Backlog items do not require formal sign-off or Customer acceptance when they are completed by the feature team.

## Timeline

The timeline for this engagement is relative to the engagement start date. All dates and durations provided are estimates only. The specific timeline will be finalized during product baseline planning and will be updated as part of core engagement planning activities.

Microsoft will provide the Microsoft team described in the Engagement organization section for the term specified in the WO or until the capacity defined in the WO is consumed. The Microsoft team will work on the most important outcomes specified by Contoso Inc as described in the Engagement outcomes section.

The proposed engagement is estimated to have a duration of 16 weeks, with the high-level timeline depicted as follows.

# Engagement organization

## Engagement staffing

The role descriptions for each area in the engagement organization are shown in the roles and responsibilities table in the sections that follow. The capacity available for each Microsoft resource is specified in the WO. If more resource capacity of any role is needed, it can be added through the change management process.

## Feature team

Following the scrum model, Microsoft uses a feature team approach to deliver an engagement. All scrum roles will be represented within the feature team. This team is an autonomous and empowered unit that has all the capabilities to design, develop, test, and release features to achieve Customer outcomes.

The roles listed below are typical and representative for feature teams, though they may differ, depending on the engagement. The skill sets of the engineers will also be different, depending on the engagement.

| Role | Responsibilities/notes | Responsible party |
| --- | --- | --- |
| Delivery Management Executive (DME) | Serves as the single point of contact and is accountable for delivery service. Serves as an escalation point for delivery issues to Microsoft senior leadership. Drives Customer satisfaction – both what is being delivered, and how it is being delivered. Leads engagement quality reviews with Contoso Inc executive sponsor to assist with conditions of satisfaction. | Microsoft |
| Project Manager | Manages and coordinates the overall Microsoft engagement and delivers it on schedule. Takes responsibility for Microsoft resource allocation, risk management, engagement priorities, and communication to executive management. Coordinates decisions within three (3) business days, or according to an otherwise agreed-upon timeline. | Microsoft |
| Architect | Lead discovery presentations and lab as well as  final presentation sessions. Provides technical oversight. Responsible for  Overall solution design. Verify whether Microsoft-recommended practices  are being followed. Partner with your Product Owner to define user  stories. | Microsoft |
| Data Scientist(s) | Responsible for the design and implementation of prompt construction and the orchestration layer Responsible for deploying end to end PoC solution | Microsoft |
| Data Engineer | Data movement, cleaning and shaping data Implement ETL processes Data Modeling | Microsoft |
| Application Development and Infrastructure Engineer(s) | Partner with your Product Owner to define user  stories. Take responsibility for implementation and  contribute to solution design. Provide the required skills in the following areas:  Open AI Service, Azure Data, Azure application  development, Azure Infrastructure . The team skills mix will vary throughout  engagement, depending on needs | Microsoft |
| Technical Architect /Lead | Provides ongoing guidance to the Microsoft feature teams. Serves as Contoso Inc operations lead, responsible for application, cloud operations and governance. Participate in all sprint reviews. Responsible for environment creation. Provides access to Microsoft resources. Participate in Security reviews Serves as the technical lead for the solution from customer. Provides Contoso Inc technical standards to Microsoft Delivery team. Works closely with Microsoft engineers and architects. | Customer |
| Functional Subject Matter Experts | Provides ongoing guidance to the Microsoft feature teams on Functional requirements and business context Takes responsibility for validating the quality and functionality of the product increment. Takes responsibility for validating the output from the application service | Customer |
| Project manager | Oversees and coordinates the overall engagement and delivers it on schedule. Oversees Contoso Inc resource allocation, risk management, engagement priorities, and communication with executive management. Coordinates decisions within three business days, or according to an otherwise agreed-upon timeline. Communicates the engagement efforts and activities to Contoso Inc Executive Committee members and stakeholders. | Customer |
| Business stakeholders | Provides direction on business outcomes. Maintains communication with Customer personnel assigned to feature teams (for example, SMEs). | Customer |
| Product Manager | Owns the MVP as a product and helps prioritize the features for MVP Brings in functional expertise to guide the team | Customer |
| Technical Subject Matter Experts | Application and Data Engineers to work with the Microsoft team, participate in sprints and support with application integration and engineering effort. | Customer |

# Engagement governance

The governance structure and processes the team will abide by for the engagement are described in the following sections.

## Engagement communication

- A cadence has already been determined with Contoso Inc. The following shall apply:
- Status calls – weekly, every Friday.
- Steering committee meetings – Every 2nd Wednesday, where Microsoft COE will represent.
- Scrum calls – every alternate day.
- Sprint demos – at the end of every sprint, held every 2nd Fridays.
- Sprint planning sessions – every 2nd week, before commencement of next sprint.

## Risk and issue management

- The same process shall apply as per AI Driven Contract Pricing SOW V1.2.1 (Phase 1).
Active issues and risks will be monitored and reassessed every week.

## Change management process

- The same process shall apply as per AI Driven Contract Pricing SOW V1.2.1 (Phase 1).

## Escalation path

- The same process shall apply as per AI Driven Contract Pricing SOW V1.2.1 (Phase 1).

## Engagement completion

Microsoft will provide Services defined in this SOW to the extent of the fees available and the term specified in the WO. If additional Services are required, the change management process will be followed, and the contract modified. The engagement will be considered complete when at least one of the following conditions has been met:

- All available capacity has been utilized for Services delivered.
- The term of the engagement has expired.
- All Microsoft activities and PBIs have been completed.
- The WO has been terminated.
Due to the nature of agile delivery, not all backlog items or outcomes may be completed during the engagement.

# Customer responsibilities and engagement assumptions

## Customer responsibilities

Contoso Inc is responsible for:

- Providing accurate, timely, and complete information within three business days or as mutually agreed upon.
- Providing access to people, including knowledgeable Customer personnel and business users as required.
- Providing sufficient Customer resources with the requisite skills for testing during the engagement.
- Managing all Customer personnel and vendors who are not managed by Microsoft.
- Managing external dependencies for related engagements or programs.
- Confirming regulatory compliance, if applicable.
- Providing standard product training for external systems as required.
- Overseeing organizational change management:
- Redesigning or re-engineering business processes.
- Designing or redesigning the functional organization.
- Planning or undertaking user communications.
- Other general Customer responsibilities:
- Contoso Inc first responder organization is responsible for initial triaging after all releases.
- Providing application support.
- Fixing bugs and troubleshooting problems that are related to applications or other third-party software, hardware products, or applications that are not explicitly mentioned as being in scope.
- Preparing documentation about processes, standards, policies, and existing guidelines.
- Designing, configuring, integrating, deploying, or fixing issues in commercially available third-party software.
- Implementing modifications to third-party systems and external interfaces to support integration.

## Engagement assumptions

The following are assumptions that apply to this engagement between Customer and Microsoft. During the engagement, the information and assumptions in this document will be validated, and if a material difference is present, this could result in Microsoft initiating a change request to cover additional work or extend the engagement duration.

- Workday:
- The standard workday for the Microsoft feature team is between 9 AM and 6 PM, Monday through Friday, local time where the team is working.
- Remote work:
- The Microsoft feature team will perform Services remotely.
- The place of performance under the SOW may be at a Microsoft facility, Contoso Inc facility, a US government facility, or various remote and off-site locations (including Microsoft employee home offices).
- In the event resources are required to be on site, a change request will be required and will follow the change management process as outlined in section 5.3 of this Statement of Work.
- Language:
- All engagement communications and documentation will be in English.
- Staffing:
- If necessary, Microsoft will make staffing changes. These may include, but are not limited to, resources and engagement roles.
- Informal knowledge transfer:
- No formal training materials will be developed or delivered as part of this engagement.  All information transfer will be through informal knowledge transfer.
- Known standards:
- Microsoft expects to use Azure DevOps, Azure Pipelines for a standard delivery.
- Time will be required to learn Customer tooling if there are deviations from Microsoft standards. This time has not been included in engagement estimates.
- Microsoft will use standard Azure DevOps process templates as well as other IP designed to speed up delivery, including, but not limited to, standard work items, pipelines, and document templates.
- Other assumptions:
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
- Azure services and technology
- Azure services and Azure-supported Microsoft technologies will be used to develop the solution.
- The components to be developed by Microsoft will be cloud-hosted.
- Microsoft will not modify any existing code base that was not produced by the Microsoft team.
- Azure DevOps or GitHub
- Customer will provide an Azure DevOps/GitHub that is accessible by all team members.
- If Contoso Inc approves a solution design that uses a product that is not generally available, Contoso Inc acknowledges this, and accepts that it may affect the engagement cost and timeline.
- When Contoso Inc determines that Microsoft or its account agents will have access to personal, identifiable information (PII), Contoso Inc is obligated to inform Microsoft within 7 days that further access to that information requires the use of equipment owned or supplied by Contoso Inc.
- Engagements which include AI
During the course of the engagement under this SOW, if the requested business outcome includes Microsoft developing or deploying an AI System for or with Customer which may be considered a sensitive use, Microsoft will conduct an internal responsible AI review, to include assessment of and requirements for potential sensitive use. The outcome of the review will be discussed with Contoso Inc and Microsoft will act in compliance with its responsible AI principles, including making any required modifications. For more information about Microsoft’s responsible AI principles please refer to https://aka.ms/RAI

- Input data quality dictates the quality of OpenAI model performance, including the efficacy of the constructed prompts.
- Machine learning/artificial intelligence assumptions
- Since the data science implementation is a discovery exercise, it is possible to iterate many times over the data science process (business understanding, data preparation, model training etc.) in each sprint. The data scientist will communicate the status to the project manager and Contoso Inc.
- The desired accuracy level of a custom or pre-trained AI/ML model will be defined during the business understanding step. No guarantee can be made on whether the model will reach the desired accuracy range. Based on the data exploration and modeling exercises, the data scientist will communicate and explain the result of the AI/ML model to Contoso Inc.
- Data source characteristics, such as security, format, size, and connection string, among others, will be identified during the business understanding step (during engagement baseline planning or sprint delivery), and the implementation of any data pipeline will be time-boxed to the iteration duration.
- All aspects related to data quality are the responsibility of Contoso Inc.
