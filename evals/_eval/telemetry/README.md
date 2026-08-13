# `telemetry` — OpenTelemetry Tracing

This package configures the OpenTelemetry SDK and exports eval results as structured OTel traces. Langfuse ingests these traces through its native OTLP endpoint.

## Contents

- [`setup.py`](setup.py) — OTel SDK init, tracer, span helpers, Langfuse OTLP defaults
- [`reporter.py`](reporter.py) — Translates eval result dicts into OTel spans

---

## `setup.py` — OTel Infrastructure

### Initialisation

`init_tracing()` sets up the global `TracerProvider` once. It is idempotent — safe to call multiple times. Configures:

- `BaggageSpanProcessor` — propagates Langfuse trace-level metadata (name, tags, environment, skill/case keys) automatically to all child spans
- `BatchSpanProcessor` + `OTLPSpanExporter` — batches and ships spans to the OTLP endpoint

`shutdown_tracing()` / `flush_tracing()` flush pending spans. The runner calls `flush_tracing()` after each case; `shutdown_tracing()` is called at process exit.

`instrument_openai()` instruments the OpenAI SDK for GenAI semantic convention spans (requires `opentelemetry-instrumentation-openai-v2`).

### Langfuse OTLP Defaults

`_ensure_langfuse_otel_env()` auto-configures `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` from Langfuse env vars when those OTel variables are not already set:

- Endpoint: `<LANGFUSE_BASE_URL>/api/public/otel`
- Headers: Basic auth from `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`, plus `x-langfuse-ingestion-version=4`

### Span Helpers

| Helper | Purpose |
|--------|---------|
| `eval_trace(...)` | Context manager — creates the root trace span with baggage propagation |
| `span(name, attributes)` | Context manager — creates a child span |
| `maybe_span(enabled, ...)` | Returns `span(...)` when enabled; `nullcontext()` otherwise |
| `set_attributes(span, attrs)` | Sets OTel-compatible attributes, skipping `None` values |
| `record_metric_result(span, ...)` | Attaches eval metric result metadata to a metric span |
| `record_generation(span, ...)` | Attaches GenAI and Langfuse generation metadata to a span |
| `trace_id_hex(span)` | Returns the 32-char hex trace ID for dataset-run linking |

---

## `reporter.py` — Eval Results → OTel Spans

`export_otel_trace(...)` is the main entry point. Called by the runner after a case completes when `--langfuse` is active. It:

1. Opens a root trace span (`<skill_name>/<case_key>`) with tags: `skill-eval`, `PASS`/`FAIL`, skill name, agent name, tools used
2. For each run: records a `eval.attempt` span containing:
   - `gen_ai.agent.turn` spans per conversation turn (sequential cases) or a single `gen_ai.agent.response` span
   - Per-metric spans for gating, diagnostic, conversational phases
   - Per-probe spans for leading question results
   - Per-turn-assertion spans
3. Records an `eval.aggregate` span with averaged scores across all runs
4. Flushes spans and returns the trace ID (used by `langfuse/datasets.py` to link the trace to a dataset run)

### Span Hierarchy

```
<skill_name>/<case_key>  (root trace)
├── eval.attempt          (one per run)
│   ├── gen_ai.agent.turn / gen_ai.agent.response
│   ├── eval.metric.gating.<name>
│   ├── eval.metric.diagnostic.<name>
│   ├── eval.metric.conversational.<name>
│   ├── eval.probe.<name>
│   └── eval.turn_assertion.<name>
└── eval.aggregate
    ├── eval.aggregate.gating.<name>
    ├── eval.aggregate.diagnostic.<name>
    ├── eval.aggregate.conversational.<name>
    ├── eval.aggregate.probe.<name>
    └── eval.aggregate.turn_assertion.<name>
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EVAL_PUSH_LANGFUSE` | Set to `1` to enable OTel export globally (alternative to `--langfuse` flag) |
| `EVAL_LANGFUSE_BASE_URL` | Langfuse base URL (default: `http://localhost:3000`) |
| `LANGFUSE_BASE_URL` | Fallback if above not set |
| `LANGFUSE_PUBLIC_KEY` | Used to build OTLP Basic auth header |
| `LANGFUSE_SECRET_KEY` | Used to build OTLP Basic auth header |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Override OTLP endpoint (auto-derived from Langfuse URL if absent) |
| `OTEL_EXPORTER_OTLP_HEADERS` | Override OTLP headers (auto-derived from Langfuse keys if absent) |
| `LANGFUSE_SSL_CERT_FILE` | Optional CA bundle for Langfuse OTLP TLS verification |
| `LANGFUSE_SSL_VERIFY` | Set to `false` for local dev to try repo Deloitte/Zscaler certs, then fall back to disabling OTLP TLS verification |
| `EVAL_LANGFUSE_ENVIRONMENT` | Langfuse environment tag on traces (default: `development`) |
