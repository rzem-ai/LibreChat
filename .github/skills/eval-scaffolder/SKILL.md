---
name: eval-scaffolder
description: >-
  Generates evaluation test scaffolding for agent skills and standalone agents.
  Given a skill's SKILL.md or an agent's Agent.md, this skill selects the
  appropriate eval category, produces a tailored eval_cases.yaml with realistic
  test cases, and creates sample test documents. Use this skill when onboarding
  a new skill or agent into the eval framework.
---

# Eval Scaffolder

You generate evaluation scaffolding for agent skills and standalone agents.

- **Skills** → output goes to `evals/skills/<Skill Name>/`
- **Agents** → output goes to `evals/agents/<Agent Name>/`

---

## Step 1 — Identify the Target and Detect Type

### 1a. Locate and read the definition file

Ask the user for the path to the skill or agent folder if not provided. Look for either:

- `SKILL.md` — this is a **skill**
- `Agent.md` — this is a **standalone agent**

Read the file in full. Record which type was found — it governs the rest of the flow.

### 1b. Skills only — ensure location

**Skip this step for agents.**

If a skill folder is **not** already inside `.github/skills/`, copy it there:

```bash
cp -r "<current location>/<Skill Name>" ".github/skills/<Skill Name>"
```

Confirm the copy succeeded. All subsequent steps use `.github/skills/<Skill Name>/` as the skill path.

If the skill is already in `.github/skills/`, skip the copy.

### 1c. Extract metadata

From the definition file, extract:

- **name** — the `name:` from the YAML frontmatter (lowercase-hyphenated)
- **description** — the `description:` from the frontmatter
- **process steps** — every `## Step` section
- **output format** — any formatting, template, or structural requirements
- **tools used** — any tool calls mentioned (e.g. code execution, file creation)
- **domain** — the professional domain (legal, finance, HR, consulting, etc.)
- **agent_id** — for agents, read the `agent_id:` field from the YAML frontmatter. This will be a `${VAR_NAME}` env var reference (e.g. `${EXPENSE_ASSIST_AGENT_ID}`), not a literal ID — agent IDs are instance-specific and must not be committed to the repo. Copy the reference verbatim into `eval_cases.yaml`; the adapter expands it at runtime via the local `.env` file.
- **KB/RAG flag** — for agents, look for mentions of `rag_query`, `knowledge base`, `uploaded documentation`, or `RAG mode` in Best Practices or Evaluation Notes

---

## Step 2 — Collect User Inputs

**YOU MUST ASK the user the following questions one at a time, in order.** Do not skip this step. Wait for a response to each question before asking the next. The user may answer "skip" to any individual question.

### Question 0: Agent ID

Skills are invoked through an agent — both skills and agents need an `agent_id` in `eval_cases.yaml`.

**For agents:** If `agent_id:` was already found in the `Agent.md` frontmatter in Step 1c, skip this question — you already have the ID. Only ask if it was missing.

**For skills:** Always ask this question.

Ask:

> **Which agent should this [skill/agent] be invoked through?**
> Provide an env var name (e.g. `EXPENSE_ASSIST_AGENT_ID`) and I'll write `agent_id: ${EXPENSE_ASSIST_AGENT_ID}` into `eval_cases.yaml`. For agents, I'll also add it to `Agent.md`. You then add the real ID to your local `.env` file.
>
> Provide a var name, or say "skip" to default to `GENERAL_BUSINESS_ASSISTANT_AGENT_ID`.

Wait for the user's response before continuing.

### Question 1: Sample queries

Ask:

> **Do you have sample user queries for this skill/agent?**
> These are prompts you'd typically type to trigger it. You can provide up to 4 — paste them as a numbered list (one per line), or say "skip".
>
> Example:
> 1. Summarise this SoW and highlight the key deliverables
> 2. Extract all payment terms from this MSA

Wait for the user's response before continuing.

### Question 2: Input documents

Ask:

> **Do you have input documents you'd normally provide?**
> Provide up to 4 — matched by position to your queries above (query 1 pairs with document 1, etc.).
> For KB-backed agents, this could be a sample of your knowledge base content.
>
> Paste paths as a numbered list — PDF, DOCX, PPTX, XLSX, and markdown all work. Or say "skip".
>
> Example:
> 1. /path/to/sow_draft.docx
> 2. /path/to/msa_vendor.pdf

