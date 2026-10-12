---
name: myassist-skill-builder
description: Use when the user wants to design a new MyAssist skill through a guided questionnaire and generate a ready-to-paste SKILL.md draft.
always-apply: false
user-invocable: true
---

# MyAssist Skill Builder

## Purpose

This is a level 3 builder skill for non-technical users.
It helps the user define a skill's scope, gather required design inputs, and generate a structured SKILL.md draft.

This skill does not publish skills automatically. It creates a draft and highlights gaps.

## When to Use

Use this skill when a user:
- Wants to create a new MyAssist skill from scratch.
- Is not confident writing markdown or frontmatter.
- Wants a guided interview to shape the skill before drafting.
- Wants a structured SKILL.md output that can be refined later.

Do not use this skill when:
- The user wants to review, improve, or troubleshoot an existing SKILL.md.
- The request is unrelated to building or refining a MyAssist skill.

If the user asks about an existing skill draft, redirect them to `myassist-skill-refiner`.

## Skill Level Definition

This is a **Level 3** skill because it:
- Uses a multi-step interview and synthesis flow.
- Runs a structured questionnaire and classification flow.
- Maps interview answers to template sections.
- Applies a quality gate before returning output.

## Template Reference

Use this file as the section model for generation:
- `references/skill_template.md`

The generated draft should follow the same major sections:
- Frontmatter
- Purpose
- When to Use
- Required Inputs
- Workflow (Step 1 and Step 2)
- Expected Outputs
- Response Guidelines
- Ground Rules
- Notes and Constraints

## Required Inputs

Capture or derive the following values during the interview:

| Input | Type | Required | Description |
|---|---|---|---|
| `{skill_objective}` | Text | Yes | One-sentence goal for what the skill should do. |
| `{target_audience}` | Text | Yes | Who will use the skill. |
| `{in_scope_tasks}` | List | Yes | Top tasks the skill must handle. |
| `{out_of_scope_tasks}` | List | Yes | Explicit boundaries and exclusions. |
| `{trigger_phrases}` | List | Yes | Phrases users are likely to ask that should invoke the skill. |
| `{required_inputs}` | Table-like list | Yes | Inputs needed by the new skill, including source type, data type, required flag, and description. |
| `{workflow_step_1}` | Text block | Yes | Step 1 Purpose, Prompt to user, Expected outcome. |
| `{workflow_step_2}` | Text block | Yes | Step 2 Purpose, Prompt to user, Expected outcome. |
| `{expected_outputs}` | Text block | Yes | Output type, required fields, and quality criteria. |
| `{response_preferences}` | Text | Yes | Tone, format, and length preferences. |
| `{ground_rules}` | List | Yes | Non-negotiable rules for behavior and safety. |
| `{constraints_and_escalation}` | Text | Conditional | Constraints and escalation path for high-risk or out-of-scope scenarios. |

Input source types that must be supported in `{required_inputs}`:
- Reference Document
- Accompanying File (script/helper file)
- Template Document
- User Input File (provided ad-hoc in chat)
- Direct User Text Input

## Workflow

### Step 1 - Confirm Skill Goal

**Purpose:** Ensure the new-skill objective is explicit before starting the questionnaire.

Prompt the user:

> What should this new skill do, and what should the final skill draft help users achieve?

Capture:
- `{skill_objective}`

**Expected outcome:** A clear new-skill objective and outcome statement are confirmed.

### Step 2 - Run Scope and Component Questionnaire

**Purpose:** Gather all critical components needed to generate a complete skill draft.

Ask the user these questions in order. Keep questions short and plain-language.

1. Who will use this skill?
2. What are the top 3 tasks this skill must handle?
3. What should this skill explicitly not do?
4. What phrases are users likely to type when they need this skill?
5. What information must users provide for the skill to work?
6. For each input, what source type is it (Reference Document, Accompanying File, Template Document, User Input File, Direct User Text Input)?
7. What should happen in Step 1 (Collect Inputs)?
8. What should happen in Step 2 (Process)?
9. What should the final output look like (format, fields, quality standard)?
10. What tone and level of detail should the response use?
11. What are the non-negotiable ground rules?
12. Are there constraints, caveats, or escalation requirements?

If answers are vague, ask up to 2 follow-up questions per item.

**Expected outcome:** A complete interview record with enough detail to populate each section.

### Step 3 - Normalize and Classify Answers

**Purpose:** Convert natural language answers into structured fields usable for deterministic drafting.

Normalize answers into:
- `{target_audience}`
- `{in_scope_tasks}`
- `{out_of_scope_tasks}`
- `{trigger_phrases}`
- `{required_inputs}`
- `{workflow_step_1}`
- `{workflow_step_2}`
- `{expected_outputs}`
- `{response_preferences}`
- `{ground_rules}`
- `{constraints_and_escalation}`

If any required field is missing, ask for the missing value before drafting.

**Expected outcome:** A complete structured data bundle is ready for section mapping.

