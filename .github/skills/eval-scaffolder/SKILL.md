---
name: eval-scaffolder
description: >-
  Generates evaluation test scaffolding for agent skills. Given a skill's
  SKILL.md, this skill selects the appropriate eval category, produces a
  tailored eval_cases.yaml with realistic test cases, and creates sample
  test documents. Use this skill when onboarding a new skill into the eval
  framework.
---

# Eval Scaffolder

You generate evaluation scaffolding for agent skills. Your output is a complete
eval directory under `evals/<Skill Name>/` containing an `eval_cases.yaml` and sample `documents/`.

---

## Step 1 — Read the Skill and Ensure Location

Locate the target skill's `SKILL.md` and read it in full.

### 1a. Ensure the skill is in `.github/skills/`

If the skill folder is **not** already inside `.github/skills/` (e.g. it is in `Untested Skills/` or another location), **copy the entire skill folder** into `.github/skills/` before proceeding. The eval framework requires skills to be in this directory.

```bash
cp -r "<current location>/<Skill Name>" ".github/skills/<Skill Name>"
```

Confirm the copy succeeded. All subsequent steps use `.github/skills/<Skill Name>/` as the skill path.

If the skill is already in `.github/skills/`, skip the copy.

### 1b. Extract skill metadata

From the `SKILL.md`, extract:

- **name** — the `name:` from the YAML frontmatter (lowercase-hyphenated)
- **description** — the `description:` from the frontmatter
- **process steps** — every `## Step` section
- **output format** — any formatting, template, or structural requirements
- **tools used** — any tool calls mentioned (e.g. code execution, file creation)
- **domain** — the professional domain (legal, finance, HR, consulting, etc.)

---

## Step 2 — Collect User Inputs

**YOU MUST ASK the user the following three questions one at a time, in order.** Do not skip this step. Wait for a response to each question before asking the next. The user may answer "skip" to any individual question.

### Question 1: Sample query

Ask:

> **Do you have a sample user query for this skill?**
> This is the prompt you'd typically type to trigger this skill. It helps me write realistic test cases.
>
> Paste it here, or say "skip".

Wait for the user's response before continuing.

### Question 2: Input document

Ask:

> **Do you have an input document you'd normally provide to this skill?**
> This is the source material the skill processes (e.g. transcript, contract, report).
>
> Attach the file, paste its content, or say "skip".

Wait for the user's response before continuing.

### Question 3: Expected output

Ask:

> **What should the output look like for the document you just provided?**
> This is what a correct response should contain — structure, key sections, tone, or specific content.
>
> Paste an example, describe it, or say "skip".

Wait for the user's response before continuing.

### If the user provides inputs:

- **Query** → use it as-is for `user_query` in case_1. Generate case_2's query as a harder variant (multi-document, edge case, or adversarial).
- **Document** → save it as-is to `documents/`. Skip synthetic document generation for that case.
- **Expected output** → use it to write a precise `expected_output` description and design leading questions that verify the specific structural and content requirements shown.

### If the user skips all:

- **Query** → derive a realistic one from the skill's process steps and description.
- **Document** → generate synthetic ones in Step 6.
- **Output** → write `expected_output` as a structural description derived from the SKILL.md process steps only.

---

## Step 3 — Classify the Skill Category

Map the skill to exactly **one** of the six eval categories:

| Category | When to Use | Key Signal |
|---|---|---|
| **Content Generation & Transformation** | Produces written content (summaries, reports, case studies) | Output is a document or structured text |
| **Knowledge Retrieval & Q&A** | Answers questions from provided documents | Output cites sources, extracts findings |
| **Data Classification & Extraction** | Classifies, extracts, or restructures data | Output is structured data, tables, tagged entities |
| **Decision Support & Recommendation** | Provides analysis, options, or recommendations | Output has recommendations with trade-offs |
| **Tool-Orchestrated Workflow Execution** | Primarily orchestrates tool calls to produce artefacts | Output depends on code execution, file generation |
| **Governance / Control / Compliance** | Reviews, audits, or enforces compliance | Output flags violations, risks, or gaps |

If a skill spans two categories, choose the one that describes its **primary output**.

---

## Step 4 — Load References

Based on the category identified in Step 3, read two reference files:

### 4a. Category Template

Read the matching template from `evals/_eval/templates/`:

| Category | Template File |
|---|---|
| Content Generation & Transformation | `evals/_eval/templates/content_generation.yaml` |
| Knowledge Retrieval & Q&A | `evals/_eval/templates/knowledge_retrieval.yaml` |
| Data Classification & Extraction | `evals/_eval/templates/data_classification.yaml` |
| Decision Support & Recommendation | `evals/_eval/templates/decision_support.yaml` |
| Tool-Orchestrated Workflow Execution | `evals/_eval/templates/tool_orchestration.yaml` |
| Governance / Control / Compliance | `evals/_eval/templates/governance_compliance.yaml` |

Use this template as your structural starting point. Do **not** copy it verbatim — adapt metrics, thresholds, and leading questions to the specific skill.

### 4b. Worked Example

Read the worked example for tone, structure, and level of detail:

| Category | Worked Example |
|---|---|
| All categories | `evals/Meeting Summariser/eval_cases.yaml` |

This example demonstrates both single-turn (`invoke_text`) and multi-turn (`invoke_sequential`) patterns with `turns`, `turn_assertions`, `conversational_metrics`, and `leading_questions`. Study how it translates skill requirements into user queries, expected outputs, and tailored leading questions.

---

## Step 5 — Generate eval_cases.yaml

Produce a complete `eval_cases.yaml`. Use the category's recommended metrics as a starting point, but **tailor everything** to the specific skill.

### Rules for case design:

