# `_eval` — Centralised Skill Evaluation Framework

A wrapper-agnostic evaluation framework for testing agent skills using [DeepEval](https://github.com/confident-ai/deepeval). Each skill only needs an `eval_cases.yaml` and sample documents in `evals/skills/<Skill Name>/` — all shared logic lives here.

### Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
  - [Multi-turn Flow](#multi-turn-flow-invoke_sequential)
- [Per-Skill Setup](#per-skill-setup)
- [Available Metrics](#available-metrics)
- [CLI Reference](#cli-reference)
- [eval_cases.yaml Schema](#eval_casesyaml-schema)
- [Langfuse Integration](#langfuse-integration)
- [Adding a New Adapter](#adding-a-new-adapter)
- [Directory Structure](#directory-structure)
- [Eval Categories](#eval-categories)

---

## Prerequisites

When using `LibreChatAdapter` as the agent adapter, ensure the following before running evals:

1. **LibreChat is running** — `docker-compose up -d` from the repo root
2. **`.env` is configured** — see [Available Adapters](#available-adapters) for required env vars
3. **Network access** — if using a corporate LLM gateway, connect VPN *before* starting Docker/Colima
4. **Python env** — `uv sync` (the `.venv` is auto-created by uv)

---

## Quick Start

```bash
# Run all cases for a skill
uv run eval-run --config "evals/skills/<Skill Name>/eval_cases.yaml"
```

This runs all cases defined in the YAML (default). To run a single case:

```bash
uv run eval-run --config "evals/skills/<Skill Name>/eval_cases.yaml" --case case_1
```

View results:

```bash
uv run eval-summary --config "evals/skills/<Skill Name>/eval_cases.yaml"
```

### Sample Output

```
============================================================
Running: case_1
============================================================

[RUN 1/1] case_1
  [Turn 0] Skill tool called: PASS
  [Turn 0] Has action items: PASS — Found: 'action items'
[RUN 1/1] Gating: PASS

GATING METRICS
Metric                        Avg  Threshold   Pass  Per-run scores
------------------------- ------- ---------- ------  --------------
Hallucination                0.00       0.50      ✓  [0.00]
Task Completion              1.00       0.50      ✓  [1.00]
Faithfulness                 1.00       0.50      ✓  [1.00]

[GATING] All gating metrics PASSED.

LEADING QUESTION PROBES (non-blocking)
Question                           Avg  Verdict  Per-run scores
------------------------------ ------- --------  --------------
Leading Q: Conciseness            0.90     ✓ OK  [0.90]
```

---

## How It Works

1. **Config-driven** — Each skill's `eval_cases.yaml` (in `evals/skills/<Skill Name>/`) defines cases, metrics, thresholds, and leading questions.
2. **Validated on load** — `eval_cases.yaml` is parsed through Pydantic before evaluation or sync. Bad metrics, assertion types, thresholds, or unsupported invoke methods fail fast with a path-aware error.
3. **Multi-run averaging** — Each case runs N times (default 3, configurable via YAML or `--num-runs`). Scores are averaged to account for non-determinism.
4. **Two-phase evaluation**:
   - **Gating metrics** — must pass (failures block)
   - **Diagnostic metrics + leading question probes** — reported but never block
5. **Results persistence** — Saved to `.results/` next to the YAML as per-case JSON files.

### Multi-turn Flow (`invoke_sequential`)

For cases with multiple turns, the execution follows this sequence:

```
┌─────────────────────────────────────────────────────────────────┐
│  For each run (N times):                                        │
│                                                                 │
│  1. SEND TURNS SEQUENTIALLY                                     │
│     ┌────────────────────────────────────────────────────┐      │
│     │ Turn 0: user message (+source if attach_source)    │      │
│     │   → Agent responds → save response, append to      │      │
│     │     conversation history                           │      │
│     │ Turn 1: next user message (history included)       │      │
│     │   → Agent responds → save response, append...      │      │
│     │ Turn N: ...                                        │      │
│     └────────────────────────────────────────────────────┘      │
│                                                                 │
│  2. EVALUATE TURN ASSERTIONS (per-turn)                         │
│     Each turn's response is checked against its                 │
│     turn_assertions: expected_tools, contains_any,              │
│     not_contains, leading_question                              │
│                                                                 │
│  3. EVALUATE CONVERSATIONAL METRICS (session-level)             │
│     The full conversation (all user + assistant turns)           │
│     is evaluated as a whole: conversation_completeness,          │
│     conversational_role_consistency, etc.                        │
│                                                                 │
│  4. EVALUATE GATING/DIAGNOSTIC METRICS (on final turn)          │
│     Standard metrics (hallucination, task_completion, etc.)      │
│     run against the last assistant response only                 │
│                                                                 │
│  5. EVALUATE LEADING QUESTIONS (on final turn)                  │
│     LLM-judged probes against the last response                 │
└─────────────────────────────────────────────────────────────────┘
```

Key points:
- The adapter maintains **conversation history** — each turn sees all prior messages, simulating a real chat session
- Source material is attached inline to whichever turn has `attach_source: true` (typically the first)
- Turn assertions give per-turn visibility; conversational metrics give session-level verdicts
- Standard gating metrics only evaluate the **final** response — use `conversation_completeness` for session-wide coverage

---

## Per-Skill Setup

Each skill needs an eval config directory under `evals/skills/`:

```
evals/skills/<Skill Name>/
├── eval_cases.yaml     # Source of truth — all golden test cases
├── dataset.jsonl       # Derived build artifact (generated by compile step)
├── .results/           # Generated by runner
└── documents/
    ├── <document_1>.md
    ├── <document_2>.md
    ├── <document_3>.md
    └── <document_4>.md
```

`dataset.jsonl` is a derived JSONL file produced by `compile.py`. It is
automatically regenerated every time `--sync-dataset` is invoked — never edit
it manually. Each line is a JSON object with `case_key`, `input`,
`expected_output`, and `metadata`.

The skill itself remains in `.github/skills/<Skill Name>/SKILL.md`.

Use the **eval-scaffolder** skill to generate this automatically:

> "Use the eval-scaffolder skill to create eval cases for the `<Skill Name>` skill."

The scaffolder produces **8 cases across 4 documents** (2 cases per document — one single-turn, one multi-turn) with varied complexity and focus. Alternatively, copy a category template from `_eval/templates/` as a starting point for manual authoring.

---

## Available Metrics

| Key | Type | Description |
|-----|------|-------------|
| `hallucination` | Gating | Detects fabricated information not in source |
| `task_completion` | Gating | Evaluates whether the task was fulfilled |
| `tool_correctness` | Gating | Verifies correct tools were called |
| `role_consistency` | Gating | Checks the agent maintained its role |
| `instruction_adherence` | Gating | Validates adherence to skill instructions |
| `answer_relevancy` | Diagnostic | Relevance of response to the query |
| `summarization` | Diagnostic | Quality of summarisation |
| `faithfulness` | Diagnostic | Groundedness in source material |
| `contextual_recall` | Diagnostic | Coverage of relevant context |
| `bias` | Diagnostic | Detects biased language |
| `toxicity` | Diagnostic | Detects harmful content |

### Conversational Metrics (session-level, for multi-turn)

These metrics evaluate the entire conversation rather than a single turn. They are placed in the regular `metrics:` (gating) or `diagnostic_metrics:` (non-blocking) lists — no separate key needed. They only work with `invoke_sequential` cases.

| Key | Description |
|-----|-------------|
| `conversation_completeness` | Whether all user requests were addressed across turns |
| `conversational_role_consistency` | Maintained persona across the conversation |
| `conversational_instruction_adherence` | Followed instructions throughout the session |

> **Note:** Do not use `task_completion` for multi-turn cases — it only evaluates the final turn's output. Use `conversation_completeness` instead.

---

## CLI Reference

### `eval-run`

```bash
uv run eval-run --config <path>                          # Run all cases (default)
uv run eval-run --config <path> --case case_1            # Run specific case
uv run eval-run --config <path> --case case_1 case_2      # Run multiple cases
uv run eval-run --config <path> --num-runs 5             # Override run count
uv run eval-run --config <path> --metrics hallucination,task_completion  # Override gating metrics
uv run eval-run --config <path> --langfuse               # Push scores to Langfuse
uv run eval-run --config <path> --langfuse --run-name "baseline"  # Named experiment
uv run eval-run --config <path> --sync-dataset           # Upload cases to Langfuse Dataset
```

### `eval-summary`

```bash
uv run eval-summary --config <path>              # Show all cases (default)
uv run eval-summary --config <path> --latest     # Show only last run
uv run eval-summary --file <path/to/case_1.json> # Show specific file
```

---

## eval_cases.yaml Schema

### Top-level Config

```yaml
adapter: _eval.adapters.librechat_adapter.LibreChatAdapter  # Required
invoke_method: invoke_text          # Global default (invoke_text | invoke_file | invoke_sequential)
num_runs: 3                         # Global default runs (overridable per-case or CLI)
```

### Case Basics

```yaml
cases:
  case_1:
    name: "Human-readable case description"
    category: "Content Generation & Transformation"
    invoke_method: invoke_sequential  # Per-case override
    source_material: "documents/sample.md"  # Relative to config directory
    chatbot_role: "A meeting summarisation analyst"
    expected_output: "Description of desired output..."
    expected_tools:                  # Tools the agent should call
      - name: skill
        input_parameters:
          skillName: "meeting-summariser"
```

### Turns & Assertions (`invoke_sequential` only)

Multi-turn cases define a `turns` list. Each turn can attach source material and include per-turn assertions:

```yaml
    turns:
      - content: "Summarise this meeting transcript."
        attach_source: true         # Attach source_material to this turn
        turn_assertions:
          - type: expected_tools    # Deterministic: expected_tools, contains_any, not_contains
            name: "Skill tool called"
            tools:
              - name: skill
                input_parameters:
                  skillName: "meeting-summariser"
          - type: contains_any
            name: "Has action items"
            phrases: ["action item", "action items", "follow-up"]
          - type: leading_question  # LLM-judged per-turn assertion
            name: "Asks for detail level"
            question: "Does the response ask the user to choose a detail level?"
```

### Metrics & Thresholds

Gating metrics must pass or the case fails. Diagnostic metrics are reported but never block:

```yaml
    metrics:
      - hallucination
      - task_completion
      - faithfulness
      - conversation_completeness  # session-level, invoke_sequential only
    thresholds:
      hallucination: 0.7
      task_completion: 0.7
      conversation_completeness: 0.5

    diagnostic_metrics:
      - tool_correctness
      - answer_relevancy
    diagnostic_thresholds:
      tool_correctness: 0.5
```

### Leading Questions

LLM-judged quality probes. Default type is `diagnostic` (non-blocking); set `type: gating` to make them block:

```yaml
    leading_questions:
      - name: "Structural Template"
        type: gating              # gating = blocks, diagnostic = non-blocking (default)
        threshold: 0.7            # Override default 0.5
        question: "Does the summary follow a standard meeting-minutes structure?"
      - name: "Conciseness"
        question: "Is the summary concise?"  # Defaults to diagnostic
```

---

## Langfuse Integration

The framework integrates with [Langfuse](https://langfuse.com) for observability and benchmarking.

### OpenTelemetry Export

Add `--langfuse` to any eval run to export eval traces to Langfuse through its
native OpenTelemetry endpoint:

```bash
uv run eval-run --config "evals/skills/Meeting Summariser/eval_cases.yaml" --langfuse --num-runs 2
```

Each eval creates an OTel trace with:
- **Tags**: `skill-eval`, `PASS`/`FAIL`, skill name
- **Trace metadata**: case key, case name, run name, run count, gating verdict
- **Observation metadata**: gating, diagnostic, probe, conversational, and turn assertion results
- **Generation spans**: Agent outputs with `gen_ai.*` attributes where available

Eval outcomes are stored as span metadata, not Langfuse score objects, in OTel
mode. Dataset sync and dataset-run linking still use the Langfuse API.

### Datasets & Experiments

Langfuse Datasets provide a benchmarking layer on top of traces:

```bash
# 1. Sync your eval_cases.yaml to a Langfuse Dataset (compile + push, idempotent)
uv run eval-run --config "evals/skills/Meeting Summariser/eval_cases.yaml" --sync-dataset

# 2. Run evals — traces are automatically linked to dataset items
uv run eval-run --config "..." --langfuse --run-name "baseline"

# 3. Make changes, run again with a new name
uv run eval-run --config "..." --langfuse --run-name "v2-improved-prompt"
```

The `--sync-dataset` command performs two steps:
1. **Compile** — `eval_cases.yaml` → `dataset.jsonl` (sorted by case_key)
2. **Sync** — reads `dataset.jsonl` rows and upserts them as Langfuse Dataset items

In Langfuse: **Datasets** → `evals/Meeting Summariser` → **Runs** links each
dataset item to its OTel trace. Two scores are posted per trace:
- `eval_score` (NUMERIC, 0.0–1.0) — mean of all gating metric scores
- `passed` (BOOLEAN) — overall gating pass/fail verdict

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `EVAL_LANGFUSE_BASE_URL` | Langfuse instance URL (default: `http://localhost:3000`) |
| `LANGFUSE_BASE_URL` | Fallback if above not set |
| `EVAL_PUSH_LANGFUSE=1` | Enable Langfuse globally (alternative to `--langfuse` flag) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional explicit OTLP endpoint (default: `<Langfuse base>/api/public/otel`) |
| `OTEL_EXPORTER_OTLP_HEADERS` | Optional explicit OTLP headers |

If `OTEL_EXPORTER_OTLP_HEADERS` is not set, the framework builds it from
`LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` and includes
`x-langfuse-ingestion-version=4`.

---

## Adding a New Adapter

To support a different agent framework, implement `AgentAdapter` from `_eval/adapters/base.py`:

```python
from _eval.adapters.base import AgentAdapter, AgentResponse, ToolCallRecord

class MyAdapter(AgentAdapter):
    def invoke_text(self, query, context) -> AgentResponse: ...
    def invoke_file(self, query, file_paths) -> AgentResponse: ...
    def invoke_sequential(self, turns, source_text=None) -> List[AgentResponse]: ...
```

Then set `adapter: _eval.adapters.my_adapter.MyAdapter` in your YAML.

### Available Adapters

| Adapter | Path | Description |
|---------|------|-------------|
| `LibreChatAdapter` | `_eval.adapters.librechat_adapter.LibreChatAdapter` | LibreChat OpenAI-compatible API (`/api/agents/v1/chat/completions`) |

The LibreChat adapter requires these env vars: `LIBRECHAT_BASE_URL`, `LIBRECHAT_API_KEY`, `LIBRECHAT_AGENT_ID`.

---

## Directory Structure

```
_eval/
├── __init__.py              # Package marker, re-exports run_eval
├── run_eval.py              # CLI entry point (--config, --case, --num-runs, --metrics, --langfuse)
├── loader.py                # YAML config loading, case resolution, source text helpers
├── schema.py                # Pydantic models for eval_cases.yaml validation
├── compile.py               # Compiles eval_cases.yaml → dataset.jsonl (auto-runs before sync)
├── runner.py                # Core engine: adapter wiring, execution, metric evaluation, orchestration
├── results.py               # Aggregation, report printing, JSON persistence
├── metrics.py               # All metric definitions, EvaluatorModel, registries
├── conftest.py              # pytest integration (pytest_addoption, pytest_generate_tests)
├── summarise_results.py     # Rich-formatted result viewer (--config, --latest, --file)
├── tests/                   # Schema and framework validation tests
├── telemetry/               # OpenTelemetry setup + eval span reporting
│   ├── __init__.py
│   ├── setup.py             # OTel SDK setup, Langfuse OTLP defaults, span helpers
│   └── reporter.py          # Eval results → OTel spans/metadata
├── langfuse/                # Langfuse API helpers for datasets/runs
│   ├── __init__.py
│   └── datasets.py          # Dataset sync + trace-to-run linking + score posting
├── adapters/
│   ├── __init__.py          # Exports AgentAdapter, AgentResponse
│   ├── base.py              # Abstract AgentAdapter ABC + dataclasses
│   └── librechat_adapter.py # LibreChat OpenAI-compatible API adapter
├── templates/               # Category YAML templates (starting points)
│   ├── content_generation.yaml
│   ├── knowledge_retrieval.yaml
│   ├── data_classification.yaml
│   ├── decision_support.yaml
│   ├── tool_orchestration.yaml
│   └── governance_compliance.yaml
```

The **eval-scaffolder** skill lives at `.github/skills/eval-scaffolder/SKILL.md` (loaded by the agent like any other skill).

---

## Eval Categories

| Category | Typical Skills |
|----------|---------------|
| Content Generation & Transformation | Meeting Summariser, Article Builder, CV Builder |
| Knowledge Retrieval & Q&A | Research Assistant, Industry Trends Analyser |
| Data Classification & Extraction | Contract Analyser, Document Redactor |
| Decision Support & Recommendation | Scenario Planning, Cost Benefit Analyser |
| Tool-Orchestrated Workflow Execution | PowerPoint Generator, Process Map Generator |
| Governance / Control / Compliance | Audit RFP Response Generator, NDA Reviewer |
