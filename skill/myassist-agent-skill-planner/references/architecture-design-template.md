# [Agent or Skill Name] - Architecture Design

Use this template when the user requests a full build plan. Complete only the sections that apply to the confirmed design.

## Overview

**Purpose:** [Business problem and intended outcome]

**Users:** [Who will use it]

**Recommendation:** [Skill / Agent only / Agent + N Skills]

**Workflow summary:** [One or two sentences describing the end-to-end flow]

## Agent Configuration

### Agent: [Name]

| Setting | Design |
|---|---|
| Purpose | [One sentence] |
| Model | [Recommended model and why] |
| Skills included | [Ordered list, or None] |
| Knowledge sources | [File Search / SharePoint / None] |
| Tools to enable | [Run Code / Artifacts / File Search / None] |
| Connectors to enable | [MCP connector names, or None] |
| Web search | [Required / Not required. If required, choose a model with the native web-search toggle enabled] |

### Agent Instruction Requirements

- State the Agent's purpose, scope, and intended users.
- List each skill and when to use it.
- For connected skills, state the exact execution order, required handoff output, and completion condition for every step.
- State what the Agent must do when an input is missing or a connector returns no result.
- Define any output, tone, safety, or confidentiality requirements.

## Existing Skills Assessment

Review skills available in the Skills Library. Identify candidates that could be reused instead of building new.

**Disclaimer:** This assessment is based on skills currently visible in the Skills Library catalogue. Skills that are shared but inactive may not appear here. Confirm final availability in the Agent Builder's Skills Library before selecting a skill.

| Proposed capability | Existing skills to consider | Assessment | Recommendation |
|---|---|---|---|
| [Capability name] | [Skill name] | [Fully covers / Partial overlap / Not suitable] | [Reuse / Build new] |
| [Capability name] | [Skill name], [Skill name] | [Assessment] | [Recommendation] |

If no existing skills are suitable for any proposed capability, state: "No existing skills identified for reuse."

## Skill Designs

Repeat this section once for each skill. Clearly state whether the skill is being **reused** or **built new**.

### Skill [N]: [Name]

**Decision:** [Reuse existing skill / Build new skill]

#### If reusing an existing skill

| Reuse detail | Information |
|---|---|
| Existing skill name | [Name from Skills Library] |
| Reason for reuse | [Why it fits the requirement] |
| Agent configuration | [Any required Agent tools, connectors, or instruction adjustments] |
| Integration notes | [How it connects with other skills in the workflow, if applicable] |

#### If building a new skill

| Design element | Detail |
|---|---|
| Purpose | [One sentence] |
| Trigger | [User input or prior skill output] |
| Input | [Specific data, document, or handoff] |
| Output | [Specific result for the next step or user] |
| Tools required | [Tools the Agent must enable] |
| Connectors required | [Connectors the Agent must enable] |
| Reference files | [Skill path and the required `read_file` instruction, or None] |
| Always apply | [Yes / No and why] |
| User invocable | [Yes / No and why] |

For the complete pre-filled information package to pass to MyAssist Skill Builder, request the **New Skill Handoff** output option.

## Execution Flow

1. **[Step 1 / Skill name]**: [Trigger, action, and output]
2. **[Step 2 / Skill name]**: [Required input from Step 1, action, and output]
3. **[Step N / Skill name]**: [Required input, action, and final output]

**Completion rule:** [The Agent must not start a later step until the prior step has produced and validated its required handoff output.]

## Tool and Connector Configuration

| Requirement | Enable on Agent | Used by | Purpose |
|---|---|---|---|
| [Tool or connector] | Yes | [Skill name] | [Why it is required] |

Tools and connectors are enabled on the Agent. Skills cannot activate them independently.

## Knowledge and Reference Documents

| Document or source | Location | Used by | Access method |
|---|---|---|---|
| [Document] | [File Search / SharePoint / `references/` path] | [Agent or skill] | [File Search / connector / `read_file`] |

Use File Search for up to 50 Agent files. For a larger document set, use the SharePoint connector. Reference files inside a skill are not automatically available; the skill instructions must explicitly call `read_file` before using them.

## Platform Constraints And Dependencies

| Requirement | MyAssist Status | Design Impact | Required User Action |
|---|---|---|---|
| [Requirement 1] | [Supported / Supported with limited access / Not supported] | [How this affects the design] | [What the user must do, or None] |
| [Requirement 2] | [Status] | [Impact] | [Action or None] |

**Examples:**
- Read files from SharePoint folder | Supported, subject to access | Use SharePoint connector | Confirm all intended users have access
- Upload workbook to SharePoint | Not supported | Users download and upload manually | Submit connector request if needed

## Other Constraints and Assumptions

- [Model or web-search dependency]
- [Any agreed scope limitation]

## Next Steps

1. [Create or configure the Agent, model, tools, and connectors.]
2. [Create the skills using the agreed inputs, outputs, and reference files.]
3. [Draft and paste the Agent instructions with the explicit execution sequence.]
4. [Test the workflow with representative inputs and validate the handoffs.]