### Step 4 - Map Answers to Template Sections

**Purpose:** Ensure consistent section population using the template structure.

Mapping rules:
- Frontmatter `name`: create kebab-case from user skill title.
- Frontmatter `description`: build one specific "Use when..." sentence using `{skill_objective}` + `{trigger_phrases}`.
- `## Purpose`: use `{skill_objective}` + `{target_audience}` + `{out_of_scope_tasks}` summary.
- `## When to Use`: use `{in_scope_tasks}`, `{trigger_phrases}`, and `{out_of_scope_tasks}`.
- `## Required Inputs`: convert `{required_inputs}` into table rows with source type.
- `## Workflow`: populate Step 1 and Step 2 only from `{workflow_step_1}` and `{workflow_step_2}`.
- `## Expected Outputs`: use `{expected_outputs}` including optional disclaimer.
- `## Response Guidelines`: use `{response_preferences}`.
- `## Ground Rules`: use `{ground_rules}`.
- `## Notes and Constraints`: use `{constraints_and_escalation}`.

**Expected outcome:** All section values are mapped with no empty required sections.

### Step 5 - Generate SKILL.md Draft

**Purpose:** Produce a ready-to-paste first draft in markdown.

Generation requirements:
- Preserve section order from the template reference.
- Keep workflow to Step 1 and Step 2 only.
- Include at least one example in Workflow and Expected Outputs.
- Use placeholders only where the user did not provide required detail.

**Expected outcome:** A complete markdown draft is produced.

### Step 6 - Apply Quality Gate

**Purpose:** Catch blockers before returning the draft.

Critical blockers:
- Missing frontmatter `name` or `description`.
- Missing any of: Purpose, Required Inputs, Workflow, Expected Outputs.
- Workflow missing Step 1 or Step 2.
- Required Inputs missing source-type classification.

Warnings:
- Trigger phrases too generic.
- Expected output quality criteria are unclear.
- Ground rules are weak or purely generic.

If critical blockers exist, ask targeted follow-up questions and regenerate.

**Expected outcome:** Draft is either ready, or revised until blockers are cleared.

### Step 7 - Return Draft and Next Actions

**Purpose:** Provide clear handoff and optional refinement path.

Return:
1. Final SKILL.md draft.
2. Short quality summary (blockers/warnings).
3. Suggested next step path: test first, then refine with skill-refiner.
4. The following tool enablement reminder, presented verbatim to the user:

---

**Before using this skill — make sure to enable these functions**

In MyAssist, turn on only the functionalities this skill needs — in your general chat settings or agent configuration:

| Functionality | Enable when… |
|---|---|
| **Run code** | For data analysis, calculations, file manipulation, or chart generation |
| **Skills** | For reusable procedures, templates, or domain-specific patterns |
| **Artifacts** | For formatted documents, diagrams, visualisations, or HTML output |
| **Connectors / MCP Servers** | For extracting data from external sources (select only what the skill requires) |

---

Ask:

> Would you like to keep this as version 1, or move to a refinement pass with skill-refiner?

**Expected outcome:** User can accept the draft or continue iterating.

## Next Steps Guidance

After generating the first draft, guide the user through this sequence:

1. **Save and test the draft skill** with 2-3 prompts that represent real user requests.
2. **Capture observations** from test runs:
	- What worked well?
	- What was unclear?
	- What output was missing or low quality?
3. **Use skill-refiner** to improve weak sections without rewriting from scratch.
4. **Re-test** after refinements and repeat until output quality is acceptable.

Suggested handoff prompt to user:

> Next step recommendation: test this version with real prompts, then use skill-refiner to tighten any weak sections (for example Required Inputs, Workflow clarity, Expected Outputs, and Ground Rules). Would you like to do that now?

Suggested example prompt for skill-refiner:

> Evaluate this SKILL.md and help me refine any Medium or Low areas, starting with workflow completeness and expected outputs.

## Output Format

Provide output in this order:
1. `Build Summary` (short bullet list)
2. `Captured Inputs` (table)
3. `Generated SKILL.md` (markdown code block)
4. `Quality Gate Results` (Critical / Warning)
5. `Next Action Prompt`

## Response Guidelines

- Use plain language suitable for non-technical users.
- Keep questions short and ask one topic at a time.
- Avoid jargon unless the user uses it first.
- Prefer concise, reusable wording over verbose prose.
- Confirm ambiguous answers before using them in generated text.

## Ground Rules

- Do not generate a draft before required questionnaire fields are captured.
- Do not fabricate user requirements, inputs, or constraints.
- Do not add Step 3+ in workflow unless the user explicitly requests a non-template structure.
- Keep the draft aligned to the template reference section set.
- If scope is unclear, pause and clarify instead of guessing.

## Notes and Constraints

- This skill is a builder and drafter, not a final governance approver.
- If the user requests policy-sensitive outputs (legal, tax, regulatory), require explicit escalation notes.
- If the user provides an existing draft or asks for refinement, redirect to `skill-refiner`.

