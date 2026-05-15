---
name: dataset-importer
description: >-
  Converts curated Q&A pairs from a Langfuse Dataset into full eval_cases.yaml
  entries. Pulls items from a specified Langfuse dataset, uses the existing
  eval_cases.yaml as a structural template, and writes eval_cases_synthetic.yaml
  with properly formatted cases referencing existing source documents.
---

# Dataset Importer

You convert Langfuse Dataset items (from UAT feedback, curated traces, or
synthetic Q&A pairs) into full eval framework test cases. Given a dataset name
and a target skill's `eval_cases.yaml`, you produce an
`eval_cases_synthetic.yaml` with complete case entries.

---

## Step 1 — Gather Inputs

Ask the user for:

1. **Langfuse dataset name** — e.g. `evals/Meeting Summariser/uat-feedback`
2. **Config path** — path to the skill's existing `eval_cases.yaml`

If the user provides both inline, skip prompting.

---

## Step 2 — Read References

### 2a. Read the existing eval_cases.yaml

Read the full `eval_cases.yaml` at the config path. This is your structural
template — every generated case must match this schema exactly.

Extract:
- Top-level fields: `adapter`, `invoke_method`, `num_runs`
- Per-case structure: `name`, `category`, `invoke_method`, `source_material`,
  `chatbot_role`, `expected_output`, `expected_tools`, `turns`,
  `turn_assertions`, `metrics`, `thresholds`, `conversational_metrics`,
  `conversational_thresholds`, `leading_questions`

### 2b. List available source documents

List all `.md` files in `<config_dir>/documents/`. These are the only files
that cases may reference via `source_material`.

---

## Step 3 — Fetch Langfuse Dataset Items

Run this Python snippet in a terminal to fetch the dataset items:

```python
import os, json
from dotenv import load_dotenv
from langfuse import Langfuse

load_dotenv()
host = os.getenv("EVAL_LANGFUSE_BASE_URL", "http://localhost:3000")
langfuse = Langfuse(host=host)
dataset = langfuse.get_dataset(name="<DATASET_NAME>")
for item in dataset.items:
    print(f"--- Item {item.id} ---")
    print(f"Input: {json.dumps(item.input, indent=2)}")
    print(f"Expected: {json.dumps(item.expected_output, indent=2)}")
    if item.metadata:
        print(f"Metadata: {json.dumps(item.metadata, indent=2)}")
    print()
```

Replace `<DATASET_NAME>` with the user-provided dataset name.

### 3a. Understand item formats

Langfuse dataset items may come from different sources:

**From UAT traces** (real user interactions):
```json
{
  "input": {
    "messages": [
      {"role": "user", "content": "Summarise this meeting..."},
      {"role": "assistant", "content": "Here is the summary..."},
      {"role": "user", "content": "What about the action items?"}
    ]
  },
  "expected_output": "The response should include action items with owners...",
  "metadata": {"trace_id": "...", "feedback": "missing action item owners"}
}
```

**From curated Q&A pairs** (manually created or from eval-synth):
```json
{
  "input": {"query": "Summarise this meeting transcript"},
  "expected_output": {"summary": "A structured summary with..."}
}
```

**From scored traces** (trace + user score):
```json
{
  "input": {
    "query": "...",
    "source_material": "documents/sample_meeting_transcript.md"
  },
  "expected_output": "...",
  "metadata": {"score": 0, "reason": "Missed key discussion point about budget"}
}
```

Handle all formats — extract the user query, conversation turns, expected
behaviour, and any failure context from metadata.

---

## Step 4 — Generate Eval Cases

For each dataset item, generate a complete eval case entry following these rules:

### 4a. Case key naming

Use keys `uat_1`, `uat_2`, ..., `uat_N`.

### 4b. Determine single-turn vs multi-turn from the data

- If the item has **multi-turn messages** (multiple user/assistant exchanges) →
  create a multi-turn case with all the user messages as turns
