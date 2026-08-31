---
name: rfp-intel
description: Analyse RFP, RFQ, or RFI tender documents and produce a structured intelligence briefing + Deloitte-branded microsite. ALWAYS use this skill when the user mentions RFP, RFQ, RFI, tender, bid, proposal, or says things like "help me understand this opportunity", "summarise these client docs", "what is this tender about", "analyse these documents for a bid", "I've got a bunch of RFP files", or "prepare a briefing on this opportunity". Use it even if they don't say "RFP" explicitly — if there are client-supplied documents and they're asking for an opportunity overview or bid intelligence, invoke this skill.
---

---
name: rfp-intel
description: Analyse RFP, RFQ, or RFI tender documents and produce a structured intelligence briefing + Deloitte-branded microsite. ALWAYS use this skill when the user mentions RFP, RFQ, RFI, tender, bid, proposal, or says things like "help me understand this opportunity", "summarise these client docs", "what is this tender about", "analyse these documents for a bid", "I've got a bunch of RFP files", or "prepare a briefing on this opportunity". Use it even if they don't say "RFP" explicitly — if there are client-supplied documents and they're asking for an opportunity overview or bid intelligence, invoke this skill.
---

# rfp-intel

Turn a folder of tender documents (PDFs, DOCX, XLSX, PPTX, and any other supported format) into a structured intelligence briefing and a Deloitte-branded microsite using automated conversion and synthesis.

## What this skill produces

Inside `agentic_converted/` in the current working directory:
- Markdown versions of every source document
- `summary.md` — structured briefing (see sections below)
- `index.html` — create a Deloitte microsite from the summary

---

## Step 1 — Discover and convert all documents

1. List **all files** in the user-supplied tender root folder recursively (including subfolders). Ignore hidden files and any files already inside `agentic_converted/`.
2. Create `agentic_converted/` if it doesn't exist.
3. Convert every file using `markitdown`. If markitdown fails for a file, fall back to `docling`. If neither works, skip the file.
   ```bash
   markitdown "<source_file>" -o "agentic_converted/<filename>.md"
   ```
    Run conversions for all files.
4. Confirm to the user how many files were converted before proceeding.

---

## Step 2 — Read and synthesise the content

Review **all** converted markdown files in `agentic_converted/` and extract complete details for the briefing. Look for:

- The organisation, their industry context, and strategic situation
- What they are trying to achieve and why now — the business problem, not just the IT problem
- **Procurement type**: Is this an RFP (Request for Proposal), RFQ (Request for Quotation), or RFI (Request for Information)? These are fundamentally different asks.
- **Commercial model**: Is this Fixed Price / Fixed Scope, Time & Materials (T&M), or a hybrid? Look for clues in how they describe pricing, deliverables, milestones, or hourly/daily rates. If it's not explicit, make a judgment call and explain your reasoning.
- Current state: what systems exist today, what's broken, what's painful
- Target state: what they want to end up with
- Technology stack, platforms, frameworks, vendors named
- Any Microsoft / Azure / M365 references
- Key dates — every single one
- Named contacts — customer contacts by name/title/email
- Named Deloitte people — only via @deloitte email or explicit Deloitte affiliation
- Evaluation criteria and how responses will be scored
- Budget signals, contract terms, IP ownership, non-negotiable requirements
- Any constraints (regulatory, security, data sovereignty, incumbent vendor)

---

## Step 3 — Write `agentic_converted/summary.md`

Structure the file exactly as below. Use Australian English throughout. Be direct and specific — this is a briefing for a senior consultant who has 5 minutes before a strategy call, not a report for academic review. Don't pad. Don't hedge. If something is unclear from the documents, say so briefly and move on.

