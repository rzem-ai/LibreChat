---
name: proposal-cv-refiner
description: Tailor and refine team member CVs and professional bios for proposals, pursuits, and RFP submissions. This single skill handles two workflows. The RFP-led workflow applies when the user provides RFP or client documents, win themes, or a value proposition. The context-led workflow applies when the user provides an industry or sector, domain focus, and role. Use this skill whenever someone wants to refine a CV, tailor a bio, build a proposal profile, align a CV to win themes or an RFP, or prepare a team member's profile for a client pitch, even if they do not name the skill. Trigger phrases include "CV refiner", "CV builder", "refine my CV", "tailor this CV", "tailor bio for proposal", "CV for RFP", "CV for pursuit", "profile for client pitch", "build a CV", and "align CV to win themes".
---

# CV Refiner

Refines an existing team member's CV or bio for proposals, pursuits, and RFP submissions. This skill unifies two previously separate tools (CV Builder and CV Refiner) into a single entry point that automatically routes to the right workflow based on what the user provides.

All outputs, from either workflow, are first drafts and must be reviewed and approved by the individual they describe before inclusion in any external-facing material. You are handling personal data.

## Two Workflows, One Skill

| | RFP-led workflow | Context-led workflow |
|---|---|---|
| **When to use** | User provides an RFP, client brief, win themes, or value proposition | User provides an industry/sector, domain focus, and role |
| **Inputs** | RFP/client docs + optional win themes + CV | Industry + domain + role + CV |
| **Output sections** | General Information, Biography, Relevant Experience, Qualifications | Single tailored narrative (profile + project experience) |
| **Output styles** | Long form / Short form / Bio | Brief bio / Short profile + projects / One-page CV + projects |

Both workflows produce Australian English markdown, anonymise organisation names, and omit project location and year.

## Step 1: Detect the Workflow (do this first, silently)

Before asking the user anything, inspect the request and any attachments to decide which workflow applies. Apply this precedence order:

1. **Explicit trigger wins.** If the user says "CV refiner" (or references an RFP/pursuit), use the RFP-led workflow. If the user says "CV builder", use the context-led workflow.
2. **RFP or client documents present** (an uploaded RFP, client brief, tender, or value proposition) → RFP-led workflow. RFP documents take precedence even if context parameters are also present.
3. **Context parameters present** (industry/sector, domain focus, and/or role stated, with no RFP document) → context-led workflow.
4. **Ambiguous** (a CV only, with no RFP document and no context) → ask once which path the user wants, offering both plainly:
   > I can tailor this two ways. Do you have an **RFP or client brief** to align to, or would you like me to tailor by **industry, domain, and role**? Either works, just let me know which you have.

Announce the detected workflow in one short line so the user can correct you (e.g. "I'll align this to your RFP" or "I'll tailor by industry, domain, and role"). Do not narrate the detection logic itself.

## Step 2: Show the Disclaimer (once)

Before generating anything, state the disclaimer a single time:

> This produces a **first-draft only**. All content must be accurate, used with permission, and reviewed and approved by the individual before any external submission. You are handling personal data.

Proceed once the user acknowledges. Do not repeat the disclaimer on later turns.

## Step 3: Gather Inputs (ask only for what is missing)

Capture everything already provided in the user's message before asking anything. Never ask for information the user has already given. Ask only for genuine gaps, and ask for optional items once.

### RFP-led workflow

Read `references/rfp-workflow.md` for the full step sequence and the internal generation prompts. In brief:

1. **RFP / client documents** — summarise the client ask: needs and specific requirements, any resourcing or CV/profile specifications, key dates (listed first), and whether a template must be filled in.
2. **Value proposition / win themes (optional)** — if provided, extract key messages and points of difference relevant to the client ask. If not provided, offer to proceed without them after a single confirmation; do not repeatedly request them.
3. **CV + output style** — request the CV (uploaded file or pasted text, including a partial excerpt if that is all the user has) and the style: Long form, Short form, or Bio. Respect an instruction to use only a supplied excerpt; do not keep asking for a full CV.

### Context-led workflow

Read `references/context-workflow.md` for the full step sequence and the internal system prompt. In brief:

1. **Context** — capture the client industry/sector, the domain experience to highlight, and the team member's role on the project (the actual role, not just a seniority level). Ask only for whichever of these three is missing.
2. **CV** — request the CV (uploaded file, pasted text, or excerpt).
3. **Output format** — offer Brief bio, Short profile + projects, or One-page CV + projects, and let the user choose.

## Step 4: Generate the Output

Apply the relevant generation prompts from the reference file for the detected workflow. Whichever workflow ran:

- Write in **Australian English** and format in **markdown**.
- **Anonymise** all organisation names; do not include project location or year.
- **Respect the requested length.** Treat the word limits for each style as hard ceilings, not suggestions. If a "Brief bio" is requested, stay within 100 words; do not pad it into a full profile.
- **Accuracy check before returning.** Compare the draft against the source CV. Do not state industry or domain experience that the CV does not evidence. Where the CV lacks sector-specific experience, describe the *type* of project work rather than claiming the sector, and vice versa.

## Step 5: Offer Download

Remind the user they can copy the markdown or export it, and offer to run the `text-to-docx` skill to produce a downloadable Word document.

## Reference Files

- `references/rfp-workflow.md` — Full RFP-led step sequence, output sections, and internal generation prompts.
- `references/context-workflow.md` — Full context-led step sequence, output formats, and internal system prompt.

## Disclaimer

This tool produces first-draft content only. All AI outputs must be reviewed and approved by the individual they describe before inclusion in any external-facing material. You are handling personal data. AI outputs can sometimes include inaccuracies.
