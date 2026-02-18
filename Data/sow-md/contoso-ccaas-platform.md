# SOW-Contoso_CCaaS_Intelligent_Platform_v1

Contact Center as-a-Service (CCaaS) Intelligent Platform

Prepared for:

Contoso Inc

Prepared by:

Microsoft

Date: August 8th, 2024

Version: 5.0

This Statement of Work (SOW) and any exhibits, appendices, schedules, and attachments to it are made pursuant to Work Order (WO) 6CAN231-413933-518944 and describes the work to be performed (“Services”) by Microsoft (“us,” “we”) for Contoso Inc (“Contoso Inc”, “Customer,” “you,” “your”) relating to CCaaS Intelligent Platform (“engagement”).

This SOW and the associated WO expire 30 days after their publication date (date Microsoft submits to Contoso Inc) unless signed by both parties or formally extended in writing by Microsoft.

# Introduction

Microsoft has collaborated with Contoso Inc to create a set of strategic objectives that span several horizons. To continue their journey of continuously improving their customer’s experience, Contoso Inc has asked Microsoft to help facilitate one of its major objectives of understanding insights from Contact Center interactions at scale and do so by implementing a user-friendly interaction platform.

This objective will be realized by providing a product team that can define a product vision and strategy with clear outcomes and measures of success, objectives, and key results (OKRs), and deliver solutions that realize those outcomes for Contoso Inc. The product team will carry out product baseline planning to determine the strongest potential solutions to deliver the agreed outcomes and then rapidly prove or disprove the hypothesis behind those solutions. In this way, the team will continually test and learn to focus on the ideal solution that delivers the required transformation.

# Engagement overview

## Customer desired business outcomes

Contoso Inc Bank desires to gain further insights and analysis into their customer calls where a customer speaks to an agent. Today all the analysis is being done manually by managers and analysts picking random calls. They have no visibility across the broader set of activities that may be happening across the different LOBs leveraging contact centers at Contoso Inc.

The main objectives of this desired analysis are:

Integrate on-prem telephony with agent desktop providing real-time agent assist capabilities including speech to text transcription, sentiment analysis, PII/PCI redaction and call summarization.

Identify complaints real time and analyze the complaint category and root cause for post call analysis.

- Identify broader trends.  Contoso Inc will use this to update interaction points across the bank, including digital channels, branches, and contact center; update agent and back-office procedures, etc.
Agent Insights. System will proactively detect call intents and surface relevant information regarding authentication, process, upsell opportunities, de-escalation and next steps.

- Enterprise Search and Knowledge Mining. Agents can search for information regarding compliance, procedures, etc. reducing average handle time and improving customer experience

An AI-based solution is needed to automate this process, saving valuable employee time, providing insights into call recordings to ensure quality, compliance, and customer satisfaction. This SOW articulates our approach to providing a contact center Intelligent Platform.

Contoso Inc has expressed the desire to obtain the following business outcomes. The agile delivery approach (described in the Delivery approach, completion, and timeline section) allows Contoso Inc to continually adjust and adapt the outcomes and direction of any solutions designed to reach said outcomes. Microsoft will continue its efforts based on the priorities and direction provided by Contoso Inc until such time as all capacity has been consumed.