```markdown
# [Client Name] — [Opportunity Name] Briefing

> [One-sentence plain-English summary of what this is and what they want]

---

## 1. What Is This?

| Field | Detail |
|---|---|
| **Procurement Type** | [RFP / RFQ / RFI] — [one sentence on what this means for how you respond] |
| **Commercial Model** | [Fixed Scope / T&M / Hybrid / Panel / Unknown] — [brief rationale from the documents] |
| **Engagement Type** | [Migration / Rebuild / Greenfield / Discovery / Managed Service / Panel / other — be specific] |
| **Customer** | [Organisation name + brief context] |
| **Issuing Entity** | [Who formally issued it — same as customer or a procurement body?] |

---

## 2. Opportunity Overview

**What the customer is trying to do:**
[2–4 sentences. What problem are they solving? What outcome are they buying? Why now?]

**Why this matters to them:**
[Business drivers, strategic goals, pain points mentioned. Quote the document where useful.]

**Scope summary:**
[What is explicitly in scope? What is explicitly out of scope? What's ambiguous?]

---

## 3. Current State → Target State

### Current State
[What does their world look like today? What systems, platforms, or processes are in place? What's legacy, what's cloud, what's on-prem? What is the pain — slow, expensive, inflexible, insecure? Be specific. If the documents describe the current environment in detail, summarise all of it here.]

### Target State
[What do they want to end up with? Are they prescriptive about the architecture or leaving it open? MACH? Microservices? Cloud-native? SaaS? Platform consolidation? Quote any vision statements or target architecture descriptions from the documents.]

### Gap / Transformation Required
[What is the delta? How big is this lift? Is it a rip-and-replace, a lift-and-shift, a phased modernisation, or something else?]

---

## 4. Technology Landscape

**Key technologies mentioned:**
[List every platform, language, framework, SaaS product, vendor, and integration mentioned — organised logically, not alphabetically]

**Constraints & non-negotiables:**
[Anything they've mandated: specific cloud provider, security standards, data sovereignty, accreditations required, incumbent vendor to work with/replace]

---

## 5. Azure & Microsoft Cloud Angle

[Is Azure explicitly required, preferred, or simply mentioned? Is Microsoft 365 / Copilot / Power Platform / D365 involved? Which specific Azure services are referenced? What is the Microsoft footprint today vs. what's planned? If Azure or Microsoft is not mentioned, say so clearly — don't invent a connection.]

---

## 6. Key Dates & Contacts

### Critical Dates
| Event | Date |
|---|---|
| [e.g., RFP Issued] | [date or ⚠️ Not specified] |
| [e.g., Clarification Deadline] | [date or ⚠️ Not specified] |
| [e.g., Submission Due] | [date or ⚠️ Check source] |
| [e.g., Presentations / Short-list] | [date or ⚠️ Not specified] |
| [e.g., Contract Award] | [date or ⚠️ Not specified] |
| [e.g., Engagement Start] | [date or ⚠️ Not specified] |

### Customer Contacts
| Name | Title | Email / Contact |
|---|---|---|
| [name] | [role] | [email if available] |

---

## 7. Evaluation Criteria & Winning

[How will responses be assessed? Are there weighted criteria? What do they seem to value most — price, capability, methodology, local presence, certifications? What does a winning response look like based on the language they use?]

---

## 8. Relevant Deloitte People

[List names and roles/context found in the documents. Only include if identified via a @deloitte email address or explicit "Deloitte" affiliation in the text. If none found, write: "No Deloitte personnel identified in the supplied documents."]

| Name | Role / Context | Email |
|---|---|---|

---

## 9. Full Intelligence Summary

[This is the meaty section. Write 5–10 paragraphs covering everything a senior bid lead needs before a 30-minute strategy session:
- Full scope of work — what exactly are they buying?
- Commercial signals — budget ranges, pricing expectations, contract structure, IP terms
- Evaluation criteria and what the customer weights heavily — what wins this?
- Competitive signals — who else is likely bidding, COTS vs build preferences, incumbent advantage
- Risks and watch-outs — unrealistic timelines, vague scope, one-sided contract terms, things that could blow up
- Fit assessment — what makes this a good or bad opportunity for Deloitte specifically
- Subtext and nuance — what are they really asking for that isn't written down? What can you read between the lines?
- Recommended next actions — what should the bid team do in the next 48 hours?]

---

*Generated by rfp-intel skill · [date]*
```

Save this file to `agentic_converted/summary.md`.

---

## Step 4 — Build the Deloitte microsite

Generate the HTML directly using the following design specifications and save it as `agentic_converted/index.html`.

When generating the HTML, include all of the following context upfront:
- **Skip Step 1 intake questions** — pass this info directly:
  - Site name: `[Client Name] — [Opportunity Name]`
  - Purpose: RFP/tender intelligence briefing
  - Audience: Internal Deloitte bid team
  - Primary CTA: "View Full Summary" (linking to summary.md or the summary section)
  - Use Deloitte defaults for all design tokens
- **Sections to include** (in this order):
 1. Nav + Hero — opportunity name, one-line summary, submission deadline as a badge; include procurement type (RFP/RFQ/RFI) and commercial model (Fixed/T&M) as prominent badges
 2. At-a-glance card row — 3–4 cards: Procurement Type, Commercial Model, Engagement Type, Microsoft/Azure angle
 3. Opportunity Overview — what the customer is doing and why (Section 2 of summary.md)
 4. Current State → Target State — side-by-side or sequential layout showing the transformation (Section 3)
 5. Technology Landscape — key tech, constraints, non-negotiables (Section 4)
 6. Timeline — all key dates as a visual timeline or table (Section 6)
 7. How to Win — evaluation criteria summary (Section 7)
 8. Team — customer contacts; Deloitte people if any (Section 8)
 9. Full Intelligence Summary — collapsible or scrollable (Section 9)
 10. Resources — list source documents by name
 11. Footer

Save the output to `agentic_converted/index.html`.

---

## Step 5 — Done

Tell the user:
1. How many files were converted
2. The path to `agentic_converted/summary.md`
3. The path to `agentic_converted/index.html` and that they can open it by double-clicking
4. One sentence on the headline finding (e.g., "This is a $X discovery engagement for a fleet management rebuild on Azure, due [date].")

If any files failed to convert or any sections in the summary couldn't be populated from the documents, mention that clearly.