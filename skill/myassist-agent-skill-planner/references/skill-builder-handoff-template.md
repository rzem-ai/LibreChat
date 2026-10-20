# New Skill Handoff Data Prefill Template

Use this template to generate pre-filled planning data for each **new** skill. This information will be passed to MyAssist Skill Builder, allowing it to skip its normal discovery questions for fields that are already confirmed.

Only generate handoff data for skills the user has decided to **build new**. Do not generate them for skills the user is reusing from the Skills Library.

---

## New Skill Handoff: [Skill Name]

### Name
**Display name:**  
[The user-facing skill name]

**Kebab-case name:**  
[lowercase-with-hyphens format for the skill's unique identifier]

---

### Purpose
[One-sentence objective: what the skill does and the outcome it produces]

---

### Intended Users
[Who will use this skill — e.g., consultants, project managers, specific practice area]

---

### Scope

**In scope:**
- [Task 1]
- [Task 2]
- [Task 3]

**Out of scope:**
- [Explicitly excluded task or boundary 1]
- [Explicitly excluded task or boundary 2]

**Trigger phrases:**
- "[Example phrase that should trigger this skill]"
- "[Another example trigger]"
- "[Third example trigger]"

---

### Inputs

| Input | Source Type | Type | Required | Description |
|---|---|---|---|---|
| [Input name] | [Reference Document / Accompanying File / Template Document / User Input File / Direct User Text Input] | [Text / Document / Data / Template] | [Yes / No] | [What the input is and how it will be used] |

**Valid Source Types:**
- **Reference Document** — a file bundled in the skill's references/ folder
- **Accompanying File** — a file the user uploads alongside their request
- **Template Document** — a reusable template stored in the skill's references/ folder
- **User Input File** — a file the user uploads as part of their task input
- **Direct User Text Input** — information the user types directly in chat

---

### Outputs

**Output type:**  
[Artifact / Document / Structured Data / Text Summary / Code / etc.]

**Required fields:**
- [Field 1: description]
- [Field 2: description]
- [Field 3: description]

**Quality criteria:**  
[How to determine if the output meets the required standard]

**Example:**  
[A brief concrete example of a successful output]

**Disclaimer (if applicable):**  
[Any important limitations, caveats, or disclaimers about the output]

---

### Workflow

| Step | Purpose | User prompt or processing instruction | Blocking | Expected outcome |
|---|---|---|---|---|
| Step 1: [Name] | [What this step achieves] | [Exact question or instruction] | [Yes / No] | [What is produced or achieved] |
| Step 2: [Name] | [What this step achieves] | [Exact question or instruction] | [Yes / No] | [What is produced or achieved] |

**Examples:**
- Step 1 example: [Brief concrete example]
- Step 2 example: [Brief concrete example]

---

### Response Guidelines

**Tone:**  
[Professional / Conversational / Technical / etc.]

**Format:**  
[Prose / Bullet points / Table / Structured sections / etc.]

**Length:**  
[Concise / Detailed / Comprehensive / Maximum N words or pages]

**Missing-input behaviour:**  
[What the skill should do if a required input is missing]

---

### Ground Rules
- [Non-negotiable rule 1]
- [Non-negotiable rule 2]
- [Non-negotiable rule 3]

---

### Constraints and Escalation

**Constraints:**
- [Limit or boundary 1]
- [Limit or boundary 2]

**Escalation:**  
[When and how to escalate]

---

### Agent Prerequisites

These are **Agent-level** configurations, not skill-level settings. List what the Agent must have enabled for this skill to work correctly.

**Tools to enable on the Agent:**
- [Tool 1 — e.g., File Search]
- [Tool 2 — e.g., Run Code]
- [Tool 3 — e.g., Artifacts]

**Connectors to enable on the Agent:**
- [Connector 1 — e.g., SharePoint]
- [Connector 2 — e.g., KX and DPN]

**Reference files:**
- [File 1 — path in the skill's references/ folder and what it contains]
- [File 2 — path and purpose]

**Upstream-skill handoff (if this skill is part of a connected workflow):**
- [Name of the upstream skill]
- [The exact output artifact or data structure this skill expects from the upstream skill]
- [Completion condition — when is the upstream skill considered done and this skill ready to start?]

---

### Invocation Settings

**always-apply:**  
[true / false — should this skill's instructions be active on every Agent turn?]

**user-invocable:**  
[true / false — can the user manually start this skill with `$skill-name`?]

**Guidance:**
- Use `always-apply: true` only for foundational instructions that must be active on every turn.
- Use `user-invocable: true` for optional tasks the user manually starts.
- For connected workflows, rely on explicit Agent instructions to control sequencing, not manual invocation.

---

## Generation Rules

1. **Populate only confirmed information** — use the information gathered during the discovery and recommendation workflow.
2. **Mark unknowns as `[OPEN]`** — if a field was not confirmed by the user, write `[OPEN]` instead of inventing a value.
3. **Do not fabricate:**
   - Policies or compliance requirements
   - Connector capabilities or integrations
   - Reference files that do not exist
   - Escalation paths or expert contacts
4. **Use valid Source Types** — only use the five allowed values listed in the Inputs section.
5. **Make upstream handoffs explicit** — for connected skills, name the exact upstream skill output format and completion condition.
6. **Agent-level prerequisites** — tools and connectors are configured on the Agent, not the skill. List them as prerequisites so the user knows what to enable.
7. **Present as normal Markdown** — use headings, tables, and bullets. **Do not** wrap the handoff in a code fence.
8. **This is planning data, not a SKILL.md** — do not generate YAML frontmatter or final skill instructions. This information will be used by Skill Builder to create the actual skill.

---

## After Generation

This handoff is internal planning context, not a user-facing deliverable. The Planner must obtain the user's agreement to start MyAssist Skill Builder before preparing the handoff. Once prepared, invoke `myassist-skill-builder` in the same Agent/session immediately; do not ask for consent again.

---

## When NOT to Generate

- The user has chosen to **reuse** an existing skill from the Skills Library — no handoff needed.
- The design is **Agent only** with no skills — offer only the agent instructions.
- The user has not yet confirmed the design — wait until the recommendation is accepted before offering to generate handoff data.