| Contoso Inc’s Desired outcomes | Assumptions |
| --- | --- |
| Implementation of CCaaS Intelligent Platform based on the Microsoft Interactive Analytics Platform (IAP) solution | Contoso Inc will provision all necessary environments (Dev, Test and Prod) including services certification. Dev environment will be ready at the start of the engagement. The test environment will be ready 4 weeks after the start of the engagement. All Azure services listed in section 1.2 are available at the start of the engagement and certified in production 4 weeks after the start of the engagement. All data required for CCaaS Intelligent Platform is available in the Azure Contoso Inc subscription and is accessible directly from telephony call streams Data Models and schema descriptions and joining logic should be provided for all data required for the CCaaS Intelligent Platform. |
| Realtime Transcription of English and (Canadian) French call recordings | Azure Cognitive Services Speech to Text service will be used for transcription  Pursuit of high accuracy levels is undertaken outside of this engagement jointly by Microsoft and Contoso Inc, supported by Contoso Inc’s Microsoft Account Team. |
| Redaction of PII/PCI data in transcribed call recordings | Azure Cognitive Services for Language or Presidio will be used for data redaction. Supported entity categories and redaction quality provided by Azure Cognitive Services for Language will be used PCI data is defined as credit card numbers, credit card security codes, credit card expiry dates, and bank account numbers. |
| Automated sentiment analysis for both caller and agent on transcribed call recordings | Azure AI Services Text Analytics service will be used for sentiment analysis. |
| Intent recognition on transcribed call recordings | Azure AI Services will be used to derive intent. Intents, entities, and utterances are to be provided by the Contoso Inc team to the Microsoft team to derive intent from the transcribed calls. |
| Agent Assist Copilot | Interactive chatbot for agents to search on policies and procedures Azure AI services (Azure Open AI) and Azure AI search will be used |
| Proactive intent analysis and automated agent insights | Automatically analyze call intent and surface insights regarding policies, procedure, de-escalation, customer upsell, next steps ,etc. |
| AI-based quality monitoring for complaints and compliance | Azure AI Services will be used to monitor quality for complaints and compliance. Intents, entities, and utterances are to be provided by the AI team to the Microsoft team to monitor compliance. Custom model and related artefacts in Azure AI Services will used |
| Call summarization | Summarize the call with relevant information and next steps for wrapping up the call procedures |
| Friendly user interface, available in English and (Canadian) French languages, supporting Single Sign-On (SSO) for Azure Active Directory | IAP default user interface will be provided. Translations from English to Canadian French to be provided by the Contoso Inc team. |
| LLMOps | Framework for experimenting, evaluation and monitoring model performance |

If more capacity is needed to deliver the desired business outcomes or if additional outcomes need to be defined, the change management process (cf. 5.3) will be followed to increase capacity.

## Technology requirements

The products and technology listed in the following table are required for the engagement. Contoso Inc is responsible for obtaining all licenses, products, or subscriptions. This list is subject to change based on adjustments made to desired outcomes or direction of the engagement.

| Product and technology item | Version | Ready by |
| --- | --- | --- |
| Microsoft Azure subscription | Not applicable | Start of engagement |
| Microsoft Azure Datalake | Gen2 | Start of engagement |
| Microsoft Azure SQL Database | Not applicable | Start of engagement |
| Microsoft Azure App Services | Not applicable | Start of engagement |
| Azure Cognitive Search | Not applicable | Start of engagement |
| Azure Cognitive Services for Language, Speech To Text, Text Analytics | Not applicable | Start of engagement |
| Azure Open AI | Not applicable | Start of engagement |
| Azure APIM | Not applicable | Start of engagement |
| Azure Virtual Machine | Not applicable | Start of engagement |
| Azure Event Hubs | Not applicable | Start of engagement |
| Azure Key Vault | Not applicable | Start of engagement |
| Azure Kubernetes Service | Not applicable | Start of engagement |
| Microsoft Power BI | Pro or Premium licensing | Start of engagement |
| Azure Functions | Not applicable | Start of engagement |
| Microsoft Azure DevOps or equivalent | Not applicable | Start of engagement |
| Azure Data Factory | V2 | Start of engagement |
| GitHub, Bitbucket or equivalent | Not applicable | Start of engagement |
| Jenkins (CI/CD) | Current | Start of engagement |
| Terraform cloud/enterprise (IaC) | Current | Start of engagement |

## Environment requirements

Contoso Inc will supply and maintain all environments used for the development and delivery lifecycle during this engagement. Contoso Inc will obtain the required Azure subscriptions and provide Microsoft with administrative control to build the development and test environments, as needed.

| Environment | Location | Responsible for configuration and maintenance | Subscription ownership | Ready by |
| --- | --- | --- | --- | --- |
| Automation environment | Azure DevOps, GitHub or equivalent, Terraform cloud/enterprise, Jenkins | Contoso Inc | Contoso Inc | Start of engagement |
| Development | Microsoft Azure | Microsoft | Contoso Inc | Start of engagement |
| Test (Pilot) | Microsoft Azure | Contoso Inc | Contoso Inc | Before Sprint 3 |
| Production | Microsoft Azure | Contoso Inc | Contoso Inc | Before deployment to production |

## Exclusions

Any area not explicitly included in the sections above describing the outcomes and requirements will not be provided by Microsoft during this engagement.  Exclusions from the services provided by Microsoft for this engagement are listed in the following table.

