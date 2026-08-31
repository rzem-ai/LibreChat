---
name: current-state-insights-generator

description: Summarise key client documentation and pin-point specific technology issues by producing a structured summary table pack and optional drilldown analysis tables. Use when a user wants technology-current-state synthesis from uploaded files, including risks, priorities, stakeholder groups, capability insights, and identified information gaps.
---

# Current State Insights Generator

This skill converts the original workflow app into a conversational process that a chat agent can run directly.

The skill supports two report modes:

1. Structured Summary
2. Drilldown Summary (optional follow-on)

## Output Format

**CRITICAL: All outputs render inline in this chat conversation. Do not save documents to files or the skills library automatically. Present all content conversationally in markdown format, rendered directly in the chat.**

If the user explicitly requests to download or save a report, only then offer to compile it into a downloadable format.

---

## What This Skill Produces

### Report 1: Structured Summary
A comprehensive markdown-table report with multiple separate tables:
- **Table 1 - Summarised Breakdown** (5-6 separate tables, one per topic: Technology Landscape, Risk Profile, Technology Priorities, Stakeholder Groups, Organisational Capabilities)
- **Table 2 - Gaps & Missing Info** (multiple tables, one per topic identified above)
- **Table 3 - Relevant Industry Information** (only if relevant industry data is used; one table per industry topic)

### Report 2: Drilldown Summary (Optional)
One or more markdown tables based on user-selected deep-dive options:
- Top 10 key technology risks evidenced by the client
- Top 5 key client technology priorities
- Different stakeholder groups within the current technology organisation

At the end of the drilldown output, include this exact style of headline:

`An exercise was undertaken to review the current state and it was found that [key finding in one sentence] that will have implications in meeting technology priorities.`

---

## How the Agent Should Run This Skill

Because users do not see original app instructions, the agent must guide them explicitly.

Use this process:

1. Explain the two report modes and ask whether user wants Structured Summary only, or both Structured + Drilldown.
2. Generate Structured Summary first.
3. Offer optional Drilldown Summary using one or more selectable deep-dive options.
4. Offer to compile both outputs into one final markdown deliverable.

If user data is incomplete, proceed with best-effort analysis and label assumptions clearly.

---

## Inputs to Collect

### Required for Structured Summary
- Uploaded client documentation (one or more), such as:
  - Technology strategies
  - Interview notes
  - Meeting transcripts
  - Architectural diagrams
  - Reports
  - Registers

### Optional quality-improvement inputs (ask proactively)
- Preferred table headings
- Any information the user wants excluded
- Preferred table structure constraints (for example, "3 columns only")

### Required for Drilldown Summary
- One or more selections from:
  - Summarise the 10 top key technology risks evidenced by the client
  - Summarise the top 5 key client technology priorities
  - Summarise the different stakeholder groups within the current technology organisation
- Structured Summary output as context

---

## Action 1: Structured Summary

### Purpose
Extract and organise technology-current-state evidence from uploaded files into a comprehensive and review-ready table pack.

### Prompt to execute
Use the following instruction set as the base prompt:

- Analyse all supplied client data, including but not limited to strategic documentation (e.g. technology strategies), interview notes, meeting transcripts, architectural diagrams, reports, and registers.
- Produce markdown tables in this pattern:
  - Source column should reference the source artifact and page/section where possible.
  - Flexible column headings are allowed as long as they are logical and consistent.
- **CRITICAL: Do NOT use any emojis, unicode symbols, arrows, or special characters. Use plain text only.**

Generate:

1. **Table 1 - Summarised Breakdown (Multiple Tables, One Per Topic)**
- Create a separate, distinct table for EACH of the following topics:
  - **Technology Landscape** table
  - **Risk Profile** table
  - **Technology Priorities** table
  - **Stakeholder Groups** table (with columns for role, purpose, and organisational context)
  - **Organisational Capabilities** table
- For each source, extract all information directly relevant to the assigned topic.
- Capture high coverage of relevant details; ignore non-essential context unless it informs interpretation.
- Each table stands alone with its own clear heading and structure.

