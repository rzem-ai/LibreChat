"""OpenTelemetry helpers for eval tracing.

The eval framework emits standard OpenTelemetry spans and Langfuse-mapped
attributes. Langfuse can ingest these spans through its native OTLP endpoint.
"""

import base64
import json
import os
from contextlib import contextmanager, nullcontext
from typing import Any, Dict, Iterable, Iterator, Optional

from opentelemetry import baggage, context, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.processor.baggage import ALLOW_ALL_BAGGAGE_KEYS, BaggageSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


_SERVICE_NAME = "librechat-evals"
_TRACER_NAME = "librechat.evals"
_INITIALIZED = False


def telemetry_enabled(cli_flag: bool) -> bool:
    """Return whether Langfuse/OTel export is enabled for this run."""
    env_flag = os.environ.get("EVAL_PUSH_LANGFUSE", "").strip().lower()
    return cli_flag or env_flag in {"1", "true", "yes"}


def init_tracing() -> bool:
    """Initialise OpenTelemetry tracing once and return whether setup succeeded."""
    global _INITIALIZED
    if _INITIALIZED:
        return True

    _ensure_langfuse_otel_env()

    try:
        resource = Resource.create({"service.name": _SERVICE_NAME})
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS))
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        trace.set_tracer_provider(provider)
        _INITIALIZED = True
        return True
    except Exception as exc:
        print(f"[OTEL] Warning: tracing setup failed: {exc}")
        return False


def get_tracer():
    """Return the eval framework tracer."""
    return trace.get_tracer(_TRACER_NAME)


def shutdown_tracing() -> None:
    """Flush and shut down the active tracer provider when available."""
    provider = trace.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        try:
            shutdown()
        except Exception as exc:
            print(f"[OTEL] Warning: tracer shutdown failed: {exc}")


def flush_tracing() -> None:
    """Flush pending spans without shutting down the global provider."""
    provider = trace.get_tracer_provider()
    force_flush = getattr(provider, "force_flush", None)
    if callable(force_flush):
        try:
            force_flush()
        except Exception as exc:
            print(f"[OTEL] Warning: tracer flush failed: {exc}")


@contextmanager
def eval_trace(
    *,
    skill_name: str,
    case_key: str,
    case_name: str,
    run_name: Optional[str],
    num_runs: int,
    user_query: str,
) -> Iterator[Any]:
    """Create the root eval trace span and propagate safe trace attributes."""
    tracer = get_tracer()
    trace_name = f"{skill_name}/{case_key}"
    tags = ["skill-eval", skill_name]
    environment = os.environ.get("EVAL_LANGFUSE_ENVIRONMENT", "development")
    baggage_values = {
        "langfuse.trace.name": trace_name,
        "langfuse.trace.tags": json.dumps(tags),
        "langfuse.trace.environment": environment,
        "langfuse.trace.metadata.skill_name": skill_name,
        "langfuse.trace.metadata.case_key": case_key,
        "langfuse.trace.metadata.case_name": case_name,
        "langfuse.trace.metadata.run_name": run_name or "",
        "langfuse.trace.metadata.num_runs": str(num_runs),
    }
    ctx = context.get_current()
    for key, value in baggage_values.items():
        if value:
            ctx = baggage.set_baggage(key, value, context=ctx)

    token = context.attach(ctx)
    try:
        with tracer.start_as_current_span(trace_name) as active_span:
            set_attributes(active_span, baggage_values)
            set_attributes(active_span, {
                "langfuse.trace.input": _json_value(user_query),
                "eval.skill.name": skill_name,
                "eval.case.key": case_key,
                "eval.case.name": case_name,
                "eval.run.name": run_name or "",
                "eval.run.total": num_runs,
            })
            yield active_span
    finally:
        context.detach(token)


@contextmanager
def span(name: str, attributes: Optional[Dict[str, Any]] = None) -> Iterator[Any]:
    """Create a child span with normalized attributes."""
    with get_tracer().start_as_current_span(name) as active_span:
        if attributes:
            set_attributes(active_span, attributes)
        yield active_span


