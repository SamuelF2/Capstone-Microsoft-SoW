# Scope & Approach - Contoso Inc Data Analytics Platform- Foundation v.02 (Ready for Customer Walk Thru)

Data Analytics Platform -Foundation

Prepared for

Contoso Inc – (Contoso Inc)

Prepared by

Microsoft Consulting Services

Shyam Sridhar – Solution Architect

Jeff Wilk - ADE

Date: January 19, 2022

Draft Version: 0.1

# Introduction

Contoso Inc (Contoso Inc) has been on a journey to increase value from data collected over many years as part of its digital transformation goals.

Their current state includes:

- Currently the Integrated Task Matrix (ITM) is managed as Excel files (multiple) in SharePoint sites/folders.
- Information (tasks) are managed within the Excel files using a (mostly) common template structure. The tasks are in a standard row/column format and the team applies various filters to isolate specific data views.
- Often information about the committee, activities, personnel and KPIs are put (manually) into various documents/visuals (E-Binder).
- There has been some work done in creating dynamic Dashboards in Power BI from the Excel files and SharePoint Lists
The data will be utilized for different types of digital transformation initiatives supported by CAF’s, including business self-service access to data and technology, empowering intelligence at edge, and federation (democratization) to the business of centralized data and services.

Defining the foundation: Microsoft Industry Solutions and Contoso Inc, will collaborate develop a backlog of business use cases, objectives and key results (OKRs) and develop a roadmap of shared data service capabilities needed to support use cases enablement beyond the core foundational services included in the IP Jump-Start Kit.  Microsoft and Contoso Inc will also collaborate to assess and develop a backlog to ensure people, process, and change management readiness.

Establishing shared data strategy services: Microsoft Industry Solutions will configure and deploy the existing Data Strategy Accelerator IP Jump-Start Kit of core shared data services building blocks needed for all use cases, including data lake, ingestion, handshaking, control file, and data catalog.

Use-case enablement support: Microsoft will partner with Contoso Inc to provide data strategy subject matter expertise and configuration of IP jump-start kit shared data services to support Contoso Inc use case enablement.

MVP add-on enablement: Microsoft will partner with Contoso Inc to enable one or more Data visualization use cases as part of the data platform exercise

Cloud native solutions are built utilizing the Data Strategy Foundation and are optimized for cloud scale, performance, and agility. They are based on cloud architectures, use managed services, and take advantage of continuous delivery to achieve reliability and faster time to market. The document presents a specific Microsoft point of view for achieving the stated objective.

This objective will be realized by bringing a product team that can define a product vision and strategy with clear outcomes and measures of success (OKRs), and provide solution options that realize those outcomes for Contoso Inc. The project team will carry out Product Baseline Planning to determine the strongest potential solutions to deliver the agreed outcomes and then rapidly prove / disprove the hypothesis behind those solutions. In this way the team will continually test and learn to focus in on the optimum solution that delivers the required transformation to the purchasing experience.

This document focuses on jump-starting Contoso Inc’s EDS using Data Strategy Accelerator. The following provides a high-level overview of what Data Strategy Accelerator entails.

#### IP Jump Start Kit

The IP Jump Start Kit includes data lake, ingestion, handshaking, control file, data catalog and classification, and foundational building blocks. These tools allow Contoso Inc’s EDS to focus on business outcomes and to demonstrate the value back to the organization.

#### Data Strategy workshop

The Data Strategy workshop provides design-led thinking strategies that will help Contoso Inc develop use cases and objectives and key results (OKRs). This workshop will also help Contoso Inc prioritize the shared data service capabilities needed to support Contoso Inc EDS beyond the core services included in the IP Jump Start Kit and to assesses people, process, and change management readiness.

#### Use-case Facilitation

Partner with Contoso Inc to support use-case implementation by providing Data Strategy subject matter expertise and configuring the IP Jump Start Kit shared data services to support use-case implementation.

# Contoso Inc goals and engagement outcomes

## Contoso Inc goals

Contoso Inc’s goals related to this engagement are listed below. These goals are listed for the purpose of providing business context for the engagement and are not statements of services to be performed by Microsoft, nor accountability. The engagement outcomes and services to be performed are described in the rest of this section 1 and the remainder of this document.

| Goal | Description |
| --- | --- |
| Program Office implementation | Program governance that will facilitate confidence in the outcome of the business use cases through consistently measuring and communicating progress on defined OKRs. In addition, support the ability to build the foundation when ready to move to business use-case scaling phases. |
| Data Strategy workshop outcomes | Match use-cases and key outcomes to Data Strategy maturity level while assessing shared data services capabilities, data governance and operations readiness and employee experience readiness. |
| Shared Data Services delivery | Deliver data lake and shared data services to facilitate data as a service and support use cases defined during workshops. |
| Data Platform Architecture: Establish a proposed data hub and/or data warehouse solution to support business data products and advanced analytics | Data Lake, for example, to support data science activities Favor parquet file format for data files. Expose Master data model (“gold” data) to support business data product APIs Identify if a dedicated DataMart/data warehouse would be required to support business data products |
| Data movement: Establish data platform and pipeline solution for gathering and transforming operational data | Solution to accommodate batch and event-driven data movement (pipelines and/or event-handlers) |
| Personalized Dashboards and PowerBI solutions: Showcasing how to create a Power BI dashboard leveraging Web APIs (data products) and target audience data filtering | Recommendations on whether to leverage Web APIs as data sources for PowerBI business analysis Leveraging role-based access to provide personalized dashboards How to categorize data assets/products to support the implementation of role-based data access |

## Engagement outcomes

The engagement will focus on the outcomes described below which will be prioritized based on direction from Contoso Inc. By the nature of agile delivery, all engagement outcomes are not always achieved.  Microsoft and Contoso Inc will regularly review engagement outcome priorities and work together to achieve the most valuable outcomes during this engagement.  The agile delivery approach (described in the Delivery approach section) allows Contoso Inc to continually adapt the engagement outcomes and direction of the solution.

