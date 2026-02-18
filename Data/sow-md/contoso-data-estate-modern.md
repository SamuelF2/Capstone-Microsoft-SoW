# SOW-DATAESTATEMODERN-Contoso Inc

| Template Guidance Delete this instructional cover sheet page before sending! |
| --- |
| This offering has adopted Leading-Edge principles that follow a scrum development process with a fixed capacity, fixed duration, and variable scope. If your engagement has fixed fee/scope or fixed deliverables, or if your engagement is staff augmentation, then this is not the right template. Combining a rich toolset developed by Microsoft Consulting Services in partnership with Microsoft Engineering, Microsoft Consulting ​Services created the Date Estate Modernization offer that provides a common technical and delivery methodology for migrating customers’ on-premises data estate & data from and to commercial and open-source databases, supporting homogeneous and heterogeneous migrations. The offering provides a set of services in relation to data estate modernization and migrations that can be combined based on the needs/requirements from Contoso Inc and prioritized accordingly. By the nature of agile delivery, all engagement outcomes are not always achieved. Microsoft and Customer will regularly review engagement outcome priorities and work together to achieve the most valuable outcomes during this engagement. Microsoft will work with Contoso Inc during each Delivery Sprint to develop a releasable product increment. The services incorporated into the offering are: Data Migration Assessment Services Schema Migration & Remediation Services Data Pipeline Migration and Remediation Services Data Migration Services Report Migration & Remediation Services This SOW is not an exhaustive list of how we deliver agile development engagements, it is not intended to be a sales tool, and it does not instruct development teams on how to deliver engagements. The intent of this contract is to set Customer expectations and help protect the feature team (delivery team) from well-intentioned Customer changes to the agile development process. For details on how to deliver engagements, see the Services Domains’ playbooks. Also refer to the Agile SOW Companion deck for background information on selling and delivering agile deals. |
| How to use this template You will notice throughout this document: Italic Pink text, in the body of the SOW is instructional and must be deleted before sending to Contoso Inc. Bold Blue text, in the body of SOW represents optional scope and must be removed or un-bolded and changed to style ‘normal’ (black type) before sending to Contoso Inc.  Before you send the document to Contoso Inc, make sure you: Refresh the table of contents. Updates the Document Properties. Check for Spelling issues. |
| Country-specific Considerations? For contracts in Germany, Austria, and Switzerland: This SOW template is acceptable for use as a Work Contract (Austrian “Werkvertrag” §§1165f ABGB, German “Werkvertrag“ §631 BGB, or Swiss “Werkvertrag“ Art. 363-379 Swiss Code of Obligations). When describing deliverables in the SOW, this will result in a warranty obligation. Therefore, a non-standard terms warranty reserve must be calculated on top of the delivery risk reserve in CompassOne. If completing the contract as a T&M Work Contract, it is necessary to plan for a warranty reserve as a free-of-charge hours buffer in CompassOne. Consult with SQA if necessary. For Service Contracts (Austrian and Germany “Dienstleistung” & Swiss “Einfacher Auftrag”), use the main K360 link and search on “statement of work” and filter by country, e.g., Germany. |
| Need help? If you have a contracting question, please reach out to the Services Contracting Office (sco@microsoft.com). If you would like to request a change to this template, please log the request on K360. |

Data Estate Modernization

Prepared for

Correctional Service of Canada

Prepared by

Microsoft Consulting Services

Shyam Sridhar

Date: November 17, 2021

Version: 1.4

This Statement of Work (SOW) and any exhibits, appendices, schedules, and attachments to it are made pursuant to Work Order (WO) [insert Work Order number] and describes the work to be performed (“services”) by Microsoft (“us,” “we”) for Correctional Service of Canada (“Contoso Inc”, “Customer,” “you,” “your”) relating to Contoso Inc Oracle Migration (“engagement”).

This SOW and the associated WO expire 30 days after their publication date (date Microsoft submits to Customer) unless signed by both parties or formally extended in writing by Microsoft.

[READ AND DELETE: PLEASE NOTE

THIS SOW TEMPLATE IS USED FOR CATALOG, NON-CUSTOMIZED, CONSULTING

OFFERS THAT ARE IN THE CATALOG AND AVAILABLE IN COMPASSONE.

CUSTOM OFFERS WILL BE TREATED AS NON-MSO (MANAGED STANDARD OFFERING)

AND WILL REQUIRE THE APPROPRIATE LEVEL OF REVIEW AS DERIVED THROUGH THE

ENTERPRISE SERVICES AUTHORIZATION POLICY (ESAP)]

# Introduction

Correctional Services Canada (Contoso Inc) runs Oracle the majority of its databases, most importantly is its Offender Management System (OMS). Contoso Inc is planning to modernize the OMS - there is an RFP that will be issued at some point (Korry might have the timeline) to replace their OMS. This modernization initiative will take at least 5-10 years to finalize. Till then, Contoso Inc will have to maintain and fund what they have.

Traditionally, Share Services Canada (SSC) used to cover the Oracle licenses for Contoso Inc, however, with WLM and SSC's move to their new Enterprise Data Centers, Contoso Inc was asked to take over the cost of Oracle moving forward. The cost to Corrections is estimated be around the $10M per year (TBC with Contoso Inc).  Coincidentally, Enterprise Architecture at Contoso Inc has indicated that they would like to move away from Oracle as a platform.

The opportunity for Contoso Inc is to save Oracle costs and potentially modernize or migrate to with SQL Server or other DBs (such as PostgreSQL) to align with their Enterprise Architecture direction. Microsoft is a key partner of Contoso Inc and we want to help Contoso Inc migrate these databases to Azure as plan A depending on technical feasibility and financial feasibility (both migration and run cost).

# Customer goals and engagement outcomes

## Customer goals

Customer goals for this engagement are listed below. They are provided for business context and are not statements of accountability, or of Microsoft Services to be performed. The engagement outcomes and Services Microsoft will perform are described in the remaining parts of Section 1 and this SOW.

