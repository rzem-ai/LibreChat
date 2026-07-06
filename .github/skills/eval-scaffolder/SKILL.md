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

### Question 0: Agent ID (agents only — skip for skills)

If `agent_id:` was found in the `Agent.md` frontmatter in Step 1c, **skip this question entirely** — you already have the ID.

Only ask if it was missing from the frontmatter:

> **I couldn't find an `agent_id` in Agent.md. What env var name should I use for this agent's ID?**
> Agent IDs are instance-specific and must not be committed to the repo. Instead, give me a env var name (e.g. `EXPENSE_ASSIST_AGENT_ID`) and I'll write `agent_id: ${EXPENSE_ASSIST_AGENT_ID}` into both `Agent.md` and `eval_cases.yaml`. You then add the real ID to your local `.env` file.
>
> Provide a var name, or say "skip" to rely on the default `LIBRECHAT_AGENT_ID` env var instead.

Wait for the user's response before continuing.

### Question 1: Sample query

Ask:

> **Do you have a sample user query for this skill/agent?**
> This is the prompt you'd typically type to trigger it. It helps me write realistic test cases.
>
> Paste it here, or say "skip".

Wait for the user's response before continuing.

### Question 2: Input document

Ask:

> **Do you have an input document you'd normally provide?**
> This is the source material it processes (e.g. transcript, contract, report).
> For KB-backed agents, this could be a sample of your knowledge base content.
>
> Provide the path to your source document — PDF, DOCX, PPTX, XLSX, and markdown all work. Paste its content, or say "skip".

Wait for the user's response before continuing.

### Question 3: Expected output

Ask:

> **What should the output look like for the document/query you just provided?**
> This is what a correct response should contain — structure, key sections, tone, or specific content.
>
> Paste an example, describe it, or say "skip".

Wait for the user's response before continuing.

### If the user provides inputs:

- **Agent ID** → set `agent_id: "<id>"` at the top level of the YAML.
- **Query** → use it as-is for `user_query` in case_1. Generate case_2's query as a harder variant (edge case, adversarial, or refusal test).
- **Document** → save it as-is to `documents/`. Skip synthetic document generation for that case.
- **Expected output** → use it to write a precise `expected_output` description and design leading questions that verify the specific structural and content requirements shown.

### If the user skips all:

- **Agent ID** → omit `agent_id` from the YAML; add a comment that the env var `LIBRECHAT_AGENT_ID` must be set.
- **Query** → derive a realistic one from the definition file's process steps and description.
- **Document** → generate synthetic ones in Step 6.
- **Output** → write `expected_output` as a structural description derived from the definition file only.

---

## Step 3 — Classify the Skill Category

Map the skill or agent to exactly **one** of the six eval categories:

| Category | When to Use | Key Signal |
|---|---|---|
| **Content Generation & Transformation** | Produces written content (summaries, reports, case studies) | Output is a document or structured text |
| **Knowledge Retrieval & Q&A** | Answers questions from documents or a knowledge base | Output cites sources, extracts findings |
| **Data Classification & Extraction** | Classifies, extracts, or restructures data | Output is structured data, tables, tagged entities |
| **Decision Support & Recommendation** | Provides analysis, options, or recommendations | Output has recommendations with trade-offs |
| **Tool-Orchestrated Workflow Execution** | Primarily orchestrates tool calls to produce artefacts | Output depends on code execution, file generation |
| **Governance / Control / Compliance** | Reviews, audits, or enforces compliance | Output flags violations, risks, or gaps |

**For KB-backed agents** (RAG mode detected in Step 1c): always classify as **Knowledge Retrieval & Q&A** and use Pattern B (KB-backed RAG) from the template.

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

Use this template as your structural starting point. Do **not** copy it verbatim — adapt metrics, thresholds, and leading questions to the specific skill or agent.

### 4b. Read source documents

For every document the user provided in Step 2, read its content using the document reader script with the path they gave you:

```bash
uv run python .github/skills/eval-scaffolder/scripts/read_document.py "<path from user>"
```

This handles PDF, DOCX, PPTX, XLSX, and markdown via `markitdown`. Use the extracted text as the source of truth for writing grounded `expected_output` descriptions and leading questions. Never fabricate or paraphrase document content.

For skills, copy the source file into `evals/skills/<Skill Name>/documents/` and set `source_material` in the YAML to the copied filename.
For agents, copy into `evals/agents/<Agent Name>/documents/`. For KB-backed agents, omit `source_material` — the agent retrieves its own context.

### 4c. Worked Example

Read the worked example for tone, structure, and level of detail:

| Category | Worked Example |
|---|---|
| All categories | `evals/skills/Meeting Summariser/eval_cases.yaml` |

This example demonstrates both single-turn (`invoke_text`) and multi-turn (`invoke_sequential`) patterns with `turns`, `turn_assertions`, `conversational_metrics`, and `leading_questions`. Study how it translates skill requirements into user queries, expected outputs, and tailored leading questions.

---

## Step 5 — Generate eval_cases.yaml

Produce a complete `eval_cases.yaml`. Use the category's recommended metrics as a starting point, but **tailor everything** to the specific skill or agent.

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

| Category | Single-turn Metrics | Multi-turn Metrics |
|---|---|---|
| Content Generation | hallucination, task_completion, faithfulness | hallucination, faithfulness, conversation_completeness |
| Knowledge Retrieval (doc Q&A) | faithfulness, task_completion, hallucination | faithfulness, hallucination, conversation_completeness |
| Knowledge Retrieval (KB/RAG) | faithfulness, answer_relevancy, contextual_recall, contextual_precision — diagnostic: contextual_relevancy | faithfulness, answer_relevancy, contextual_recall, conversation_completeness — diagnostic: contextual_relevancy |
| Data Classification | task_completion, faithfulness | faithfulness, conversation_completeness |
| Decision Support | task_completion, faithfulness, hallucination | faithfulness, hallucination, conversation_completeness |
| Tool Orchestration | task_completion, faithfulness | faithfulness, conversation_completeness |
| Governance / Compliance | task_completion, faithfulness, hallucination | faithfulness, hallucination, conversation_completeness |

> **Note:** `task_completion` only evaluates the final turn's output. For multi-turn cases, `conversation_completeness` evaluates the entire dialogue and is the correct replacement. All metrics in `metrics:` are gating; use `diagnostic_metrics:` for non-blocking.

### YAML structure — skill:

```yaml
# <Skill Name> — Evaluation Cases
# Category: <Category Name>

adapter: _eval.adapters.librechat_adapter.LibreChatAdapter
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
agent_id: "<librechat-agent-id>"   # omit if relying on LIBRECHAT_AGENT_ID env var
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
uv run eval-run --config "evals/<skills|agents>/<Name>/eval_cases.yaml" --sync-dataset
```

### 8b. Run the baseline eval

```bash
uv run eval-run --config "evals/<skills|agents>/<Name>/eval_cases.yaml" --langfuse --run-name "1_scaffold_baseline"
```

### 8c. Display the summary

```bash
uv run eval-summary --config "evals/<skills|agents>/<Name>/eval_cases.yaml"
```