- Leveraging the existing data available to create the following reports:
- Task Allocation (by subordinate organization, including expectations and status)
- Spending Baseline (ensure that the allocated spend by task fits within the current budget)
- Task completion (completed, outstanding, trends over time)
- Financial resource usage (spend/tends against baseline)
- Even if the data continues to be managed in Excel, define a logical reporting data model and process that can be used to provide continuously updated reporting.
- In addition to detailed reporting, provide a dashboard experience to enable exploration of the
data models and enable ad hoc reporting and visualizations.

If more time is needed to deliver the desired engagement outcomes or if new engagement outcomes need to be defined, the Change management process will be followed.

The engagement will focus on the following outcomes:

| Engagement outcomes | Assumptions |
| --- | --- |
| As part of the Data Strategy Program Office provide overall timeline and resource management for successful Data Strategy delivery for Contoso Inc, including tracking and communications. Please see program office specifics in the initial product backlog feature(s) in Exhibits. Review and update as needed, product backlog in Exhibits. | Microsoft assumes Contoso Inc will also have an assigned program management role to act as a single point of contact for Program-related communications and tracking/escalations. The Contoso Inc program manager will engage with the Microsoft delivery program manager to support and facilitate broad communications with key stakeholders and jointly host a steering committee meeting with at least monthly intervals. The high-level backlog of activities will be managed in Azure DevOps. |
| The Data Strategy pre-workshop maturity assessment (selection-based self-assessment), provides an indication of Contoso Inc’s maturity level for the implementation of Data Strategy, and to what level the capabilities defined as shared data services are present within Contoso Inc organization. | Microsoft will provide Contoso Inc with access to this assessment prior to the Data Strategy workshop. Contoso Inc will complete the maturity assessment before the workshop is started by Microsoft. Contoso Inc resources will be available to complete the required activities within the specified timelines. |
| As part of the Data Strategy Workshop, match use-cases and key outcomes to Data Strategy maturity level while assessing shared data services capabilities and data governance and operations as well as people, process, and change management readiness. Please see Data Strategy workshop specifics in the initial product backlog feature(s) in Exhibits. Review and update as needed, product backlog in Exhibits. | Contoso Inc resources will be available to complete the required activities within the specified timelines. |
| Delivery of shared data services backlog to support elements of the Data Strategy framework pillars (preparation, agility, and resilience) to enable identified shared data services from Data Strategy workshop.  Please see shared data services specifics in the initial product backlog feature(s) in Exhibits. Review and update as needed, product backlog in Exhibits. | Contoso Inc resources will be available to complete the required activities within the specified timelines. The shared data services needs will be identified as an outcome of the Data Strategy workshop. |
| Promoting an enhanced employee experience with data for end-users  Please see employee experience specifics in the initial product backlog feature(s) in Exhibits. Review and update as needed, product backlog in Exhibits. | Contoso Inc resources will be available to complete the required activities within the specified timelines. Employee experience needs will be identified as an outcome of the Data Strategy workshop. Employee experience activities align to use cases and shared data services backlog work items as needed to move ahead with use case delivery. |
| Data Visualization backlog creation and backlog delivery to enable identified Power BI Reporting business value. Please see data visualization specifics in the initial product backlog feature(s) in Exhibits. Review and update as needed, product backlog in Exhibits. | Contoso Inc resources will be available to complete the required activities within the specified timelines. Data migration needs will be identified as an outcome of the data analytics assessment and discovery. Available shared data services IP and tooling to be utilized for BI delivery. BI activities align to use cases and shared data services backlog work items as needed to move ahead with use case delivery. |

In addition to the engagement outcomes listed above, the initial product backlog in the Exhibits section will be used as input to Product Baseline Planning.  As with the engagement outcomes, all backlog items will not always be delivered.  The agile delivery approach allows Contoso Inc to prioritize the most valuable backlog items and continually adapt the solution.

## Technology requirements

The products and technology that are listed in the following table are required for the engagement. The Contoso Inc is responsible for obtaining all identified licenses, products, or subscriptions.

| Product and technology item | Version | Ready by |
| --- | --- | --- |
| Microsoft Azure subscription | Not applicable | Start of engagement |
| Microsoft 365 Subscription | Not applicable | Start of engagement |
| Microsoft Azure DevOps | Not applicable | Start of engagement |
| Additional tools and technologies determined during Product Baseline Planning | Not applicable | Start of engagement |

## Environment requirements

All environments used for the development and delivery lifecycle will be supplied and maintained by Contoso Inc. The Contoso Inc will provide the required Azure subscriptions and provide Microsoft with administrative control to build the development and test environments.

| Environment | Location | Responsible for configuration and maintenance | Subscription Ownership | Ready by |
| --- | --- | --- | --- | --- |
| Development | Microsoft Azure | Microsoft or Contoso Inc | Microsoft or Contoso Inc | Start of engagement |

## Exclusions

Any area not explicitly included in the sections above describing the outcomes and requirements will not be provided by Microsoft during this engagement.  Exclusions from the services provided by Microsoft for this engagement are listed in the following table.

