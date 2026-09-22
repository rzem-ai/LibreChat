---
name: myassist-skill-refiner
description: Use when the user wants to improve, evaluate, or refine a LibreChat SKILL.md — checking if it's well-formed, fixing unexpected behaviour, translating feedback into concrete changes, or improving how a skill instructs the model.
always-apply: false
user-invocable: true
---

# Skill Refiner

## Purpose

This skill has two modes that can be used independently or in sequence:

- **Evaluate** — Assess the quality of an existing skill across 7 standard dimensions and produce a consistent structured table rated Low / Medium / High, with findings and recommendations.
- **Refine** — Guide a user (including non-technical users) through a structured interview to classify their feedback and generate ready-to-paste markdown content for the target SKILL.md file.

The two modes are designed to work together: run Evaluate first to identify gaps, then flow into Refine to fix them.

**This skill highlights proposed changes and outputs a revised markdown artifact ready to apply.** When running in LibreChat, the agent can edit the skill file directly — but must present the changes and receive explicit user confirmation before applying them.

---

## When to Use

Use this skill when a user:
- Wants to check whether a skill is well-formed and complete
- Has received feedback from testers and wants to translate it into a skill change
- Doesn't know which section of a SKILL.md to edit
- Wants to add, remove, or replace content in an existing skill
- Is a non-technical user who has spotted a problem with a skill's behaviour and needs help articulating the fix
- Wants help turning criticism, limitations, weak outputs, or performance issues into clearer skill instructions

---

## Mode Detection

At the start of every session, identify which mode the user needs based on their intent:

| User says | Route to |
|---|---|
| "evaluate", "review", "check quality", "assess a skill" | **Mode A — Evaluate** |
| "refine", "update", "improve", "add feedback", "the skill didn't work" | **Mode B — Refine** |
| Ambiguous or unclear | Ask: *"Would you like to evaluate a skill's quality, or refine it based on feedback you've received?"* |

Do not skip mode detection. Both modes begin with identifying the target skill.

If both evaluate and refine signals are present in the same message (e.g. "review it and fix the issues"), run Mode A first, then flow into Mode B via Step A3.

---

## Mode A — Evaluate Skill

### Step A1 — Identify the Skill

**Purpose:** Establish which skill is being evaluated.

Ask the user:

> Which skill would you like me to evaluate? You can give me the skill's name, or paste the full contents of its SKILL.md file.

Ask the user to confirm the skill name is correct before continuing. If the skill cannot be found — because the name does not match a skill visible in this session, or it has not been shared with you — ask the user to paste the SKILL.md content directly. Do not attempt to act on a skill you cannot see. If pasting the content, use it as the source of truth for evaluation.

**Expected outcome:** The target skill content is available for assessment.

---

### Step A2 — Run Evaluation

**Purpose:** Assess the skill against 7 quality dimensions and produce a consistent, structured output.

Evaluate the skill content against each dimension using the criteria in the **Evaluation Dimensions** section below. Then produce the following table — always use this exact structure:

| Dimension | Rating | Finding | Recommendation |
|---|---|---|---|
| Description quality | High / Medium / Low | What was found (or missing) | What to add or change |
| Required inputs | High / Medium / Low | What was found (or missing) | What to add or change |
| Workflow completeness | High / Medium / Low | What was found (or missing) | What to add or change |
| Output format | High / Medium / Low | What was found (or missing) | What to add or change |
| Edge case coverage | High / Medium / Low | What was found (or missing) | What to add or change |
| Tone & formatting rules | High / Medium / Low | What was found (or missing) | What to add or change |
| **Overall quality** | **1–5** | **One-sentence summary** | **Top priority action** |

**Rating scale:**
- **High** — criterion is clearly met
- **Medium** — partially met or inconsistently applied
- **Low** — criterion is absent or severely lacking

**Overall quality score (derived — do not score this row subjectively):**

Assign points to each of the 6 scored dimensions: High = 2 pts, Medium = 1 pt, Low = 0 pts. Total possible: 12 points.

| Points | Overall rating |
|---|---|
| 11–12 | **5** — Production ready |
| 9–10 | **4** — Minor gaps only |
| 6–8 | **3** — Needs work |
| 3–5 | **2** — Significant issues |
| 0–2 | **1** — Fundamental gaps |

**Critical cap:** If any dimension is rated Low and the consequence of that gap is Critical (i.e., the skill gives wrong or misleading results without it), the overall score is capped at **3** regardless of total points.

**Expected outcome:** A complete, consistent evaluation table the user can share or act on.

---

### Step A3 — Offer Refinement

