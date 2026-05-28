"""Live tracing helpers for inline metric and aggregate recording.

These functions record OTel spans in real-time during eval execution,
as opposed to the post-hoc reconstruction in reporter.py.
"""

import json
from typing import Any, List, Optional

from .setup import record_metric_result, set_attributes, span


def span_name(prefix: str, name: str) -> str:
    """Build a stable, readable span name from a prefix and result name."""
    safe = "_".join(str(name).strip().lower().split())
    return f"{prefix}.{safe[:60]}" if safe else prefix


def record_run_metrics(run: dict) -> None:
    """Record per-run metric spans inside the active trace context."""
    for phase in ("gating", "diagnostic", "conversational"):
        for name, score, threshold, success, reason in run.get(phase, []):
            with span(span_name(f"eval.metric.{phase}", name)) as s:
                record_metric_result(
                    s,
                    name=name,
                    score=score,
                    threshold=threshold,
                    success=success,
                    reason=reason,
                    phase=phase,
                )

    for name, score, reason in run.get("probes", []):
        with span(span_name("eval.probe", name)) as s:
            set_attributes(s, {
                "langfuse.observation.type": "span",
                "eval.probe.name": name,
                "eval.probe.score": score,
                "eval.probe.reason": reason,
            })

    for assertion in run.get("turn_results", []):
        with span(span_name("eval.turn_assertion", assertion["name"])) as s:
            set_attributes(s, {
                "langfuse.observation.type": "span",
                "eval.turn.index": assertion["turn"],
                "eval.assertion.name": assertion["name"],
                "eval.assertion.type": assertion["type"],
                "eval.assertion.passed": assertion["passed"],
                "eval.assertion.score": assertion.get("score"),
                "eval.assertion.reason": assertion["reason"],
            })


def record_aggregate(
    root_span: Any,
    agg: dict,
    all_runs: List[dict],
    skill_name: str,
    agent_metadata: Optional[dict] = None,
) -> None:
    """Record aggregate results and final trace attributes."""
    meta = agent_metadata or {}
    tools_used = list(dict.fromkeys(
        name for run in all_runs for name in run.get("tools_called", [])
    ))
    tags = ["skill-eval", "PASS" if agg["gating_passed"] else "FAIL", skill_name]
    if meta.get("name"):
        tags.append(meta["name"])
    tags.extend(tools_used)

    last_output = all_runs[-1].get("agent_output", "") if all_runs else ""
    set_attributes(root_span, {
        "langfuse.trace.output": json.dumps(last_output, default=str),
        "langfuse.trace.tags": json.dumps(tags),
        "langfuse.trace.metadata.gating_passed": agg["gating_passed"],
        "langfuse.trace.metadata.tools_used": json.dumps(tools_used),
        "eval.gating.passed": agg["gating_passed"],
    })

    if meta:
        agent_attrs: dict = {}
        for key in ("id", "name", "description", "provider", "model", "version"):
            val = meta.get(key)
            if val is not None:
                agent_attrs[f"eval.agent.{key}"] = val
                agent_attrs[f"langfuse.trace.metadata.agent_{key}"] = val
        if meta.get("provider"):
            agent_attrs["gen_ai.system"] = meta["provider"]
        if meta.get("model"):
            agent_attrs["gen_ai.request.model"] = meta["model"]
        set_attributes(root_span, agent_attrs)

    with span("eval.aggregate", {
        "eval.gating.passed": agg["gating_passed"],
        "langfuse.observation.type": "span",
    }):
        for phase, key in (("gating", "gating_results"), ("diagnostic", "diagnostic_results")):
            for name, avg, threshold, success, scores in agg[key]:
                with span(span_name(f"eval.aggregate.{phase}", name)) as s:
                    record_metric_result(
                        s, name=name, score=avg, threshold=threshold,
                        success=success, reason="aggregate", phase=phase, scores=scores,
                    )

        for name, avg, threshold, success, scores in agg.get("conversational_results", []):
            with span(span_name("eval.aggregate.conversational", name)) as s:
                record_metric_result(
                    s, name=name, score=avg, threshold=threshold,
                    success=success, reason="aggregate", phase="conversational", scores=scores,
                )

        for name, avg, scores in agg["probe_results"]:
            with span(span_name("eval.aggregate.probe", name)) as s:
                set_attributes(s, {
                    "langfuse.observation.type": "span",
                    "eval.probe.name": name,
                    "eval.probe.score": avg,
                    "eval.probe.scores": json.dumps(scores, default=str),
                })