| Area | Description |
| --- | --- |
| Hardware | Microsoft will not provide hardware for this engagement. |
| Product licenses and subscriptions | Product licenses (Microsoft or non-Microsoft) and cloud service subscriptions are not included, unless otherwise noted in section “Technology requirements.” |
| Product bugs and upgrades | Product upgrades, bug, and design change requests for Microsoft products. |
| Training | Formal user training or the creation of training materials. |
| Deployment, installation, configuration, and testing | The following items are not included: Installation, configuration, and testing of non-Microsoft software other than software identified as within scope. Testing and configuration of applications and services outside of those required to support the deployment of the solution. |
| Network and storage | Troubleshooting or remediation of existing network and storage systems is not in scope. |
| Data Cleansing | Data Cleansing is out of scope if data cleansing is not performed by the data contracting, data quality or data reconciliation within shared data services, except for the data cleansing included as part of data quality capability. |
| Process reengineering | Redesign or re-engineering of Contoso Inc’s business processes is not included. |
| Organizational design | Designing—or redesigning—Contoso Inc’s functional organization. |
| Source code review | The Contoso Inc will not provide Microsoft with access to non-Microsoft source code or source code information. For any non-Microsoft code, Microsoft services will be limited to the analysis of binary data, such as a process dump or network monitor trace. |
| Integration with third-party software | Microsoft will not be responsible for integration with third-party software. |

# Delivery approach, completion, and timeline

## Delivery approach

General Project Scope

The project may address the following scope areas which may be revised at any time based on direction from Contoso Inc. There may be additional scope not listed in the following list that may be delivered, as well as scope listed that is prioritized low enough that it might not be built due to capacity constraints. By the nature of agile development, scope is variable.  When the resource labor category, capacity and/or duration of the delivery team needs to be amended to deliver the agreed backlog items, Contoso Inc may need to reduce the scope to remain within the project budget. This approach allows Contoso Inc to continually adapt the scope and direction of the solution.

This engagement leverages an agile approach using the Scrum framework. Product Baseline Planning can be performed if a product backlog does not already exist to the level of detail necessary for the team to begin the Delivery Sprints. The goal of each Delivery Sprint is a product increment that can be released into pre-production. Microsoft and Contoso Inc will work together to build a repeatable release capability with the goal of having the initial release of value within 30 days.

### Sprint process

