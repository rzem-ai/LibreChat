"""Telemetry exports for eval tracing."""

from .live import record_aggregate, record_run_metrics
from .reporter import export_otel_trace
from .setup import (
    eval_trace,
    flush_tracing,
    get_tracer,
    init_tracing,
    instrument_openai,
    maybe_span,
    record_generation,
    record_metric_result,
    set_attributes,
    shutdown_tracing,
    span,
    telemetry_enabled,
    trace_id_hex,
)

__all__ = [
    "eval_trace",
    "export_otel_trace",
    "flush_tracing",
    "get_tracer",
    "init_tracing",
    "instrument_openai",
    "maybe_span",
    "record_aggregate",
    "record_generation",
    "record_metric_result",
    "record_run_metrics",
    "set_attributes",
    "shutdown_tracing",
    "span",
    "telemetry_enabled",
    "trace_id_hex",
]