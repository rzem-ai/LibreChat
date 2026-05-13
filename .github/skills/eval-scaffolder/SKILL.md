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

Read the closest worked example for tone, structure, and level of detail:

| Category | Worked Example |
|---|---|
| Content Generation | `evals/Meeting Summariser/eval_cases.yaml` |
| Knowledge Retrieval | `evals/Research Assistant/eval_cases.yaml` |
| Data Classification | `evals/Contract Analyser/eval_cases.yaml` |
| Decision Support | `evals/Contract Analyser/eval_cases.yaml` |
| Tool Orchestration | `evals/Meeting Summariser/eval_cases.yaml` |
| Governance / Compliance | `evals/Audit RFP Response Generator/eval_cases.yaml` |

Study how the worked example translates skill requirements into user queries, expected outputs, and tailored leading questions.

---

## Step 5 — Generate eval_cases.yaml

Produce a complete `eval_cases.yaml`. Use the category's recommended metrics as a starting point, but **tailor everything** to the specific skill.

### Rules for case design:

1. **Create exactly 2 cases** — one straightforward, one harder variant (multi-document, edge case, or complex prompt).
2. **user_query** must be a realistic prompt a Deloitte consultant would actually type.
3. **expected_output** must describe the structure and content expected, not exact text.
4. **expected_tools** must always include `get_skill_instructions` with the skill's `name:` value.
5. **source_files** or **source_material** must reference files in `documents/` relative to the YAML.
6. **invoke_method** — use `invoke_file` if documents are provided, `invoke_text` if context is inline.
7. **leading_questions** — write 3–5 per case. At least 1 must be `type: gating`. Questions should probe the skill's specific output requirements, not generic quality.
8. **num_runs** — default to 3.
9. **metrics** — select from: `hallucination`, `task_completion`, `tool_correctness`, `role_consistency`, `instruction_adherence`, `policy_compliance`, `answer_relevancy`, `summarization`, `faithfulness`, `contextual_recall`, `bias`, `toxicity`.

### Category → Recommended Metrics:

| Category | Gating | Diagnostic |
|---|---|---|
| Content Generation | hallucination, task_completion, tool_correctness, role_consistency, policy_compliance | answer_relevancy, summarization, faithfulness |
| Knowledge Retrieval | faithfulness, answer_relevancy, tool_correctness | contextual_recall, task_completion |
| Data Classification | task_completion, policy_compliance | answer_relevancy, faithfulness |
| Decision Support | task_completion, instruction_adherence, role_consistency | answer_relevancy, bias |
| Tool Orchestration | tool_correctness, task_completion | answer_relevancy |
| Governance / Compliance | task_completion, instruction_adherence, policy_compliance | answer_relevancy, bias, toxicity |

### YAML structure:

```yaml
# <Skill Name> — Evaluation Cases
# Category: <Category Name>

adapter: _eval.adapters.agno_adapter.AgnoAdapter
invoke_method: <default invoke method>
num_runs: 3

cases:

  case_1:
    name: "<descriptive name>"
    category: "<Category Name>"
    invoke_method: <invoke_text|invoke_file>
    source_files:
      - "documents/<filename>.md"
    user_query: >-
      <realistic user prompt>
    expected_output: >-
      <description of expected output>
    expected_tools:
      - name: get_skill_instructions
        input_parameters:
          skill_name: "<skill-name>"

    metrics:
      - <metric_1>
      - <metric_2>

    thresholds:
      <metric_1>: <value>
      <metric_2>: <value>

    diagnostic_metrics:
      - <metric>

    diagnostic_thresholds:
      <metric>: <value>

    leading_questions:
      - name: "<Probe Name>"
        type: gating
        threshold: 0.7
        question: >-
          <specific question about output quality>

      - name: "<Probe Name>"
        question: >-
          <diagnostic question>

  case_2:
    # ... (harder variant)
```

---

## Step 6 — Generate Sample Test Documents

For each `source_files` entry referenced in the YAML, create a realistic sample document in `documents/`.

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
uv run eval-run --config "evals/<Skill Name>/eval_cases.yaml"
```

Once complete, display the results:

```bash
uv run eval-summary --config "evals/<Skill Name>/eval_cases.yaml"
```

Do not ask for confirmation — run both commands automatically after Step 7 completes.