| Area | Description |
| --- | --- |
| User Communications | Microsoft will not be handling user communications |
| On-prem streaming services | Contoso Inc will be deploying and managing the on-prem non-Microsoft streaming services like kafka, etc that don’t get deployed in Azure or AKS |
| Express Route and Onprem/Azure networking | Contoso Inc will own onprem to Contoso Inc azure tenant networking setup |
| Call Acquisition and Data Ingestion | Call acquisition (SIP-REC fork, gRPC, etc) are out of scope for this engagement. Contoso Inc will enable streaming access to live call audio stream. Contoso Inc will also stream relevant metadata (provider key, interaction id, etc.) from Genesys telephony. For production pilot we can alternatively consider streaming from agent desktop microphone. This would require a client application to be installed and managed on agent desktops |
| Azure services certification efforts | Microsoft will not be assisting with the efforts to certify Azure services as part of this engagement. All Azure services required are expected to be certified before the beginning of the project. |
| Upgrading internal analytics frameworks and patterns | Microsoft will not be making changes to existing analytics frameworks at Contoso Inc. |
| Hardware | Microsoft will not provide hardware for this engagement. |
| Product licenses and subscriptions | Product licenses (Microsoft or non-Microsoft) and cloud service subscriptions are not included, unless otherwise noted in section “Technology requirements.” |
| Product bugs and upgrades | Product upgrades, bug, and design change requests for Microsoft products. |
| Training | Formal user training or the creation of training materials. |
| Deployment, installation, configuration, and testing | The following items are not included: Installation, configuration, and testing of non-Microsoft software other than software identified as within scope. Testing and configuration of applications and services outside of those required to support the deployment of the solution. |
| Network and storage | Troubleshooting or remediation of existing network and storage systems is not in scope. |
| Data Cleansing | Data Cleansing is out of scope if data cleansing is not performed by the data contracting, data quality or data reconciliation within shared data services, except for the data cleansing included as part of data quality capability. |
| Process reengineering | Redesign or re-engineering of Contoso Inc’s business processes is not included. |
| Organizational design | Designing—or redesigning—Contoso Inc’s functional organization. |
| Source code review | Contoso Inc will not provide Microsoft with access to non-Microsoft source code or source code information. For any non-Microsoft code, Microsoft services will be limited to the analysis of binary data, such as a process dump or network monitor trace. |
| Integration with third-party software | Microsoft will not be responsible for integration with third-party software. |
| Data migration | Data migration activities are not in scope for this project. |
| Application security code review | Security code review of an application or applications outside of the current projects scope. |

# Definitions and acronyms

The following table lists terms, initialisms, and acronyms used in this document.

| Term/acronym | Description |
| --- | --- |
| Backlog | The set of epics, features, and user stories that are prioritized and assigned to resources during sprints to direct the effort of the feature teams to work toward Contoso Inc outcomes and desired business value. |
| BWBM | Black and white box monitoring. Blackbox monitoring: testing externally visible behavior as a user would see it. Whitebox monitoring: monitoring based on metrics exposed by the internals of the system, including logs, interfaces (like the Java virtual machine profiling interface), or an HTTP handler that emits internal statistics. |
| CPM | Consulting product manager. The role assigned to lead a feature team. Responsibilities are outlined in the Feature team section of this document. |
| BOR zone | Book of Records zone |
| DOD | Definition of Done |
| DOR | Definition of Ready |
| IAP | Interaction Analytics Platform |
| Informal knowledge transfer | The exchange of information between Microsoft staff and Contoso Inc staff as they work together on the engagement. |
| OKRs | Objectives and key results. A set of measurable goals and metrics used to track progress toward reaching valued business outcomes. |
| ORC | Operational readiness criteria. Criteria used in the review where customers have a base set of monitors, logs, runbooks, user acceptance testing (SIT), security, and scans needed to place a service into use (“production readiness review”). Services deemed business critical also include availability and reliability measurements (availability and serviceability, at a higher level). |
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

This engagement uses an agile approach based on the scrum framework for delivery. The goal of each delivery sprint is a product increment that can be released into production (see explanation of “product increment” in the Definitions and acronyms section). Microsoft and Contoso Inc will work together to build a repeatable release capability, operational readiness criteria, and service level objectives with the goal of having an MVP (cf. 3.2).

Microsoft will support Contoso Inc through a warranty period for all deployments executed across the duration of the engagement.

## Sprint process

