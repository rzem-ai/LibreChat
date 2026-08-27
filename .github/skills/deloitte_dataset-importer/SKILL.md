---
name: dataset-importer
description: >-
  Imports curated Q&A pairs from a Langfuse Dataset directly into
  eval_cases.yaml as golden test cases. Pulls items from a specified Langfuse
  dataset, uses the existing eval_cases.yaml as a structural template, and
  appends fully-formed case entries. Assumes the user has already reviewed and
  approved the data in Langfuse before invoking this skill.
---

# Dataset Importer

You import reviewed Langfuse Dataset items (from UAT feedback, curated traces,
or synthetic Q&A pairs) directly into a skill's `eval_cases.yaml` as golden
test cases. The user has already reviewed data quality in Langfuse — your job
is to transform the items into properly-structured YAML cases and append them.

After import, the user runs `--sync-dataset` to push the updated cases to
Langfuse.

---

## Step 1 — Gather Inputs

Ask the user for:

1. **Config path** — path to the skill's existing `eval_cases.yaml`

The dataset name is derived automatically: `evals/<skill_directory_name>`
(e.g., `evals/Meeting Summariser`). This is the same dataset that
`--sync-dataset` pushes to — new items added by the user via the Langfuse UI
coexist alongside synced items.

If the user provides the config path inline, skip prompting.

---

## Step 2 — Read References

### 2a. Read the existing eval_cases.yaml

Read the full `eval_cases.yaml` at the config path. This is your structural
template — every generated case must match this schema exactly.

Extract:
- Top-level fields: `adapter`, `invoke_method`, `num_runs`
- Per-case structure: all field names and nesting
- **Highest existing case key number** — new cases continue from there

### 2b. List available source documents

List all `.md` files in `<config_dir>/documents/`. These are the files cases
may reference via `source_material`.

### 2c. Read REFERENCE.md