Wait for the user's response before continuing.

### Question 3: Expected output

Ask:

> **What should the output look like for the queries/documents you provided?**
> This is what a correct response should contain — structure, key sections, tone, or specific content.
> If you provided multiple inputs, describe the expected output for each (numbered to match).
>
> Paste examples, describe them, or say "skip".

Wait for the user's response before continuing.

### If the user provides inputs:

- **Agent ID** → set `agent_id: "<id>"` at the top level of the YAML.
- **Queries / Documents** → each numbered pair (query N + document N) seeds one document slot (2 cases). Pair 1 → cases 1–2, pair 2 → cases 3–4, pair 3 → cases 5–6, pair 4 → cases 7–8. Any unprovided slots are filled with synthetic documents in Step 6.
- **Single query/doc** → use it for case_1. Generate case_2 as a harder variant (edge case, adversarial, or refusal) on the same document.
- **Document** → read and save it per Step 4b. Skip synthetic generation for that slot.
- **Expected output** → use it to write a precise `expected_output` description and design leading questions that verify the specific structural and content requirements shown.

### If the user skips all:

- **Agent ID** → set `agent_id: "${GENERAL_BUSINESS_ASSISTANT_AGENT_ID}"` in the YAML.
- **Queries** → derive realistic ones from the definition file's process steps and description.
- **Documents** → generate all 4 synthetic ones in Step 6.
- **Output** → write `expected_output` as a structural description derived from the definition file only.

---

## Step 3 — Classify the Skill Category

Map the skill or agent to exactly **one** of the four eval categories:

| Category | When to Use | Key Signal |
|---|---|---|
| **Advisory or Drafting** | Produces professional written deliverables or researched answers | Output is a document, structured narrative, or sourced answer |
| **Data Analysis** | Classifies, extracts, or assesses structured information from documents | Output is structured data, extracted fields, or risk flags |
| **System Integration or Utility** | Invokes external tools or APIs as the primary mechanism | Single tool call or API interaction drives the output |
| **Workflow Automation** | Orchestrates multi-step tool chains end-to-end | Multi-turn; sequence of dependent tool calls |

**For KB-backed agents** (RAG mode detected in Step 1c): always classify as **Advisory or Drafting** and use Pattern B (KB-backed RAG) from the template.

If a skill spans two categories, choose the one that describes its **primary output**.

---

## Step 4 — Load References

Based on the category identified in Step 3, read two reference files:

### 4a. Category Template

Read the matching template from `evals/_eval/templates/`:

| Category | Template File |
|---|---|
| Advisory or Drafting | `evals/_eval/templates/advisory_drafting.yaml` |
| Data Analysis | `evals/_eval/templates/data_analysis.yaml` |
| System Integration or Utility | `evals/_eval/templates/system_integration.yaml` |
| Workflow Automation | `evals/_eval/templates/workflow_automation.yaml` |

Use this template as your structural starting point. Do **not** copy it verbatim — adapt metrics, thresholds, and leading questions to the specific skill or agent.

### 4b. Read source documents

For every document the user provided in Step 2, read its content using the document reader script with the path they gave you:

```bash
uv run python .github/skills/eval-scaffolder/scripts/read_document.py "<path from user>"
```

This handles PDF, DOCX, PPTX, XLSX, and markdown via `markitdown`. Use the extracted text as the source of truth for writing grounded `expected_output` descriptions and leading questions. Never fabricate or paraphrase document content.

Regardless of the original file format, always save the extracted content as a `.md` file — never copy the source binary into `documents/`. Derive the filename from the original file's stem (e.g. `contract_draft.docx` → `contract_draft.md`). Write the markdown to disk using code execution.

For skills, write the `.md` file to `evals/skills/<Skill Name>/documents/` and set `source_material` in the YAML to that filename.
For agents, write to `evals/agents/<Agent Name>/documents/`. For KB-backed agents, omit `source_material` — the agent retrieves its own context.

---

## Step 5 — Generate eval_cases.yaml

Produce a complete `eval_cases.yaml`. Use the category's recommended metrics as a starting point, but **tailor everything** to the specific skill or agent.

### Rule 0 — Honour user inputs (MANDATORY)

**Before applying any other rule, check what the user provided in Step 2.**

Each numbered (query, document) pair from Step 2 maps to one document slot — two cases:

