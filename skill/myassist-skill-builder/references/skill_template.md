---
name: <add-skill-name-in-kebab-case>
description: <add a specific 'Use when...' trigger sentence describing when this skill should activate>
# Example description: Use when the user asks for meeting notes to be converted into action items with owners and due dates.
always-apply: false
user-invocable: true
---

# Skill Template

## Purpose
Guidance:
Write 2-4 short lines that cover:
- What this skill does.
- Who this skill is for.
- What this skill does not do.

Examples:
This skill helps project teams convert meeting notes into action items.
It is designed for business users.
It does not provide legal or compliance advice.

## When to Use
Guidance:
Use this skill when:
- <add trigger 1: direct user request>
- <add trigger 2: another common request>
- <add trigger 3: contextual scenario>

Do not use this skill when:
- <add out-of-scope scenario 1>
- <add out-of-scope scenario 2>

Examples:
- Use this skill when: The user asks to summarize workshop notes into actions.
- Do not use this skill when: The user asks for legal advice or policy sign-off.

## Required Inputs

Guidance:
Before filling the table, decide the source type for each input:
- Reference Document
- Accompanying File (script/helper file)
- Template Document
- User Input File (provided ad-hoc in chat)
- Direct User Text Input

| Input | Source Type | Type | Required | Description |
|---|---|---|---|---|
| <input_name_1> | <choose one source type> | Text | Yes | <what this input is and why it is needed> |
| <input_name_2> | <choose one source type> | Text | Conditional | <when this becomes required> |
| <input_name_3> | <choose one source type> | File/Text | No | <optional context that improves the output> |

Examples:
| Meeting Notes | User Input File (provided ad-hoc in chat) | Text | Yes | Source notes to convert into outputs |
| Action Template | Template Document | File | Conditional | Required when output must match a company template |

## Workflow

Guidance to user:
Define only Step 1 and Step 2.
For each step, include Purpose, Prompt to user, Blocking, and Expected outcome.
Use Blocking: Yes if the next step cannot proceed without this step. Use Blocking: No if the skill can continue with a warning, assumption, or optional placeholder.

### Step 1 - Collect Inputs
Purpose: <state why this step exists>
Prompt to user: <add the exact question the skill should ask>
Blocking: <Yes/No>
Expected outcome: <state what must be true before moving to Step 2>

### Step 2 - Process
Purpose: <state the core transformation or analysis this step performs>
Prompt to user: <optional clarification question if needed>
Blocking: <Yes/No>
Expected outcome: <state what draft output is produced>

Examples:
If the user asks for a summary, collect the source text in Step 1, then produce a structured summary in Step 2.

## Expected Outputs
Guidance to user:
Describe exactly what the skill should return.

Disclaimer:
> These output elements are a guide, not a mandatory checklist. If the skill output is a populated template document, include only the output details that are relevant for that template.

Include:
- Output type: <table / bullet list / short narrative / structured JSON-like text>
- Required fields: <list required fields in the output>
- Quality criteria: <what makes the output acceptable>

Examples:
- Summary skill output: 5 bullet points with a one-line executive summary and 3 key risks.
- Action-tracker skill output: table with columns Owner, Action, Due Date, Status.

Example output:
| Owner | Action | Due Date | Status |
|---|---|---|---|
| Alex | Confirm scope with finance | 2026-09-01 | In progress |
| Priya | Draft project timeline | 2026-09-03 | Not started |

## Response Guidelines
Guidance:
- Tone: <choose one: Professional / Friendly / Direct>
- Format: <choose one: Table / Bullet points / Short paragraphs>
- Length: <choose one: Short / Medium / Detailed>
- If key input is missing, ask a clarifying question before proceeding.

Examples:
- Tone: Professional
- Format: Table
- Length: Short

## Ground Rules
Guidance:
Add non-negotiable rules the skill must always follow.

Examples:
- Use only approved inputs and references listed in Required Inputs.
- If required input is missing, stop and ask for it before continuing.
- Do not invent facts, sources, or outputs.
- If the request is out of scope, state this clearly and suggest a next best step.
- Add a domain-specific rule here: <insert a non-negotiable rule for this skill>.

## Notes and Constraints
Guidance:
Use this section for limits, caveats, and escalation details.

Examples:
- If the request is out of scope, say so clearly and suggest the next best step.
- Do not invent facts; use only user-provided inputs and approved references.
- Escalation rule: <add who to escalate to for sensitive or high-risk requests>.