def maybe_span(enabled: bool, name: str, attributes: Optional[Dict[str, Any]] = None):
    """Return a span context when enabled; otherwise return a no-op context."""
    if enabled:
        return span(name, attributes)
    return nullcontext()


def set_attributes(active_span: Any, attributes: Dict[str, Any]) -> None:
    """Set OpenTelemetry-compatible attributes, skipping empty unsupported values."""
    for key, value in attributes.items():
        normalized = _attribute_value(value)
        if normalized is not None:
            active_span.set_attribute(key, normalized)


def record_metric_result(
    active_span: Any,
    *,
    name: str,
    score: Optional[float],
    threshold: Optional[float],
    success: bool,
    reason: str,
    phase: str,
    scores: Optional[Iterable[Optional[float]]] = None,
) -> None:
    """Attach eval metric result metadata to a metric span."""
    set_attributes(active_span, {
        "langfuse.observation.type": "span",
        "langfuse.observation.metadata.metric_name": name,
        "langfuse.observation.metadata.metric_phase": phase,
        "langfuse.observation.metadata.metric_score": score,
        "langfuse.observation.metadata.metric_threshold": threshold,
        "langfuse.observation.metadata.metric_passed": success,
        "langfuse.observation.metadata.metric_reason": reason,
        "eval.metric.name": name,
        "eval.metric.phase": phase,
        "eval.metric.score": score,
        "eval.metric.threshold": threshold,
        "eval.metric.passed": success,
        "eval.metric.reason": reason,
        "eval.metric.scores": _json_value(list(scores)) if scores is not None else None,
    })


def record_generation(
    active_span: Any,
    *,
    provider: str,
    model: str,
    input_value: Any,
    output_value: Any,
    tools_called: Optional[Iterable[Any]] = None,
) -> None:
    """Attach GenAI and Langfuse generation metadata to a span."""
    set_attributes(active_span, {
        "langfuse.observation.type": "generation",
        "langfuse.observation.input": _json_value(input_value),
        "langfuse.observation.output": _json_value(output_value),
        "langfuse.observation.model.name": model,
        "gen_ai.operation.name": "chat",
        "gen_ai.system": provider,
        "gen_ai.request.model": model,
        "gen_ai.response.model": model,
    })
    if tools_called:
        tool_names = [getattr(tool, "name", "") for tool in tools_called]
        set_attributes(active_span, {"eval.tools.called": _json_value(tool_names)})


def trace_id_hex(active_span: Any) -> Optional[str]:
    """Return a 32-character hex trace id for Langfuse dataset-run linking."""
    span_context = active_span.get_span_context()
    trace_id = getattr(span_context, "trace_id", 0)
    if not trace_id:
        return None
    return f"{trace_id:032x}"


def _ensure_langfuse_otel_env() -> None:
    """Set Langfuse OTLP defaults from existing Langfuse env vars when absent."""
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        base_url = (
            os.environ.get("EVAL_LANGFUSE_BASE_URL", "").strip()
            or os.environ.get("LANGFUSE_BASE_URL", "").strip()
            or "http://localhost:3000"
        )
        os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = f"{base_url.rstrip('/')}/api/public/otel"

    if os.environ.get("OTEL_EXPORTER_OTLP_HEADERS"):
        return

    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "").strip()
    if not public_key or not secret_key:
        os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = "x-langfuse-ingestion-version=4"
        return

    auth = base64.b64encode(f"{public_key}:{secret_key}".encode("utf-8")).decode("ascii")
    os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = (
        f"Authorization=Basic {auth},x-langfuse-ingestion-version=4"
    )


def _attribute_value(value: Any) -> Optional[str | bool | int | float]:
    if value is None:
        return None
    if isinstance(value, (str, bool, int, float)):
        return value
    return _json_value(value)


def _json_value(value: Any) -> str:
    try:
        return json.dumps(value, default=str, ensure_ascii=True)
    except TypeError:
        return json.dumps(str(value), ensure_ascii=True)