**Purpose:** Give the user a natural path to fix identified issues.

After presenting the table, ask:

> Would you like to address any of these issues now? I can guide you through refining the skill for any Low or Medium items.

If yes → switch to **Mode B — Refine**. Skip Step B1 — the skill is already identified. Pre-load the first Low-rated dimension as the opening feedback item and begin at Step B2.

---

## Mode B — Refine Skill

### Step B1 — Identify the Skill

**Purpose:** Establish which skill the feedback relates to.

Ask the user:

> Which skill is this feedback for? You can give me the name, or describe what it was supposed to do.

- If the target skill is already clear from the conversation (e.g., named in the opening message or visible in context), confirm it rather than asking from scratch.
- If the user gives a name → ask them to confirm it is the correct skill before continuing. If the skill cannot be found — because the name does not match a skill visible in this session, or it has not been shared with you — ask the user to paste the SKILL.md content directly. Do not attempt to act on a skill you cannot see.
- If the user doesn't know the skill name → ask them to describe what the skill was supposed to do, then suggest the most likely match and ask them to confirm before continuing

**Expected outcome:** The target skill is identified and confirmed.

**External skill check:** Once the skill content is available, scan it for references that cannot run in MyAssist. Flag only the following:
- Absolute host-local file paths outside the MyAssist sandbox (e.g. `/Users/...`, `C:\...`, `~/...`)
- Shell or terminal execution commands that require an unavailable runtime (e.g. commands outside the enabled Run Code sandbox)
- Instructions to run a script directly when no enabled MyAssist capability can execute it (e.g. "run this Python file", "execute the script")

Do not flag:
- Sandbox paths such as `/mnt/data`
- Commands explicitly supported by the enabled Run Code functionality
- Relative file paths (e.g. `references/skill_template.md`) — these refer to files attached to the skill and are valid

If incompatible references are found, present them as a short list and ask:

> This skill references functions or folders not present in MyAssist — was this skill built outside MyAssist?

- If **yes** → note it as externally built. Before proceeding, ask:

  > Before we continue, please re-upload the skill along with any files it references. We recommend organising them in a `references/`, `assets/`, or `scripts/` folder so the skill can locate them consistently.

  Once files are uploaded (or the user confirms none are needed), carry the flagged items forward into Step B2 as the opening feedback items, one at a time, so the user can decide how to handle each.

- If **no** → continue normally.

---

### Step B2 — Capture and Classify Feedback

**Purpose:** Understand what the user observed and classify it so it can be placed correctly in the SKILL.md.

Ask the user:

> What feedback do you have? You can describe what went wrong in your own words, or paste the AI response that didn't meet your expectations.

**If the feedback is vague** (e.g. "the output didn't feel right", "it wasn't what I expected"):
1. Ask up to 2–3 follow-up questions to narrow it down (e.g. "What were you expecting to see?", "At what point did the response go wrong?", "Can you give me an example of what the correct output would look like?")
2. Once enough detail is gathered, summarise your understanding and ask the user to confirm before continuing

**If a long AI response is pasted and multiple issues are present:**
1. Identify all distinct issues in the response
2. Present them as a numbered list and confirm with the user
3. Process each one individually in sequence — complete the full classification and output for one before moving to the next

**Before proposing any edits, translate the criticism into a usable diagnosis:**
1. Identify the user's likely intent or goal
2. Identify what they expected to happen
3. Identify what actually went wrong or felt weak
4. Infer the most likely failure mode in the skill's instructions
5. Turn that into a general improvement principle, not just a fix for the one example

Keep this diagnosis short and practical. Use it to improve the quality of the refinement, not to produce a long explanation.

**For each piece of feedback, classify using the following questions:**

**Question 1 — Input or output?**
> Does this relate to something the user needs to **provide** to the skill (an input), or something the skill **produces** (an output or behaviour)?

**Question 2 — Consequence**
> What happens if this isn't addressed?
> - The skill gives wrong or misleading results → **Critical**
> - The output is lower quality than expected → **Important**
> - It's a polish or nice-to-have improvement → **Nice to have**

**Question 3 — Frequency**
> Does this apply every time the skill is used, or only in certain situations?
> - Every time → **Always**
> - Only when X → **Conditional** (capture the condition)

**Question 4 — Placement**
> If the placement is clear from the feedback, proceed. If not, ask:
> *"When did you notice this issue — was it when you first started using the skill, partway through, or in the final output?"*
> Then offer 2–3 of the most likely placements from the list below and let the user choose:
> - Required inputs table
> - Workflow step (ask which step number or what the step was about)
> - Response guidelines / formatting rules
> - Trigger phrases
> - Behavioural rules / guardrails
> - Other (ask to describe)