| Pair | Cases | Document slot |
|------|-------|---------------|
| Pair 1 | case_1 (single-turn), case_2 (harder variant) | document_1 |
| Pair 2 | case_3 (single-turn), case_4 (harder variant) | document_2 |
| Pair 3 | case_5 (single-turn), case_6 (harder variant) | document_3 |
| Pair 4 | case_7 (single-turn), case_8 (harder variant) | document_4 |

For each provided pair:

- **Query provided** → use it verbatim as `user_query` (or as the first turn's `content` for `invoke_sequential`) in the slot's first case. Do not rephrase or generalise it.
- **Document provided** → it was already read and copied in Step 4b. Set `source_material` to that filename. Do not generate a synthetic document for this slot.
- **Expected output provided** → write `expected_output` and leading questions directly from it. Ground every probe in the specific structure, sections, or content the user described.
- **Harder variant case** → uses the same document as its pair's first case, but with a harder query (edge case, adversarial, or refusal test).

Any slot whose pair was not provided by the user is filled with a synthetic document generated in Step 6.

If the user skipped all questions, ignore this rule and proceed normally.

---

### Rules for case design:

1. **Create exactly 8 cases.** How they are organised depends on whether source documents exist:
   - **Skills and doc Q&A agents** — 4 documents × 2 cases per document. Each document gets one single-turn case (`invoke_text` with `user_query`) and one multi-turn case (`invoke_sequential` with `turns` and `turn_assertions`).
   - **KB-backed agents (no source documents)** — 4 question categories × 2 cases per category. Categories should reflect the agent's domain (e.g. for an expense FAQ agent: *Standard policy query*, *Edge-case policy query*, *Out-of-scope / refusal*, *Multi-step clarification*). Each category gets one single-turn case (`invoke_sequential` with a single turn) and one multi-turn case (`invoke_sequential` with 2–3 turns). Use `invoke_sequential` for all KB-backed agent cases — do not use `invoke_text`.
2. **user_query** (for `invoke_text`) or **turns** (for `invoke_sequential`) must contain realistic prompts a Deloitte consultant would actually type.
3. **expected_output** must describe the structure and content expected, not exact text.
4. **expected_tools** must include the skill tool call with the skill's name (e.g. `{name: skill, input_parameters: {skillName: "skill-name"}}`). For standalone agents with no skill tool, omit `expected_tools`.
5. **source_material** must reference a file in `documents/` relative to the YAML. For KB-backed (RAG) skills or agents, omit `source_material` entirely — the agent retrieves its own context from its knowledge base.
6. **invoke_method** — use `invoke_text` for single-turn, `invoke_sequential` for multi-turn conversations.
7. **leading_questions** — write 3–5 per case. At least 1 must be `type: gating`. Questions should probe the skill's specific output requirements, not generic quality. For KB-backed agents, include at least one probe that checks for correct refusal/redirect when the question is out of scope.
8. **num_runs** — default to 3.
9. **metrics** — select from: `hallucination`, `task_completion`, `faithfulness`, `answer_relevancy`, `summarization`, `contextual_recall`, `contextual_precision`, `contextual_relevancy`, `bias`, `toxicity`, `conversation_completeness`, `conversational_role_consistency`, `conversational_instruction_adherence`. Conversational metrics (prefixed `conversation*`) require a `ConversationalTestCase` and only work with `invoke_sequential` cases. **Do NOT use `task_completion` for multi-turn (`invoke_sequential`) cases** — it only evaluates the final turn's response against the overall expected output. Use `conversation_completeness` in the `metrics:` list instead.
10. **For `invoke_sequential` cases** — use `turns` with `turn_assertions` (types: `expected_tools`, `contains_any`, `not_contains`, `leading_question`). Include `conversation_completeness` in the regular `metrics:` list as a gating metric to assess overall task fulfilment across all turns.
11. **chatbot_role** — describe the agent's persona for the test case.

### Category → Recommended Metrics:

| Category | Single-turn Gating | Multi-turn Gating | Diagnostic |
|---|---|---|---|
| Advisory or Drafting (doc-backed) | faithfulness, hallucination†, task_completion | faithfulness, hallucination†, conversation_completeness | — |
| Advisory or Drafting (RAG/KB-backed) | faithfulness, answer_relevancy, contextual_recall, contextual_precision | faithfulness, answer_relevancy, contextual_recall, conversation_completeness | contextual_relevancy |
| Data Analysis | faithfulness, task_completion, hallucination† | faithfulness, hallucination†, conversation_completeness | — |
| System Integration or Utility | faithfulness, task_completion, tool_correctness | faithfulness, tool_correctness, conversation_completeness | — |
| Workflow Automation | always multi-turn | faithfulness, tool_correctness, conversation_completeness | — |

> **Note:** `task_completion` only evaluates the final turn's output. For multi-turn cases, `conversation_completeness` evaluates the entire dialogue and is the correct replacement. All metrics in `metrics:` are gating; use `diagnostic_metrics:` for non-blocking. `tool_correctness` requires `expected_tools` to be defined on the case. **†** `hallucination` is lower-is-better with threshold `0.3`; drop it when the skill draws on domain knowledge beyond the source document — see Rule 14.

### Rule 12 — Metric consistency within invoke_method groups (MANDATORY)

Gating metrics must be **identical across all cases of the same `invoke_method`** within a skill's `eval_cases.yaml`. The only permitted difference between the two groups is the swap of `task_completion` ↔ `conversation_completeness`.

- All `invoke_text` cases → same metric set (e.g., `faithfulness`, `hallucination`, `task_completion`)
- All `invoke_sequential` cases → same metric set (same core metrics, `task_completion` replaced by `conversation_completeness`)
- **Use `leading_questions` as the per-case differentiator — not metric variations.**

Do not add extra metrics to individual cases to make them feel more targeted. If a metric applies to the skill, it applies to all cases of that invoke_method. If it only applies to one case, it belongs in `leading_questions` instead.

### Rule 13 — Place structural probes on the turn that produces the output (MANDATORY for invoke_sequential)

Case-level `leading_questions` on an `invoke_sequential` case are evaluated against the **final turn's output only** — not earlier turns.

For cases where an intermediate turn produces structured output (a table, extracted fields, a schema, a numbered list), place probes about that structure as a `turn_assertion` of type `leading_question` on the specific turn, not at the case level. A probe at the case level asking "does the table have six columns?" will be evaluated against the final prose reply and will always fail.

**When to use each:**

| Probe target | Where to place it |
|---|---|
| Does the table/schema/structured output from turn N conform to the required format? | `turn_assertion` of type `leading_question` on turn N |
| Does the first-turn output contain required phrases or section markers? | `turn_assertion` of type `contains_any` on turn 0 |
| Does the final turn's response correctly answer the follow-up question? | Case-level `leading_questions` |
| Does the full conversation avoid hallucinating or inventing content? | Case-level `leading_questions` (surveys the whole dialogue) |

**Example turn_assertion for a table schema probe:**

```yaml
    turns:
      - content: >-
          Produce the Step 1 assessment.
        attach_source: true
        turn_assertions:
          - type: expected_tools
            name: "Skill tool called"
            tools:
              - name: skill
                input_parameters:
                  skillName: "my-skill"
          - type: leading_question
            name: "Six-Column Schema"
            question: >-
              Does the assessment table contain exactly the six required columns
              (Theme, Position, Extracted Clause, Alignment, Details, Amendment)
              with no extra or missing columns?
```

### Rule 14 — Hallucination: threshold, and when to include or drop it (MANDATORY)

`HallucinationMetric` is **lower-is-better** — score 0 means no hallucination, score 1 means every context item was contradicted. The metric passes when `score ≤ threshold`.

**Threshold:** Always use `hallucination: 0.3`. A threshold of 0.7 permits 70% of the source material to be contradicted before failing — that is too permissive to be meaningful.

**When to include hallucination:** Only when the skill output should be derived **exclusively** from the provided source document — for example, a pure document summariser or data extractor where the model must not add any information beyond what the source contains.

**When to drop hallucination and use faithfulness + leading questions instead:**

| Condition | Why hallucination misfires |
|---|---|
| The skill applies domain knowledge from its system prompt (preferred positions, standard policies, institutional expertise) | The judge sees that knowledge as "not in the source document" → contradiction → score 1.0, guaranteed failure regardless of quality |
| Only one context item is passed | Score is always binary (0.0 or 1.0); a single contradiction = full failure; the threshold is effectively irrelevant |
| The agent uses RAG/KB (retrieves its own context) | The context passed to the metric is incomplete relative to what the agent actually used |

`faithfulness` (higher-is-better) already covers the "is output grounded in the source document?" angle. For the fabrication check, add a leading question such as: *"Does the output introduce any facts, clauses, or positions not present in the source document?"*

The category table marks `hallucination` with `†` for categories where this caveat applies most often.

### YAML structure — skill:

```yaml
# <Skill Name> — Evaluation Cases
# Category: <Category Name>

adapter: _eval.adapters.librechat_adapter.LibreChatAdapter
agent_id: "${GENERAL_BUSINESS_ASSISTANT_AGENT_ID}"
invoke_method: invoke_text  # or invoke_sequential for multi-turn
num_runs: 3

cases:

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
        threshold: 0.5
        question: >-
          <specific question about output quality>

      - name: "<Probe Name>"
        question: >-
          <non-blocking probe question>
```

### YAML structure — standalone agent (KB-backed RAG):

```yaml
# <Agent Name> — Evaluation Cases
# Category: Knowledge Retrieval & Q&A (KB-backed RAG)

adapter: _eval.adapters.librechat_adapter.LibreChatAdapter
agent_id: "${EXPENSE_ASSIST_AGENT_ID}"   # or ${GENERAL_BUSINESS_ASSISTANT_AGENT_ID} as fallback
invoke_method: invoke_sequential
num_runs: 3

cases:

  case_1:
    name: "<descriptive name>"
    category: "Knowledge Retrieval & Q&A"
    invoke_method: invoke_sequential
    # No source_material — agent retrieves from its knowledge base
    chatbot_role: "<agent persona description>"
    expected_output: >-
      <description of expected answer — specific facts or policy details>

    turns:
      - content: >-
          <user question>
        # No attach_source — agent owns retrieval

    metrics:
      - faithfulness
      - answer_relevancy
      - contextual_recall
      - contextual_relevancy
      - contextual_precision

    thresholds:
      faithfulness: 0.7
      answer_relevancy: 0.5
      contextual_recall: 0.5
      contextual_relevancy: 0.5
      contextual_precision: 0.5

    leading_questions:
      - name: "Grounded in KB"
        type: gating
        threshold: 0.7
        question: >-
          Is the answer grounded in the knowledge base rather than general model knowledge?

      - name: "Correct Refusal"
        question: >-
          For out-of-scope questions, does the agent refuse and redirect correctly?
```

---

## Step 6 — Generate Sample Test Documents

For KB-backed agents, synthetic documents are **only needed if no real KB content was provided**. Skip this step entirely if the agent retrieves from a pre-loaded knowledge base and no document was given in Step 2.

For all other skill/agent types, create exactly **4 documents** in `documents/`. Each document is referenced by 2 cases in the YAML.

### Document rules:

1. **Use real documents when available** — if the user provided files, read them with `read_document.py` and use that content. Only generate synthetic documents for slots the user did not fill.
2. **Domain-appropriate** — use realistic but fictional data matching the skill's domain.
3. **Sufficient complexity** — 200–500 words minimum.
4. **Contains testable elements** — include details the leading questions will probe for.
5. **Variety** — documents should vary in format, length, and complexity (e.g. formal transcript, informal notes, detailed report, short bullet points).
6. **Markdown format** — use `.md` with proper headings.
7. **No real client data** — all content must be fictional.

---

## Step 7 — Output

Write the following files using code execution.

**For skills:**

```
evals/skills/<Skill Name>/
├── eval_cases.yaml
└── documents/
    ├── <document_1>.md
    ├── <document_2>.md
    ├── <document_3>.md
    └── <document_4>.md
```

**For agents:**

```
evals/agents/<Agent Name>/
├── eval_cases.yaml
└── documents/          # omit if KB-backed and no docs needed
    └── <document>.md
```

After writing, print a summary:

```
✓ Eval scaffolding created for: <name>
  Type: Skill | Agent
  Category: <category>
  Cases: 8
  Documents: 4 (or "N/A — KB-backed agent" if skipped)
```

---

## Step 8 — Sync Dataset and Run the Eval

After writing the files, run the following three commands in order. Do not ask
for confirmation — execute all three automatically after Step 7 completes.

### 8a. Sync cases to Langfuse Dataset

```bash
uv run eval-run "<Name>" --sync-dataset
```

### 8b. Run the baseline eval

```bash
uv run eval-run "<Name>" --langfuse --run-name "1_scaffold_baseline"
```

### 8c. Display the summary

```bash
uv run eval-summary "<Name>"
```