| Goal | Description |
| --- | --- |
| Decrease operational costs | By modernizing data platforms to take advantage of cloud-based services, many operational costs can be reduced: auto-scaling, automatic maintenance and monitoring, native encryption, and serverless architectures. |
| Increase security and governance of data | By moving to Microsoft cloud-based services, enhanced security policies can be applied to enforce data classification, protection, encryption, auditing, and other methods to increase the security and governance of Contoso Inc data estate. |
| Decrease costs by reducing licensing | Modernizing the data estate by eliminating costly third-party technologies and replacing them with open-source software systems could reduce licensing requirements and further cost savings. |
| Increase agility and resiliency by using DevOps | By introducing DevOps deployment techniques, Customer will be able to achieve greater agility to provide services “just in time” and scale them appropriately when needed. Additionally, by separating computing from storage, disaster recovery systems may be deployed when needed rather than having unused systems constantly running. |

## Engagement outcomes

The engagement will focus on the outcomes described below, which will be prioritized based on direction from Customer. By the nature of agile delivery, not all engagement outcomes are always achieved. Microsoft and Customer will regularly review engagement outcome priorities and work together to achieve the most valuable outcomes during this engagement. The agile delivery approach (described in the Delivery approach section) allows Customer to continually adapt the engagement outcomes and direction of the Solution.

If more time is needed to deliver the desired engagement outcomes, or if additional engagement outcomes need to be defined, the change management process will be followed.

Using the services defined below, Microsoft will focus on the following outcomes.

| Service | Description | Outcome |
| --- | --- | --- |
| Data migration assessment services | For each data source added to the product backlog, the following services will be performed, if prioritized. (Refer to the Delivery approach section for details on the prioritization process.) Conduct interviews (and workshops) [Question: is this “and workshops” or “in the form of workshops”?] to understand dependencies, retention requirements and security controls, such as personally identifiable information (PII) and Sarbanes-Oxley (SOX). Also included would be availability requirements, cutover synchronization requirements, change rates, use concurrency, and other business-related criteria. Collect and review assessment data obtained either from tools or by Contoso Inc directly. | The outcome will be a clear, well-defined implementation path for each in-scope data source to modernize and migrate it to its target environment. |
| Schema migration and remediation services in Development Environemtn | For each data source added to the product backlog, the following services will be performed, if prioritized. (Refer to the Delivery approach section for details on the prioritization process.) Enumerate and catalog all required data description language (DDL) changes to support data migration from the source system to the target system. Convert or remediate source DDL as required for the target system. Enumerate and catalog all data type conversions required. Perform unit testing on remediated and/or converted objects to validate correctness and completeness. Provide deployment scripts that can be integrated into deployment pipelines following Continuous Integration and Continuous Delivery (CI/CD) principles. Provide a change log for migrated data sources. Perform migration testing of manual changes. Deploy target schemas using DevOps pipelines for quick, iterative releases. | After this milestone is reached, data can be migrated to the target environments that will then begin to realize Contoso Inc goals stated above. |

In addition to the engagement outcomes listed above, the initial product backlog in the Exhibits section will be used as input for product baseline planning. As with engagement outcomes, not all backlog items will always be delivered. The agile delivery approach allows Customer to prioritize the most valuable backlog items and continually adapt the Solution.

## Technology requirements

.

The products and technology listed in the following table are required for the engagement. Contoso Inc is responsible for obtaining all identified licenses, products, or subscriptions.

| Product or technology item | Version | Ready by |
| --- | --- | --- |
| Microsoft Azure subscription | Not applicable | Start of engagement |
| Microsoft 365 subscription | Not applicable | Start of engagement |
| Microsoft Azure DevOps | Not applicable | Start of engagement |
| GitHub | Not applicable | Start of engagement |
| Microsoft SQL Server | [Insert target version] | Start of engagement |
| Microsoft Data Migration Assistant | Current | Start of engagement |
| Microsoft SQL Server Migration Assistant for Oracle | Current | Start of engagement |
| Ora2pg (tool used to migrate Oracle to PostgreSQL) Ispirer (tool used to migrate Oracle to PostgreSQL) NewtGlobal DMAP (tool used to migrate Oracle to PostgreSQL) | Current | Start of engagement |

## Environment requirements

Contoso Inc will supply and maintain all environments used for the development and delivery lifecycle. Contoso Inc will obtain the required Azure subscriptions and provide Microsoft with administrative control to build the development and test environments.

| Environment | Location | Responsible for configuration and maintenance | Subscription Owner | Ready by |
| --- | --- | --- | --- | --- |
| Automation environment | Azure DevOps, GitHub, Jira, Jenkins | Microsoft or Customer | Customer | Start of engagement |
| Development | Microsoft Azure | Microsoft or Customer | Customer | Ready by respective phase |

# Customer responsibilities and engagement assumptions

## Exclusions

During this engagement, Microsoft will not provide any outcome or requirement that is not explicitly included in the previous sections. Items specifically excluded from Microsoft services provided are listed in the following table.

| Area | Description | Description |
| --- | --- | --- |
| Product licenses and subscriptions | Product licenses (Microsoft or non-Microsoft) and cloud service subscriptions are not included. |
| Hardware | Microsoft will not provide hardware for this engagement. |
| Integration with third-party software | Microsoft will not be responsible for integration with third-party software. |
| Product bugs  and upgrades | Product upgrades, bugs, and design change requests for Microsoft products are not included in this engagement. |
| Source code review | Customer will not provide Microsoft with access to non-Microsoft source code or source code information. For any non-Microsoft code, Microsoft Services will be limited to the analysis of binary data, such as a process dump or network monitor trace. Security assessments on DDL, scripts, source code, or other material provided by Contoso Inc is out of scope for this engagement. |
| Process reengineering | Designing functional business components of the Solution is not included. |
| Organizational change management | Designing—or redesigning—Customer’s functional organization is not included. |
| Development migration and planning | The following are not included: Infrastructure or software procurement Development testing, turnover, and implementation The deployment or set up and decommissioning of physical servers. Operation and maintenance of the Development environment |
| Developing performance test cases | Developing any performance test rigs or approaches is not included. |
| Performance testing and tuning | The following are not included: Doing any performance tuning outside the target database environment (non-upgrade-related) Fixing any existing performance problems |
| Training | The following are not included: Creation of any training material Product training Formal training |

