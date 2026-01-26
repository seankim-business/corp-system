# GDPR Compliance Roadmap for Nubabel SaaS

> **Document Version:** 1.0  
> **Last Updated:** January 2026  
> **Scope:** Multi-tenant SaaS platform with Slack/MCP integrations  
> **Regulatory Framework:** EU General Data Protection Regulation (GDPR) 2016/679

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Controller/Processor Roles](#2-controllerprocessor-roles)
3. [Lawful Basis for Processing](#3-lawful-basis-for-processing)
4. [Data Mapping and Records of Processing](#4-data-mapping-and-records-of-processing)
5. [Data Protection Impact Assessments (DPIA)](#5-data-protection-impact-assessments-dpia)
6. [Data Subject Rights and DSAR Workflows](#6-data-subject-rights-and-dsar-workflows)
7. [Data Retention and Deletion](#7-data-retention-and-deletion)
8. [Breach Notification and Response](#8-breach-notification-and-response)
9. [Multi-Tenant SaaS Considerations](#9-multi-tenant-saas-considerations)
10. [Technical and Organizational Measures](#10-technical-and-organizational-measures)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Compliance Checklists](#12-compliance-checklists)
13. [Sample Policies and Controls](#13-sample-policies-and-controls)
14. [Authoritative Sources and Citations](#14-authoritative-sources-and-citations)

---

## 1. Executive Summary

This document provides a comprehensive GDPR compliance framework for Nubabel, a multi-tenant SaaS platform with Slack and MCP (Model Context Protocol) integrations. It addresses the unique challenges of processing personal data in a shared infrastructure environment while maintaining strict tenant isolation and regulatory compliance.

### Key Compliance Objectives

- **Establish clear controller/processor relationships** with customers and third-party integrations
- **Implement robust data subject rights workflows** including DSAR handling within 30-day SLA
- **Maintain comprehensive records of processing activities** (ROPA) per Article 30
- **Deploy technical measures for multi-tenant data isolation** and security
- **Create incident response procedures** meeting 72-hour breach notification requirements

### Nubabel-Specific Context

| Integration       | Data Flow                      | GDPR Consideration                                 |
| ----------------- | ------------------------------ | -------------------------------------------------- |
| Slack             | User messages, workspace data  | Nubabel as processor; Slack customer as controller |
| MCP Servers       | Tool invocations, context data | Varies by MCP server configuration                 |
| AI/LLM Processing | Prompts, responses, embeddings | Special attention to automated decision-making     |

---

## 2. Controller/Processor Roles

### 2.1 Definitions (Article 4 GDPR)

| Role                  | Definition                                                    | Key Responsibilities                                                                          |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Data Controller**   | Determines the purposes and means of processing personal data | Overall compliance, lawful basis, transparency, data subject rights                           |
| **Data Processor**    | Processes personal data on behalf of the controller           | Follow controller instructions, security measures, breach notification to controller          |
| **Joint Controllers** | Two or more controllers jointly determine purposes and means  | Transparent arrangement, allocate responsibilities, single point of contact for data subjects |

> **Citation:** European Commission, "Controller/processor" [^1]; ICO, "A guide to controllers and processors" [^2]

### 2.2 Nubabel's Role Analysis

#### Scenario 1: Nubabel as Processor (Primary Scenario)

When customers use Nubabel to process their end-users' data:

```
Customer (Controller) --> Nubabel (Processor) --> Sub-processors (if any)
```

**Nubabel's Processor Obligations:**

- [ ] Process data only on documented instructions from the controller
- [ ] Ensure persons processing data are bound by confidentiality
- [ ] Implement appropriate technical and organizational security measures
- [ ] Engage sub-processors only with prior authorization
- [ ] Assist controller with data subject requests
- [ ] Delete or return data at end of service
- [ ] Make available information to demonstrate compliance
- [ ] Allow and contribute to audits

#### Scenario 2: Nubabel as Controller

When Nubabel processes data for its own purposes:

| Processing Activity         | Purpose              | Lawful Basis                       |
| --------------------------- | -------------------- | ---------------------------------- |
| Customer account management | Service delivery     | Contract (Art. 6(1)(b))            |
| Usage analytics             | Service improvement  | Legitimate interest (Art. 6(1)(f)) |
| Marketing communications    | Business development | Consent (Art. 6(1)(a))             |
| Security logging            | Platform security    | Legitimate interest (Art. 6(1)(f)) |

#### Scenario 3: Dual Role

Nubabel may act as both controller and processor simultaneously:

- **Controller** for: Customer account data, billing information, platform analytics
- **Processor** for: Customer's end-user data processed through the platform

### 2.3 Data Processing Agreement (DPA) Requirements

Per Article 28(3), the DPA must include:

| Clause                      | Requirement                          | Implementation                   |
| --------------------------- | ------------------------------------ | -------------------------------- |
| Subject matter and duration | Define processing scope              | Tied to service agreement term   |
| Nature and purpose          | Specify processing activities        | Reference to service description |
| Type of personal data       | Categories processed                 | Defined in data inventory        |
| Categories of data subjects | Who the data relates to              | End-users, employees, contacts   |
| Controller obligations      | Rights and responsibilities          | Audit rights, instructions       |
| Processor obligations       | Security, sub-processors, assistance | Technical measures, DSAR support |

### 2.4 Controller Checklist

```markdown
## Controller Determination Indicators

- [ ] We decided to collect or process the personal data
- [ ] We decided what the purpose or outcome of the processing was to be
- [ ] We decided what personal data should be collected
- [ ] We decided which individuals to collect personal data about
- [ ] We obtain commercial gain from the processing
- [ ] We make decisions about individuals as a result of processing
- [ ] We have a direct relationship with the data subjects
- [ ] We appointed processors to process data on our behalf
```

### 2.5 Processor Checklist

```markdown
## Processor Determination Indicators

- [ ] We follow instructions from someone else regarding processing
- [ ] We were given the personal data by a customer or third party
- [ ] We do not decide to collect personal data from individuals
- [ ] We do not decide the lawful basis for use of data
- [ ] We do not decide what purposes the data will be used for
- [ ] We do not decide whether to disclose data, or to whom
- [ ] We do not decide how long to retain the data
- [ ] We are not interested in the end result of the processing
```

---

## 3. Lawful Basis for Processing

### 3.1 The Six Lawful Bases (Article 6)

| Basis                   | Article | When Applicable                               | Documentation Required                |
| ----------------------- | ------- | --------------------------------------------- | ------------------------------------- |
| **Consent**             | 6(1)(a) | Freely given, specific, informed, unambiguous | Consent records, withdrawal mechanism |
| **Contract**            | 6(1)(b) | Necessary for contract performance            | Service agreement                     |
| **Legal Obligation**    | 6(1)(c) | Required by law                               | Legal reference                       |
| **Vital Interests**     | 6(1)(d) | Protect life                                  | Rare in SaaS context                  |
| **Public Interest**     | 6(1)(e) | Official authority                            | N/A for private SaaS                  |
| **Legitimate Interest** | 6(1)(f) | Balanced against data subject rights          | LIA documentation                     |

> **Citation:** GDPR Article 6 [^3]; ICO, "Lawful basis for processing" [^4]

### 3.2 Lawful Basis Selection for Nubabel

| Processing Activity      | Recommended Basis              | Justification                        |
| ------------------------ | ------------------------------ | ------------------------------------ |
| Core service delivery    | Contract                       | Necessary to provide agreed services |
| Customer support         | Contract                       | Part of service delivery             |
| Security monitoring      | Legitimate Interest            | Essential for platform security      |
| Product analytics        | Legitimate Interest            | Service improvement (with LIA)       |
| Marketing emails         | Consent                        | Requires explicit opt-in             |
| Third-party integrations | Contract/Consent               | Depends on integration type          |
| AI/ML model training     | Consent or Legitimate Interest | Requires careful assessment          |

### 3.3 Legitimate Interest Assessment (LIA) Template

```markdown
## Legitimate Interest Assessment

### 1. Purpose Test

**What is the legitimate interest?**
[Describe the specific interest being pursued]

**Who benefits?**

- [ ] Our organization
- [ ] Third parties
- [ ] Data subjects
- [ ] Wider society

**Is the interest lawful and clearly articulated?**
[Yes/No with explanation]

### 2. Necessity Test

**Is the processing necessary for this purpose?**
[Explain why processing is required]

**Could the purpose be achieved in a less intrusive way?**
[Document alternatives considered]

### 3. Balancing Test

**What is the nature of the personal data?**

- [ ] Basic identifiers
- [ ] Contact information
- [ ] Behavioral data
- [ ] Special category data

**What are the reasonable expectations of data subjects?**
[Document expected understanding]

**What is the likely impact on data subjects?**

- Positive impacts: [List]
- Negative impacts: [List]

**Are there additional safeguards to reduce impact?**
[List safeguards implemented]

### 4. Conclusion

**Can we rely on legitimate interest?**
[Yes/No with reasoning]

**Review date:** [Date]
**Approved by:** [Name/Role]
```

> **Citation:** EDPB Guidelines 01/2024 on Legitimate Interests [^5]

---

## 4. Data Mapping and Records of Processing

### 4.1 Data Mapping Requirements

Data mapping is the foundation of GDPR compliance, required to:

- Understand what personal data is processed
- Identify data flows and storage locations
- Support DSAR fulfillment
- Enable accurate ROPA maintenance

> **Citation:** ICO, "Documentation" [^6]; GDPR Article 30 [^7]

### 4.2 Nubabel Data Inventory

| Data Category         | Data Elements                 | Source            | Storage Location  | Retention                  | Legal Basis         |
| --------------------- | ----------------------------- | ----------------- | ----------------- | -------------------------- | ------------------- |
| **Account Data**      | Name, email, company          | Registration      | Primary DB        | Account lifetime + 7 years | Contract            |
| **Authentication**    | Password hash, MFA tokens     | User input        | Auth service      | Account lifetime           | Contract            |
| **Usage Data**        | Actions, timestamps, IP       | Platform activity | Analytics DB      | 2 years                    | Legitimate Interest |
| **Slack Integration** | Messages, user IDs, workspace | Slack API         | Encrypted storage | Per customer policy        | Contract            |
| **MCP Context**       | Tool calls, responses         | MCP servers       | Session storage   | Session + 30 days          | Contract            |
| **Support Tickets**   | Communications, attachments   | Customer input    | Support system    | 3 years post-resolution    | Contract            |
| **Billing**           | Payment method, invoices      | Customer input    | Payment processor | 7 years (legal)            | Legal Obligation    |

### 4.3 Records of Processing Activities (ROPA)

#### Controller ROPA Template (Article 30(1))

```markdown
## Record of Processing Activities - Controller

### Organization Details

- **Controller Name:** Nubabel Inc.
- **Contact Details:** [Address, Email, Phone]
- **Data Protection Officer:** [Name, Contact]
- **EU Representative (if applicable):** [Name, Contact]

### Processing Activity: [Name]

| Field                                   | Details                                  |
| --------------------------------------- | ---------------------------------------- |
| **Purpose of Processing**               | [Describe purpose]                       |
| **Categories of Data Subjects**         | [e.g., Customers, End-users, Employees]  |
| **Categories of Personal Data**         | [e.g., Contact info, Usage data]         |
| **Recipients/Categories of Recipients** | [Internal teams, Sub-processors]         |
| **International Transfers**             | [Countries, Safeguards (SCCs, adequacy)] |
| **Retention Period**                    | [Duration or criteria]                   |
| **Technical/Organizational Measures**   | [Security controls reference]            |
| **Lawful Basis**                        | [Article 6 basis]                        |
| **Last Review Date**                    | [Date]                                   |
```

#### Processor ROPA Template (Article 30(2))

```markdown
## Record of Processing Activities - Processor

### Organization Details

- **Processor Name:** Nubabel Inc.
- **Contact Details:** [Address, Email, Phone]
- **Data Protection Officer:** [Name, Contact]

### Processing on Behalf of: [Controller Name]

| Field                                 | Details                         |
| ------------------------------------- | ------------------------------- |
| **Categories of Processing**          | [Types of processing performed] |
| **International Transfers**           | [Countries, Safeguards]         |
| **Technical/Organizational Measures** | [Security controls]             |
| **Sub-processors Used**               | [List with purposes]            |
```

### 4.4 Data Flow Diagram - Nubabel Platform

```
                                    ┌─────────────────┐
                                    │   End Users     │
                                    └────────┬────────┘
                                             │
                                             ▼
┌─────────────────┐              ┌─────────────────────┐
│  Slack          │◄────────────►│   Nubabel Platform  │
│  (Integration)  │              │   (Multi-tenant)    │
└─────────────────┘              └──────────┬──────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
           ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
           │  Primary DB   │      │  Analytics    │      │  MCP Servers  │
           │  (Tenant Data)│      │  (Aggregated) │      │  (Context)    │
           └───────────────┘      └───────────────┘      └───────────────┘
                    │
                    ▼
           ┌───────────────┐
           │ Sub-processors│
           │ (Cloud, CDN)  │
           └───────────────┘
```

---

## 5. Data Protection Impact Assessments (DPIA)

### 5.1 When DPIA is Required

A DPIA is mandatory under Article 35 when processing is "likely to result in a high risk" to individuals' rights and freedoms.

> **Citation:** ICO, "When do we need to do a DPIA?" [^8]; European Commission, "When is a DPIA required?" [^9]

#### Automatic DPIA Triggers (Article 35(3))

| Trigger                                                     | Nubabel Relevance                              |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Systematic and extensive profiling with significant effects | AI-powered features, automated recommendations |
| Large-scale processing of special category data             | If health/biometric data processed             |
| Systematic monitoring of publicly accessible areas          | N/A                                            |

#### High-Risk Indicators (EDPB Guidelines)

| Indicator                                                  | Nubabel Assessment                        |
| ---------------------------------------------------------- | ----------------------------------------- |
| Evaluation or scoring                                      | AI/ML features may trigger                |
| Automated decision-making with legal/significant effects   | Review AI features                        |
| Systematic monitoring                                      | Usage tracking, security monitoring       |
| Sensitive data or highly personal data                     | Depends on customer use cases             |
| Large-scale processing                                     | Multi-tenant platform = likely            |
| Matching or combining datasets                             | Cross-integration data flows              |
| Data concerning vulnerable subjects                        | If customers serve vulnerable populations |
| Innovative use of technology                               | MCP/AI integrations                       |
| Data transfer outside EU                                   | Cloud infrastructure location             |
| Processing preventing data subjects from exercising rights | Review access controls                    |

**Rule of Thumb:** If 2+ indicators apply, conduct a DPIA.

### 5.2 DPIA Process

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. Screening   │────►│  2. Description │────►│  3. Assessment  │
│  (Is DPIA       │     │  (Document      │     │  (Identify      │
│   required?)    │     │   processing)   │     │   risks)        │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐              │
│  6. Review      │◄────│  5. Sign-off    │◄─────────────┤
│  (Ongoing)      │     │  (Approval)     │              │
└─────────────────┘     └─────────────────┘              │
                                                         ▼
                                               ┌─────────────────┐
                                               │  4. Mitigation  │
                                               │  (Controls)     │
                                               └─────────────────┘
```

### 5.3 DPIA Template

```markdown
## Data Protection Impact Assessment

### 1. Project Overview

- **Project Name:** [Name]
- **Project Owner:** [Name/Role]
- **DPO Consulted:** [Yes/No, Date]
- **Assessment Date:** [Date]

### 2. Processing Description

**What personal data will be processed?**
[List data categories]

**Why is the processing necessary?**
[Purpose and justification]

**Who will the data be shared with?**
[Recipients, sub-processors]

**How long will data be retained?**
[Retention period and justification]

### 3. Necessity and Proportionality

**Is the processing necessary for the purpose?**
[Assessment]

**Is the processing proportionate?**
[Assessment]

**What is the lawful basis?**
[Article 6 basis with justification]

### 4. Risk Assessment

| Risk                 | Likelihood | Severity | Overall Risk | Mitigation |
| -------------------- | ---------- | -------- | ------------ | ---------- |
| Unauthorized access  | [H/M/L]    | [H/M/L]  | [H/M/L]      | [Control]  |
| Data breach          | [H/M/L]    | [H/M/L]  | [H/M/L]      | [Control]  |
| Inaccurate data      | [H/M/L]    | [H/M/L]  | [H/M/L]      | [Control]  |
| Excessive retention  | [H/M/L]    | [H/M/L]  | [H/M/L]      | [Control]  |
| Cross-tenant leakage | [H/M/L]    | [H/M/L]  | [H/M/L]      | [Control]  |

### 5. Measures to Address Risks

[Document technical and organizational measures]

### 6. Consultation

**Has the DPO been consulted?** [Yes/No]
**DPO Opinion:** [Summary]

**Is prior consultation with supervisory authority required?**
[Yes/No - required if high residual risk cannot be mitigated]

### 7. Sign-off

- **Project Owner:** [Signature, Date]
- **DPO:** [Signature, Date]
- **Senior Management:** [Signature, Date]

### 8. Review Schedule

**Next Review Date:** [Date]
**Review Triggers:** [List events requiring re-assessment]
```

---

## 6. Data Subject Rights and DSAR Workflows

### 6.1 Overview of Data Subject Rights

| Right                              | Article | Description                                  | Response Time       |
| ---------------------------------- | ------- | -------------------------------------------- | ------------------- |
| **Right of Access**                | 15      | Obtain confirmation and copy of data         | 1 month             |
| **Right to Rectification**         | 16      | Correct inaccurate data                      | 1 month             |
| **Right to Erasure**               | 17      | Delete data ("right to be forgotten")        | 1 month             |
| **Right to Restriction**           | 18      | Limit processing                             | 1 month             |
| **Right to Data Portability**      | 20      | Receive data in machine-readable format      | 1 month             |
| **Right to Object**                | 21      | Object to processing                         | Without undue delay |
| **Rights re: Automated Decisions** | 22      | Not be subject to solely automated decisions | 1 month             |

> **Citation:** ICO, "Right of access" [^10]; EDPB, "How do I respond to a request for erasure?" [^11]

### 6.2 DSAR Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DSAR HANDLING WORKFLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

Day 0: Request Received
        │
        ▼
┌───────────────────┐
│ 1. Log Request    │ ─── Record: Date, Channel, Request Type
│    Start Timer    │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐     ┌───────────────────┐
│ 2. Verify Identity│────►│ Request           │
│                   │ No  │ Clarification     │ ─── Clock pauses
└────────┬──────────┘     └───────────────────┘
         │ Yes
         ▼
┌───────────────────┐     ┌───────────────────┐
│ 3. Assess Request │────►│ Manifestly        │
│    Validity       │     │ Unfounded/        │ ─── May refuse or charge fee
└────────┬──────────┘     │ Excessive?        │
         │ Valid          └───────────────────┘
         ▼
┌───────────────────┐
│ 4. Locate Data    │ ─── Search all systems, including backups
│    (All Systems)  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 5. Review Data    │ ─── Check for third-party data, exemptions
│    Apply          │
│    Exemptions     │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 6. Prepare        │ ─── Compile response, redact where necessary
│    Response       │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 7. Deliver to     │ ─── Secure delivery method
│    Data Subject   │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 8. Document       │ ─── Retain records of request and response
│    Completion     │
└─────────────────────┘

Timeline: Must complete within 1 month (extendable to 3 months for complex requests)
```

### 6.3 DSAR Response Checklist

```markdown
## DSAR Processing Checklist

### Receipt and Logging

- [ ] Request logged with unique reference number
- [ ] Receipt date recorded (timer starts)
- [ ] Request channel documented
- [ ] Initial acknowledgment sent (recommended within 3 days)

### Identity Verification

- [ ] Requester identity verified
- [ ] If third-party request, authorization confirmed
- [ ] Verification method documented

### Request Assessment

- [ ] Request type identified (access, erasure, etc.)
- [ ] Scope of request clarified if needed
- [ ] Manifestly unfounded/excessive assessment completed
- [ ] Extension required? (notify within 1 month)

### Data Location

- [ ] Primary database searched
- [ ] Analytics systems searched
- [ ] Backup systems searched
- [ ] Third-party integrations checked (Slack, MCP)
- [ ] Email/support systems searched
- [ ] Log files reviewed

### Data Review

- [ ] Third-party personal data identified and redacted
- [ ] Applicable exemptions documented
- [ ] Legal review completed (if complex)

### Response Preparation

- [ ] Data compiled in accessible format
- [ ] Supplementary information included (purposes, recipients, retention)
- [ ] Response reviewed for completeness

### Delivery

- [ ] Secure delivery method used
- [ ] Delivery confirmation obtained
- [ ] Response within deadline

### Documentation

- [ ] Complete record retained
- [ ] Lessons learned documented
```

### 6.4 Right to Erasure Implementation

#### Erasure Triggers (Article 17(1))

| Trigger                                       | Action Required                         |
| --------------------------------------------- | --------------------------------------- |
| Data no longer necessary                      | Delete when purpose fulfilled           |
| Consent withdrawn                             | Delete unless other lawful basis exists |
| Data subject objects (no overriding grounds)  | Delete                                  |
| Unlawful processing                           | Delete                                  |
| Legal obligation to erase                     | Delete                                  |
| Data collected from child for online services | Delete                                  |

#### Erasure Exceptions (Article 17(3))

| Exception                    | Example                 |
| ---------------------------- | ----------------------- |
| Freedom of expression        | Journalistic purposes   |
| Legal obligation to retain   | Tax records, audit logs |
| Public health                | Medical records         |
| Archiving in public interest | Historical research     |
| Legal claims                 | Litigation hold         |

#### Technical Erasure Procedure

```markdown
## Data Erasure Procedure

### 1. Scope Identification

- Identify all systems containing the data subject's data
- Include: Primary DB, backups, logs, analytics, integrations

### 2. Erasure Methods by System

| System              | Method                                            | Verification         |
| ------------------- | ------------------------------------------------- | -------------------- |
| Primary Database    | Hard delete or anonymization                      | Query confirmation   |
| Backups             | Exclude from future restores, delete when rotated | Backup log review    |
| Analytics           | Anonymization                                     | Aggregation check    |
| Logs                | Anonymization (if retention required)             | Log review           |
| Third-party (Slack) | API deletion request                              | Confirmation receipt |
| Search indexes      | Re-index without data                             | Search verification  |

### 3. Notification to Recipients

- Notify all recipients of the data about erasure
- Document notifications sent

### 4. Verification

- Confirm deletion across all systems
- Document verification steps
- Retain erasure record (without personal data)
```

---

## 7. Data Retention and Deletion

### 7.1 Storage Limitation Principle (Article 5(1)(e))

Personal data must be kept for no longer than necessary for the purposes for which it is processed.

> **Citation:** ICO, "Storage limitation" [^12]; European Commission, "How long can data be kept?" [^13]

### 7.2 Nubabel Retention Schedule

| Data Category                 | Retention Period              | Justification                 | Deletion Method     |
| ----------------------------- | ----------------------------- | ----------------------------- | ------------------- |
| **Active Account Data**       | Account lifetime              | Service delivery              | N/A while active    |
| **Closed Account Data**       | 30 days post-closure          | Grace period for reactivation | Hard delete         |
| **Billing Records**           | 7 years                       | Tax/legal requirements        | Archive then delete |
| **Support Tickets**           | 3 years post-resolution       | Service improvement, disputes | Anonymize or delete |
| **Usage Analytics**           | 2 years                       | Product improvement           | Anonymization       |
| **Security Logs**             | 1 year                        | Security investigations       | Automated deletion  |
| **Audit Logs**                | 7 years                       | Compliance, legal             | Secure archive      |
| **Slack Integration Data**    | Per customer policy           | Customer-controlled           | Customer-initiated  |
| **MCP Session Data**          | 30 days post-session          | Debugging, continuity         | Automated deletion  |
| **Marketing Consent Records** | Duration of consent + 3 years | Proof of consent              | Secure archive      |
| **DSAR Records**              | 3 years                       | Demonstrate compliance        | Secure archive      |

### 7.3 Retention Policy Template

```markdown
## Data Retention Policy

### 1. Purpose

This policy establishes retention periods for personal data processed by Nubabel
to ensure compliance with GDPR Article 5(1)(e) (storage limitation).

### 2. Scope

Applies to all personal data processed by Nubabel, whether as controller or processor.

### 3. Principles

- Data retained only as long as necessary for specified purposes
- Retention periods documented and justified
- Regular review of retained data
- Secure deletion when retention period expires

### 4. Retention Schedule

[Insert retention schedule table]

### 5. Exceptions

- Legal holds: Data subject to litigation preserved regardless of schedule
- Regulatory requests: Data preserved as required by authorities
- Ongoing investigations: Security-related data preserved during investigation

### 6. Deletion Procedures

- Automated deletion for time-based retention
- Manual review for complex data categories
- Verification of deletion completion
- Documentation of deletion actions

### 7. Review

This policy reviewed annually or upon significant changes to processing activities.

**Policy Owner:** [Role]
**Last Review:** [Date]
**Next Review:** [Date]
```

---

## 8. Breach Notification and Response

### 8.1 Breach Notification Requirements

| Requirement                   | Timeline            | Threshold                    | Citation      |
| ----------------------------- | ------------------- | ---------------------------- | ------------- |
| Notify Supervisory Authority  | 72 hours            | Risk to rights/freedoms      | Article 33    |
| Notify Data Subjects          | Without undue delay | High risk to rights/freedoms | Article 34    |
| Processor notifies Controller | Without undue delay | Any breach                   | Article 33(2) |

> **Citation:** GDPR Articles 33-34 [^14]; ICO, "72 hours - how to respond to a personal data breach" [^15]

### 8.2 Breach Response Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     BREACH RESPONSE WORKFLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

HOUR 0: Breach Detected/Reported
        │
        ▼
┌───────────────────┐
│ 1. CONTAIN        │ ─── Immediate actions to stop ongoing breach
│    (Immediate)    │     - Isolate affected systems
└────────┬──────────┘     - Preserve evidence
         │                - Activate incident response team
         ▼
┌───────────────────┐
│ 2. ASSESS         │ ─── Determine scope and severity
│    (Hours 0-24)   │     - What data affected?
└────────┬──────────┘     - How many data subjects?
         │                - What is the risk level?
         ▼
┌───────────────────┐
│ 3. RISK EVALUATE  │ ─── Determine notification requirements
│    (Hours 0-48)   │
└────────┬──────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│No Risk │ │Risk    │
│to      │ │Exists  │
│Rights  │ │        │
└────┬───┘ └────┬───┘
     │          │
     ▼          ▼
┌────────┐ ┌────────────────────┐
│Document│ │4. NOTIFY AUTHORITY │ ─── Within 72 hours
│Only    │ │   (Hour 72 max)    │     - Nature of breach
└────────┘ └─────────┬──────────┘     - Categories/numbers affected
                     │                - Likely consequences
                     │                - Measures taken
                     ▼
              ┌──────────────┐
              │ High Risk?   │
              └──────┬───────┘
                     │
              ┌──────┴──────┐
              │             │
              ▼             ▼
        ┌──────────┐  ┌──────────────────┐
        │ No       │  │ 5. NOTIFY DATA   │ ─── Without undue delay
        │          │  │    SUBJECTS      │     - Clear language
        └──────────┘  └─────────┬────────┘     - Nature of breach
                                │              - Recommendations
                                ▼
                      ┌──────────────────┐
                      │ 6. REMEDIATE     │ ─── Fix vulnerabilities
                      │                  │     - Implement controls
                      └─────────┬────────┘     - Update procedures
                                │
                                ▼
                      ┌──────────────────┐
                      │ 7. POST-INCIDENT │ ─── Lessons learned
                      │    REVIEW        │     - Update policies
                      └──────────────────┘     - Training
```

### 8.3 Breach Notification Content

#### To Supervisory Authority (Article 33(3))

```markdown
## Breach Notification to Supervisory Authority

### 1. Nature of Breach

- Description of breach
- Date/time of breach
- Date/time of discovery
- How breach was discovered

### 2. Data Subjects Affected

- Categories of data subjects
- Approximate number of data subjects
- Categories of personal data
- Approximate number of records

### 3. Likely Consequences

- Potential impact on data subjects
- Risk assessment

### 4. Measures Taken

- Immediate containment actions
- Remediation steps
- Measures to mitigate adverse effects

### 5. Contact Information

- DPO name and contact details
- Other contact point for more information
```

#### To Data Subjects (Article 34)

```markdown
## Breach Notification to Data Subjects

Dear [Name],

We are writing to inform you of a personal data breach that may affect your information.

**What happened:**
[Clear, plain language description of the breach]

**What information was involved:**
[Types of personal data affected]

**What we are doing:**
[Steps taken to address the breach and protect your data]

**What you can do:**
[Recommended protective actions - e.g., change passwords, monitor accounts]

**For more information:**
Contact our Data Protection Officer at [contact details]

We sincerely apologize for any concern this may cause.

[Signature]
```

### 8.4 Breach Register Template

| Field              | Description                     |
| ------------------ | ------------------------------- |
| Breach ID          | Unique identifier               |
| Date Discovered    | When breach was identified      |
| Date Occurred      | When breach actually happened   |
| Description        | Nature of the breach            |
| Data Categories    | Types of personal data affected |
| Data Subjects      | Number and categories affected  |
| Cause              | Root cause analysis             |
| Risk Assessment    | Risk level and justification    |
| Authority Notified | Yes/No, Date, Reference         |
| Subjects Notified  | Yes/No, Date, Method            |
| Remediation        | Actions taken                   |
| Lessons Learned    | Improvements identified         |

---

## 9. Multi-Tenant SaaS Considerations

### 9.1 Data Isolation Requirements

Multi-tenant architecture requires strict data segregation to prevent cross-tenant data leakage.

> **Citation:** ComplyDog, "Multi-Tenant SaaS Privacy" [^16]; Microsoft Azure, "Governance and compliance in multitenant solutions" [^17]

#### Isolation Strategies

| Strategy             | Description                  | GDPR Benefit        | Implementation                  |
| -------------------- | ---------------------------- | ------------------- | ------------------------------- |
| **Database-level**   | Separate database per tenant | Strongest isolation | Higher cost, complex management |
| **Schema-level**     | Separate schema per tenant   | Good isolation      | Moderate complexity             |
| **Row-level**        | Tenant ID with RLS           | Cost-effective      | Requires careful implementation |
| **Encryption-based** | Tenant-specific keys         | Data protection     | Key management overhead         |

### 9.2 Nubabel Multi-Tenant Controls

```markdown
## Multi-Tenant Data Isolation Controls

### Database Layer

- [ ] Tenant ID enforced on all data tables
- [ ] Row-Level Security (RLS) policies active
- [ ] Cross-tenant queries prevented at database level
- [ ] Tenant context validated on every request

### Application Layer

- [ ] Tenant context injected at authentication
- [ ] All queries include tenant filter
- [ ] API endpoints validate tenant ownership
- [ ] Session isolation between tenants

### Network Layer

- [ ] Network segmentation where applicable
- [ ] Tenant-specific API rate limiting
- [ ] Logging includes tenant context

### Encryption

- [ ] Data encrypted at rest (AES-256)
- [ ] Data encrypted in transit (TLS 1.3)
- [ ] Consider tenant-specific encryption keys for sensitive data

### Access Control

- [ ] RBAC enforced within tenant boundary
- [ ] Admin access logged and audited
- [ ] No cross-tenant admin access without explicit authorization

### Monitoring

- [ ] Anomaly detection for cross-tenant access attempts
- [ ] Audit logging of all data access
- [ ] Regular penetration testing for isolation
```

### 9.3 Integration-Specific Considerations

#### Slack Integration

| Aspect           | GDPR Consideration              | Control                 |
| ---------------- | ------------------------------- | ----------------------- |
| Message data     | Processor for customer data     | DPA with customer       |
| User identifiers | Pseudonymization where possible | Map to internal IDs     |
| Workspace data   | Tenant isolation                | Workspace-scoped access |
| OAuth tokens     | Secure storage                  | Encrypted, rotated      |

#### MCP Server Integration

| Aspect                  | GDPR Consideration        | Control               |
| ----------------------- | ------------------------- | --------------------- |
| Context data            | May contain personal data | Minimize, encrypt     |
| Tool invocations        | Audit trail required      | Comprehensive logging |
| Third-party MCP servers | Sub-processor assessment  | DPA, security review  |
| Session persistence     | Retention limits          | Auto-expiry           |

---

## 10. Technical and Organizational Measures

### 10.1 Article 32 Requirements

Controllers and processors must implement appropriate technical and organizational measures to ensure security appropriate to the risk.

> **Citation:** ENISA, "Data Protection Engineering" [^18]; GDPR Article 32 [^19]

### 10.2 Technical Measures

| Category                     | Measure                                 | Implementation                      |
| ---------------------------- | --------------------------------------- | ----------------------------------- |
| **Access Control**           | RBAC, MFA, least privilege              | Identity provider, role definitions |
| **Encryption**               | At-rest (AES-256), in-transit (TLS 1.3) | Database encryption, HTTPS          |
| **Pseudonymization**         | Replace identifiers with tokens         | Tokenization service                |
| **Logging & Monitoring**     | Comprehensive audit trails              | SIEM, log aggregation               |
| **Backup & Recovery**        | Regular backups, tested recovery        | Automated backups, DR plan          |
| **Vulnerability Management** | Regular scanning, patching              | Automated scanning, patch policy    |
| **Network Security**         | Firewalls, segmentation, WAF            | Cloud security groups, WAF          |
| **Endpoint Security**        | Device management, encryption           | MDM, disk encryption                |

### 10.3 Organizational Measures

| Category              | Measure                                   | Implementation              |
| --------------------- | ----------------------------------------- | --------------------------- |
| **Policies**          | Data protection, security, acceptable use | Documented, communicated    |
| **Training**          | GDPR awareness, security training         | Annual training, onboarding |
| **Incident Response** | Documented procedures, team               | IR plan, regular drills     |
| **Vendor Management** | Due diligence, DPAs                       | Vendor assessment process   |
| **Access Reviews**    | Regular access certification              | Quarterly reviews           |
| **Change Management** | Controlled changes, testing               | Change advisory board       |
| **Physical Security** | Data center security                      | Cloud provider controls     |

### 10.4 Security Controls Checklist

```markdown
## GDPR Security Controls Checklist

### Confidentiality

- [ ] Access control mechanisms in place
- [ ] Multi-factor authentication enabled
- [ ] Encryption at rest implemented
- [ ] Encryption in transit implemented
- [ ] Data classification scheme defined

### Integrity

- [ ] Input validation on all data entry
- [ ] Checksums/hashing for data integrity
- [ ] Audit logging enabled
- [ ] Change detection mechanisms

### Availability

- [ ] Backup procedures documented and tested
- [ ] Disaster recovery plan in place
- [ ] High availability architecture
- [ ] Incident response procedures

### Resilience

- [ ] Regular security testing (penetration tests)
- [ ] Vulnerability scanning
- [ ] Patch management process
- [ ] Business continuity planning

### Evaluation

- [ ] Regular security assessments
- [ ] Compliance audits
- [ ] Control effectiveness testing
- [ ] Continuous improvement process
```

---

## 11. Implementation Roadmap

### 11.1 Phase 1: Foundation (Months 1-2)

| Task                           | Owner        | Deliverable           |
| ------------------------------ | ------------ | --------------------- |
| Appoint DPO or privacy lead    | Leadership   | DPO appointment       |
| Complete data mapping          | Privacy team | Data inventory        |
| Document processing activities | Privacy team | ROPA                  |
| Identify lawful bases          | Privacy team | Lawful basis register |
| Review existing contracts      | Legal        | Contract gap analysis |

### 11.2 Phase 2: Core Compliance (Months 3-4)

| Task                         | Owner                 | Deliverable       |
| ---------------------------- | --------------------- | ----------------- |
| Implement DSAR workflow      | Privacy + Engineering | DSAR process      |
| Create privacy notices       | Privacy + Legal       | Updated notices   |
| Establish retention schedule | Privacy + Engineering | Retention policy  |
| Implement consent management | Engineering           | Consent mechanism |
| Conduct initial DPIAs        | Privacy team          | DPIA reports      |

### 11.3 Phase 3: Technical Controls (Months 5-6)

| Task                                 | Owner       | Deliverable                |
| ------------------------------------ | ----------- | -------------------------- |
| Implement data deletion capabilities | Engineering | Deletion automation        |
| Enhance access controls              | Engineering | RBAC implementation        |
| Deploy encryption                    | Engineering | Encryption at rest/transit |
| Implement audit logging              | Engineering | Audit trail system         |
| Establish breach detection           | Security    | Monitoring alerts          |

### 11.4 Phase 4: Operationalization (Months 7-8)

| Task                 | Owner              | Deliverable        |
| -------------------- | ------------------ | ------------------ |
| Train all staff      | HR + Privacy       | Training records   |
| Test DSAR process    | Privacy team       | Process validation |
| Conduct breach drill | Security + Privacy | Drill report       |
| Finalize vendor DPAs | Legal              | Signed DPAs        |
| Internal audit       | Privacy team       | Audit report       |

### 11.5 Phase 5: Continuous Improvement (Ongoing)

| Task                | Frequency | Owner                 |
| ------------------- | --------- | --------------------- |
| ROPA review         | Quarterly | Privacy team          |
| Policy review       | Annually  | Privacy team          |
| Training refresh    | Annually  | HR                    |
| DPIA reviews        | As needed | Privacy team          |
| Control testing     | Annually  | Security              |
| Vendor reassessment | Annually  | Procurement + Privacy |

---

## 12. Compliance Checklists

### 12.1 Master GDPR Compliance Checklist

```markdown
## GDPR Compliance Master Checklist

### Governance

- [ ] Data Protection Officer appointed (if required)
- [ ] Privacy governance structure established
- [ ] Accountability documentation maintained
- [ ] Regular compliance reviews scheduled

### Lawfulness

- [ ] Lawful basis identified for all processing
- [ ] Consent mechanisms compliant (where used)
- [ ] Legitimate interest assessments completed
- [ ] Special category data processing justified

### Transparency

- [ ] Privacy notice published and accessible
- [ ] Privacy notice covers all required information
- [ ] Layered notices for complex processing
- [ ] Just-in-time notices for specific processing

### Data Subject Rights

- [ ] DSAR process documented and operational
- [ ] Identity verification procedures in place
- [ ] Response within 1-month SLA
- [ ] Erasure capability implemented
- [ ] Portability capability implemented
- [ ] Objection handling process defined

### Data Minimization

- [ ] Only necessary data collected
- [ ] Purpose limitation enforced
- [ ] Retention periods defined and enforced
- [ ] Regular data review and deletion

### Accuracy

- [ ] Data accuracy procedures in place
- [ ] Rectification process operational
- [ ] Data quality monitoring

### Security

- [ ] Technical measures implemented
- [ ] Organizational measures implemented
- [ ] Regular security assessments
- [ ] Incident response plan tested

### Breach Management

- [ ] Breach detection capabilities
- [ ] Breach response procedures documented
- [ ] 72-hour notification process ready
- [ ] Breach register maintained

### International Transfers

- [ ] Transfer mechanisms identified (SCCs, adequacy)
- [ ] Transfer impact assessments completed
- [ ] Supplementary measures implemented if needed

### Processors

- [ ] Processor due diligence conducted
- [ ] DPAs in place with all processors
- [ ] Sub-processor management process
- [ ] Processor compliance monitoring

### DPIAs

- [ ] DPIA screening process defined
- [ ] DPIAs conducted for high-risk processing
- [ ] DPIA outcomes implemented
- [ ] Regular DPIA reviews

### Records

- [ ] ROPA maintained and current
- [ ] Processing activities documented
- [ ] Compliance evidence retained
```

### 12.2 Monthly Compliance Tasks

```markdown
## Monthly GDPR Compliance Tasks

### Week 1

- [ ] Review open DSARs and status
- [ ] Check DSAR response deadlines
- [ ] Review breach register for patterns

### Week 2

- [ ] Audit access control changes
- [ ] Review new vendor onboarding
- [ ] Check consent withdrawal requests

### Week 3

- [ ] Review retention schedule compliance
- [ ] Check automated deletion logs
- [ ] Audit cross-tenant access attempts

### Week 4

- [ ] Update ROPA if changes occurred
- [ ] Review security alerts
- [ ] Prepare monthly compliance report
```

---

## 13. Sample Policies and Controls

### 13.1 Data Protection Policy (Summary)

```markdown
## Nubabel Data Protection Policy

### 1. Purpose

This policy establishes Nubabel's commitment to protecting personal data
in compliance with GDPR and applicable data protection laws.

### 2. Scope

Applies to all personal data processed by Nubabel, all employees,
contractors, and third parties processing data on our behalf.

### 3. Principles

We adhere to the GDPR principles:

- Lawfulness, fairness, and transparency
- Purpose limitation
- Data minimization
- Accuracy
- Storage limitation
- Integrity and confidentiality
- Accountability

### 4. Roles and Responsibilities

- **Data Protection Officer:** [Contact]
- **Data Owners:** Responsible for data in their domain
- **All Staff:** Comply with this policy

### 5. Key Requirements

- Process data only with lawful basis
- Collect only necessary data
- Keep data accurate and up-to-date
- Retain data only as long as needed
- Keep data secure
- Respect data subject rights

### 6. Breach Reporting

Report any suspected breach immediately to [security@nubabel.com]

### 7. Training

All staff must complete annual data protection training.

### 8. Compliance

Violations may result in disciplinary action.

**Policy Owner:** DPO
**Effective Date:** [Date]
**Review Date:** [Date + 1 year]
```

### 13.2 DSAR Handling Procedure

```markdown
## Data Subject Access Request Procedure

### 1. Receipt

- Log request in DSAR register
- Assign unique reference number
- Record date received (Day 0)
- Send acknowledgment within 3 business days

### 2. Verification

- Verify requester identity
- If third-party, verify authorization
- Request additional information if needed (clock pauses)

### 3. Assessment

- Determine request type(s)
- Assess if manifestly unfounded or excessive
- Determine if extension needed (complex/numerous)

### 4. Data Gathering

- Search all relevant systems
- Compile personal data
- Identify third-party data for redaction
- Apply exemptions where applicable

### 5. Review

- Legal review if complex
- DPO review if sensitive
- Prepare response package

### 6. Response

- Provide data in accessible format
- Include supplementary information
- Use secure delivery method
- Deliver within deadline (Day 30 or extended)

### 7. Documentation

- Record response details
- Retain records for 3 years
- Update DSAR register

### Escalation

- Complex requests: Escalate to DPO
- Legal issues: Escalate to Legal
- Technical issues: Escalate to Engineering
```

### 13.3 Breach Response Procedure

```markdown
## Data Breach Response Procedure

### 1. Detection and Reporting

**Any employee** who suspects a breach must immediately report to:

- Security team: security@nubabel.com
- DPO: dpo@nubabel.com

### 2. Initial Response (Hour 0-4)

- Security team assesses and contains
- Incident Response Team activated
- Initial severity assessment
- Evidence preservation

### 3. Investigation (Hour 4-48)

- Determine scope and impact
- Identify affected data and subjects
- Root cause analysis
- Risk assessment

### 4. Notification Decision (Hour 48-72)

- DPO assesses notification requirements
- If risk to rights/freedoms: Notify authority
- If high risk: Notify data subjects
- Document decision rationale

### 5. Notification Execution

**To Authority (if required):**

- Submit within 72 hours
- Use supervisory authority portal
- Include all required information

**To Data Subjects (if required):**

- Clear, plain language
- Describe breach and impact
- Provide recommendations
- Provide contact for questions

### 6. Remediation

- Implement fixes
- Update controls
- Verify effectiveness

### 7. Post-Incident Review

- Lessons learned session
- Update procedures
- Training if needed
- Report to leadership

### Incident Response Team

- Incident Commander: [Role]
- Technical Lead: [Role]
- Communications: [Role]
- Legal: [Role]
- DPO: [Role]
```

### 13.4 Vendor Due Diligence Checklist

```markdown
## Vendor Data Protection Due Diligence

### Vendor Information

- Vendor Name:
- Service Description:
- Data Processed:
- Assessment Date:

### Security Assessment

- [ ] SOC 2 Type II report reviewed
- [ ] ISO 27001 certification verified
- [ ] Penetration test results reviewed
- [ ] Security questionnaire completed

### GDPR Compliance

- [ ] Privacy policy reviewed
- [ ] DPA template acceptable
- [ ] Sub-processor list provided
- [ ] Breach notification clause adequate
- [ ] Data deletion capability confirmed
- [ ] DSAR support capability confirmed

### Data Transfers

- [ ] Data location(s) identified
- [ ] Transfer mechanism in place (if non-EU)
- [ ] Supplementary measures if needed

### Contractual

- [ ] DPA signed
- [ ] SLA acceptable
- [ ] Audit rights included
- [ ] Termination/data return clause

### Approval

- [ ] Privacy team approved
- [ ] Security team approved
- [ ] Legal approved
- [ ] Procurement approved

**Risk Rating:** [Low/Medium/High]
**Approved:** [Yes/No]
**Review Date:** [Date + 1 year]
```

---

## 14. Authoritative Sources and Citations

### Primary Legal Sources

[^3]: **GDPR Article 6 - Lawfulness of processing**

- URL: https://gdpr.eu/article-6-how-to-process-personal-data-legally/
- Full text: https://gdpr-info.eu/art-6-gdpr/

[^7]: **GDPR Article 30 - Records of processing activities**

- URL: https://gdpr.eu/article-30-records-of-processing-activities/
- Full text: https://gdpr-info.eu/art-30-gdpr/

[^14]: **GDPR Articles 33-34 - Breach notification**

- Article 33: https://gdpr.eu/article-33-notification-of-a-personal-data-breach/
- Article 34: https://gdpr-info.eu/art-34-gdpr/

[^19]: **GDPR Article 32 - Security of processing**

- URL: https://gdpr-info.eu/art-32-gdpr/

### European Commission Guidance

[^1]: **European Commission - Controller/processor**

- URL: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/controllerprocessor_en
- Description: Official EU guidance on controller and processor roles and responsibilities

[^9]: **European Commission - When is a DPIA required?**

- URL: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/when-data-protection-impact-assessment-dpia-required_en

[^13]: **European Commission - How long can data be kept?**

- URL: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/principles-gdpr/how-long-can-data-be-kept-and-it-necessary-update-it_en

### ICO (UK Information Commissioner's Office) Guidance

[^2]: **ICO - A guide to controllers and processors**

- URL: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/controllers-and-processors/controllers-and-processors-a-guide
- Description: Comprehensive guidance on determining controller/processor status

[^4]: **ICO - Lawful basis for processing**

- URL: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/
- Legitimate interests: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/

[^6]: **ICO - Documentation**

- URL: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/documentation
- Description: Guidance on documenting processing activities

[^8]: **ICO - When do we need to do a DPIA?**

- URL: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia

[^10]: **ICO - Right of access**

- URL: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access
- PDF Guide: https://ico.org.uk/media2/migrated/4031029/right-of-access-1-0-20240919.pdf

[^12]: **ICO - Storage limitation**

- URL: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/

[^15]: **ICO - 72 hours: how to respond to a personal data breach**

- URL: https://ico.org.uk/for-organisations/advice-for-small-organisations/personal-data-breaches/72-hours-how-to-respond-to-a-personal-data-breach/

### EDPB (European Data Protection Board) Guidance

[^5]: **EDPB Guidelines 01/2024 on Legitimate Interests**

- URL: https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf
- Description: Detailed guidance on applying legitimate interests as lawful basis

[^11]: **EDPB - How do I respond to a request for erasure?**

- URL: https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/how-do-i-respond-request-erasure_en

### ENISA (EU Agency for Cybersecurity)

[^18]: **ENISA - Data Protection Engineering**

- URL: https://www.enisa.europa.eu/publications/data-protection-engineering
- PDF: https://www.enisa.europa.eu/sites/default/files/publications/ENISA%20Report%20-%20Data%20Protection%20Engineering.pdf
- Description: Technical guidance on implementing data protection by design

**ENISA - Security Measures for Personal Data Processing**

- URL: https://www.enisa.europa.eu/risk-level-tool/help
- Description: Online tool for selecting appropriate security measures

**ENISA - Guidelines for SMEs on Security of Personal Data Processing**

- URL: https://www.enisa.europa.eu/publications/guidelines-for-smes-on-the-security-of-personal-data-processing
- Description: Practical security guidance for smaller organizations

### Multi-Tenant SaaS Specific Sources

[^16]: **ComplyDog - Multi-Tenant SaaS Privacy: Complete Data Isolation and Compliance Architecture**

- URL: https://complydog.com/blog/multi-tenant-saas-privacy-data-isolation-compliance-architecture
- Description: Detailed guidance on data isolation in multi-tenant environments

[^17]: **Microsoft Azure - Architectural approaches for governance and compliance in multitenant solutions**

- URL: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/governance-compliance
- Description: Cloud architecture patterns for compliance

**AWS - Guidance for Multi-Tenant Architectures**

- URL: https://aws.amazon.com/solutions/guidance/multi-tenant-architectures-on-aws
- Description: AWS-specific multi-tenant isolation patterns

### Additional Resources

**GDPR Hub - Article 17 Right to Erasure**

- URL: https://gdprhub.eu/Article_17_GDPR
- Description: Case law and interpretations of erasure rights

**IAPP - What triggers a DPIA under the GDPR**

- URL: https://iapp.org/resources/article/what-triggers-a-dpia-under-the-gdpr
- Description: Practical guidance on DPIA triggers

**IAPP - How to draft a GDPR-compliant retention policy**

- URL: https://iapp.org/news/a/how-to-draft-a-gdpr-compliant-retention-policy/
- Description: Retention policy drafting guidance

---

## Document Control

| Version | Date         | Author          | Changes         |
| ------- | ------------ | --------------- | --------------- |
| 1.0     | January 2026 | Compliance Team | Initial version |

**Review Schedule:** Annual review or upon significant regulatory/operational changes

**Distribution:** Internal use - Compliance, Legal, Engineering, Security teams

---

_This document provides guidance and should not be considered legal advice. Consult with qualified legal counsel for specific compliance questions._