2. **Table 2 - Gaps & Missing Info (Separate Tables Per Topic)**
- Create a separate, distinct table for each topic area where gaps exist:
  - **Gaps in Risk Information** table
  - **Gaps in Priorities Information** table
  - **Gaps in Stakeholder Groups Information** table
  - **Gaps in [Other Topic]** table (as applicable)
- For each gap, provide educated suggestions/examples based on common technology-organisation patterns.
- Each gap category gets its own dedicated table for clarity.

3. **Table 3 - Relevant Industry Information**
- Include only if relevant industry data is used.
- Present in a separate markdown table.

Ensure output is comprehensive, logically sequenced, and ready for user review or amendment before drilldown.

### Source guidance
Where available, use industry data (e.g. IBISWorld) only when it materially strengthens interpretation.

---

## Action 2: Drilldown Summary (Optional)

### Purpose
Generate targeted deep-dive tables based on selected analytical themes.

### Prompt assembly
Construct the prompt in this order:

1. "Our firm aims to gather information to support a technology strategy for the organisation."
2. "Utilise the information provided and generate a summary of facts based on the selection(s) of {selected_options}."
3. "Here is a structured summary to take into consideration: {structured_summary_output}."
4. "For each selection, format the output in a separate markdown table and differentiate them with a bold heading."
5. "CRITICAL: Do NOT use any emojis, unicode symbols, arrows, or special characters in the output. Use plain text only."
6. Add final headline requirement exactly as specified in the section above.

### Output rules
- One separate markdown table per selected option.
- Use bold heading per section, e.g. **Top 10 Key Technology Risks Evidenced by the Client**.
- Keep findings evidence-linked to uploaded sources or structured-summary statements.
- Conclude with the required one-sentence implication headline.

---

## Full Conversation Flow (Recommended)

Use this script when user starts fresh:

1. "I can create a Structured Summary from your technology documents, then optionally generate Drilldown tables for specific themes. All output will appear here in the chat."
2. "Please upload or confirm your source files."
3. "Would you like to specify preferred table headings, exclusions, or table format constraints before I generate?"
4. Run Structured Summary and present Tables 1-2 (and 3 if relevant) **inline in the chat**.
5. "Would you like a Drilldown Summary? If yes, choose one or more: top risks, top priorities, stakeholder groups."
6. Run Drilldown Summary with selected options **inline in the chat**.
7. "Would you like me to compile both outputs into one final report?" (If yes, present the combined report inline. Only offer a downloadable version if they request it.)

---

## Final Output Assembly

When user asks to compile/finalise:

- Present a single markdown report inline in the chat with sections in this order:
  1. Structured Summary
  2. Drilldown Summary (if requested)
  3. Final Key Implication Headline
- Add a short section at the end: **Assumptions and Validation Checks**.

**Note**: This compiled report remains in the chat conversation. Do NOT save it to files or the skills library automatically. Only create a downloadable file if the user explicitly requests it.

---

## Output Standards

- Always use markdown tables (not prose-only outputs).
- **MANDATORY: Create a separate, distinct data table for each topic or category.** Do not combine topics into single tables.
- Each table must have a clear bold heading identifying the topic (e.g. **Technology Landscape**, **Risk Profile**, **Stakeholder Group: Finance Department**).
- **CRITICAL: Do NOT include any emojis, unicode symbols, or special characters in any output.** Use plain text only.
- Keep headings explicit and easy to scan.
- Prefer source traceability in a source column where possible.
- Clearly mark assumptions where source evidence is missing.
- Do not produce images/diagrams in this skill.
- Remind user outputs are draft analytical artefacts and should be validated before decision-making.

---

## File Handling: CRITICAL

**This skill does NOT automatically save documents to files, the skills library, or any external storage.**

All outputs:
- Render inline in the chat conversation only
- Are presented as markdown tables and sections within the chat
- Stay in the conversation history

**File creation only occurs if:**
- User explicitly requests a downloadable version ("Save this as...", "Download", "Export", etc.)
- In that case, only create files on direct user request

This prevents accidental clutter in the skills library and keeps the workflow chat-focused.
