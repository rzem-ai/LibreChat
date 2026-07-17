# `templates` — Eval Case YAML Templates

Starter templates for manually authoring `eval_cases.yaml` files. Each template targets one eval category and includes annotated single-turn and multi-turn case skeletons.

Copy the template that matches your skill's category to `evals/skills/<Skill Name>/eval_cases.yaml` and fill in the `TODO` placeholders.

> **Tip:** Use the eval-scaffolder skill instead of editing a template by hand — it generates 8 grounded cases across 4 documents automatically:
> *"Use the eval-scaffolder skill to create eval cases for the `<Skill Name>` skill."*

---

## Available Templates

| File | Category | Typical Skill Type |
|------|----------|--------------------|
| [`advisory_drafting.yaml`](advisory_drafting.yaml) | Advisory or Drafting | Summarisation, report drafting, document Q&A, KB-backed research |
| [`data_analysis.yaml`](data_analysis.yaml) | Data Analysis | Contract extraction, document classification, risk flagging, compliance review |
| [`system_integration.yaml`](system_integration.yaml) | System Integration or Utility | Single tool invocations, API-driven output, data import/export utilities |
| [`workflow_automation.yaml`](workflow_automation.yaml) | Workflow Automation | Multi-step tool chains, artefact generation pipelines, end-to-end workflows |

---

## Template Structure

Every template includes:

- **`case_1`** — Single-turn (`invoke_text`) with gating metrics and leading questions
- **`case_2`** — Multi-turn (`invoke_sequential`) with `turns`, `turn_assertions`, and conversational metrics

**Exception:** `workflow_automation.yaml` uses `invoke_sequential` for both cases — workflow skills are always multi-turn by definition.

### Metric Field Rules

> **Important:** All metrics — including conversational ones — belong in the `metrics:` list.
> There is no `conversational_metrics:` field. The runner splits standard vs. conversational metrics
> internally based on the `CONVERSATIONAL_METRICS` registry.

| Field | Purpose |
|-------|---------|
| `metrics:` | Gating metrics — any metric from `VALID_METRICS`, including `conversation_completeness` |
| `diagnostic_metrics:` | Non-blocking metrics (e.g., `contextual_relevancy` for RAG cases) |
| `thresholds:` | Per-metric float thresholds |
| `diagnostic_thresholds:` | Per-diagnostic-metric thresholds |

### Multi-turn (`invoke_sequential`) Rules

- **Do NOT use `task_completion`** on `invoke_sequential` cases — it only evaluates the final turn in isolation.
- Use `conversation_completeness` in `metrics:` instead to assess task fulfilment across all turns.

### Advisory or Drafting — Two Patterns

**Pattern A** — Document-backed: user supplies source material alongside their query.
Set `source_material` and use `attach_source: true` on the first turn.

**Pattern B** — KB-backed RAG: agent retrieves from a pre-loaded knowledge base.
Omit `source_material` entirely. Use `invoke_sequential`. Use retrieval metrics
(`contextual_precision`, `contextual_recall`) alongside `faithfulness` and `answer_relevancy`.

---

## Recommended Metrics by Category

| Category | Single-turn Gating | Multi-turn Gating | Diagnostic |
|---|---|---|---|
| Advisory or Drafting (doc-backed) | `faithfulness`, `hallucination`, `task_completion` | `faithfulness`, `hallucination`, `conversation_completeness` | — |
| Advisory or Drafting (RAG/KB) | `faithfulness`, `answer_relevancy`, `contextual_recall`, `contextual_precision` | `faithfulness`, `answer_relevancy`, `contextual_recall`, `conversation_completeness` | `contextual_relevancy` |
| Data Analysis | `faithfulness`, `task_completion`, `hallucination` | `faithfulness`, `hallucination`, `conversation_completeness` | — |
| System Integration or Utility | `faithfulness`, `task_completion`, `tool_correctness` | `faithfulness`, `tool_correctness`, `conversation_completeness` | — |
| Workflow Automation | always multi-turn | `faithfulness`, `tool_correctness`, `conversation_completeness` | — |

---

## Usage

```bash
# 1. Copy the template
cp evals/_eval/templates/advisory_drafting.yaml \
   evals/skills/My\ Skill/eval_cases.yaml

# 2. Edit the YAML — fill in all TODO fields

# 3. Run a single case to verify the setup
uv run eval-run --config "evals/skills/My Skill/eval_cases.yaml" --case case_1
```

See the [top-level `_eval` README](../README.md#eval_casesyaml-schema) for the full YAML schema reference.
