# Professional Services Risk Assessment and Mitigation Framework

**Document Version:** 1.0
**Effective Date:** January 2026
**Document Owner:** Chief Risk Officer
**Classification:** Internal Use Only

---

## Executive Summary

This document establishes a comprehensive Risk Assessment and Mitigation Framework for professional services delivery engagements. As a technology company's professional services arm, we face unique risks spanning financial, delivery, technical, compliance, and reputational domains. This framework provides structured methodologies for identifying, assessing, mitigating, monitoring, and reporting risks throughout the engagement lifecycle.

The framework aligns with:
- **ISO 31000:2018** (Risk Management Guidelines)
- **COSO Enterprise Risk Management Framework**
- **Microsoft Enterprise Risk Management (ERM) Principles**
- **SDMPlus/MCEM Delivery Standards**

---

## Table of Contents

1. [Risk Governance Structure](#1-risk-governance-structure)
2. [Risk Categories and Taxonomy](#2-risk-categories-and-taxonomy)
3. [Risk Assessment Methodology](#3-risk-assessment-methodology)
4. [Risk Scoring and Prioritization](#4-risk-scoring-and-prioritization)
5. [Risk Mitigation Strategies](#5-risk-mitigation-strategies)
6. [Risk Monitoring and Reporting](#6-risk-monitoring-and-reporting)
7. [ESAP (Engagement Solution Assurance Program) Integration](#7-esap-integration)
8. [Deal Review and Approval Gates](#8-deal-review-and-approval-gates)
9. [Risk Register Management](#9-risk-register-management)
10. [Lessons Learned Integration](#10-lessons-learned-integration)
11. [Appendices](#appendices)

---

## 1. Risk Governance Structure

### 1.1 Risk Management Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTIVE RISK COMMITTEE                     │
│         (CRO, CFO, COO, Head of Delivery, Legal Counsel)        │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│   DEAL REVIEW     │   │   TECHNICAL       │   │   COMPLIANCE      │
│   COMMITTEE       │   │   QUALITY         │   │   & LEGAL         │
│   (DRC/ORB)       │   │   ASSURANCE       │   │   REVIEW BOARD    │
└───────────────────┘   └───────────────────┘   └───────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ENGAGEMENT RISK OWNERS                        │
│   (Solution Architect, Delivery Manager, CPL, CDP, SQA)          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROJECT DELIVERY TEAMS                        │
│         (Project Managers, Technical Leads, Consultants)         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Roles and Responsibilities

| Role | Risk Responsibilities |
|------|----------------------|
| **Chief Risk Officer (CRO)** | Overall risk strategy, policy ownership, executive reporting, escalation point for critical risks |
| **Executive Risk Committee** | Quarterly risk reviews, approval of risk appetite, major risk decisions |
| **Deal Review Committee (DRC)** | Pre-signature deal risk assessment, approval gates for high-value/complex engagements |
| **Technical Quality Assurance (TQA)** | Solution viability, technical risk assessment, architecture reviews |
| **Solution Quality Assurance (SQA)** | SoW quality, scope clarity, contractual risk, compliance validation |
| **Consulting Practice Lead (CPL)** | Practice-specific risk oversight, resource availability, methodology adherence |
| **Customer Delivery Partner (CDP)** | Customer relationship risk, strategic alignment, consumption goals |
| **Delivery Manager** | Day-to-day risk management, status reporting, mitigation execution |
| **Solution Architect** | Technical feasibility, integration risks, performance/scalability concerns |
| **Account Delivery Lead (ADL)** | Portfolio-level risk aggregation, resource conflicts, account health |

### 1.3 Escalation Matrix

| Risk Level | Escalation Path | Response Time |
|------------|-----------------|---------------|
| **Critical (Level 1)** | Immediate → DRC Chair → CRO → Executive Committee | 4 hours |
| **High (Level 2)** | Within 24 hours → Engagement Lead → CPL/CDP → DRC | 24 hours |
| **Medium (Level 3)** | Weekly review → Delivery Manager → Practice Lead | 1 week |
| **Low (Level 4)** | Monthly review → Project Team → Engagement Lead | 2 weeks |

---

## 2. Risk Categories and Taxonomy

### 2.1 Primary Risk Domains

#### 2.1.1 Financial Risks
| Risk ID | Risk Type | Description | Typical Indicators |
|---------|-----------|-------------|-------------------|
| FIN-001 | Margin Erosion | Project costs exceed budget, reducing profitability | Burn rate >110% of plan |
| FIN-002 | Revenue Leakage | CCCV (Commercial Cloud Contract Value) underutilization | Capacity utilization <80% |
| FIN-003 | Payment Risk | Customer delays or disputes on invoicing | DSO >90 days |
| FIN-004 | Currency Exposure | FX fluctuations affecting multi-currency deals | >5% currency movement |
| FIN-005 | Pricing Risk | Underestimated effort or incorrect rate application | Estimate variance >20% |
| FIN-006 | ECIF Leakage | Early closure or unused capacity in funded deals | ECIF burn <projected |

#### 2.1.2 Delivery Risks
| Risk ID | Risk Type | Description | Typical Indicators |
|---------|-----------|-------------|-------------------|
| DEL-001 | Schedule Slippage | Milestones missed, timeline extensions needed | >2 week variance |
| DEL-002 | Scope Creep | Uncontrolled expansion of requirements | >15% scope growth |
| DEL-003 | Resource Availability | Key personnel unavailable or turnover | >20% team churn |
| DEL-004 | Customer Dependency | Customer fails to meet obligations | >5 blockers/month |
| DEL-005 | Quality Defects | Excessive defects impacting acceptance | S1/S2 defects >threshold |
| DEL-006 | Velocity Failure | Team unable to maintain committed delivery pace | Velocity <70% of plan |
| DEL-007 | Governance Failure | Inadequate PM oversight or steering | Missing governance artifacts |
| DEL-008 | Acceptance Failure | Customer refuses to accept deliverables | Rejected deliverables |

#### 2.1.3 Technical Risks
| Risk ID | Risk Type | Description | Typical Indicators |
|---------|-----------|-------------|-------------------|
| TEC-001 | Solution Viability | Proposed solution cannot be implemented as designed | Architectural concerns |
| TEC-002 | Integration Complexity | Interfaces with external systems fail or are delayed | API failures, data issues |
| TEC-003 | Performance Limits | Solution cannot meet NFR requirements | Load test failures |
| TEC-004 | Technology Maturity | Reliance on non-GA or emerging products | Preview features in scope |
| TEC-005 | Security Vulnerability | Security flaws discovered during implementation | Pen test findings |
| TEC-006 | Data Migration | Data quality, volume, or complexity challenges | Migration errors >5% |
| TEC-007 | ISV Dependency | Third-party ISV solution fails or underperforms | ISV issues, no Plan B |
| TEC-008 | Scalability Limits | Solution cannot scale to production volumes | Stress test failures |

#### 2.1.4 Compliance and Legal Risks
| Risk ID | Risk Type | Description | Typical Indicators |
|---------|-----------|-------------|-------------------|
| COM-001 | Regulatory Non-compliance | Violation of industry regulations (GDPR, HIPAA, etc.) | Audit findings |
| COM-002 | Contractual Breach | Failure to meet contractual obligations | SLA violations |
| COM-003 | IP Exposure | Intellectual property disputes or unauthorized use | IP claims |
| COM-004 | Responsible AI | AI systems causing harm or bias | RAI assessment failures |
| COM-005 | Privacy Violation | Improper handling of personal data | Data breach |
| COM-006 | Subcontractor Risk | Third-party vendors failing compliance | Vendor audit issues |
| COM-007 | Conflict of Interest | Real or perceived conflicts in engagement | Ethics violations |
| COM-008 | Export Control | Technology transfer violations | ITAR/EAR issues |

#### 2.1.5 Reputational Risks
| Risk ID | Risk Type | Description | Typical Indicators |
|---------|-----------|-------------|-------------------|
| REP-001 | Customer Dissatisfaction | Poor CSAT/NPS scores, complaints | CSAT <3.5/5 |
| REP-002 | Reference Loss | Customer unwilling to provide reference | Negative feedback |
| REP-003 | Public Failure | Project failure becomes publicly known | Media coverage |
| REP-004 | Partner Damage | Relationship with ISV/partners harmed | Partner escalations |
| REP-005 | Employee Impact | Talent loss or morale issues from failed project | Attrition spike |

#### 2.1.6 Strategic/Commercial Risks
| Risk ID | Risk Type | Description | Typical Indicators |
|---------|-----------|-------------|-------------------|
| STR-001 | Account Relationship | Strategic account health at risk | Executive escalations |
| STR-002 | Consumption Failure | Cloud consumption goals not achieved | ACR/MAU below target |
| STR-003 | Competitive Loss | Customer considering competitor solutions | Competitive RFPs |
| STR-004 | Strategic Misalignment | Engagement doesn't support business objectives | Priority conflicts |
| STR-005 | Market Changes | External market shifts affecting engagement | Industry disruption |

### 2.2 Risk Category Weightings by Engagement Type

| Engagement Type | Financial | Delivery | Technical | Compliance | Reputational | Strategic |
|-----------------|-----------|----------|-----------|------------|--------------|-----------|
| **Agile Implementation** | 15% | 25% | 25% | 15% | 10% | 10% |
| **Cloud Migration (CTS)** | 15% | 20% | 30% | 15% | 10% | 10% |
| **Business Applications** | 20% | 20% | 25% | 15% | 10% | 10% |
| **Advisory/Consulting** | 25% | 15% | 15% | 20% | 15% | 10% |
| **Managed Services** | 20% | 25% | 20% | 20% | 10% | 5% |
| **AI/ML Implementations** | 15% | 20% | 25% | 25% | 10% | 5% |

---

## 3. Risk Assessment Methodology

### 3.1 Risk Assessment Lifecycle

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   IDENTIFY   │───▶│    ASSESS    │───▶│   RESPOND    │───▶│   MONITOR    │
│              │    │              │    │              │    │              │
│ • Discovery  │    │ • Probability│    │ • Accept     │    │ • Track KRIs │
│ • Checklists │    │ • Impact     │    │ • Mitigate   │    │ • Report     │
│ • Workshops  │    │ • Urgency    │    │ • Transfer   │    │ • Review     │
│ • History    │    │ • Score      │    │ • Avoid      │    │ • Escalate   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       ▲                                                            │
       └────────────────────────────────────────────────────────────┘
                        Continuous Improvement Loop
```

### 3.2 Risk Identification Methods

#### 3.2.1 Pre-Engagement (Deal Phase)
- **Deal Qualification Checklist**: Standard questions during opportunity assessment
- **Customer Maturity Assessment**: Evaluate customer's capability to deliver on dependencies
- **Historical Analysis**: Review past engagements with customer/similar scope
- **Solution Review**: TQA assessment of proposed technical solution
- **Estimation Review**: Validate effort estimates against benchmarks

#### 3.2.2 During Engagement (Delivery Phase)
- **Weekly Risk Reviews**: Structured review in project status meetings
- **RAID Log Analysis**: Continuous update of Risks, Assumptions, Issues, Dependencies
- **Sprint Retrospectives**: Agile ceremonies surfacing delivery risks
- **Technical Checkpoints**: Architecture and code reviews
- **Customer Feedback**: Regular pulse checks and escalation reviews

#### 3.2.3 Post-Engagement (Closure Phase)
- **Lessons Learned Sessions**: Structured post-mortem analysis
- **Risk Materialization Review**: Which risks occurred, which were mitigated
- **Knowledge Base Update**: Feed findings into organizational learning

### 3.3 Risk Assessment Questionnaire

For each identified risk, answer the following:

| Question | Purpose |
|----------|---------|
| 1. What is the specific risk event? | Clear definition |
| 2. What triggers could cause this risk to materialize? | Root cause analysis |
| 3. What is the probability of occurrence (1-5)? | Likelihood assessment |
| 4. What is the impact if it occurs (1-5)? | Consequence analysis |
| 5. When might this risk materialize? | Timing/urgency |
| 6. Who is affected (customer, team, company)? | Stakeholder impact |
| 7. What early warning indicators exist? | Detection capability |
| 8. What mitigation actions are possible? | Response options |
| 9. Who should own this risk? | Accountability |
| 10. What is the residual risk after mitigation? | Effectiveness assessment |

---

## 4. Risk Scoring and Prioritization

### 4.1 Probability Assessment Scale

| Level | Probability | Description | Historical Frequency |
|-------|-------------|-------------|---------------------|
| 1 | Rare | Unlikely to occur | <5% of similar engagements |
| 2 | Unlikely | Could occur but not expected | 5-15% of similar engagements |
| 3 | Possible | May occur during engagement | 15-40% of similar engagements |
| 4 | Likely | More likely than not to occur | 40-70% of similar engagements |
| 5 | Almost Certain | Expected to occur | >70% of similar engagements |

### 4.2 Impact Assessment Scale

| Level | Impact | Financial | Schedule | Scope | Quality | Reputation |
|-------|--------|-----------|----------|-------|---------|------------|
| 1 | Negligible | <$10K | <1 week | Minimal | Minor defects | None |
| 2 | Minor | $10K-$50K | 1-2 weeks | <5% change | Some rework | Team level |
| 3 | Moderate | $50K-$200K | 2-4 weeks | 5-15% change | Significant rework | Customer level |
| 4 | Major | $200K-$1M | 1-3 months | 15-30% change | Major quality issues | Account level |
| 5 | Severe | >$1M | >3 months | >30% change | Project failure | Public/Market |

### 4.3 Risk Priority Matrix

```
                         IMPACT
              1      2      3      4      5
           ┌──────┬──────┬──────┬──────┬──────┐
         5 │  5   │  10  │  15  │  20  │  25  │
           │ Med  │ Med  │ High │V.High│V.High│
           ├──────┼──────┼──────┼──────┼──────┤
         4 │  4   │  8   │  12  │  16  │  20  │
           │ Low  │ Med  │ Med  │ High │V.High│
P          ├──────┼──────┼──────┼──────┼──────┤
R        3 │  3   │  6   │  9   │  12  │  15  │
O          │ Low  │ Low  │ Med  │ Med  │ High │
B          ├──────┼──────┼──────┼──────┼──────┤
         2 │  2   │  4   │  6   │  8   │  10  │
           │V.Low │ Low  │ Low  │ Med  │ Med  │
           ├──────┼──────┼──────┼──────┼──────┤
         1 │  1   │  2   │  3   │  4   │  5   │
           │V.Low │V.Low │ Low  │ Low  │ Med  │
           └──────┴──────┴──────┴──────┴──────┘
```

### 4.4 Risk Priority Levels

| Priority Level | Score Range | Color | Action Required |
|----------------|-------------|-------|-----------------|
| **Very High** | 16-25 | 🔴 Red | Immediate escalation and mitigation required |
| **High** | 12-15 | 🟠 Orange | Mitigation plan mandatory, DRC visibility |
| **Medium** | 6-11 | 🟡 Yellow | Active management, regular monitoring |
| **Low** | 3-5 | 🟢 Green | Monitor, accept with documentation |
| **Very Low** | 1-2 | ⚪ White | Accept, minimal monitoring |

### 4.5 Velocity/Urgency Modifier

| Urgency | Modifier | Trigger |
|---------|----------|---------|
| **Immediate** | +3 | Risk could materialize within 1 week |
| **Near-term** | +2 | Risk could materialize within 1 month |
| **Medium-term** | +1 | Risk could materialize within 1 quarter |
| **Long-term** | 0 | Risk is 3+ months away |

**Adjusted Priority Score** = Base Score + Urgency Modifier

---

## 5. Risk Mitigation Strategies

### 5.1 Risk Response Framework

| Strategy | Description | When to Use | Example |
|----------|-------------|-------------|---------|
| **Avoid** | Eliminate the risk by removing the cause | High impact, high probability risks where avoidance is feasible | Remove non-GA feature from scope |
| **Mitigate** | Reduce probability or impact through controls | Most common approach for manageable risks | Add buffer to timeline, increase testing |
| **Transfer** | Shift risk ownership to third party | Risks better managed by others | Customer owns data migration, insurance |
| **Accept** | Acknowledge risk without active mitigation | Low priority risks or risks with no viable mitigation | Minor schedule risk with customer awareness |

### 5.2 Standard Mitigation Patterns by Risk Category

#### 5.2.1 Financial Risk Mitigations
| Risk | Standard Mitigations |
|------|---------------------|
| **Margin Erosion** | Weekly burn rate monitoring, early warning at 105%, escalation at 110%, scope/resource adjustment |
| **Revenue Leakage** | Monthly CCCV utilization review, proactive customer engagement, capacity redeployment |
| **Payment Risk** | Milestone-based invoicing, customer credit check, payment terms enforcement |
| **Pricing Risk** | Estimation peer review, contingency buffer (10-20%), fixed-price ceiling provisions |

#### 5.2.2 Delivery Risk Mitigations
| Risk | Standard Mitigations |
|------|---------------------|
| **Schedule Slippage** | Buffer in timeline (15-20%), critical path monitoring, acceleration options identified |
| **Scope Creep** | Formal change control process, scope freeze periods, CR pricing defined in SoW |
| **Resource Availability** | Backup resources identified, cross-training, early recruitment for specialized skills |
| **Customer Dependency** | Dependencies in SoW with dates, weekly tracking, escalation path defined, CR for delays |
| **Quality Defects** | Definition of Done, testing gates, acceptance criteria per deliverable |

#### 5.2.3 Technical Risk Mitigations
| Risk | Standard Mitigations |
|------|---------------------|
| **Solution Viability** | Architecture review (TQA), POC for unproven approaches, design spikes |
| **Integration Complexity** | Interface contracts early, integration testing environment, stub/mock services |
| **Performance Limits** | NFR validation in requirements, load testing in scope, performance budget |
| **Technology Maturity** | Avoid non-GA in production scope, PG engagement, fallback architecture |
| **ISV Dependency** | ISV vetting checklist, SLA from ISV, Plan B documented, RACI clarity |

#### 5.2.4 Compliance Risk Mitigations
| Risk | Standard Mitigations |
|------|---------------------|
| **Regulatory Non-compliance** | Compliance requirements in scope, specialized resources, audit checkpoints |
| **Responsible AI** | RAI assessment via ISD RAI Champ, content filtering, red team testing, monitoring |
| **Privacy Violation** | Data classification, encryption, access controls, DPA in place, ISRA completed |
| **Subcontractor Risk** | Vendor vetting, flowdown clauses, audit rights, performance monitoring |

### 5.3 Mitigation Effectiveness Tracking

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Mitigation Implementation Rate** | >95% | % of planned mitigations executed on time |
| **Risk Reduction Ratio** | >60% | (Initial Score - Residual Score) / Initial Score |
| **Risk Materialization Rate** | <15% | % of identified risks that materialize |
| **Mitigation Cost Ratio** | <10% of deal value | Total mitigation costs / engagement value |

---

## 6. Risk Monitoring and Reporting

### 6.1 Key Risk Indicators (KRIs)

#### 6.1.1 Leading Indicators (Predictive)
| KRI | Threshold | Data Source | Frequency |
|-----|-----------|-------------|-----------|
| Customer responsiveness | Response time >48 hours | Communication logs | Weekly |
| Team velocity trend | Declining 2+ sprints | ADO/Jira | Per sprint |
| Open blockers count | >3 critical blockers | RAID log | Daily |
| Requirement stability | >10% change/month | Change log | Monthly |
| Resource bench strength | <1 backup per critical role | Resource plan | Monthly |

#### 6.1.2 Lagging Indicators (Confirmatory)
| KRI | Threshold | Data Source | Frequency |
|-----|-----------|-------------|-----------|
| Budget burn rate | >110% | Financial systems | Weekly |
| Schedule variance | >2 weeks behind | Project schedule | Weekly |
| Defect density | >threshold by type | Test management | Per release |
| Customer satisfaction | CSAT <3.5 | Survey results | Monthly |
| Escalation count | >2/month | Escalation log | Monthly |

### 6.2 Reporting Cadence and Formats

| Report | Audience | Frequency | Content |
|--------|----------|-----------|---------|
| **Project Risk Status** | Delivery Team | Weekly | Current risks, status, actions |
| **Engagement Risk Dashboard** | Engagement Lead, CPL | Weekly | Top risks, KRIs, escalations |
| **Practice Risk Summary** | Practice Leadership | Bi-weekly | Aggregated practice risks |
| **DRC Risk Briefing** | Deal Review Committee | Per deal | Deal-specific risk assessment |
| **Executive Risk Report** | CRO, ExCom | Monthly | Portfolio risk heat map, trends |
| **Quarterly Risk Review** | Board/Audit Committee | Quarterly | Strategic risks, materialized losses |

### 6.3 Risk Dashboard Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ENGAGEMENT RISK DASHBOARD                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │   OVERALL RISK      │  │   RISKS BY STATUS   │  │   RISKS BY OWNER    │  │
│  │   SCORE: 14/25      │  │   Open: 12          │  │   SA: 4             │  │
│  │   [████████░░] 56%  │  │   Mitigating: 8     │  │   DM: 6             │  │
│  │   Level: MEDIUM     │  │   Closed: 23        │  │   CPL: 2            │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │   TOP 5 RISKS                                                         │  │
│  │   1. 🔴 [TEC-003] Performance requirements may exceed platform limits │  │
│  │   2. 🟠 [DEL-004] Customer resource availability for UAT phase        │  │
│  │   3. 🟠 [FIN-001] Scope additions without corresponding budget        │  │
│  │   4. 🟡 [TEC-007] ISV integration timeline at risk                    │  │
│  │   5. 🟡 [DEL-002] Requirements volatility in Module 3                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │   RISK TREND (Last 8 Weeks)                                           │  │
│  │   Score: 18 → 16 → 15 → 14 → 14 → 13 → 14 → 14                        │  │
│  │   [Trend Chart: Slightly Declining]                                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │   KRI ALERTS                                                          │  │
│  │   ⚠️ Budget burn rate: 108% (threshold: 105%)                         │  │
│  │   ⚠️ Open blockers: 4 (threshold: 3)                                  │  │
│  │   ✅ Customer responsiveness: 24 hours (threshold: 48)                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. ESAP (Engagement Solution Assurance Program) Integration

### 7.1 ESAP Level Determination

ESAP levels determine the depth of risk review and approval requirements:

| ESAP Level | Criteria | Risk Review Requirements |
|------------|----------|-------------------------|
| **Type 1 (High Risk)** | Deal value >$5M OR Margin <10% OR Complex solution OR Customer escalation history | Full DRC review, TQA mandatory, SQA mandatory, Executive sign-off |
| **Type 2 (Medium Risk)** | Deal value >$1M OR Margin <15% OR New technology OR First engagement with customer | DRC review, SQA review, Practice Lead approval |
| **Type 3 (Low Risk)** | Standard engagement below thresholds | Standard review, Solution Architect sign-off |

### 7.2 Risk-Based Review Requirements by ESAP Level

| Review Activity | Type 1 | Type 2 | Type 3 |
|-----------------|--------|--------|--------|
| Solution Architect Review | Required | Required | Required |
| SQA Review | Required | Required | Optional |
| TQA Assessment | Required | Recommended | Optional |
| CPL Approval | Required | Required | Required |
| CDP Approval | Required | Required | Optional |
| ADL Approval | Required | Optional | Not Required |
| DRC Presentation | Required | Optional | Not Required |
| Executive Sponsor | Required | Not Required | Not Required |
| RAI Assessment | If AI in scope | If AI in scope | If AI in scope |
| ISRA Completion | Required | Required | Required |

### 7.3 Minimum Acceptable Risk Score by ESAP Level

| ESAP Level | Maximum Acceptable Aggregate Risk Score | Minimum Mitigation Coverage |
|------------|----------------------------------------|----------------------------|
| Type 1 | 15/25 (Medium) | 100% of High/Critical risks |
| Type 2 | 18/25 (Medium-High) | 100% of Critical, 90% of High |
| Type 3 | 20/25 (High) | 100% of Critical |

---

## 8. Deal Review and Approval Gates

### 8.1 Pre-Signature Risk Gates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEAL LIFECYCLE RISK GATES                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  QUALIFICATION    SOLUTIONING    SOW DRAFTING    REVIEW    SIGNATURE       │
│       │               │               │            │            │          │
│       ▼               ▼               ▼            ▼            ▼          │
│   ┌───────┐       ┌───────┐       ┌───────┐    ┌───────┐    ┌───────┐     │
│   │Gate 1 │──────▶│Gate 2 │──────▶│Gate 3 │───▶│Gate 4 │───▶│Gate 5 │     │
│   │       │       │       │       │       │    │       │    │       │     │
│   │Qualify│       │Solution│       │ SoW   │    │Review │    │Sign   │     │
│   │ Risk  │       │ Risk   │       │ Risk  │    │ Risk  │    │ Risk  │     │
│   └───────┘       └───────┘       └───────┘    └───────┘    └───────┘     │
│       │               │               │            │            │          │
│   • Account risk   • Tech viability • Scope clear • All reviews • Exec     │
│   • Fit assessment • Estimation     • AC defined  • Approvals   • Sign-off │
│   • Complexity     • Architecture   • Risks in    • Mitigations • Contract │
│                    • Resource plan    register    • DRC (if req)• final    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Gate Criteria

#### Gate 1: Qualification Risk Assessment
- [ ] Account health score reviewed
- [ ] Customer payment history verified
- [ ] Competitive situation assessed
- [ ] Strategic fit confirmed
- [ ] Initial complexity rating assigned

#### Gate 2: Solution Risk Assessment
- [ ] Technical solution documented
- [ ] Architecture reviewed (TQA for Type 1)
- [ ] Estimation peer-reviewed
- [ ] Resource availability confirmed
- [ ] Technology risks identified
- [ ] ISV dependencies vetted (if applicable)

#### Gate 3: SoW Risk Assessment
- [ ] Scope clearly bounded (in/out)
- [ ] Deliverables have acceptance criteria
- [ ] Customer responsibilities documented
- [ ] Assumptions stated explicitly
- [ ] Initial risk register populated
- [ ] No banned phrases present
- [ ] Methodology alignment verified

#### Gate 4: Review Risk Assessment
- [ ] All required persona reviews completed
- [ ] Risk register reviewed and approved
- [ ] All High/Critical risks have mitigations
- [ ] Mitigation owners assigned
- [ ] DRC approval (if required)
- [ ] RAI assessment complete (if AI in scope)
- [ ] ISRA completed in Virtuoso

#### Gate 5: Signature Risk Clearance
- [ ] All gate criteria met
- [ ] Final risk score within acceptable range
- [ ] Executive approval (for Type 1)
- [ ] Contract terms acceptable
- [ ] Special conditions addressed
- [ ] Risk reserve set appropriately

---

## 9. Risk Register Management

### 9.1 Risk Register Structure

Each risk entry must contain:

| Field | Required | Description |
|-------|----------|-------------|
| Risk ID | Yes | Unique identifier (e.g., PRJ-001-TEC-003) |
| Title | Yes | Brief descriptive name |
| Category | Yes | Primary risk domain (Financial, Delivery, Technical, Compliance, Reputational, Strategic) |
| Description | Yes | Detailed description of the risk event |
| Root Cause | Yes | Underlying cause or trigger |
| Probability | Yes | 1-5 scale per methodology |
| Impact | Yes | 1-5 scale per methodology |
| Priority Score | Yes | Probability × Impact |
| Priority Level | Yes | Very Low to Very High |
| Status | Yes | Identified, Assessed, Mitigating, Accepted, Closed, Materialized |
| Mitigation Strategy | Yes (High+) | Avoid, Mitigate, Transfer, Accept |
| Mitigation Actions | Yes (High+) | Specific steps to address risk |
| Owner | Yes | Person accountable for managing risk |
| Due Date | Yes (High+) | Target date for mitigation completion |
| Residual Score | Yes (after mitigation) | Expected score after mitigation |
| KRIs | Optional | Key indicators to monitor |
| Related Risks | Optional | Links to dependent risks |
| History | Auto | Audit trail of changes |

### 9.2 Risk Register Lifecycle

```
┌──────────────┐
│  IDENTIFIED  │ ── New risk entered, awaiting assessment
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   ASSESSED   │ ── Probability/Impact scored, priority assigned
└──────┬───────┘
       │
       ├─────────────────────────────┐
       ▼                             ▼
┌──────────────┐              ┌──────────────┐
│  MITIGATING  │              │   ACCEPTED   │ ── Low priority, documented acceptance
└──────┬───────┘              └──────┬───────┘
       │                             │
       ▼                             │
┌──────────────┐                     │
│   CLOSED     │ ◄───────────────────┘
│  (Mitigated) │ ── Risk reduced to acceptable level or no longer applicable
└──────────────┘

       │
       ▼ (If risk occurs)
┌──────────────┐
│ MATERIALIZED │ ── Risk event occurred, becomes Issue
└──────────────┘
```

### 9.3 Risk Register Review Cadence

| Review Type | Frequency | Participants | Purpose |
|-------------|-----------|--------------|---------|
| **Project Risk Review** | Weekly | PM, Tech Lead | Status update, new risks |
| **Engagement Risk Review** | Bi-weekly | Delivery Manager, SA, Customer | Customer visibility, decisions |
| **Practice Risk Aggregation** | Monthly | CPL, All DMs | Trend analysis, resource risks |
| **Portfolio Risk Review** | Quarterly | CRO, Practice Heads | Strategic risks, policy updates |

---

## 10. Lessons Learned Integration

### 10.1 Risk Learning Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RISK LEARNING ECOSYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────┐                           ┌───────────────────────────┐ │
│   │   DELIVERY    │                           │    KNOWLEDGE BASE         │ │
│   │   EXPERIENCE  │──────────────────────────▶│                           │ │
│   │               │  Lessons Learned          │  • Risk patterns by type  │ │
│   │ • Risks that  │  Sessions                 │  • Mitigation playbooks   │ │
│   │   materialized│                           │  • Industry benchmarks    │ │
│   │ • Mitigations │                           │  • Customer profiles      │ │
│   │   that worked │                           │                           │ │
│   │ • Near misses │                           └───────────────────────────┘ │
│   └───────────────┘                                       │                 │
│                                                           │                 │
│                                                           ▼                 │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                    SMART RISK ENGINE                                   │ │
│   │                                                                        │ │
│   │  • Pattern recognition from historical data                            │ │
│   │  • Risk scoring calibration                                            │ │
│   │  • Mitigation effectiveness tracking                                   │ │
│   │  • Predictive risk identification                                      │ │
│   │  • Automated risk suggestions during deal shaping                      │ │
│   │                                                                        │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│                              ▼                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                    NEW ENGAGEMENTS                                     │ │
│   │                                                                        │ │
│   │  • Pre-populated risk checklists based on engagement type              │ │
│   │  • Suggested mitigations from similar engagements                      │ │
│   │  • Customer-specific risk history                                      │ │
│   │  • Methodology-specific risk templates                                 │ │
│   │                                                                        │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Lessons Learned Capture Template

| Field | Description |
|-------|-------------|
| Engagement ID | Reference to source engagement |
| Risk ID | Original risk identifier |
| Risk Category | Classification |
| Risk Description | What was the risk |
| Materialized? | Yes/No/Partial |
| Impact Realized | Actual impact if materialized |
| Mitigation Applied | What actions were taken |
| Mitigation Effectiveness | Did it work? (1-5 scale) |
| Key Learning | What should others know |
| Recommended Actions | Changes to standard mitigations |
| Applicable Scenarios | When does this apply |
| Keywords | For searchability |

### 10.3 Risk Intelligence Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| **Lessons Capture Rate** | Engagements with LL / Total engagements | >90% |
| **Risk Prediction Accuracy** | Predicted risks that materialized / Total predictions | Calibration |
| **Mitigation Reuse Rate** | Mitigations from KB used / Total mitigations | >50% |
| **Time to Risk Identification** | Days from engagement start to risk identification | <14 days avg |

---

## Appendices

### Appendix A: Banned Phrases in SoW Risk Documentation

The following phrases create unacceptable risk exposure and must NEVER appear in SoW documentation:

| Banned Phrase | Risk Created | Alternative Language |
|---------------|--------------|---------------------|
| "guarantee" | Unlimited liability | "target", "objective", "expected" |
| "ensure" | Absolute commitment | "work toward", "make reasonable efforts" |
| "best effort" | Undefined standard | Specific, measurable commitments |
| "unlimited" | No scope boundary | Define specific limits |
| "at sole discretion" | Customer control | "mutually agreed" |
| "to client's satisfaction" | Subjective acceptance | Defined acceptance criteria |
| "as needed" | Open-ended scope | "as defined in scope" |
| "roughly" | Imprecise estimates | Specific ranges with assumptions |

### Appendix B: Risk Assessment Checklist by Engagement Type

#### B.1 Agile Implementation Checklist
- [ ] Customer Agile maturity assessed
- [ ] Product Owner authority confirmed
- [ ] Backlog exists or discovery phase included
- [ ] Definition of Ready/Done established
- [ ] Sprint cadence agreed
- [ ] Capacity-based delivery understood by customer
- [ ] Non-functional requirements defined
- [ ] Change request process for velocity changes

#### B.2 Cloud Migration (CTS) Checklist
- [ ] Application discovery complete
- [ ] Complexity assessment performed
- [ ] Migration velocity assumptions stated
- [ ] Customer preparation responsibilities clear
- [ ] Cut-over planning included
- [ ] Rollback procedures defined
- [ ] Business continuity addressed
- [ ] Security controls validated
- [ ] GSI RACI defined (if applicable)

#### B.3 Business Applications Checklist
- [ ] Fit/gap analysis scope defined
- [ ] Integration workload estimated
- [ ] Data migration strategy documented
- [ ] Test cycles and customer obligations clear
- [ ] Defect resolution process defined
- [ ] ISV vetted and RACI established
- [ ] Performance testing budgeted
- [ ] Customer capabilities validated

### Appendix C: Risk Reserve Calculation

Risk reserve should be set based on aggregate risk profile:

| Risk Profile | Reserve Percentage | Calculation Basis |
|--------------|-------------------|-------------------|
| Conservative (Type 1) | 15-20% | High-risk deals, new customers |
| Standard (Type 2) | 10-15% | Typical engagements |
| Aggressive (Type 3) | 5-10% | Low-risk, repeat business |

**Formula:**
```
Risk Reserve = Σ (Risk Probability × Risk Impact × Estimated Cost) for all High/Critical risks
```

### Appendix D: Risk Communication Templates

#### D.1 Risk Escalation Template

```
RISK ESCALATION NOTICE

Date: [Date]
Engagement: [Name]
Escalated By: [Name/Role]
Escalated To: [Name/Role]

Risk ID: [ID]
Risk Title: [Title]
Current Status: [Status]
Priority Level: [Level]

Situation:
[Describe current state of the risk]

Impact if Unaddressed:
[Describe potential consequences]

Recommended Actions:
[List specific actions needed]

Decision Required By: [Date]
Support Needed:
[List resources/authority needed]

Attachments:
[List relevant documents]
```

#### D.2 Risk Acceptance Template

```
RISK ACCEPTANCE FORM

Date: [Date]
Engagement: [Name]
Risk ID: [ID]

Risk Description:
[Full description]

Reason for Acceptance:
[Why mitigation is not feasible/cost-effective]

Residual Impact if Materialized:
[Financial/Schedule/Quality impacts]

Monitoring Plan:
[How the risk will be monitored]

Trigger for Re-evaluation:
[Conditions that would require reassessment]

Approved By:
[Name/Role] - Date: [Date]
[Name/Role] - Date: [Date]
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2026 | CRO Office | Initial release |

---

**Next Review Date:** April 2026
**Classification:** Internal Use Only
**Distribution:** Professional Services Leadership, Delivery Managers, Solution Architects, Quality Assurance Teams