Microsoft will undertake an iterative delivery approach based on a fixed-capacity, fixed-duration, variable-scope process known as the scrum process (http://scrumguides.org). The key tenets are:

- Joint ownership of decisions
- Short implementation units (sprints)
- Prioritization of business and technical debt objectives in a product backlog
- Time-bound planning for each sprint
- Emphasis on the remaining work
- Sprints that produce a releasable product increment
- Sprint demonstrations that are time-restricted and have regular checkpoints
- Automation approach and pipeline strategy
- Zero downtime deployment strategy
- Retrospective meetings that may be used for course correction

At the end of each sprint, the CPM and applicable Customer decision makers will review the progress made against the objectives to determine if any adjustments need to be made using the change management process.

## Engagement initiation

At the beginning of the engagement, the following tasks need to be completed before the start of product baseline planning.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Conduct a pre-initiation call or meeting to initiate team formation and communicate expectations. Document the engagement launch prerequisites. Track the status of launch prerequisites and adjust the start date for product baseline planning accordingly. Conduct a detailed walk-through of the SOW with Contoso Inc to agree on an initial engagement schedule and approach. Help Contoso Inc identify the required roles, stakeholders, and names for the initial feature teams. Initiate orientation of Microsoft resources into Contoso Inc environment. Define the scope and the timeline of the MVP. |
| Contoso Inc activities The activities to be performed by Contoso Inc | Attend and participate in the pre-initiation call. Assign engagement initiation and launch prerequisite responsibilities to accountable Customer leadership and establish target completion dates. Attend the engagement initiation and complete the launch of prerequisites. Set up steering committee for the engagement and schedule meeting frequency as defined in the communication plan. Staff the engagement with the required Customer personnel in the time frames agreed upon in the pre-initiation call. Own and complete any orientation requirements for Microsoft resources within Contoso Inc environment. |

## Product baseline planning

The feature team will conduct product baseline planning during a mutually agreed-upon time frame to construct the initial product backlog and high-level architecture. At the completion of this exercise, the outcomes, assumptions, and dependencies will be verified.

Should there be any material deviations from the initial estimated capacity, these and their implications will be discussed. Any changes will be addressed through the change management process.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Agile/scrum workshop Work with Contoso Inc to identify the stakeholders and SMEs that will function as a feature team. Conduct workshops as required with Contoso Inc stakeholders and SMEs. Collaborate with Contoso Inc to: Determine sprint duration and sprint capacity. Review the desired outcomes and define OKRs. Create a problem statement by defining the goal for the overall solution. Create vision statements by defining functional or behavioral requirements for the overall solution. Define personas and user journeys by determining how users currently operate, and how they plan to operate going forward. Define epics and features by creating a workstream broken down into subtopics and action items. Define SLOs, SLIs, DOR, DOD, ORC, and BWBM. Collaborate with the CPM to create a proposed backlog, including non-functional requirements for the first release and a set of user stories ready for sizing, design, and development. Identify impediments to efficient development, including areas that require more elaboration, like proofs of concept or other architectural discovery tasks. Define a test strategy, plan, and automation pipeline for all in-scope testing defined in the Testing and defect remediation section of this SOW. |
| Contoso Inc activities The activities to be performed by Contoso Inc | Determine who is responsible for environment setup and operations. Identify a solution owner or sponsor who is empowered to make business prioritization decisions and act as a single point of contact for questions about requirements. Identify the Contoso Inc team members who will be available for the duration of the engagement. Allocate roles to be filled by Contoso Inc. Attend and participate in the workshop sessions to define the user stories. Provide updated background information, documentation, and business requirements. Help remove any impediments. Define a PAT process. Identify all security procedures and policies that the Microsoft team must comply with and follow. |
| Key assumptions | Contoso Inc representatives (especially the solution owner or sponsor) will be available throughout the duration of the workshop. Personnel assigned to key roles are available and knowledgeable about their product. The backlog will be refined during product baseline planning, which may result in changes to the overall scope and changes to required capacity. Security and Monitoring integrations will be managed by Contoso Inc. |

## Delivery sprints

Each delivery sprint will last 2 weeks. The final duration for sprints will be determined in collaboration with Contoso Inc during product baseline planning. A typical list of activities is provided below. Microsoft and Contoso Inc will review delivered outcomes after every sprint to determine whether updates are needed to the backlog or outcomes.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | On the first day of the sprint, conduct sprint planning. Determine whether sufficient information is available for each user story or PBI. An item will be flagged if more clarification is needed. If clarification is not provided, it may be deferred to later sprints. Determine whether the PBIs assigned to a sprint can be completed within that sprint based on available capacity and interdependencies with other PBIs. Conduct and participate in daily scrum meetings. Work collaboratively to design and plan for the implementation of the PBIs. Create and perform unit, functional, and system tests. Identify impediments to engagement delivery progress and how production incidents will be factored into delivery. Regularly update the remaining effort estimate for PBIs based on the development progress, dependencies, and architectural constraints or needs. Explore external dependencies and determine approaches to handle mismatches in SLOs. Review and refine the risk list. Mark PBIs completed that meet the defined DOD (done by the CPM). Provide PBI completion and capacity burn down analysis in a weekly cadence to refine PBI assignments and help to optimize engineering resources. At the end of a sprint, conduct a sprint review and sprint retrospective. |
| Contoso Inc activities The activities to be performed by Contoso Inc | Attend and participate in daily scrum meetings, if necessary. Help refine PBIs and provide timely clarifications. Provide updated background information, documentation, and business requirements. Collaborate with Microsoft to update the product backlog for future sprints. Help remove any impediments. Support the Microsoft team with deployments to the agreed-upon environments. Conduct PAT on completed PBIs according to the PAT cycle defined in the release plan. Identify repetitive items that can be handled via automation. Attend sprint reviews and provide feedback. |
| Key assumptions | Contoso Inc representatives, especially the product manager, will be available throughout the duration of the sprint. The product backlog will be updated as required in each sprint, which may result in changes to the overall scope and changes to required capacity. |

## Testing and defect remediation

Testing

The following kinds of testing are included in the engagement.

| Test type | Description | Responsibility | Responsibility | Responsibility |
| --- | --- | --- | --- | --- |
| Test type | Description | Has responsibility for testing? | Provides test data and test cases | Provides guidance and support |
| Functional testing | Tests performed by a feature team within a delivery sprint to validate that the product features function in accordance with the acceptance criteria defined per PBIs. | Feature team | Feature team | Microsoft |
| Non-Functional testing | Tests performed on the system or components of the system to validate their respective adherence to non-functional requirements in different, expected, operational conditions. These include, but are not limited to, performance, load endurance, and stress testing. These tests should exercise the system or component and results should include metrics gathered from monitoring and other operational observability sources. | Contoso Inc | Contoso Inc | Microsoft |
| System testing | Tests performed to validate that the implemented solution operates as designed, across functionality delivered by different feature teams. | Contoso Inc | Contoso Inc | Microsoft |
| PAT | PAT will be conducted over the course of the engagement according to the PAT time frames agreed upon during product baseline planning (as described in the Product baseline planning section). Feedback from PAT (defect or additional PBIs) and other product backlog items will be prioritized in the product backlog. | Contoso Inc | Contoso Inc | Microsoft |
| Production Verification Testing | Production testing will be conducted on real deployments to validate and measure behavior and performance in the production environment. | Contoso Inc | Contoso Inc | Microsoft |

Defect remediation

If possible, defects found by the feature team during a delivery sprint are fixed within the sprint itself. Defects that cannot be resolved during the sprint will be added to the product backlog. Defects found elsewhere, will be prioritized by the CPMs and become part of the product backlog for the feature team.

## Sprint completion

Sprints will end based on the calendar schedule defined during product baseline planning. At the conclusion of each sprint, feature teams will conduct a sprint review and sprint retrospective. During the sprint review, completed work will be demonstrated. At the end of each sprint, Microsoft will provide a sprint completion report. Backlog items do not require formal sign-off or Customer acceptance when they are completed by the feature team.

## Timeline

The timeline for this engagement is relative to the engagement start date. All dates and durations provided are estimates only. The specific timeline will be finalized during product baseline planning and will be updated as part of core engagement planning activities.

Microsoft will provide the Microsoft team described in the Engagement organization section for the term specified in the WO or until the capacity defined in the WO is consumed. The Microsoft team will work on the most important outcomes specified by Contoso Inc as described in Contoso Inc desired business outcomes section.

The high-level timeline of the engagement is depicted in the following graphic.

# Engagement organization

## Engagement staffing

The role descriptions for each area in the engagement organization are shown in the roles and responsibilities table in the sections that follow. The capacity available for each Microsoft resource is specified in the WO. If more resource capacity of any role is needed, it can be added through the change management process.

## Executive steering committee

The executive steering committee provides overall senior management oversight and strategic direction for the engagement. In addition, it removes obstacles for the engagement team. The executive steering committee for the engagement will meet per the frequency defined in the communication plan and will include the roles listed in the table below.

| Role | Responsibilities/notes | Responsible party |
| --- | --- | --- |
| Executive sponsor | Participates in the executive steering committee. Serves as a point of escalation to support clearing engagement roadblocks. Serves as a final arbiter of engagement issues. Makes decisions about the engagement strategic direction. Approves significant change requests. | Both Contoso Inc and Microsoft |
| Engagement owner | Serves as Contoso Inc single point of contact and is accountable for the engagement. Interacts with executive sponsors from both Contoso Inc and Microsoft. Routinely engages with the Microsoft delivery management executive (DME) or program director. Works to eliminate Contoso Inc-related issues hindering or impeding implementation. | Contoso Inc |
| Delivery Management Executive | Oversees all service delivery engagements with Contoso Inc. Serves as an escalation point for delivery issues to Microsoft senior leadership. | Microsoft |
| Program architect | Serves as the single point of contact and is accountable for service delivery. Serves as an escalation point for delivery issues to Microsoft senior leadership. Drives Customer satisfaction – both what is being delivered, and how it is being delivered. Leads engagement quality reviews with Contoso Inc executive sponsor to assist with “conditions of satisfaction.” Oversees and coordinates the overall Microsoft engagement and delivers it on schedule. Takes responsibility for Microsoft resource allocation, risk management, engagement priorities, and communication to executive management. Coordinates decisions within three business days, or according to an otherwise agreed-upon timeline. | Microsoft |

## Product council

The product council is the primary mechanism for aligning stakeholders and dealing with competing priorities. It acts as the forum where the strategy is agreed upon so that all key decision makers understand what decisions are being made about the direction of the product and why. The product council allows the feature teams to maintain autonomy while simultaneously determining the overall priorities for business outcomes.

Ultimately, the product council is formed to define and share the product strategy and roadmap. It also makes decisions needed to resolve any conflicting product priorities.

In addition to the roles listed below, all product managers and technical leads from the individual feature teams are also members of the product council.

| Role | Responsibilities/notes | Responsible party |
| --- | --- | --- |
| Product manager | Defines the product vision and strategy, including OKRs, to provide clarity, focus, and alignment with strategic Customer priorities and desired business outcomes. Coordinates all activities to meet specific business value-driven requirements. Coordinates with business units for sponsorship and budgeting. Effectively communicates, collaborates, and coordinates with all relevant IT and business stakeholders. Establishes and maintains an effective and functioning internal sourcing and feedback loop process to gather and improve product capabilities. | Contoso Inc |
| Domain Solution Architect | Sets the strategic direction for architecture of the products being developed. Facilitates alignment to desired business outcomes and OKRs for all products. Leads the product council from a technical perspective. Serves as the technical person responsible for user story/PBI backlog decisions during sprint planning and defines validation criteria for work items. Helps the product managers prioritize and manage the product backlog. Facilitates conversations between product stakeholders so that the product managers can make informed decisions. Collaborates with Contoso Inc to define the set of security and data protection principles to which the engagement must adhere. Reviews technical designs from feature teams to determine compliance. | Microsoft |
| Project manager | Oversees and coordinates the overall engagement and delivers it on schedule. Oversees Contoso Inc resource allocation, risk management, engagement priorities, and communication with executive management. Coordinates decisions within three business days, or according to an otherwise agreed-upon timeline. Communicates the engagement efforts and activities to Contoso Inc executive committee members and stakeholders. | Contoso Inc |
| Business stakeholders | Provides direction on business outcomes. Maintains communication with Customer personnel assigned to feature teams (for example, SMEs). | Contoso Inc |

## Feature team

Following the scrum model, Microsoft uses a feature team approach to deliver an engagement. All scrum roles will be represented within the feature team. This team is an autonomous and empowered unit that has all the capabilities to design, develop, test, and release features to achieve Contoso Inc outcomes. A feature team consists of a product manager, scrum master, technical lead, SMEs, and engineers with various development, test, deployment, infrastructure, security, data, and operation skills.

The roles listed below are typical and representative for feature teams, though they may differ, depending on the engagement. The skill sets of the engineers will also be different, depending on the engagement.

| Role | Responsibilities/notes | Responsible party |
| --- | --- | --- |
| CPM (an agile/scrum product owner plus additional responsibilities) | Takes responsibility for the alignment with the strategy and objectives communicated by the product council if one is present in the engagement. Manages and prioritizes the product backlog. Serves as the primary person responsible for user story/PBI backlog decisions during sprint planning. Serves as the single point of contact for decisions about PBIs and prioritization. Defines validation criteria for work items, especially user stories. Actively participates in all sprint ceremonies. Takes responsibility for planning validation testing. Serves as a member of the product council if present. | Microsoft |
| Project manager (Scrum master) | Leads the feature team using a disciplined scrum process. Collaborates closely with Contoso Inc to manage the product backlog and facilitate stakeholder collaboration as necessary. Facilitates the daily standup meetings. Helps the team maintain the burndown chart. Sets up retrospectives, sprint reviews, and sprint planning sessions. Handles interruptions and obstacles that would disrupt the team and its progress during the sprint. Guides product managers through complex or technically complicated user stories. Coaches team members in self-management and cross-functionality. Helps the scrum team focus on creating high-value incremental builds that meet the definition of done. Makes sure that all scrum events take place and are positive, productive, and kept on schedule. | Microsoft |
| Technical lead | Partners with Contoso Inc to understand business needs and solution requirements and assists with technical governance. Helps evaluate implications of trade-off decisions to prioritize product backlog. Serves as a member of the product council. Within the scope of a feature team and for an individual product, serves as the technical person responsible for user story/PBI decisions during sprint planning and defines validation criteria for work items. Facilitates conversations between various product stakeholders so that the product managers can make informed decisions. Facilitates DevOps standardization (for example, DevOps taxonomy and DevOps principles and practices). Provides Contoso Inc with technical advice regarding the Microsoft cloud. Reviews solution architecture and design to identify design-related security issues. Reviews results of security tests performed on a working test environment. | Microsoft |
| Engineer | Takes responsibility for design, implementation of the solution. Participates in all sprint reviews. Note: The mix of feature team engineering skills may vary throughout the engagement, depending on work requirements. | Microsoft |
| DevOps Engineer 1 | Estimated project commitment: full time. Takes responsibility for deployment to PAT and Production following DevOps principles. | Contoso Inc |
| DevOps Engineer 2 | Estimated project commitment: full time. Takes responsibility for deployment to PAT and Production following DevOps principles. | Contoso Inc |
| Test Consultant | Estimated project commitment: full time. Takes responsibility developing and planning test strategy. Performs test performance analysis, test environment assessment and configuration | Contoso Inc |
| SME | Provides ongoing guidance to the Microsoft feature teams. Serves as Contoso Inc operations lead, responsible for cloud operations and governance. Takes responsibility for validating the quality and functionality of the product increment. Participates in all sprint reviews. | Contoso Inc |
| CISO (or delegate) | Reviews and approves the security control framework. | Contoso Inc |

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
- Product manager
- Product council
- Executive steering committee

## Engagement completion

Microsoft will provide Services defined in this SOW to the extent of the fees available and the term specified in the WO. If additional Services are required, the change management process will be followed, and the contract modified. The engagement will be considered complete when at least one of the following conditions has been met:

- All available capacity has been utilized for Services delivered.
- The term of the engagement has expired.
- All Microsoft activities and product backlog items have been completed.
- The WO has been terminated.
Due to the nature of agile delivery, not all backlog items or outcomes may be completed during the engagement. The Microsoft team will rely on the CPM in conjunction with the product council to determine priority of the product backlog so that the important backlog items can be completed during the engagement.

# Customer responsibilities and engagement assumptions

## Customer responsibilities

Contoso Inc is responsible for:

- Providing accurate, timely, and complete information within three business days or as mutually agreed upon.
- Providing access to people, including knowledgeable Customer personnel and business users as required.
- Providing sufficient Customer resources with the requisite skills for testing during the engagement.
- Providing sufficient Customer resources for the engineering roles agreed upon with Microsoft.
- Ensuring that Customer resources assigned to the engagement for the engineering roles agreed upon with Microsoft are dedicated to the engagement and are not pulled away for other activities.
- Providing all requisite information to relevant external parties to obtain clearances for all personnel actively participating in the engagement if security clearances are required.
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

The following are assumptions that apply to this engagement between Contoso Inc and Microsoft. During the engagement, the information and assumptions in this document will be validated, and if a material difference is present, this could result in Microsoft initiating a change request to cover additional work or extending the engagement duration.

- Workday:
- Local Microsoft employees will follow the standard Microsoft (or appropriate subsidiary) workday and work week.
- If Microsoft Global Delivery factories are used, then the following also apply:
- The standard workday for the offshore Microsoft factory team is between 9:30 AM and 6:30 PM India standard time, Monday through Friday, except for scheduled holidays. Limited exceptions can be made with advanced planning to support production-level changes or to address a need that requires a meeting between an offshore resource and Contoso Inc and which cannot be accomplished during the standard workday. Exceptions will be coordinated by the program manager.
- Offshore resources that are not part of the factory will be available between 7 AM and 10 PM India standard time over an eight-hour continuous window.
- Remote work:
- The Microsoft feature team will perform Services remotely.
- Language:
- All engagement communications and documentation will be in English. Local language support and translations will be provided by Contoso Inc.
- Staffing:
- If necessary, Microsoft will make staffing changes. These may include, but are not limited to, resources and engagement roles.
- If a security clearance is required, all resources will have the appropriate level of security access required to complete engagement-related efforts.
- Resource mobilization for staffing the engagement will be 4 weeks.
- Informal knowledge transfer:
- No formal training materials will be developed or delivered as part of this engagement. All information transfer will be through informal knowledge transfer.
- Known standards:
- Microsoft expects to use Azure DevOps, Azure Pipelines and may use GitHub for a standard delivery.
- Time will be required to learn Contoso Inc tooling if there are deviations from Microsoft standards. This time has not been included in engagement estimates.
- Microsoft will use standard Azure DevOps process templates, as well as other IP designed to speed up delivery, including, but not limited to, standard work items, pipelines, and document templates.
- Other assumptions:
- In addition to engagement team members, Contoso Inc shall allow Microsoft internal systems to access the mutually accessible delivery platforms and tools used for this engagement.
- Microsoft will read, store, and share necessary delivery insights on the work artifacts and products generated as part of this engagement (for example, test cases, code base, and pipelines) that are hosted on mutually accessible delivery platforms, like Azure DevOps, Jira, and GitHub.
- Microsoft will make available to Contoso Inc all data and insights gathered during the engagement. Microsoft will purge said data and insights upon explicit Customer request or at the end of the engagement.
- Holidays, vacations, and training time have not been factored into this SOW.
- All work is to be contiguously scheduled. Any breaks in the engagement calendar must be scheduled two weeks in advance, or the time will be billed without interruption.
In the case of a break in the engagement, resources will be released from the engagement and may not be able to be re-engaged on demand. There may also be resourcing delays of up to four weeks when unpausing project delivery.  New resources engaged will also be subject to additional 3-4 weeks of delays for Contoso Inc onboarding and compliance training. If the break is not planned or is longer than two weeks, we will leverage the Change Management.
- Contoso Inc will meet the necessary requirements to help make sure the solution design meets regulatory requirements.
- If localization support is required to support additional languages, it may be added to the product backlog.
- Azure services and technology
- Azure services and Azure-supported Microsoft technologies will be used to develop the solution.
- The components to be developed by Microsoft will be cloud-hosted.
- Microsoft will not modify any existing code base that was not produced by the Microsoft delivery team.
- Azure DevOps
- Either Contoso Inc will provide a Microsoft Azure DevOps services (or equivalent solution) account that is accessible by all team members, or Microsoft will provide an account (possibly with limited Customer access).
- If Contoso Inc approves a solution design that uses a product that is not generally available, Contoso Inc acknowledges this, and accepts that it may affect the engagement cost and timeline.
- When Contoso Inc determines that Microsoft or its agents will have access to personal identifiable information, Contoso Inc is obligated to inform Microsoft within 10 days that further access to that information requires the use of equipment owned or supplied by Contoso Inc.
Any purchased GitHub Consulting Services are provided by GitHub, Inc., a wholly owned subsidiary of Microsoft Corporation.  Notwithstanding anything to the contrary in your Work Order, the GitHub Privacy Statement available at https://aka.ms/github_privacy and the GitHub Data Protection Addendum and Security Exhibit located at https://aka.ms/github_dpa will apply to your procurement of GitHub Consulting Services.
