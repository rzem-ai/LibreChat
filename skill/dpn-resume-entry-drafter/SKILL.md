---
name: dpn-resume-entry-drafter
description: Generate formatted DPN resume entries for project work using the DPN Resume Entry Drafter app (plugin 111). Use when someone wants to write a DPN resume entry, update their DPN profile with a project, draft a project summary for DPN, or create a career record entry. Trigger phrases include "DPN resume", "resume entry", "DPN entry", "project entry for DPN", "update DPN profile".
---

# DPN Resume Entry Drafter Test

Generates polished, consistently formatted project resume entries for Deloitte People Network (DPN) profiles. Acts as an HR reviewer that transforms raw project notes into concise, third-person, paragraph-style entries suitable for internal career records.

## What This Does

Takes user-provided project details and produces a DPN-ready resume entry with:
- A bold header (Client – Project Name + Project Role)
- Standardised date range in MM/YY – MM/YY format
- Industry classification
- Four achievement bullet points (past tense, third person, no names)
- A skills and technologies line

Output uses formal Australian English (en-AU), past tense verbs, and no personal pronouns or names.

## How to Use (App Workflow)

The DPN Resume Entry Drafter app (plugin 111) has a three-step stepper:

### Step 1: Introduction
The app explains what a project resume entry is and invites the user to proceed.

> A project resume entry is a brief summary created after completing a project. It outlines the project's goals, your specific role, and the key skills or responsibilities developed. This summary helps highlight your contributions and experience gained.

### Step 2: Enter Project Information
Collect all of the following fields from the user:

| Field | Description | Example |
|---|---|---|
| **Client Name** | Name of the client organisation | ABC Bank |
| **Project Name** | Name or description of the project | Payments Transformation Program |
| **Project Role** | Your role on the project | Business Analyst |
| **Duration** | Project date range (any format accepted) | Jan 2023 – May 2024 |
| **Industry** | Client industry or sector | Financial Services |
| **Project Description** | Brief description of the project and your involvement | Free text |
| **Key Achievements and Responsibilities** | 2–3 impactful accomplishments | Free text |
| **Key Skills and Technology Used** | Tools, methods, and technologies used | Agile, SQL, Power BI |

### Step 3: Generate the Resume Entry
Generate the entry, display it in an editable rich text area, and instruct the user to review and copy it into their DPN resume.

> Review the drafted entry. Make edits if needed to ensure clarity, professionalism, and correct AU/EN spelling. When satisfied, copy and paste the entry into your resume before uploading it to DPN.

## Agent Behaviour

When this skill is loaded:

1. **Explain the purpose briefly** — tell the user this will generate a formatted DPN project resume entry.
2. **Collect all eight fields** — ask for Client Name, Project Name, Project Role, Duration, Industry, Project Description, Key Achievements, and Key Skills. If any required field is missing or unclear, request it before generating.
3. **Generate the entry** — apply the system prompt and output format rules below.
4. **Invite review** — remind the user to review for accuracy, professionalism, and correct AU English spelling before pasting into DPN.
5. **Offer download** — remind the user they can copy sections or export to .docx. Offer to run the skill 'text-to-docx' to convert the output into a downloadable Word document.

## System Prompt (Applied Internally)

> Write a concise, third-person professional summary entry for DPN profiles, following strict formatting and content rules. Do not use personal pronouns or names. Use past tense verbs to describe actions and outcomes. Group related information into dense paragraphs with minimal breaks, focusing on clarity, detail, and logical flow. Use formal Australian English and capitalisation with relevant industry terminology, avoiding unnecessary jargon. Ensure each section aligns to the requirements below.

## Date Formatting Rules

All dates must be converted to **MM/YY – MM/YY** format regardless of input format.

| Input | Output |
|---|---|
| 03/07-03/11/25 | 07/25 – 11/25 |
| 08-11/2025 | 08/25 – 11/25 |
| 03/2024 – 05/2024 | 03/24 – 05/24 |
| January 2025 – March 2025 | 01/25 – 03/25 |
| Single month: March 2024 | 03/24 – 03/24 |

General rule: For ranges, extract both months and years. For single-month projects, repeat the same MM/YY at both ends.

## Output Format

Produce the resume entry using the **exact structure below**. Do not add or remove sections.

```
**Client Name - Project Name
Project Role**
MM/YY – MM/YY

Industry

• Past tense verb + single sentence describing action/outcome.
• Past tense verb + single sentence describing action/outcome.
• Past tense verb + single sentence describing action/outcome.
• Past tense verb + single sentence describing action/outcome.

**Skills & Technologies Used:** Skill One, Skill Two, Skill Three, Skill Four, Skill Five
```

### Output Rules

- **Bold block**: "Client Name - Project Name" on line 1, "Project Role" on line 2 — both in the same bold block
- **Dates**: MM/YY – MM/YY immediately below the bold block
- **Industry**: Single line, with a blank line between the dates and the project description
- **Bullet points**: Exactly four (•), each a single sentence starting with a past tense verb (e.g. Led, Managed, Delivered, Coordinated, Provided, Implemented, Optimised). No joining of points.
- **Skills line**: Bold heading "Skills & Technologies Used:" followed by exactly five comma-separated skills/technologies, each capitalised
- Do **not** repeat Project Role outside the bold block
- Do **not** use these labels literally anywhere in the entry: "Client Name", "Project Name", "Project Description", "Key Achievements", "Key Skills and Technology Used", "Industry", "Duration"
- Do **not** include instructional text in the output
- No first-person pronouns or names

### Compliant Example

```
**Deloitte - ITS Laptop Refresh
ServiceNow ITS Analyst**
03/24 – 05/24

Technology, Media, & Telecommunications

• Provided support to the ITS team during Deloitte's 2024 laptop refresh and applied ITSM best practices on the ServiceNow platform to manage requests and device provisioning.
• Coordinated imaging, asset updates and device handovers to ensure practitioners received fully configured devices on schedule.
• Liaised with practitioners, imaged new PCs with required software, attended setup appointments and guided users through startup procedures to ensure a smooth transition.
• Processed over 300 service catalogue tasks during the refresh period and documented common user issues to help streamline future rollouts.

**Skills & Technologies Used:** ServiceNow, ITSM, Asset Management, Device Provisioning, Agile
```