1. **Create exactly 2 cases** — case_1 is single-turn (`invoke_text` with `user_query`), case_2 is multi-turn (`invoke_sequential` with `turns` and `turn_assertions`).
2. **user_query** (for `invoke_text`) or **turns** (for `invoke_sequential`) must contain realistic prompts a Deloitte consultant would actually type.
3. **expected_output** must describe the structure and content expected, not exact text.
4. **expected_tools** must include the skill tool call with the skill's name (e.g. `{name: skill, input_parameters: {skillName: "skill-name"}}`).
5. **source_material** must reference a file in `documents/` relative to the YAML.
6. **invoke_method** — use `invoke_text` for single-turn, `invoke_sequential` for multi-turn conversations.
7. **leading_questions** — write 3–5 per case. At least 1 must be `type: gating`. Questions should probe the skill's specific output requirements, not generic quality.
8. **num_runs** — default to 3.
9. **metrics** — select from: `hallucination`, `task_completion`, `faithfulness`, `answer_relevancy`, `summarization`, `contextual_recall`, `bias`, `toxicity`.
10. **For `invoke_sequential` cases** — use `turns` with `turn_assertions` (types: `expected_tools`, `contains_any`, `not_contains`, `leading_question`). Add `conversational_metrics` and `conversational_thresholds`.
11. **chatbot_role** — describe the agent's persona for the test case.

### Category → Recommended Metrics:

| Category | Metrics | Conversational |
|---|---|---|
| Content Generation | hallucination, task_completion, faithfulness | conversation_completeness |
| Knowledge Retrieval | faithfulness, task_completion, hallucination | conversation_completeness |
| Data Classification | task_completion, faithfulness | — |
| Decision Support | task_completion, faithfulness, hallucination | conversation_completeness |
| Tool Orchestration | task_completion, faithfulness | conversation_completeness |
| Governance / Compliance | task_completion, faithfulness, hallucination | — |

### YAML structure:

```yaml
# <Skill Name> — Evaluation Cases
# Category: <Category Name>

adapter: _eval.adapters.librechat_adapter.LibreChatAdapter
invoke_method: invoke_text  # or invoke_sequential for multi-turn
num_runs: 3

cases:

  # --- Single-turn case ---
  case_1:
    name: "<descriptive name>"
    category: "<Category Name>"
    source_material: "documents/<filename>.md"
    chatbot_role: "<agent persona description>"
    user_query: >-
      <realistic user prompt>
    expected_output: >-
      <description of expected output>
    expected_tools:
      - name: skill
        input_parameters:
          skillName: "<skill-name>"

    metrics:
      - <metric_1>
      - <metric_2>

    thresholds:
      <metric_1>: <value>
      <metric_2>: <value>

    leading_questions:
      - name: "<Probe Name>"
        type: gating
        threshold: 0.7
        question: >-
          <specific question about output quality>

      - name: "<Probe Name>"
        question: >-
          <non-blocking probe question>

  # --- Multi-turn case ---
  case_2:
    name: "<descriptive name — harder variant>"
    category: "<Category Name>"
    invoke_method: invoke_sequential
    source_material: "documents/<filename>.md"
    chatbot_role: "<agent persona description>"
    expected_output: >-
      <description of expected multi-turn output>
    expected_tools:
      - name: skill
        input_parameters:
          skillName: "<skill-name>"

    turns:
      - content: >-
          <first user message>
        attach_source: true
        turn_assertions:
          - type: expected_tools
            name: "<assertion name>"
            tools:
              - name: skill
                input_parameters:
                  skillName: "<skill-name>"
          - type: contains_any
            name: "<assertion name>"
            phrases: ["<phrase1>", "<phrase2>"]

      - content: >-
          <follow-up user message>
        turn_assertions:
          - type: leading_question
            name: "<assertion name>"
            question: >-
              <LLM-judged question about this turn's response>

    metrics:
      - <metric_1>
      - <metric_2>

    thresholds:
      <metric_1>: <value>
      <metric_2>: <value>

    conversational_metrics:
      - conversation_completeness

    conversational_thresholds:
      conversation_completeness: 0.5

    leading_questions:
      - name: "<Probe Name>"
        type: gating
        threshold: 0.7
        question: >-
          <specific question about output quality>
```

---

## Step 6 — Generate Sample Test Documents

For each `source_material` entry referenced in the YAML, create a realistic sample document in `documents/`.

### Document rules:

1. **Domain-appropriate** — use realistic but fictional data matching the skill's domain.
2. **Sufficient complexity** — 200–500 words minimum.
3. **Contains testable elements** — include details the leading questions will probe for.
4. **Case 2 documents** — if it's a comparison case, create a second version with deliberate differences.
5. **Markdown format** — use `.md` with proper headings.
6. **No real client data** — all content must be fictional.

---

## Step 7 — Output

Write the following files using code execution:

```
evals/<Skill Name>/
├── eval_cases.yaml
└── documents/
    ├── <document_1>.md
    └── <document_2>.md   (if needed)
```

After writing, print a summary:

```
✓ Eval scaffolding created for: <skill-name>
  Category: <category>
  Cases: 2
  Documents: <N>
```

---

## Step 8 — Run the Eval

Immediately run the evaluation against the scaffolding you just created:

```bash
uv run eval-run --config "evals/<Skill Name>/eval_cases.yaml" --langfuse --run-name "scaffold-baseline"
```

Once complete, display the results:

```bash
uv run eval-summary --config "evals/<Skill Name>/eval_cases.yaml"
```

Do not ask for confirmation — run both commands automatically after Step 7 completes.

Optional: sync cases to Langfuse Datasets for experiment tracking:

```bash
uv run eval-run --config "evals/<Skill Name>/eval_cases.yaml" --sync-dataset
```