- If the item has a **single query** → create a single-turn case
- If the item has **failure metadata** (e.g. `"feedback": "missing X"`) →
  add a leading question that specifically probes for the reported failure

### 4c. Source material assignment

- If the item's metadata or input specifies a source document → use that
- Otherwise distribute existing source documents evenly across cases
- Only reference files that exist in `documents/`

### 4d. Required fields per case

Every case MUST include:

```yaml
name: "<descriptive name — include failure context if from UAT feedback>"
category: "<same as existing cases>"
invoke_method: invoke_sequential
source_material: "documents/<existing_file>.md"
chatbot_role: "<same as existing cases>"
expected_output: >-
  <what a correct response should contain — if UAT feedback says something was
  missing, explicitly require it here>
expected_tools:
  - name: skill
    input_parameters:
      skillName: "<skill tool name from existing cases>"
turns:
  - content: >-
      <the user's actual query from the dataset item>
    attach_source: true
    turn_assertions:
      - type: expected_tools
        name: "Skill tool called"
        tools:
          - name: skill
            input_parameters:
              skillName: "<skill tool name>"
      - type: contains_any
        name: "<meaningful assertion name>"
        phrases: ["<phrase1>", "<phrase2>", "<phrase3>"]
metrics:
  - hallucination
  - task_completion
  - faithfulness
thresholds:
  hallucination: 0.7
  task_completion: 0.7
  faithfulness: 0.7
conversational_metrics:
  - conversation_completeness
conversational_thresholds:
  conversation_completeness: 0.5
leading_questions:
  - name: "<probe name>"
    type: gating
    threshold: 0.7
    question: >-
      <question that verifies a key aspect of the expected output>
```

### 4e. Content derivation from UAT feedback

- **User query**: use the actual user message from the trace verbatim (or
  lightly cleaned). Real queries are more valuable than synthetic rewrites.
- **Expected output**: if the item has failure metadata (score=0, feedback text),
  the expected_output should explicitly require what was missing.
- **Leading questions**: derive at least one gating question from the failure
  reason. E.g. if feedback says "missed budget overrun topic" → add a leading
  question: "Does the summary include the budget overrun discussion?"
- **contains_any phrases**: ground these in the actual source document content —
  read the referenced document and pick real terms/names/numbers that should
  appear in a correct response.

### 4f. Multi-turn cases from traces

When the dataset item contains a full conversation:
- Map each user message to a `turn` entry
- First turn gets `attach_source: true`
- Add turn_assertions to each turn based on what a correct response at that
  stage should contain
- If the failure happened at a specific turn, add stronger assertions there

---

## Step 5 — Write Output

### 5a. Compose eval_cases_synthetic.yaml

Write the file to `<config_dir>/eval_cases_synthetic.yaml` with:

```yaml
# <Skill Name> — UAT-Derived Evaluation Cases
# Generated from Langfuse dataset: <dataset_name>

adapter: <same as original>
invoke_method: <same as original>
num_runs: 3

cases:
  uat_1:
    ...
  uat_2:
    ...
```

### 5b. Validate

After writing, verify:
- All `source_material` paths point to files that exist in `documents/`
- All cases have the required fields listed in 4d
- YAML is valid (no syntax errors)
- Leading questions derived from UAT feedback are specific and testable

---

## Constraints

- **Never generate new source documents** — only reference existing files in `documents/`
- **Match the schema exactly** — use the existing `eval_cases.yaml` as the authoritative template
- **Preserve real user queries** — use actual user messages from traces, don't rephrase them
- **Encode failure feedback as assertions** — UAT failures become gating leading questions
- **Use realistic assertions** — phrases in `contains_any` must be terms that actually appear in the referenced source document
- **Keep leading questions specific** — they should be answerable with yes/no based on the response content
- **Preserve the adapter and tool expectations** — copy `adapter`, `expected_tools`, and `skillName` from the existing config
