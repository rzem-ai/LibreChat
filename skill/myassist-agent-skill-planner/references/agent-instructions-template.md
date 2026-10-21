# Agent Instructions Template

Use this template when writing instructions for a MyAssist Agent. Agent instructions give the AI context on what the agent is for, which skills are available, and how to use them — including the order skills should run and what information passes between them.

Fill in each section below. Sections marked `[Required]` must be completed. Sections marked `[If applicable]` only apply when skills are connected in a sequence.

---

## Agent Instructions

### What this agent does
[Required]

Write 2–3 sentences describing the purpose of this agent. What workflow does it support? Who uses it? What is the end goal?

Example:
> This agent supports the proposal development process. It guides the user through reading RFP requirements, researching relevant Deloitte content, and producing a structured proposal response. It is designed for pursuit teams preparing client submissions.

---

### Available skills
[Required]

List each skill the agent has access to. For each skill, include a one-line description of what it does so the agent knows when to invoke it.

| Skill | What it does |
|---|---|
| [Skill name] | [One sentence — what this skill does and when to use it] |
| [Skill name] | [One sentence — what this skill does and when to use it] |
| [Skill name] | [One sentence — what this skill does and when to use it] |

Example:
| Skill | What it does |
|---|---|
| Requirements Reader | Reads an uploaded proposal or RFP document and extracts a structured list of requirements, evaluation criteria, and constraints |
| KX Research | Takes a requirements summary and searches KX and DPN for relevant Deloitte methodology and thought leadership |
| Response Formulator | Takes the requirements summary and KX research findings and populates a proposal response template |

---

### Skill execution order
[If applicable — complete this section if skills run in a defined sequence]

Describe the exact order in which skills should be used and what information passes between them. Skills are selected by the model at runtime, so this section must state the sequence explicitly; otherwise a skill may be used out of order or skipped.

**Step 1 — [Skill name]**
- Triggered by: [What the user provides to start — e.g. "user uploads the RFP document"]
- Produces: [What this skill outputs — e.g. "a structured requirements summary"]

**Step 2 — [Skill name]**
- Input from: [Previous skill or user — e.g. "requirements summary from Step 1"]
- Produces: [What this skill outputs — e.g. "a curated list of relevant KX content"]

**Step 3 — [Skill name]**
- Input from: [Previous skills or user — e.g. "requirements summary from Step 1 and KX content from Step 2"]
- Produces: [Final output — e.g. "a populated proposal response template"]

Add a completion rule after the final step, for example: "Do not begin Step 2 until Step 1 has produced the requirements summary. Do not produce the final response until all previous steps are complete."

---

### Reference documents and knowledge sources
[If applicable — complete this section if the agent has access to shared documents]

List any documents, templates, or knowledge sources the agent should reference across skills. For each, note where it is stored.

| Document | Location | Used by |
|---|---|---|
| [Document name] | [File Search / SharePoint drive URL / skill references/ folder] | [All skills / specific skill name] |

Example:
| Document | Location | Used by |
|---|---|---|
| Proposal response template | File Search | Response Formulator skill |
| Deloitte brand guidelines | SharePoint — Proposals drive | All skills |

---

### Behavioural guidelines
[Required]

Add any rules or preferences that apply across all skills in this agent.

Examples:
- Always use Australian English in all outputs
- Do not include client names or confidential information in outputs unless explicitly provided by the user
- If a required input is missing, ask the user for it before proceeding to the next skill
- All outputs are first drafts — remind the user to review before use
- [Add your own rule here]

---

### Out of scope
[Required]

State clearly what this agent does not do, to prevent the AI from going off-task.

Examples:
- This agent does not provide legal or compliance advice
- This agent does not access live client systems
- This agent does not submit documents on the user's behalf
- [Add your own out-of-scope statement here]
