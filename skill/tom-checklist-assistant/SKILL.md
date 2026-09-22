---
name: tom-checklist-assistant
description: Generate a TOM (Technology Operating Model) Checklist from the PAR section of a TAR document to confirm ARB pre-requisites before scheduling an architecture review with ITS Enterprise Architecture. Use when someone needs to generate a TOM checklist, check TAR document prerequisites, prepare for an ARB review, or extract architecture details from a TAR. Trigger phrases include "TOM checklist", "TAR document", "ARB prerequisites", "architecture review", "TOM checklist assistant".
---

# TOM Checklist Assistant

Generates a TOM Checklist from the PAR section of a project TAR (Technology Architecture Review) document. Extracts six key ARB pre-requisite fields in parallel and produces a downloadable checklist to bring to an architecture review meeting with ITS Enterprise Architecture.

## What This Does

- **Extracts the PRJ project number** from the TAR cover slide
- **Extracts data classification** from the Data Integrations table in the PAR section
- **Extracts BCP tier** from the BCP tier sub-section (Silver / Gold / Platinum / Diamond)
- **Extracts open-source packages** including name, license, and license hyperlink for each
- **Extracts authentication types** (e.g. Azure AD, CIAM, Entra ID, MFA, SSO, certificates)
- **Extracts hosting platforms** (e.g. DCS, Azure, AWS, GCP, on-premise, Deloitte Global)

All six fields are extracted in parallel from a single button click, then the completed checklist can be downloaded.

## How to Use (App Workflow)

The TOM Checklist Assistant app (plugin 109) has a three-step workflow:

### Step 1: Upload TAR Document
Upload the TAR document in Word format. The TAR template should be downloaded from the SPM website: [https://deloitteapac.service-now.com/spmkp](https://deloitteapac.service-now.com/spmkp) — search for *'TAR Template'*.

**Important:** Before uploading, ensure you have:
- Read the guidance on **page 4** of the TAR document
- Completed the **ARB Pre-requisites**

### Step 2: Generate TOM Checklist
Click **"Generate TOM Checklist"** to extract all six ARB pre-requisite fields from the TAR document in parallel. This can take up to 5 minutes.

Review each extracted field. If any pre-requisite has not been met, update the TAR document, re-upload, and regenerate.

| Field | Extraction Rule | Requirement |
|---|---|---|
| **Project Number** | Scan for string beginning with "PRJ" on the cover slide | Must be the approved PPM project number from ServiceNow (e.g. PRJ1234567) |
| **Data Classification** | Scan Data Integrations table for: Personal Information / Confidential / High Risk Confidential / Public | Must be confirmed with the Business Security Office (BSO) and included in the Data Integrations table |
| **BCP Tier** | Scan BCP tier heading for: Silver / Gold / Platinum / Diamond | Must be confirmed with the BSO and documented in the BCP tier sub-section |
| **Open-Source** | Scan for open-source packages (e.g. React, Angular, Vue, Java, .NET Core, Python, Terraform); return name, license, and license hyperlink per item | All packages must be documented in the PAR section components table. "Yellow" and "red" category packages require AU Legal guidance before use — contact the EA team for the open-source guidance document |
| **Authentication** | Scan including images for authentication types (e.g. Azure AD, CIAM, Entra ID, MFA, SSO, certificates) | Application must implement Deloitte SSO/MFA; CIAM required for external client access |
| **Hosting** | Scan including images for hosting platforms (e.g. DCS, Azure, AWS, GCP, on-premise, Deloitte Global) | Must be hosted in approved Deloitte platforms: DCS, on-premise, or approved SaaS with VCRA completed |

### Step 3: Download
Once all pre-requisites are verified, click **"Download TOM Checklist"** to download the completed checklist. Bring both the TOM Checklist and the TAR document to the architecture review meeting with ITS Enterprise Architecture.

## Agent Behaviour

When this skill is loaded:

1. **Explain the purpose** — tell the user this tool extracts ARB pre-requisite information from a TAR document and generates a TOM Checklist for the architecture review meeting with ITS Enterprise Architecture.
2. **Collect the TAR document** — ask the user to upload or provide the TAR document (Word format). Remind them it must have been completed using the latest TOM AU TAR template from SPM, page 4 guidance read, and ARB pre-requisites completed.
3. **Extract all six fields in parallel** — apply all six extraction prompts simultaneously and present the results clearly labelled.
4. **Accuracy check** — review each extracted field and flag any that appear incomplete or where the pre-requisite may not have been met. Prompt the user to update the TAR document if so.
5. **Offer download** — once the user confirms all pre-requisites are met, confirm the checklist is ready to download. Offer to run the skill `text-to-docx` to convert the output into a downloadable Word document.

## System Prompt (Applied Internally)

All six extractions run in parallel from the same TAR document upload.

### Project Number
> Scan the document and return the string beginning with "PRJ". Do not add any additional help text, spaces or formatting.

### Authentication
> Scan the document including any images and summarise in one sentence the list of authentication types found e.g., Azure AD, CIAM, Entra ID, MFA, SSO, certificates.

### BCP Tier
> Scan the document and under the 'BCP tier' heading, return any of the following strings 'Silver', 'Gold', 'Platinum', 'Diamond' if found. Do not add any additional help text or formatting.

### Open-Source
> Scan the document including any images and return a bullet point list of any 'open source' found e.g., React, Angular, Vue, Java, .NET Core, NUnit, XUnit, JUnit, Python, Kali, OpenVPN, Ruby, Terraform, MISP. For each open source found in the document display the name, license and license hyperlink comma separated on one line. If the information is not found in the document, then please source from official repositories. Do not add any additional help text or formatting.

### Hosting
> Scan the document including any images and summarise in one sentence a list of the proposed hosting platforms e.g., DCS, Azure, AWS, GCP, on-premise, Internal, Deloitte Global.

### Data Classification
> Scan the document and in the data integrations table if found, return any of the following strings 'Personal Information', 'Confidential', 'High Risk Confidential', 'Public'. Do not add any additional help text or formatting.

## Plugin Metadata

| Field | Value |
|---|---|
| Plugin ID | 109 |
| Plugin type | 2 (Stepper app) |
| Visibility | local, dev, stage, prod |
| Permission | Public |
| Country restriction | None |
| Temperature | 0.5 |
| Max tokens | 4096 |
| Owner | Theos Rippis (trippis@deloitte.com.au) |
| Report to | Theos Rippis, Leigh Rooney (lrooney@deloitte.com.au) |
| Tags | Document Review & Processing, Tech Solution Design |

## Disclaimer

AI outputs can sometimes include inaccuracies. Ensure all generated content is reviewed and verified before use or submission.