## Customer responsibilities

In addition to Customer activities defined elsewhere in this SOW, Customer is also required to:

- Provide information.
- This includes accurate, timely (within three (3) business days or as mutually agreed upon), and complete information required for the engagement.
- Provide access to people and resources.
- This includes access to knowledgeable Customer personnel, including business user representatives, and access to funding if additional budget is needed to deliver engagement scope.
- Acquire and install the cloud capacity that is needed to support the environments as defined in the environment section of this SOW.
- Provide access to systems.
- This includes access to all necessary Customer work locations, networks, systems, and applications (remote and on-site).
- Provide a work environment.
- This consists of suitable workspaces, including desks, chairs, and Internet access.
- Or provide required equipment for security enhanced remote connectivity.
- Manage non-Microsoft resources.
- Customer will assume responsibility for the management of all Customer personnel and vendors not managed by Microsoft.
- Manage external dependencies.
- Customer will facilitate any interactions with related engagement or programs to manage external engagement dependencies.
- Troubleshoot systems that are not being developed by Microsoft.
- Confirm regulatory compliance.
- Provide informal product training.
- Oversee organizational change management.
- Redesign or re-engineer business processes.
- Design – or redesign – the functional organization.
- Plan or undertake end-user communications.
- Other general Customer responsibilities.
- Assign a team to collaborate on the engagement with the Microsoft team.
- Monitor network activity.
- Provide application support.
- Take responsibility for the financial costs associated with hardware purchasing, software licensing, or purchase of Microsoft or third-party tools.
- Fix bugs and troubleshoot problems that are related to applications or other third-party software, hardware products, or applications that are not explicitly mentioned as being in scope.
- Prepare documentation about processes, standards, policies, and existing guidelines.
- Design, configure, integrate, deploy, and fix issues in commercially available third-party software.
- Implement modifications to third-party systems or external interfaces to support integration.
- Perform data cleansing and data migration activities.
- Plan, design, customize, enhance, troubleshoot, and resolve problems that are related, but not limited, to supporting the infrastructure listed here:
- Firewalls.
- Storage area networks.
- Networks.
- Design, install, and configure the environment (other than development and system testing).
- Other technical responsibilities
- Supply all baseline database DDL and backups.
- Sign-off of migrated data.
- Provide test data or test databases for the databases to be migrated.
- Comply with Contoso Inc data compliance and data privacy standards before sharing data with Microsoft (for example, scrubbing, masking, and encryption.)
- Create and provide functional and acceptance tests for baseline code when code remediation is required.
- Install Customer-required antivirus, monitoring, auditing, or other agents onto a virtual machine.
- Provide connectivity access to one or more of its datacenters and Azure subscriptions for all Microsoft consultants, architects, and authorized partners (both on and offshore) who are actively assigned to the engagement. Specific connection methods to be determined no later than during product baseline planning. Examples include Express Route, S2S VPN, etc.
- Customer is responsible for providing or obtaining sufficient network bandwidth across all network segments (hops) from the data source(s) to Azure, whether the data center(s) is(are) operated by Contoso Inc or one of its third-party contracted providers.
- If the disposition of a data pipeline or report is replacement, Customer is responsible for finding a suitable replacement and validating that it is functionally equivalent.
- If the disposition of a data pipeline or report is retirement, Contoso Inc is responsible for validating the target data environment meets all business requirements without the retired pipeline or report.

## Engagement assumptions

The engagement scope, services, fees, timeline, and detailed Solution are based on the information provided by Customer to date. During the engagement, the information and assumptions in this SOW will be validated, and if a material difference is present, this could result in Microsoft initiating a change request to cover additional work or extend the engagement duration. In addition, the following assumptions have been made:

- Workday:
- The standard workday for the Microsoft feature team is between 9 AM and 6 PM, Monday through Friday, local time where the team is working.
- Remote working:
- The Microsoft feature team may perform services remotely.
- If the Microsoft feature team is required to be present at Contoso Inc location every week, resources will typically be on-site for three (3) nights and four (4) days, arriving on a Monday and leaving on a Thursday.
- The place of performance under the SOW may be at a Microsoft facility, a Customer facility, a US government facility, or various remote and off-site locations, including Microsoft employee home offices.
- Language:
- All engagement communications and documentation will be in English. Local language support and translations will be provided by Contoso Inc.
- Staffing:
- If necessary, Microsoft will make staffing changes. These may include, but are not limited to, the number of resources, individuals, and engagement roles.
- Microsoft presumes that the design and implementation work will be performed primarily by Microsoft Consulting Services (MCS). We have, however, assumed some level of involvement from Customer personnel as detailed in Contoso Inc responsibilities section of this SOW. We have not accounted for any internal costs of that involvement.
- Resource mobilization for staffing the engagement will be [XX weeks].
- Security clearances:
- Holding requisite clearances or submitting Microsoft Consultants / Engineers identified to support this effort into the clearance process. To include any additional Microsoft Consultants , engineers that may be required to support this effort.
- As cleared resources are required as part of the contract, Customer will provide Microsoft Corporation an executed DD Form 254, Department of Defense Contract Security Classification Specification for any work requiring access to classified information. No classified work can commence without this document.
- All resources will have the appropriate level of security access required to complete engagement-related efforts or Customer will submit individuals for the appropriate level of security access.
- Work performed remotely and not of a classified nature will be performed by US Citizens. Full Customer clearance is not required.
- Work performed on-site will be conducted with fully cleared resources, per Customer requirements.
- Various clearance levels will be utilized, depending on the work needed to be conducted.
- Informal knowledge transfer:
- Customer staff members who work alongside Microsoft staff will be provided with information knowledge transfer throughout the engagement. No formal training materials will be developed or delivered as part of this informal knowledge transfer.
- Known standards:
- Microsoft expects to use Azure DevOps and Azure Pipelines and may use GitHub for standard delivery.
- Time will be required to learn Contoso Inc tooling and backlog if there are deviations from Microsoft standards. This time has not been included in engagement estimates.
- All engagement team members will have the appropriate level of security access needed to complete engagement-related efforts.
- In addition to engagement team members, Customer shall allow engagement team members and Microsoft internal systems to access the mutually accessible delivery platforms and tools used for this engagement.
- Microsoft will read, store, and share necessary delivery insights on the work artifacts and products generated as part of this engagement (for example, test cases, code base, and pipelines) that are hosted on the mutually accessible delivery platforms, such as Azure DevOps, Jira, and GitHub.
- The gathered data and generated insights will be made available to Contoso Inc throughout the engagement. It will be purged at the end of the engagement, or upon explicit by Contoso Inc.
- Holidays, vacations, and training time have not been factored into this SOW.
- All work is to be contiguously scheduled. Any breaks in the engagement calendar must be scheduled four (4) weeks in advance, or the time will be billed without interruption.
- Customer-required compliance training for highly regulated industries is not included in the estimation. This includes:
- Security training
- Internal orientation
- Financial compliance training
- Healthcare compliance training
- Procedures outside of Microsoft standard compliance
- Background checks, fingerprinting, badging, and authentication
- Customer agrees that Microsoft may associate Customer online services with Professional Services accounts through configuration of Customer subscriptions, Azure resources, and deployed applications.
- Browser compatibility testing has not been estimated as part of the current duration of the engagement. This may be added, but it will affect the overall duration in terms of the established budget.
- Contoso Inc will meet the necessary requirements to help make sure the Solution design meets regulatory requirements.
- If localization support is required—support for additional languages, for example—it will be added to the product backlog and implemented as part of regular sprint work.
- Azure services and technology
- Azure services and Azure-supported Microsoft technologies will be used to develop the Solution.
- Microsoft will develop the be cloud-hosted components.
- Microsoft will not modify any existing code base that was not produced by the MCS team.
- Azure DevOps
- Either Customer will provide a Microsoft Azure DevOps services account that is accessible by all team members, or Microsoft will provide an account with possibly limited access for Contoso Inc.

## Technical assumptions

Insert additional items as required – do not repeat assumptions listed elsewhere in the SOW. Consider the following: technical assumptions, infrastructure assumptions, and engagement delivery assumptions. Refer to the SOW writing guide for additional options.

Review all assumptions for accuracy with special attention to optional assumptions which may be Customer specific. For optional assumptions you wish to keep, change the style to “Bullet list” and indent as needed; otherwise delete optional items.

The engagement scope, services, fees, timeline, and detailed Solution are based on the information provided by Contoso Inc to date. During the engagement, the information and assumptions in this SOW will be validated, and if a material difference is present, this could result in Microsoft initiating a change request to cover additional work or extend the engagement duration. In addition, the following technical assumptions have been made:

| General technical assumptions |
| --- |
| None of the database objects are encrypted; all items can be viewed by the development team. If any objects that are encrypted, Customer is responsible for either decrypting the objects or providing unencrypted DDL scripts. |
| The Microsoft team should have appropriate credentials and permissions for Contoso Inc Azure subscription, source data environments, and virtual machines for performing migrations. The required permissions will be provided by the Microsoft team during product baseline planning. |
| No changes will be made to the database artifacts and dependencies after the database is submitted to the migration team. If a change is submitted, the database will be rejected and will only be considered once it has been submitted again. |
| It is assumed that Contoso Inc development, testing, and UAT environments implement the same configurations. Microsoft will not take responsibility for failures arising from differences in configurations between environments. |
| A “like-for-like” unit testing (assuming no changes in the functionality of source objects) approach will be used for remediated database problems. |
| No changes will be made to the database artifacts and dependencies after the database is submitted to the migration team. If a change is submitted, the database will be rejected and will only be considered it has once submitted again. |
| Network connectivity between Contoso Inc data center or centers hosting source data and the target Azure region or regions has sufficient bandwidth to meet Customer time requirements for transferring data—for both initial transfers and continued synchronization, if necessary. |
| If sufficient network bandwidth is not available from the data source to Azure, other options, such as Azure Data Box and Azure Data Box Heavy, may be required. Use of these offline technologies may increase migration times and engagement duration. |
| The method of data validation will be mutually agreed upon with Customer during backlog establishment and reevaluated at the time of sprint planning. During delivery sprints, validation methods may differ or require adjustment, depending upon technical decisions, migration patterns, and complexity. |
| Any deviation to the stated scope, assumptions, or “time-boxed” hours (that is, schedule- or deadline-driven) will be managed through the change management process. |

| Technical assumptions for source systems using Oracle |
| --- |
| Any Oracle DBLinks usage will be identified and will be considered on a case-by-case basis; appropriate remediation or alternatives will be identified in collaboration with Contoso Inc technical team. |
| Oracle fusions apps , Oracle BI and analytics services and middleware services will be considered on a case-by-case basis; appropriate remediation or alternatives will be identified in collaboration with Contoso Inc technical team. |
|  |
|  |

# Delivery approach, completion, and timeline

## Delivery approach

This engagement uses an agile approach (described below) based on the scrum framework. Product baseline planning can be performed if a product backlog with the level of detail necessary for the team to begin delivery sprints does not already exist. Microsoft will work with Customer during each delivery sprint to develop a releasable product increment as agreed to and defined by the “definition of done.” Microsoft and Customer will work together to build a repeatable release capability with the goal of having the initial release of value within 40 days.