Microsoft will undertake an iterative delivery approach that is based on a fixed capacity, fixed duration, variable-scope process known as the Scrum process (http://scrumguides.org). The key tenets are as follows:

- Joint ownership of decisions.
- Short implementation units (sprints).
- Prioritization of business objectives in a product backlog.
- Time-bound planning for each sprint.
- Emphasis on the remaining work.
- Sprints that produce a working solution.
- Sprint demonstrations that are time-restricted and have regular checkpoints.
- Regular retrospective meetings that may be used for course correction.

At the end of each sprint, the Microsoft Project  Manager and Architect and applicable Contoso Inc decision makers such as the Contoso Inc Project  Manager will review the progress made against the objectives to determine if any adjustments need to be made through the Change management process.

### Engagement initiation

At the beginning of the engagement, the following prerequisites must be completed. These tasks must be completed before Product Baseline Planning.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Conduct a preinitiation call or meeting to initiate team formation and communicate expectations. Document the engagement launch prerequisites using input from this document. Track the status of launch prerequisites and adjust the engagement initiation phase start date accordingly. Conduct a detailed walk-through of this document with Contoso Inc to agree upon an initial engagement schedule and approach. Assist Contoso Inc to start identifying the required roles and stakeholders and names for the initial feature teams.  Initiate onboarding of Microsoft resources onto Contoso Inc environment. |
| Contoso Inc activities The activities to be performed by Contoso Inc | Attend and participate in the preinitiation call. Assign engagement initiation and launch prerequisites responsibilities to accountable Contoso Inc leadership and establish target completion dates. Complete the engagement initiation and launch prerequisites. Staff the engagement with the required Contoso Inc resources in the time frames agreed upon in the preinitiation call. Assist with any onboarding requirements for Microsoft to be able to start. |

### Product Baseline Planning

To balance the change, uncertainty, and need of delivery of business outcome, the engagement will begin with Product Baseline Planning. The feature team will conduct the product baseline planning as a 4-week exercise to build out the initial product backlog and high-level architecture. At the completion of this exercise, the outcomes, assumptions, and dependencies will be verified.

Should there be any material deviations from the initial estimations, these and their implications will be discussed. The impact of such changes will be addressed through the Change management process.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Agile/Scrum workshop  Work with Contoso Inc to identify the stakeholders and SMEs that will function as a feature team. Data Strategy workshop  Microsoft will conduct a maturity assessment during Product Baseline Planning.  The intent of the Data Strategy workshop is to match use-cases and key outcomes to Data Strategy maturity level while assessing shared data services capabilities, data governance and operations readiness and employee experience readiness During the workshop, the team (Microsoft and Contoso Inc) will reach agreement on a shared vision for Data Strategy and the specific scope that will be required to make that vision a reality. The Data Strategy workshop will be four days, 2 hours each day, in duration. Collaborate with Contoso Inc to refine or baseline following the Data Strategy workshop: Review the outcomes, define objectives & key results (OKR). A problem statement – defining the aspirational goal for the overall solution. Vision statements – defining functional or behavioral requirements for the overall solution. Personas / user journeys – how end users currently operate, and how they plan to operate going forward. Epics and features – workstream breakdown into subtopics and action items. User stories/ Product backlog items (PBIs) for the product backlog – a breakdown of action items into consumable tasks that can be delivered during a single sprint. PBIs – for non-functional requirements (e.g. performance, encryption, scalability, etc.) or stories that do not require a user persona. Share/Develop a recommended high-level technical architecture. Collaborate with Contoso Inc Project Manager to create a proposed scope for the first release, including a set of user stories that are ready for sizing, design, and development. Build or validate the initial product backlog. Collaborate with Contoso Inc Project Manager to create a proposed scope for the first delivery sprint, including a set of foundational user stories, of the highest priority, on which other user stories and solutions are dependent. Identify impediments for efficient development, including areas that require more elaboration, like proofs of concept or other architectural discovery tasks. Collaborate with Contoso Inc to create: A definition of ready, which is the criteria that determines when a User Story / PBI that is ready to be developed. A Definition of Done, that is, what constitutes completed user stories. Those criteria will be used by the team to decide when a story is complete. Define a test strategy and plan for all in-scope testing defined in the Testing and defect remediation section. If additional testing is determined as necessary during Product Baseline Planning, it may be added following the change management process. Re-evaluate the estimate of effort after detailing user stories to compare with original estimate and trigger Change Management process as necessary. Collaborate with Contoso Inc on progress tracking and reporting based on the initial backlog of user stories. |
| Contoso Inc activities The activities to be performed by Contoso Inc | Identify a Sponsor who is empowered to make business prioritization decisions and act as a single point of contact for requirements questions. Identify Contoso Inc team members who will be available for the duration of the engagement. Attend and participate in the workshop sessions to define the user stories as necessary. Provide updated background information, documentation, and business requirements. Clarify requirements as needed. Collaborate with Microsoft to create a proposed scope for the first delivery sprint. Provide help removing any impediments. Define a UAT process. Identify all security procedures and policies that the Microsoft Team must comply with. |
| Key assumptions | Contoso Inc representatives (especially the sponsor) will be available throughout the duration of the workshop. Key roles such as Contoso Inc Project Managers and Architects are available and knowledgeable about their product. The backlog will be refined during Product Baseline Planning, which may result in changes to overall scope and changes to required capacity. |

### Delivery sprints

Each delivery sprint will last two (2) weeks. The final duration for sprints will be determined in collaboration with Contoso Inc during Product Baseline Planning. Before sprint planning starts, the Microsoft Project Manager will collaborate with the feature team to create a proposed sprint backlog. This sprint backlog will consist of a set of product backlog items that the feature team estimate may be completed during the sprint.

The first day of every sprint will be set aside for sprint planning for that sprint. In some exceptional cases, sprint planning may extend past the first day. The feature team and the Project Managers and will attend.

During the delivery sprint, the feature teams will build out the solution with planned user stories / PBIs and architecture, which will be updated, if it is required. Daily standup meetings will be performed by the feature team to keep everyone informed and to report any impediments.

The last day of the sprint is usually dedicated to demonstrating the functionality that has been achieved in the sprint and to carrying out a retrospective of the sprint. Microsoft will review with Contoso Inc the outcome delivered after every sprint to assess if changes are needed, for example, update the future scope/outcomes. Changes of the overarching product during the delivery should be minimized so delivery velocity and targeted outcomes are not impacted. Sprint retrospectives help determine where the team succeeded, and where improvements can be made. The Project Managers reviews the completed story and marks them as Done or Not Done based on “Definition of Done”.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Review the user stories assigned to a sprint. Determine whether sufficient information is available for each User Story / PBI or not. A User Story / PBI will be flagged if more clarification is needed and unless properly understood it may be decided to defer the User Story / PBI to later sprints. Determine whether the user stories assigned to a sprint can all be completed within that sprint or not based on the available capacity and inter-dependencies across user stories. Conduct and participate in daily scrum meetings. Work collaboratively to design and plan for the implementation of the user stories. Create and execute unit, functional, and system tests. Collaborate with Contoso Inc Project Manager to create a proposed scope for future sprints, including a set of user stories that are ready to be assigned. Provide guidance to help Contoso Inc Project Manager to manage the backlog  Identify impediments to engagement delivery progress. Continuous refinement of the effort estimate (effort remaining) of user stories based on the progress of the development, dependencies and architectural constraints/needs. Explore external dependencies. Review and refine the risk list. Continuous collaboration with Contoso Inc to reassess the remaining resource capacity considering the progress of delivery, refined product backlog and clarity on the requirements. When appropriate, use the deployment process to deploy the Product to the agreed upon environment(s). At the end of a sprint following activities will be conducted: Sprint review – A sprint review meeting is a single meeting held at the end of the sprint to inspect the increment and adapt the product backlog if needed. The Microsoft Project Manager (mandatory) and Contoso Inc stakeholders (optional but recommended) will attend (see Delivery sprint completion section for details). Sprint retrospective – The sprint retrospective is an opportunity for the scrum team to inspect itself and determine if there are any improvements that need to be enacted during the next sprint. |
| Contoso Inc activities The activities to be performed by Contoso Inc | Attend and participate daily scrum meetings if necessary. Help refine user stories and provide timely clarifications. Provide updated background information, documentation, and business requirements. Collaborate with Microsoft to create the proposed scope for future sprints. Provide help removing any impediments. Support the Microsoft team with deployments to the agreed upon environment(s). Conduct User Acceptance Testing on completed Backlog Items according to the UAT cycle defined in the release plan. Attend the sprint review meetings and provide feedback |
| Key assumptions | Contoso Inc representatives, especially the sponsor, will be available throughout the duration of the sprint. The backlog will be continuously refined in each sprint, which may result in changes to overall scope and changes to required capacity. |

### Testing and defect remediation

Testing

The following kinds of testing are included in the engagement:

| Test type | Description | Responsibility | Responsibility | Responsibility |
| --- | --- | --- | --- | --- |
| Test type | Description | Has responsibility for testing? | Provides test data and test cases | Provides guidance and support |
| Functional Testing | Tests performed by a feature team within a delivery sprint to validate the product features function in accordance with the acceptance criteria defined in the features and user stories. | Microsoft | Microsoft | Microsoft |

Defect remediation

Defects found during a delivery sprint, because of functional and system testing are fixed within the delivery sprint itself. Defects found during UAT, or defects found in pre-production, will be prioritized by the appropriate Project managers and Architects, and become part of the backlog for the feature teams.

| Priority | Description |
| --- | --- |
| High | These are considered blocking or significant defects and must be prioritized over any user stories during sprint planning and capacity planning by the feature team. If found during UAT, they must be fixed prior to pre-production deployment. If found in pre-production, they must be fixed in the next development sprint. |
| Low | These are lower priority defects that don’t need a mandatory fix before being deployed in pre-production. However, there should be a fixed capacity in every sprint to fix these defects if they exist. This ensures that technical debt is not accumulating. |

## Project Artifacts

Microsoft will work with Contoso Inc in the co-creation of the following project artifacts

| Name | Description |
| --- | --- |
| Sprint completion report | This report lists the in-scope items that have been completed during the sprint, any planned work that was not completed, and any engagement risks or problems. This report is produced as an output of each sprint. |

## Completion and Definition of Done

### Delivery sprint completion

As part of each Sprint Review, the feature team will review and demonstrate each backlog item completed in the delivery sprint and confirm whether it is considered done using the Definition of Done agreed during Product Baseline Planning. Each backlog item that is done will be recorded as such in Azure DevOps. The results will also be captured as part of the sprint completion report. The feature team will also review the progress made towards the higher-level objectives through a review of feature progress, SLOs, and other related telemetry as applicable.

The status of each completed backlog item must be updated in Azure DevOps within three (3) days after the sprint review meeting is complete.

### Backlog item completion

Backlog items do not require formal sign-off or Contoso Inc acceptance when they are completed by the feature team. Any defects found in a finished backlog item will be added to the backlog as a defect and prioritized by the Project Manager/s with the other backlog items. A finished backlog item may also prompt the Project Manager/s to add additional backlog items to enhance the solution.

## Timeline

The timeline for this engagement is relative to the engagement start date. All dates and durations provided are estimates only. The specific timeline will be finalized during Product Baseline Planning and will be updated as part of core engagement planning activities.  The Data Strategy Workshop will be 1 week, 2 hours each day. Product Baseline Planning is 2 weeks, followed by 8weeks of Delivery Sprints and a Close phase of 1 week.

We will provide the Microsoft team described in the Engagement organization section for a period not to exceed 11 weeks or until the capacity defined in the Service Order is consumed.  The Microsoft team will work on the most important outcomes you define as described in the Engagement outcomes section.

The high-level timeline of the engagement is depicted in the following image:

# Engagement governance

The governance structure and processes the team will adhere to for the engagement are described in the following sections.

## Engagement communication

In addition to the communication mechanisms built into the Delivery approach, the following will be used to communicate during the engagement:

- Communication plan – this document will describe the frequency, audience, and content of communication with the team and stakeholders. It will be developed by Microsoft and Contoso Inc as part of engagement planning.
- Status reports – the Microsoft team will prepare and issue regular status reports to engagement stakeholders per the frequency defined in the communication plan.
- Status meetings – the Microsoft team will schedule regular status meetings to review the overall engagement status and open problems and risks per the frequency defined in the communication plan.

## Risk and issue management

The following general procedure will be used to manage active engagement issues and risks during the engagement:

- Identify – identify and document engagement issues (current problems) and risks (potential events that impact the engagement).
- Analyze and prioritize – assess the impact and determine the highest priority risks and issues that will be managed actively.
- Plan and schedule – decide how to manage high-priority risks and assign responsibility for risk management and issue resolution.
- Track and report – monitor and report the status of risks and issues.
- Escalate – escalate to engagement sponsors the high impact issues and risks that the team is unable to resolve.
- Control – review the effectiveness of the risk and issue management actions.
Active issues and risks will be monitored and reassessed on a weekly basis.

## Change management process

The Microsoft agile approach does not guarantee that all items defined in the product backlog will be completed, nor that all engagement outcomes will be achieved. Should Contoso Inc decide to continue work after engagement completion described in the Engagement completion section, Contoso Inc may include it as part of a future engagement or request a change, as described in the process below.

During the engagement, either party may request modifications to the services described in this document. These changes only take effect when the proposed change is agreed upon by both parties. The change management process steps are:

- The change is documented: all change requests will be documented by Microsoft in a Microsoft change request form and submitted to Contoso Inc. The change request form includes:
- A description of the change.
- The estimated effect of implementing the change.
- The change is submitted: the change request form will be provided to Contoso Inc.
- The change is accepted or rejected: The Contoso Inc has three (3) business days to confirm the following to Microsoft:
- Acceptance –Contoso Inc must sign and return change request form.
- Rejection – if Contoso Inc does not want to proceed with the change or does not provide an approval within three business days, no changes will be performed.
During the engagement, either party can request, in writing, additions, deletions, or modifications to the services described in this document (“change”). Approved changes will be managed through amendments and could lead to additional costs and schedule impacts. We shall have no obligation to commence work in connection with any change until the details of the change are agreed upon in an amendment signed by the authorized signatories from both parties.

Within three (3) consecutive business days of receipt of the proposed amendment, you must either indicate acceptance of the proposed change by signing the amendment or advise us not to perform the change. If you advise us not to perform the change, we will proceed with the original agreed upon services only. In the absence of your acceptance or rejection within the previously noted time frame, we will not perform the proposed change.

## Escalation path

The Project Managers, Project Sponsor, and other designees will work closely together to manage engagement issues, risks, and change requests as described previously. The Contoso Inc will provide reasonable access to the sponsor(s) to expedite resolution. The standard escalation path for review, approval, or dispute resolution is as follows:

- Feature team member (Microsoft or Contoso Inc).
- Product / Project Manager (Microsoft and Contoso Inc).
- Microsoft Account Delivery Executive and Contoso Inc project sponsor

## Engagement completion

Due to the nature of the Microsoft Agile Capacity Model, the final backlog items produced at the time of the conclusion of the engagement may or may not include the completion of all items in the product backlog identified by the Product Owner/Customer. This may result in a product which may not represent the minimal set of features required to satisfy Contoso Inc’s acceptance criteria for a pre-production implementation.  The Microsoft team will rely on Contoso Inc Product Owner to determine priority in the product backlog so that the most important backlog items can be completed during the engagement.

Microsoft will provide Services related the scope contained in this document until the available fees have all been consumed or all Microsoft activities and in-scope items have been completed.

# Engagement organization

## Engagement staffing

Microsoft will provide the required skills to help Contoso Inc build feature teams to become a product-centric organization. Feature teams will consist of both Contoso Inc and Microsoft delivery resources.

Contoso Inc will provide overarching project management. The project Managers are responsible for the alignment with the strategy and objectives communicated by Contoso Inc Project Manager.

The role descriptions for the engagement are shown in the Roles and responsibilities section.

## Project steering committee

The project steering committee provides overall senior management oversight and strategic direction for the engagement. The project steering committee for the engagement will meet per the frequency defined in the communication plan and will include the roles listed in the Engagement organization section later in this document.

- Stakeholder review session will occur a minimum of monthly. This meeting should be scheduled in the first week of the engagement.  Topics covered should include:
- Show what has been delivered.
- Get feedback directly from project sponsor.
- Approve major epics.

| Role | Organization |
| --- | --- |
| Project Sponsor | Contoso Inc |
| Project Sponsor | Microsoft |
| Engagement Owner | Contoso Inc |
| Project Manager | Microsoft |
| Project Manager | Contoso Inc |
| Technical Lead/Architect | Microsoft |

## Product Council

The Product Council is the function dealing with new product prioritization, business justification, planning, verification, forecasting, pricing, product launch, and marketing of a product or products at all stages of the product lifecycle.

Ultimately, the Product Council is formed to define and share the product strategy and roadmap and making decisions to resolve any conflicting product priorities that are currently in play.

| Role | Organization |
| --- | --- |
| Project Manager | Microsoft |
| Project Manager | Contoso Inc |
| Product Line Architect | Microsoft |

## Feature team

Microsoft uses a feature team approach to deliver the engagement. A feature team is an autonomous and empowered unit that has all the capabilities to design, test, and release features designed to reach Contoso Inc outcomes. A feature team consists of a Project Manager, Technical Lead, and multiple engineers with various development, test, deployment, infrastructure, security, data, and operation skills.

We will provide 1 feature team to reach the desired outcome(s) for this engagement, depending upon the number of outcomes, velocity, timeline, and budget.  Contoso Inc will provide a designated Project Manager for each feature team to support application and feature prioritization.  If additional feature teams are needed to deliver the desired outcomes, the Change management process can be leveraged.

## Engagement roles and responsibilities

The key engagement roles and the responsibilities are as follows.

| Role | Responsibilities | Responsible Party |
| --- | --- | --- |
| Project Sponsors | Participate in the project steering committee. Serve as a point of escalation to support clearing engagement roadblocks. Serve as a final arbiter of engagement issues. Make decisions about the engagement strategic direction. Approve significant change requests. | Both Contoso Inc and Microsoft |
| Account Delivery Executive | Provide delivery oversight for the Microsoft engagement. Interact with Contoso Inc stakeholders who have responsibility for the overall program to help clear any project roadblocks that arise.  Facilitate project governance activities and participate as a key member of the project steering committee Serve as the single point of contact for escalations, billing issues, personnel matters, and contract changes. | Microsoft |
| Contoso Inc Architect | Determines the north star for the product-centric transformation based on the trinity of people, process & technology. Drives business outcomes by identifying. Defines the product vision and strategy, including objectives & key results (OKRs) to provide clarity, focus, and alignment according to strategic Contoso Inc priorities. Aligns all activities to meet specific business value-driven requirements. Aligns with business units for sponsorship and budgeting. Effectively communicates, collaborates and aligns with all relevant IT and business stakeholders. Establish and maintain an effective and functioning inner sourcing and feedback loop process to harvest and improve product capabilities. | Contoso Inc |
| Project Manager | Manages and coordinates the overall engagement and deliver it on schedule. Takes responsibility for Contoso Inc resource allocation, risk management, engagement priorities, and communication to senior management. Coordinates decisions within three (3) business days, or according to an otherwise agreed-upon timeline. | Contoso Inc |
| Project Manager | Manage and coordinate Microsoft project delivery. Lead the project kickoff, project planning meetings, weekly status meetings, closeout meeting. Serve as the primary point of contact for the Microsoft team, coordinating their activities to deliver according to the project schedule. Take responsibility for issue and risk management, project decision and change request management, and status communications. Coordinate Microsoft resources and any subcontracted partners, including staffing, task assignments, and status reporting  Help the project team focus on the right goals, and help it meet the critical success factors of the project. Participate as a member of the project steering committee Lead quality reviews with Contoso Inc to assist with conditions of satisfaction. | Microsoft |
| Feature Team roles | Feature Team roles | Feature Team roles |
| Project Manager | Manages and prioritizes the product backlog. Serves as the primary person responsible for User Story / PBI scope decisions during sprint planning. Single point of contact for decisions about product backlog items and prioritization. Defines acceptance criteria for work items, especially user stories. Actively participates in all sprint reviews. Responsible for planning UAT and providing appropriate Contoso Inc resources across sprints for testing. Assists Contoso Inc on prioritization of scope, management of backlog. | Contoso Inc / Contoso Inc assisted by Microsoft / Microsoft |
| Scrum master | Lead the feature team using a disciplined Scrum process. Collaborate closely with Contoso Inc to manage the product backlog. Facilitates the daily standup. Helps the team maintain the burndown chart. Sets up retrospectives, sprint reviews or sprint planning sessions. Shields the team from interruptions during the sprint. Removes obstacles that affect the team. Walks the Project Manager/s through more technical user stories. | Contoso Inc or Microsoft |
| Technical Lead | Partner with Contoso Inc to understand business needs and solution requirements and assist with technical governance. Helps evaluate implications of trade-off decisions and assists in prioritizing product backlog. Serves as the technical person responsible for User Story / PBI scope decisions during sprint planning and define acceptance criteria for work items. Facilitates conversations between various product stakeholders so that the Project Managers can make an informed decision. Enables DevOps standardization (e.g., DevOps taxonomy, DevOps principles and practices). Advises Contoso Inc around Microsoft Cloud technical aspects. | Microsoft |
| Engineers | Responsible for design, implementation, test, and deployment to a pre-production following DevOps principles. Provides the required skills and becomes an active member of the Feature Team:  Azure Infrastructure Azure Security Azure Application Architecture Azure Application Development Azure Data & AI Automation Testing User Experience Design The feature team engineering skills and/or skills-mix will vary throughout the engagement dependent on work needs. All team members participate in all sprint reviews. | Microsoft |
| Subject Matter Experts (SME) | Provides ongoing guidance to the Microsoft feature team(s). Participates in all sprint reviews. | Contoso Inc |
| Adoption and Change Management Consultant | Assists Contoso Inc Project Manager with the definition of the Mission and OKRs. Adopts a product-centric mindset and culture, which is led by the leadership.  Contributes to the overall learning approach to foster product-centric and DevOps mindset, aligned with existing Contoso Inc initiatives, teams forming and DevOps tooling decision. Coaches of leaders on their role as sponsors for change and fostering DevOps across the entire organization | Microsoft |

# Contoso Inc responsibilities and engagement assumptions

## Contoso Inc responsibilities

In addition to Contoso Inc activities defined elsewhere in this document, Contoso Inc is also required to:

- Provide information.
- This includes accurate, timely (within three business days or as mutually agreed upon), and complete information.
- Provide access to people and resources.
- This includes access to knowledgeable Contoso Inc personnel, including business user representatives, and access to funding if additional budget is needed to deliver engagement scope.
- Acquire and install the cloud capacity that is needed to support the environments as defined in the scope section of this document.
- Provide access to systems.
- This includes access to all necessary Contoso Inc work locations, networks, systems, and applications (remote and onsite).
- Provide a work environment.
- This consists of suitable workspaces, including desks, chairs, and Internet access.
- Or provide required equipment for secure remote connectivity.
- Manage non-Microsoft resources.
- The Contoso Inc will assume responsibility for the management of all Contoso Inc personnel and vendors who are not managed by Microsoft.
- Manage external dependencies.
- The Contoso Inc will facilitate any interactions with related engagement or programs to manage external engagement dependencies.
- Troubleshoot systems that are not being developed by Microsoft.
- Confirm regulatory compliance.
- Provide standard product training.
- Organizational change management
- Redesign or re-engineering of business processes.
- Designing – or redesigning – the functional organization.
- Planning or undertaking of end-user communications.
- Other general responsibilities.
- The Contoso Inc will assign a team to collaborate on the engagement with the Microsoft team.
- Monitor network activity.
- Provide application support.
- Responsible for the financial costs associated with hardware purchasing, software licensing, or purchasing of Microsoft or third-party tools.
- Bug fixing and troubleshooting problems that are related to applications or other third-party software, hardware products, or applications that are not explicitly mentioned as in scope.
- Prepare documentation about processes, standards, policies, or existing guidelines.
- Designing, configuring, integrating, deploying, or fixing issues in commercially available third-party software.
- Modifications to third-party systems and/or external interfaces to support integration.
- Data Cleansing and Data Migration activities.
- Plan, design, customize, enhance, troubleshoot, or resolve problems that are related, but not limited, to supporting the infrastructure listed here:
- Firewalls.
- Storage area networks.
- Networks.
- Design, install, and configure the environment (other than development and system testing).

## Engagement assumptions

The engagement scope, services, fees, timeline, and our detailed solution are based on the information provided by Contoso Inc to date. During the engagement, the information and assumptions in this document will be validated, and if a material difference is present, this could result in this could result in the need to reduce the project scope to align with the remaining available budget. In addition, the following assumptions have been made:

- Workday:
- The standard workday for the Microsoft feature team is between 9 AM and 6 PM, Monday through Friday, local time where the team is working.
- Remote working:
- The Microsoft feature team will perform all services remotely.
- If the Microsoft feature team is required to be present at the Contoso Inc location on a weekly basis, resources will typically be on site for three nights and four days, arriving on a Monday and leaving on a Thursday.
- The place of performance under the Scope and Approach may be at a Microsoft facility, a Contoso Inc’s facility, or various remote and off-site locations (including Microsoft employee home offices).
- Language:
- All engagement communications and documentation will be in English. Local language support and translations will be provided by Contoso Inc.
- Staffing:
- If necessary, Microsoft will make staffing changes. These may include, but are not limited to, the number of resources, individuals, and engagement roles.
- We have presumed that most of the design and implementation work will be performed by Microsoft Consulting Services (MCS). We have, however, assumed some level of involvement from your personnel as detailed in the Contoso Inc responsibilities. We have not accounted for any internal costs of that involvement.
- Informal knowledge transfer:
- Contoso Inc staff members who work alongside Microsoft staff will be provided with information knowledge transfer throughout the engagement. No formal training materials will be developed or delivered as part of this informal knowledge transfer.
- Known standards:
- Microsoft has expectations of utilizing Azure DevOps, Azure Pipelines and may use GitHub for a standard delivery.
- Time will be required to learn the client tooling and backlog if there are deviations from Microsoft standards. This time was not included in the estimation.
- Other assumptions:
- All engagement resources will have the appropriate level of security access needed to complete engagement-related efforts.
- In addition to engagement team members, Contoso Inc shall allow Microsoft internal systems to access the mutually accessible delivery platforms/tools used for this engagement.
- Microsoft will read, store, and share necessary delivery insights on the work artifacts and products generated as part of this engagement (e.g.: test cases, code base, pipelines) that are hosted on the mutually accessible delivery platforms like Azure DevOps, Jira, GitHub etc.
- The gathered data and the generated insights will be made available to the Contoso Inc during the duration of the engagement and will be purged based on explicit Contoso Inc request or the end of the engagement.
- Holidays, vacation, and training time have not been factored into this document.
- All work is to be contiguously scheduled. Any breaks in the engagement calendar must be scheduled four weeks in advance.
- Contoso Inc required compliance training for highly regulated industries is not included in the estimation.  This includes:
- Security training
- Internal onboarding
- Financial compliance training
- Healthcare compliance training
- Procedures outside of Microsoft standard compliance
- Background checks / Fingerprinting / Badging / Authentication
- Contoso Inc agrees that Microsoft, may associate Contoso Inc’s Online Services with Professional Services accounts through configuration of the Contoso Inc’s subscriptions, Azure resources and/or deployed applications.
- Browser compatibility testing has not been estimated as part of the current duration. This may be added but it will affect the overall duration of the engagement in terms of the established budget.
- The Contoso Inc will meet the necessary requirements to help make sure the solution design meets regulatory requirements.
- If localization support is required – support for additional languages, for example – it will be added to the product backlog and implemented as part of regular sprint work.
- Azure Services and Technology
- Azure services and Azure-supported Microsoft technologies will be used to develop the solution.
- The components to be developed by Microsoft will be cloud-hosted.
- Microsoft will not modify any existing code base that was not produced by the MCS team.
- Azure DevOps
- Either the Contoso Inc will provide a Microsoft Azure DevOps Services account that is accessible by all team members, or Microsoft will provide an account (with possibly limited access for Contoso Inc.)
- Data Governance & Operations
- It is assumed that the Data Governance & Operations track can finish earlier than the entire Program.
- During Product Baseline Planning, Data Governance & Operations scope of work will be further elaborated, and capacity may be readjusted.
- Contoso Inc will provide the resources responsible for Data governance and operations for service management planning and readiness activities as described in the Data Governance & Operations scope.
- We are closely monitoring the recent developments regarding the spread of the novel coronavirus (COVID-19). Currently, we do not anticipate COVID-19 to impact our engagement with you. However, the situation is very fluid. Our priority is the safety of our personnel, customers, and community. To that end, Microsoft is diligently working to implement the recommendations issued by the World Health Organization (WHO), the Centers for Disease Control and Prevention (CDC), and relevant local authorities. Customer projects and engagements are considered “essential travel”. In the event we anticipate needing to disrupt any onsite services due to Microsoft’s efforts to limit exposure of its personnel and customers to the virus, we will notify you as soon as possible. We are committed to working with you to complete any ongoing projects and will update you if there are further developments. Please do keep us informed as to whether you are putting in place any arrangements which may impact our engagement with you.

- Employee Experience
- It is assumed in the estimations that the Employee Experience team will finish before the Program is completed.
- During Product Baseline Planning, the Employee Experience scope of work will be further elaborated; capacity may be readjusted accordingly to support product owners and employee experience leads on driving the employee experience backlog.

# Definitions and Acronyms

| Acronym | Description |
| --- | --- |
| ALM | Application Lifecycle Management |
| Backlog or Story Scope | The requirements or features defined in the product backlog. |
| UAT | User Acceptance Test |
| DoD | Definition of Done |
| DoR | Definition of Ready |
| EFUs | Epics Features User Stories |
| Engagement Scope | The overall vision / scope of the engagement or solution being created. |
| SME | Subject Matter Expert |
| PM | Product Manager |
| PBIs | Product backlog items |

# Exhibits

## Initial product backlog

The table below represents the initial product backlog to be validated and prioritized during Product Baseline Planning.  The backlog items may be revised at any time based on direction from Contoso Inc, and they may not all be completed during the engagement. There may also be new backlog items added during the engagement which have a higher priority for Contoso Inc than those listed below. The product backlog is maintained and updated throughout the engagement based on priorities set by Contoso Inc following the agile approach described in the Delivery approach section.

| # | Item | Description |
| --- | --- | --- |
| 1 | Data Strategy Program Office Feature | Establish a Data Strategy Program Office to work with Contoso Inc and manage: Program tracking tooling in Azure DevOps Program tracking dashboards Master scheduling Monthly communication and weekly meeting cadence providing status reporting on team model (feature teams) Status update frequency and mechanism Budget tracking and reporting to Contoso Inc Team member bandwidth management Creation and management of Program success metrics |
| 2 | Data Strategy Workshop Feature | Run a Data Strategy workshop that assesses: Shared data services required to support an Enterprise Data Strategy and support use-case delivery.   Use cases, OKRs and Minimal Viable Products (MVPs). Data governance and operations maturity and next steps to build plan for people, process and change management data-driven organizational readiness. Change enablement readiness and employee experience approach, considering which adoption and change management elements are needed. |
| 3 | Shared Data Services Feature | Provide Contoso Inc with charter, tenet and standard templates and shared data services delivery aligning to the following: Jump-Start shared data services: Data Lake Ingestion for compute services Data Catalog service Handshaking service Control file service Data Catalog + Classification Security |
| 4 | Employee Experience Adoption Feature (To be added to the use-case development cycle) | Promote an enhanced employee experience with data for end-users including: Assessment and discovery of Contoso Inc existing change management capabilities, providing understanding of the blockers and enablers for end user adoption of new ways of working with data. Co-designed adoption feature using best practice recommendations for effective change management application. Product owners are prepared and empowered to drive an enhanced employee experience with data for targeted end users. Targeted employees adopt new ways of working with data. |
| 5 | Data Visualization Feature | Establish a Data Visualization approach and deliver BI and Analytics with Contoso Inc as follows: Analytics assessment and discovery of existing data analytics environments and in-scope workloads including analytics backlog creation. Co-designed look and feel of the data visualization using best practice recommendations for effective data story telling. Data ingestion using the available shared data services IP and tooling provide data needed for reports and dashboards. A data model (semantic model). ADO / DevOps process for Report development. Reports and dashboards tested and deployed to a pre-production environment. |