Read `REFERENCE.md` (in this skill's directory) for metric selection tables,
leading question derivation rules, and Format A filtering rules.

---

## Step 3 — Fetch Langfuse Dataset Items

Run [scripts/fetch_langfuse_items.py](scripts/fetch_langfuse_items.py) from the
project root. It fetches only new items and writes them to a temp file:

```bash
python .github/skills/dataset-importer/scripts/fetch_langfuse_items.py \
  --skill-name "<SKILL_DIR_NAME>"
```

Replace `<SKILL_DIR_NAME>` with the skill directory name from the config path.

**If 0 new items are found:** tell the user there's nothing to import and stop.

**Filtering logic:** Items synced by `--sync-dataset` always have metadata
containing `skill` and `case_name` fields. Items added manually via the
Langfuse UI (from traces) have different metadata (e.g., `agentName`,
`thread_id`). The filter skips synced items and returns only user-added ones.

### 3a. Detect item format

| Format | Detection rule | Characteristics |
|--------|---------------|-----------------|
| **A** — Traced session | `input` is an array | Multi-turn, `expected_output.messages` has full conversation incl. final response |
| **B** — UAT trace | `input` is a dict with `messages` key | Multi-turn, has `metadata.feedback` |
| **C** — Curated Q&A | `input` is a dict with `query` key | Single-turn |
| **D** — Scored trace | `input` dict with `query` + `metadata.score` | Single-turn, has failure reason |

For Format A: use `expected_output.messages` as the **single source of truth**
for all extraction (it is a superset of `input` — same conversation plus the
final assistant response). Apply the filtering rules in REFERENCE.md to separate
real user turns from injected skill instructions, tool_calls, and skill messages.
The `input` field is only needed for format detection (checking if it's an array).

---

## Step 4 — Generate Eval Cases

For each dataset item, generate a complete eval case entry.

### 4a. Case key naming

Continue the existing numbering sequence (e.g., `case_5`, `case_6`...).

### 4b. Source material

- If metadata/input specifies a source document → use it
- If the first user message embeds inline content (transcript/notes) → extract
  the document portion and save as a new file in `documents/`. Name it
  descriptively. Strip the instruction prefix.
- Otherwise distribute existing source documents evenly across cases

### 4c. Derive case content

**All formats — expected_output field:**
- For Format A: use `expected_output.messages` as the single source. Find the
  final `assistant` response (no `tool_calls`) — this is the golden answer.
  Summarise what it should contain in 1-3 sentences for the YAML field.
  Never copy the raw messages array.
- For Formats B/D with failure metadata: explicitly require what was missing.
- For Format C: use `expected_output` directly.

**All formats — turns:**
- For Format A: extract real user turns from `expected_output.messages` using
  the filtering rules. Ignore `input` (it's a subset of expected_output).
- For other formats: extract from `input.messages` or `input.query`.
- First turn gets `attach_source: true`
- Preserve exact user message text as `content`

**All formats — turn_assertions:**
- Pair each real user turn with the **next** assistant response (no `tool_calls`)
  in `expected_output.messages` — this is the expected response for that turn
- First turn: add `expected_tools` assertion for skill invocation
- Each turn: add `leading_question` assertions derived from the paired
  assistant response (use derivation table in REFERENCE.md)
- For Formats B/D with failure metadata: add a gating probe at the relevant
  turn targeting the specific failure (threshold: 0.8)

**All formats — extract tool info:**
- Find `skillName` from `tool_calls` in assistant messages within
  `expected_output.messages` or from existing cases
- Use for both case-level `expected_tools` and first-turn assertion

### 4d. Select metrics

Use the metric selection table in REFERENCE.md. Do NOT blindly copy from
existing cases. Always apply base metrics (`task_completion`, `hallucination`).
Add content-driven metrics only when the corresponding pattern is detected.

Add `conversation_completeness` to `metrics:` when case has 3+ turns.

**Thresholds:** match the thresholds used in the existing eval_cases.yaml for
consistency (typically 0.5 for all metrics). Only use higher thresholds (0.7+)
if existing cases already use them or if explicitly warranted by UAT failure
metadata.

### 4e. Generate leading questions

Use the leading question derivation table in REFERENCE.md. Generate:
- 1+ gating `leading_question` turn_assertion per turn (from expected response)
- 1-2 case-level leading questions from the final response

All questions must be yes/no, reference specific content, never generic.

### 4f. Required fields template

Every case MUST include:

```yaml
name: "<descriptive name>"
category: "<same as existing cases>"
invoke_method: invoke_sequential
source_material: "documents/<file>.md"
chatbot_role: "<same as existing cases>"
expected_output: >-
  <1-3 sentence description of correct response>
expected_tools:
  - name: skill
    input_parameters:
      skillName: "<skill tool name>"
turns:
  - content: >-
      <user's actual message>
    attach_source: true
    turn_assertions:
      - type: expected_tools
        name: "Skill tool called"
        tools:
          - name: skill
            input_parameters:
              skillName: "<skill tool name>"
      - type: leading_question
        name: "<meaningful name>"
        question: "<specific question>"
metrics:
  - task_completion
  - hallucination
thresholds:
  task_completion: 0.5
  hallucination: 0.5
leading_questions:
  - name: "<probe name>"
    type: gating
    threshold: 0.5
    question: >-
      <question about final output>
```

---

## Step 5 — Append to eval_cases.yaml

### 5a. Append cases directly

Append generated cases under the `cases:` key. Do NOT create a separate file.

### 5b. Validate

- All `source_material` paths point to existing files in `documents/`
- All required fields present
- YAML is valid, case keys unique and sequential
- Leading questions are specific (reference concrete content)
- Metrics selected per-case (not copied wholesale)
- Turn_assertions pair with expected assistant responses
- Run `uv run eval-run "<Skill Name>" --sync-dataset` to validate
  the appended YAML and push to Langfuse (Pydantic validation triggers during compile)

### 5c. Next step for the user

> Cases appended to eval_cases.yaml. Run `--sync-dataset` to push to Langfuse:
> ```
> uv run eval-run "<Skill Name>" --sync-dataset
> ```

---

## Constraints

- **Source document creation** — only when traced session has inline content.
  Never fabricate source material.
- **Schema fidelity** — match existing eval_cases.yaml structure exactly
- **Preserve real queries** — use verbatim user messages, don't rephrase
- **Failure → assertion** — UAT failures become gating probes (threshold: 0.8)
- **Metric selection per-case** — use REFERENCE.md table, never blindly copy
- **Specific leading questions** — derive from response content, never generic
- **No raw message dumps** — `expected_output` must be human-readable summary
- **Realistic assertions** — ground in actual source/response content
- **Preserve tool expectations** — copy `adapter`, `expected_tools`, `skillName`
- **Auto-promote** — all items go directly to eval_cases.yaml (pre-reviewed)
- **Sequential numbering** — continue from highest existing key, never reuse