### Sprint process

Microsoft will undertake an iterative delivery approach based on a fixed-capacity, fixed-duration, variable-scope process known as the scrum process (http://scrumguides.org). The key tenets are as follows:

- Joint ownership of decisions
- Short implementation units (sprints)
- Prioritization of business objectives in a product backlog
- Time-bound planning for each sprint
- Emphasis on the remaining work
- Sprints that produce a working Solution
- Sprint demonstrations that are time-restricted and have regular checkpoints
- Regular retrospective meetings that may be used for course correction

At the end of each sprint, the Microsoft product manager and applicable Customer decision makers, such as Contoso Inc product manager, will review the progress made against the objectives to determine if any adjustments need to be made through the change management process.

### Engagement initiation

At the beginning of the engagement, the following prerequisites tasks must be performed before Product baseline planning can be commence.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Conduct a preinitiation call or meeting to initiate team formation and communicate expectations. Document the engagement launch prerequisites using input from this SOW. Track the status of launch prerequisites and adjust the Engagement initiation phase start date accordingly. Conduct a detailed walkthrough of the SOW with Customer to agree upon an initial engagement schedule and approach. Assist Customer to start identifying the required roles and stakeholders and names for the initial feature teams.  Initiate onboarding Microsoft resources into Contoso Inc environment. |
| Customer activities The activities to be performed by Contoso Inc | Attend and participate in the preinitiation call. Assign engagement initiation and launch prerequisites responsibilities to accountable Customer leadership and establish target completion dates. Complete the engagement initiation and launch prerequisites. Staff the engagement with the required Customer resources in the time frames agreed upon in the preinitiation call. Assist with the orientation requirements Microsoft needs to be able to start the engagement. |

### Product baseline planning.

To balance the change, uncertainty, and need of delivery of business outcome, the engagement will begin with product baseline planning. The feature team will conduct this planning as an 8-week exercise to build out the initial product backlog and high-level architecture. At the completion of this exercise, the outcomes, assumptions, and dependencies will have been verified.

Should there be any material deviations from the initial estimations, these and their implications will be discussed. The impact of such changes will be addressed using the Change management process.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Agile/scrum workshop Work with Customer to identify the stakeholders and subject matter experts (SMEs) that will function as a feature team. Conduct an all-day workshop for Customer stakeholders and SMEs. Collaborate with Customer to: Review the desired outcomes and define objectives and key results (OKRs). Create a problem statement by defining the goal for the overall Solution. Create vision statements by defining functional or behavioral requirements for the overall Solution. Define personas and user journeys by determining how end users currently operate, and how they plan to operate going forward. Define epics and features and define a workstream breakdown into subtopics and action items. Define user stories and product backlog items (PBIs) for the product backlog—a breakdown of action items into consumable tasks that can be delivered during a single sprint. Define PBIs for non-functional requirements (for example, performance, encryption, and scalability) and stories that do not require a user persona. Develop a recommended high-level technical architecture. Collaborate with Contoso Inc product manager to create a proposed scope for the first release, including a set of user stories that are ready for sizing, design, and development. Build or validate the initial product backlog. Collaborate with Contoso Inc product manager to create a proposed scope for the first delivery sprint, including a set of foundational user stories, of the highest priority (the ones on which other user stories and solutions are dependent). Identify impediments to efficient development, including those areas that require more elaboration, such as proofs of concept or other architectural discovery tasks. Collaborate with Customer to create: A definition of ready, which is the criteria that determines when a user story or PBI is ready to be developed. A definition of done, which is what constitutes completed user stories. The team will use this criterion to decide when a story is complete. Define a test strategy and plan for all in-scope tests defined in the Testing and defect remediation section. If additional testing is needed during product baseline planning, it should be added using the change management process. Reevaluate the estimate of effort after detailing user stories. Compare with the original estimate and trigger the change management process if necessary. Collaborate with Customer to track progress and generate reports based on the initial backlog of user stories. |
| Customer activities The activities to be performed by Contoso Inc | Identify a sponsor who is authorized to make business prioritization decisions and act as a single point of contact for questions about requirements. Identify Customer team members who will be available for the duration of the engagement. Attend and participate in the workshop sessions to define user stories as necessary. Provide updated background information, documentation, and business requirements. Clarify requirements as needed. Collaborate with Microsoft to create a proposed scope for the first delivery sprint. Provide help removing any impediments. Define a UAT process. Identify all security procedures and policies that the Microsoft team must comply with. |
| Key assumptions | Customer representatives (especially the sponsor) will be available throughout the duration of the workshop. Key roles, such as Customer product managers, are available and knowledgeable about their product. The backlog will be refined during product baseline planning, which may result in changes to the overall scope and changes to required capacity. |

### Delivery sprints

Each delivery sprint will last two (2) to four (4) weeks. The final duration for sprints will be determined in collaboration with Customer during product baseline planning. Before sprint planning starts, the Microsoft product manager will collaborate with the feature team to create a proposed sprint backlog. The backlog will consist of a set of PBIs that the feature team estimates may be completed during the sprint.

The first day of each sprint will be set aside to plan for that sprint. In some exceptional cases, sprint planning may extend past the first day. The feature team and the product managers will attend.

During the delivery sprint, the feature teams will build out the Solution with planned user stories/PBIs and architecture, which will be updated, if required. The feature team will perform daily standup meetings to keep everyone informed and to report any impediments.

The last day of the sprint is usually dedicated to demonstrating the functionality that has been achieved in the sprint and to carrying out a retrospective of the sprint. Microsoft will review the outcome delivered to determine if changes are needed (for example, updating the future scope or outcomes). Product changes during the delivery should be minimized so delivery times and targeted outcomes are not impacted. Sprint retrospectives help determine where the team succeeded, and where improvements can be made. The product managers review the completed story and mark them as “done” or “not done” based on the definition of done.

| Category | Description |
| --- | --- |
| Microsoft activities The activities to be performed by Microsoft | Review the user stories assigned to a sprint. Determine if sufficient information is available for each user story or PBI. A user story/PBI will be flagged if more clarification is needed. If sufficient clarification is not available, the user story/PBI may be deferred to later sprints. Review the available capacity and interdependencies across user stories to determine whether the user stories assigned to a sprint can be completed during that sprint. Conduct and participate in daily scrum meetings. Work collaboratively to design and plan for the implementation of user stories. Create and implement unit, functional, and system tests. Collaborate with Contoso Inc product manager to create a proposed scope for future sprints, including a set of user stories that are ready to be assigned. Provide guidance to help Contoso Inc product manager to oversee the backlog.  Identify impediments to engagement delivery progress. Provide ongoing refinement of the effort estimate (effort remaining) of user stories based on the progress of the development, dependencies and architectural constraints or needs. Explore external dependencies. Review and refine the risk list. Provide ongoing collaboration with Contoso Inc to reassess the remaining resource capacity based on the progress of delivery, refined product backlog and clarity about the requirements. Use the deployment process when appropriate to deploy the product to one or more of the agreed-upon environments. At the end of a sprint following activities will be conducted: Sprint review – A sprint review meeting is a single meeting held at the end of the sprint to evaluate the progress and update the product backlog if needed. Attendance by the Microsoft product manager is mandatory; attendance by Customer stakeholders is optional, but recommended (see Delivery sprint completion section for details). Sprint retrospective – The sprint retrospective is an opportunity for the scrum team to inspect itself and determine if there are any improvements that need to be enacted during the next sprint. |
| Customer activities The activities to be performed by Contoso Inc | . Attend and participate in daily scrum meetings if necessary. Help refine user stories and provide timely clarifications. Provide updated background information, documentation, and business requirements. Collaborate with Microsoft to create the proposed scope for future sprints. Provide help removing impediments. Support the Microsoft team with deployments to the agreed-upon environment. Conduct UAT on completed backlog Items according to the UAT cycle defined in the release plan. Attend the sprint review meetings and provide feedback |
| Key assumptions | Customer representatives, especially the sponsor, will be available throughout the duration of the sprint. The backlog will be regularly refined in each sprint, which may result in changes to overall scope and changes to required capacity. |

### Testing and defect remediation

Testing

The following kinds of testing are included in the engagement.

| Test type | Description | Responsibility | Responsibility | Responsibility |
| --- | --- | --- | --- | --- |
| Test type | Description | Has responsibility for testing? | Provides test data and test cases | Provides guidance and support |
| Functional testing (aka unit testing) | Tests performed by a feature team during a delivery sprint to validate that the product features function in accordance with the acceptance criteria defined in the features and user stories. | Microsoft | Microsoft | Microsoft |

Defect remediation

Defects found through functional and system testing will be fixed within the delivery sprint itself. Defects found during UAT or Development, will be prioritized by the appropriate product managers, and become part of the backlog for the feature teams.

| Priority | Description |
| --- | --- |
| High | Blocking or significant defects.  The feature team must prioritize these defects over user stories during sprint and capacity planning. If found during UAT, they must be fixed prior to Development deployment. If found in Development, they must be fixed in the next development sprint. |
| Low | Low priority defects that do not need a mandatory fix before being deployed in Development. However, there should be capacity allocated in every sprint to fix these defects if they exist. This helps to prevent a backlog of defects from accumulating. |

## Deliverables

Microsoft will provide the following.

| Name | Description | Acceptance Required |
| --- | --- | --- |
| Sprint completion report | This report lists the in-scope items that have been completed during the sprint, any planned work that was not completed, and any engagement risks or problems. This report is produced as an output of each sprint. | No |

## Completion and definition of done

### Delivery sprint completion

As part of each sprint review, the feature team will review and demonstrate each backlog item completed in the delivery sprint and confirm whether it is considered “done” using the “definition of done” agreed to during product baseline planning. Each backlog item that is done will be recorded as such in Azure DevOps . The results will also be captured as part of the sprint completion report. The feature team will also review the progress made towards the higher-level objectives by reviewing feature progress, service-level objectives, and other related telemetry data as applicable.

The status of each completed backlog item must be updated in Azure DevOps  within three (3) days after the sprint review meeting is complete.

### Backlog item completion

Backlog items do not require formal sign-off or Customer acceptance when they are completed by the feature team. Any defects found in a finished backlog item will be added to the backlog as a defect and prioritized with the other backlog items by product managers. A finished backlog item may also prompt the product managers to add more backlog items to enhance the Solution.

## Timeline

The timeline for this engagement is relative to the engagement start date. All dates and durations provided are estimates only. The specific timeline will be finalized during product baseline planning and will be updated as part of the core engagement planning activities.

Microsoft will provide the Microsoft team described in the Engagement organization section of this SOW for a period not to exceed <8 weeks>, or until the capacity defined in the WO is consumed. The Microsoft team will work on the outcomes prioritized by Contoso Inc as described in the Engagement outcomes section.

The high-level timeline of the engagement is depicted in the following image.

# Engagement governance

The governance structure and processes the team will adhere to for the engagement are described in the following sections.

## Engagement communication

In addition to the communication mechanisms built into the delivery approach, the following will be used to communicate during the engagement:

- Communication plan: this document will describe the frequency, audience, and content of communication with the team and stakeholders. Microsoft and Customer will develop it as part of engagement planning.
- Status reports: the Microsoft team will prepare and issue regular status reports to engagement stakeholders per the frequency defined in the communication plan.
- Status meetings: the Microsoft team will schedule regular status meetings, per the frequency defined in the communication plan, to review the overall engagement status and open problems and risks.

## Risk and issue management

The following general procedure will be used to manage active engagement issues and risks during the engagement:

- Identify: identify and document engagement issues (current problems) and risks (potential events that could affect the engagement).
- Analyze and prioritize: assess the impact and determine the highest priority risks and issues that will be actively managed.
- Plan and schedule: decide how to manage high-priority risks and assign responsibility for risk management and issue resolution.
- Track and report: monitor and report the status of risks and issues.
- Escalate: escalate to engagement sponsors the high impact issues and risks that the team is unable to resolve.
- Control: review the effectiveness of the risk and issue management actions.
Active issues and risks will be monitored and reassessed every week.

## Change management process

The Microsoft agile approach does not guarantee that all items defined in the product backlog will be completed, nor that all engagement outcomes will be achieved. Should Customer decide to continue work after engagement completion (described in the Engagement completion section), Customer may request a change by following the process below.

During the engagement, either party may request modifications to the services described in this SOW. These changes will take effect only when the proposed change is agreed upon by both parties. The change management process steps are:

- The change is documented: Microsoft will document all change requests in a Microsoft change request form. The change request form includes:
- A description of the change.
- The estimated effect of implementing the change.
- The change is submitted: Microsoft will provide the change request form to Customer.
- The change is accepted or rejected: Customer has three (3) business days to confirm the following to Microsoft:
- Acceptance – Customer must sign and return change request form.
- Rejection – if Customer does not want to proceed with the change or does not provide an approval within three (3) business days, no changes will be performed.
During the engagement, either party can request, in writing, additions, deletions, or modifications to the services described in this SOW (“change”). Approved changes will be managed through amendments, which could lead to additional costs and schedule impacts. Microsoft shall have no obligation to commence work in connection with any change until the details of the change are agreed upon in an amendment signed by the authorized signatories from both parties.

Within three (3) consecutive business days of receipt of the proposed amendment, Customer must either indicate acceptance of the proposed change by signing the amendment or advise Microsoft not to perform the change. If Customer advisees Microsoft not to perform the change, Microsoft will proceed with the original agreed-upon services only. In the absence of Customer acceptance or rejection within the previously noted time frame, Microsoft will not perform the proposed change.

## Escalation path

The product managers, executive sponsor, and other designees will work closely together to manage engagement issues, risks, and change requests as described previously. Contoso Inc will provide reasonable access to sponsors to expedite resolution. The standard escalation path for review, approval, or dispute resolution is as follows:

- Feature team member (Microsoft or Customer)
- Product manager (Microsoft and Customer)
- Executive steering committee

## Engagement completion

Microsoft will provide services defined in this SOW to the extent of the fees available and the term specified in the WO. If additional services are required, the change management process will be followed, and the contract modified. The engagement will be considered complete when at least one of the following conditions has been met:

- All fees available have been utilized for services delivered and expenses incurred.
- The term of the engagement has expired.
- No additional backlog items remain to be assigned to a sprint.
- The WO has been terminated.
Due to the nature of agile delivery, the final backlog items produced at the time of the conclusion of the engagement may or may not include the completion of all the items in the backlog. The Microsoft team will rely on Contoso Inc team to keep an updated and prioritized list of engagement outcomes so that the most important backlog items can be completed during the engagement to support the most important outcomes that take precedence.

# Engagement organization

## Engagement staffing

Microsoft will provide the required skills to help Customer build feature teams to become a product-oriented organization. Feature teams will consist of both Customer and Microsoft delivery resources.

Customer will provide product management oversight. The product managers are responsible for the alignment with the strategy and objectives communicated by Contoso Inc product manager.

The role descriptions for the engagement are shown in the roles and responsibilities table for each area in the engagement organization hierarchy. The capacity available for each Microsoft resource is specified in the WO. If more resource capacity is needed, it can be added through the change management process.

## Executive steering committee

The executive steering committee provides senior management oversight and strategic direction for the engagement. The executive steering committee will meet per the frequency defined in the communication plan and will include the roles listed below.

- Stakeholder review sessions will occur at least once a month. This meeting should be scheduled in the first week of the engagement. Topics covered should include:
- What has been delivered
- Feedback from the executive sponsor
- Approval of major epics

| Role | Responsibilities | Responsible Party |
| --- | --- | --- |
| Executive sponsor | Participates in the executive steering committee. Serves as a point of escalation to support clearing engagement roadblocks. Serves as a final arbiter of engagement issues. Makes decisions about the strategic direction of the engagement. Approves significant change requests. | Customer and Microsoft |
| Engagement owner | Serves as the single point of contact and is accountable for the engagement. Interacts with both Customer and Microsoft executive sponsors. Routinely engages with the Microsoft account delivery executive. Works to eliminate Customer-related issues hindering implementation or speed of the engagement. | Customer |
| Account delivery executive | Serves as the single point of contact and is accountable for service delivery. Has oversight across all service delivery resources. Serves as an escalation point for delivery issues. Takes a lead role to promote Customer satisfaction with both what is being delivered, and how it is being delivered. Leads engagement quality reviews with Contoso Inc executive sponsor to assist with conditions of satisfaction. | Microsoft |

## Product council

The product council is responsible for recent product prioritization, business justification, planning, verification, forecasting, pricing, product launch, and marketing of a product or products at all stages of the product lifecycle.

Ultimately, the product council defines and shares the product strategy and roadmap and makes the decisions necessary to resolve any conflicting product priorities. The following roles will be part of the product council.

Adjust roles and responsibilities section that will be part of the Product Council as appropriate.

| Role | Responsibilities | Responsible Party |
| --- | --- | --- |
| Product line architect | Collaborates with Contoso Inc product line architect and product manager to understand business needs and Solution requirements and assist with technical governance. Provides Customer product managers with technical advice regarding the Microsoft cloud. Works closely across feature teams to help maintain consistency and progress. Serves as the technical person responsible for user story/PBI scope decisions during sprint planning and defines acceptance criteria for work items. Assists product managers with prioritization of scope, and management of backlog. Facilitates conversations among product stakeholders so that the product managers can make informed decisions. | Microsoft |
| Project manager | Oversees and coordinates the overall engagement and delivers it on schedule. Takes responsibility for Customer resource allocation, risk management, engagement priorities, and communication with executive management. Coordinates decisions within 3 business days, or according to an otherwise agreed-upon timeline. | Customer |
| Project manager | Manages and coordinates the overall Microsoft engagement and delivers it on schedule. Takes responsibility for Microsoft resource allocation, risk management, engagement priorities, and communication with executive management. Coordinates decisions within 3 business days, or according to an otherwise agreed-upon timeline. | Microsoft |

## Feature team

Microsoft uses a feature team approach to deliver the engagement. A feature team is an autonomous and empowered unit that has all the capabilities to design, test, and release features designed to reach Customer outcomes. A feature team consists of a product manager, scrum master, technical lead, SMEs, and engineers with development, test, deployment, infrastructure, security, data, and operation skills.

Adjust roles and responsibilities section that will be part of the Feature Team as appropriate.

| Role | Responsibilities | Responsible party |
| --- | --- | --- |
| Product manager (PM) | Manages and prioritizes the product backlog. Serves as the primary person responsible for user story and PBI scope decisions during sprint planning. Serves as the single point of contact for decisions about product backlog items and prioritization. Defines acceptance criteria for work items, especially user stories. Actively participates in all sprint reviews. Takes responsibility for planning UAT and for providing appropriate Customer resources for testing across sprints. Assists Customer with scope prioritization and backlog management. | Customer/Customer assisted by Microsoft |
| Scrum master | Leads the feature team using a disciplined scrum process. Collaborates closely with Contoso Inc to manage the product backlog and facilitate stakeholder collaboration as necessary. Facilitates the daily standup meetings. Helps the team maintain the burndown chart. Sets up retrospectives, sprint reviews, and sprint planning sessions. Handles interruptions and obstacles that would disrupt the team and its progress during the sprint. Guides product managers through complex or technically complicated user stories. Coaches team members in self-management and cross-functionality. Helps the scrum team focus on creating high-value incremental builds that meet the definition of done. Makes sure that all scrum events take place and are positive, productive, and kept on schedule. | Customer |
| Technical lead | Collaborates with Contoso Inc to understand its business needs and Solution requirements and to assist with technical governance. Helps to evaluate the implications of trade-off decisions during product backlog prioritization. Serves as the technical person responsible for user story and PBI scope decisions during sprint planning and defines acceptance criteria for work items. Facilitates conversation among product stakeholders so that product managers can make informed decisions. Facilitates DevOps standardization (for example, DevOps taxonomy, DevOps principles and practices). Provides Contoso Inc with technical advice regarding the Microsoft Cloud. | Microsoft |
| Engineer | Takes responsibility for design, implementation, test, and deployment to Development following DevOps principles. Provides the required skills in the following areas and is an active member of the feature team.  Azure infrastructure Azure security Azure application architecture Azure application development Azure data and AI Automation Testing User experience design The feature team engineering skills and skill mix will vary throughout the engagement, depending on work requirements. Participates in all sprint reviews. | Microsoft |
| SMEs | Provides ongoing guidance to the Microsoft feature teams Participates in all sprint reviews. | Customer |

We will provide 1 feature team(s) to reach the desired outcomes for this engagement, depending upon number of outcomes, velocity, timeline, and budget. Customer will provide a designated product manager for each feature team to support application and feature prioritization. The change management process can be used if additional feature teams are needed to deliver the desired outcomes.

## Security office

The security office consists of Contoso Inc chief information security officer (CISO) or authorized designate and a staff of security champions from Customer, Microsoft, or both. The security office is responsible for setting the security standards and controls that govern the engagement. All products and services delivered during the engagement are required to follow these controls.

| Role | Responsibilities | Responsible Party |
| --- | --- | --- |
| CISO (or delegate) | Reviews and approves the security control framework. | Customer |
| Security champions | Owns the security control framework that defines the necessary controls for the cloud platform and the overall Solution. Works with the different feature teams to understand the required controls for their products and solutions. Develops the security control framework. Coordinates with the product managers to develop priorities and dependencies. Coordinates with the CISO to adopt more cloud-native security controls. | Customer |

# Definitions and acronyms

| Acronym/term | Description |
| --- | --- |
| ALM | Application lifecycle management |
| Backlog or story scope | The requirements or features defined in the product backlog |
| UAT | User acceptance test |
| Engagement scope | The overall vision or scope of the engagement or Solution being created |
| SME | Subject matter expert |
| PM | Product manager |
| PBIs | Product backlog items |
| SSIS | SQL Server Integration Services |
| SSRS | SQL Server Reporting Services |
| SSAS | SQL Server Analysis Services |
| ETL | Extract, transform, and load |
| ELT | Extract, load, and transform |
| Application remediation | Application remediation refers to addressing database calls, such as open database connectivity, Java database connectivity, object linking, and embedding database, and database-specific query languages that are embedded in application code but are not part of the database. |

## Initial product backlog

The table below represents the initial product backlog to be validated and prioritized during product baseline planning. Backlog items may be revised at any time based on direction from Customer, and not all of them may be completed during the engagement. There may also be backlog items added during the engagement that are higher priority to Customer than those listed below. The product backlog is maintained and updated throughout the engagement based on priorities set by Customer by following the agile approach described in the Delivery approach section.

Stay at the epic/feature level in this table. Do not go to user story level.

| # | Item | Description |
| --- | --- | --- |
| 1 | Assessment Database Migration | Oracle to SQL migration assessment and roadmap |
| 2 | POC | Sample use case to demo oracle to sql migration |

## Oracle migrations

The IP and playbooks can be found in our DevOps location here