**Expected outcome:** Each piece of feedback is classified with: input/output, consequence level, frequency, and placement.

### Step B2A — Generalize the Fix

**Purpose:** Prevent overfitting the refinement to a single example.

Before drafting changes, check whether the proposed refinement improves the broader behavior of the skill or only patches the exact example raised by the user.

- Prefer changes that make the skill more reusable across similar prompts or failure cases.
- Avoid adding narrow rules that only solve one phrasing unless the user explicitly wants that specificity.
- If the skill has become cluttered, consider simplifying, removing, or consolidating weak instructions instead of only adding more text.

**Expected outcome:** Proposed refinements improve the skill's general behavior and keep the prompt lean.

---

### Step B3 — Conflict and Removal Checks

**Purpose:** Catch changes that could break existing skill behaviour before generating output.

**If the feedback conflicts with an existing rule:**
1. Flag the conflict explicitly: *"This feedback conflicts with an existing rule in the skill that says: [quote the rule]."*
2. Explain what the existing rule is intended to do
3. Ask: *"Would you like to override this rule, or adjust your feedback?"*
4. Only proceed once the user confirms

**If the feedback means removing or replacing existing content:**
1. Flag it: *"This change would remove or replace existing content, which may affect how the skill behaves."*
2. Recommend developer review before applying
3. Ask the user to confirm they want to proceed before generating the output

**Expected outcome:** No conflicting or destructive changes are generated without explicit user confirmation.

---

### Step B4 — Confirm and Generate

**Purpose:** Show the user what will be changed and why before generating the final formatted output.

Present a concise summary table of all proposed changes for this piece of feedback using this exact structure:

| Type | Placement | Consequence level | Rationale |
|---|---|---|---|
| Input / Output rule / Workflow step / Trigger / Behavioural rule | Section name and location in the SKILL.md | Critical / Important / Nice to have | One concise sentence explaining why |

Then ask:

> Does this capture your intent? Shall I generate the formatted output?

Once confirmed, ask:

> How would you like the output?
> 1. Ready-to-paste markdown (formatted text you can copy directly into the SKILL.md)
> 2. Plain English description of what to change and where
> 3. Both

Then generate the output using the **Formatting Decision Guide** below.

When generating the output:
- Keep each field concise and high-signal.
- Prefer short, specific wording over long explanatory prose.
- Use plain language by default.
- Only use technical terms without explanation if the user's wording shows they are already comfortable with them.

If useful, you may also suggest 2-3 lightweight example prompts or checks the user can use to validate the refined skill behavior. This is optional and should be brief.

After delivering the output, check whether the target skill is missing a `## Required Inputs` table or a `## Response Guidelines` / `## Behavioural Guidelines` section. If either is absent, ask:

> I notice this skill doesn't have a [Required Inputs table / Response Guidelines section]. Would you like me to add one as part of this refinement?

Only draft and propose that section if the user confirms. Do not add it unilaterally.

After delivering the output, ask:

> Would you like me to apply these changes directly to the skill file?

- If the user says yes, confirm exactly which file will be edited and summarise the approved changes briefly before applying them.
- Only edit the skill after the user has explicitly confirmed they want the changes applied.
- If the user says no, leave the response as a proposal only.

Then ask:

> Before we continue — if you're able to, test the updated skill with a prompt that previously triggered the issue and see what it produces. Come back with what you observe and we can keep refining. Or if you have more feedback ready now, we can continue.

- If the user wants to test first → close the session cleanly. When they return, resume at Step B2 with awareness of what was already changed.
- If the user wants to continue → return to Step B2.

Once the user confirms there is no more feedback, ask:

> Would you like a fresh evaluation of the skill now that the changes have been applied?

If yes → return to Step A1.

---

## Evaluation Dimensions

Use these criteria when assessing each dimension in Step A2.

### 1. Description quality
- Is the `description` field present in the frontmatter?
- Is it between 20 and 250 characters? *(Under 20 triggers a LibreChat `TOO_SHORT` warning; over 250 is silently truncated before the model reads it — the model never sees the full text.)*
- Does it follow the pattern `"Use when [specific trigger scenarios]"` — written so the model can parse it as a triggering signal, not a human-readable label?
- Does it cover both command-style triggers (e.g., *"the user asks to evaluate a skill"*) and contextual/conversational triggers (e.g., *"a user pastes a SKILL.md and asks if it looks right"*)?
- Is the trigger language specific enough to avoid unintended firing on adjacent topics? (Bare words like "improve" or "update" without domain qualification will over-trigger.)
- Does it avoid non-LibreChat frontmatter fields such as `tags`, `category`, `triggers:`, or `plugin_id`?

