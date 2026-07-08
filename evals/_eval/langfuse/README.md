# `langfuse` — Langfuse API Integration

This package handles the Langfuse-API-specific pieces of the eval framework. OpenTelemetry owns trace and observation export (see [`telemetry/`](../telemetry/README.md)). This module covers what OTel cannot: dataset management and experiment linking.

## Contents

- [`datasets.py`](datasets.py) — Dataset sync, trace-to-run linking, and score posting

---

## What It Does

### Dataset Sync

`sync_dataset_to_langfuse(config_path, config)` reads the compiled `dataset.jsonl` file next to `eval_cases.yaml` and upserts each row as a Langfuse Dataset item.

- Dataset name: `evals/<Skill Name>` (derived from the parent directory)
- Item IDs are deterministic UUID5s — syncing twice is idempotent
- The compile step (`eval_cases.yaml` → `dataset.jsonl`) runs automatically before sync when you pass `--sync-dataset`

```bash
uv run eval-run --config "evals/skills/Meeting Summariser/eval_cases.yaml" --sync-dataset
```

### Trace Linking

`link_trace_to_dataset(config_path, case_key, trace_id, run_name)` links an OTel-exported trace to its corresponding dataset item, grouping it under a named experiment run.

This enables the **Datasets → Runs** view in Langfuse, where you can compare `baseline` vs `v2-improved-prompt` side-by-side.

```bash
# Named experiments for comparison
uv run eval-run --config "..." --langfuse --run-name "baseline"
uv run eval-run --config "..." --langfuse --run-name "v2-improved-prompt"
```

### Score Posting

`post_scores(trace_id, gating_results, gating_passed)` posts two composite scores to Langfuse per trace:

| Score name | Type | Value |
|------------|------|-------|
| `eval_score` | NUMERIC | Mean of all gating metric scores (0.0–1.0) |
| `passed` | BOOLEAN | Overall gating pass/fail verdict |

These scores power Langfuse's experiment comparison charts.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EVAL_LANGFUSE_BASE_URL` | Langfuse instance URL (default: `http://localhost:3000`) |
| `LANGFUSE_BASE_URL` | Fallback if `EVAL_LANGFUSE_BASE_URL` is not set |
| `LANGFUSE_PUBLIC_KEY` | Used to authenticate the Langfuse client |
| `LANGFUSE_SECRET_KEY` | Used to authenticate the Langfuse client |

The Langfuse client is created lazily — connection failures are caught and logged without aborting the eval run.

---

## Relationship to OTel

| Concern | Handled by |
|---------|-----------|
| Trace spans, observations, generation metadata | [`telemetry/`](../telemetry/README.md) via OTLP |
| Dataset creation and item upsert | `langfuse/datasets.py` via Langfuse API |
| Linking a trace to a dataset run | `langfuse/datasets.py` via Langfuse API |
| Composite score posting | `langfuse/datasets.py` via Langfuse API |