### 2. Required Inputs
- Is there a `## Required Inputs` section or equivalent?
- Does each input have a name, type, required/conditional flag, and description?
- Are conditional inputs clearly marked with their condition?
- Are placeholder names consistent (e.g. `{input_name}` format)?

### 3. Workflow Completeness
- Does the skill have a `## Workflow` section with numbered steps?
- Does each step have a clear **Purpose**, a user-facing prompt or instruction, and an **Expected outcome**?
- Do the steps form a logical, complete sequence from start to final output?
- Are there any gaps where the user would be left without guidance?

### 4. Output Format
- Is the expected output clearly specified (e.g. table, numbered list, paragraph, code block)?
- Does the skill specify length, tone, and structure of the output?
- Are example output formats or templates included where helpful?

### 5. Edge Case Coverage
- Are failure or fallback paths defined (e.g. what happens if an input is missing, ambiguous, or invalid)?
- Are escalation paths or confidence flags specified?
- Are conditional branches handled explicitly?

### 6. Tone & Formatting Rules
- Is there a `## Response Guidelines` or `## Behavioural Guidelines` section?
- Are tone, hedging language, and formatting conventions specified?
- Are critical rules marked with **bold** labels?
- Are verbatim instructions or guardrails formatted as `> blockquotes`?

### 7. Overall Quality
- Does the skill read as a coherent, self-contained set of instructions?
- Could a non-author follow it and produce consistent results?
- Are there any obvious contradictions or ambiguities?

---

## Formatting Decision Guide

Use this table to determine how to format output generated in Step B4.

| Classification | Formatting to Apply |
|---|---|
| Critical + Always | **Bold** label on the rule; `Required: Yes` in input table |
| Critical + Conditional | **Bold** label on the rule; `Required: Conditional` in input table |
| Important | Standard prose or table row; no special emphasis |
| Nice to have | Standard prose; no emphasis |
| Input (any consequence level) | New row in `## Required Inputs` table |
| Output / format rule | New row in `## Response Guidelines Summary` table |
| Workflow step change | Addition to or modification of the relevant `### Step N` block |
| Trigger / description update | Update the `description` field in the frontmatter |
| Verbatim instruction or guardrail | `> blockquote` formatting |
| Removal / replacement | Include a `<!-- DEVELOPER: review before applying -->` comment above the change |

---

## Output Templates

Reference these patterns when generating formatted output in Step B4.

**New input row:**
```markdown
| `{input_name}` | Text | Yes / Conditional | Description of what this input is and how it is used. |
```

**New behavioural rule (Critical):**
```markdown
- **Rule label:** Description of the rule and what the skill must or must not do.
```

**New workflow step:**
```markdown
### Step N — Step Title

**Purpose:** What this step achieves and why it matters.

Prompt the user:

> [Verbatim question or instruction to show the user]

Capture the response as `{input_name}`.

**Expected outcome:** What should be true after this step completes.
```

**Description update (frontmatter):**
```yaml
description: Use when <updated trigger language that captures the new scenario>.
```

**Verbatim guardrail:**
```markdown
> [Exact instruction the AI must follow — use blockquote for any rule that must be applied literally]
```

**Removal / replacement with developer flag:**
```markdown
<!-- DEVELOPER: review before applying — this removes existing content -->
[Replacement text here]
```

---

## Notes

- **This skill must not edit a SKILL.md file without explicit user confirmation.** It may apply approved changes directly only after asking the user whether they want the changes applied and receiving a clear yes.
- **This skill must not evaluate, refine, or edit its own SKILL.md.** If the user names `myassist-skill-refiner` or the file `myassist-skill-refiner/SKILL.md` as the target skill at any point, decline immediately and direct them to the skill's maintainer.
- When processing feedback from a non-technical user, always confirm your interpretation before generating output — do not assume.
- If a user pastes a SKILL.md file for evaluation, treat the pasted content as the source of truth, not any prior knowledge of that skill.
- This skill is designed to be used with any skill. It is not limited to a specific skill or domain.
- Match the level of technical language to the user's cues. Briefly explain technical terms when needed.
- Prefer root-cause improvements over surface rewrites.
- Prefer refinements that remove ambiguity, reduce redundant instructions, and improve consistent behavior across similar prompts.
- If the user is focused on quick iteration rather than formal skill structure, keep the explanation short and center the recommendation itself.
- Before applying edits, restate the target file and the approved change summary so the user can confirm the exact action.
