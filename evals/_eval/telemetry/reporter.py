"""OpenTelemetry reporting for eval results."""

import json
from pathlib import Path
from typing import List, Optional

from . import setup as otel


def export_otel_trace(
    *,
    config_path: Path,
    case_key: str,
    case: dict,
    all_runs: List[dict],
    agg: dict,
    effective_runs: int,
    run_name: Optional[str],
    is_sequential: bool,
    agent_metadata: Optional[dict] = None,
) -> Optional[str]:
    """Export eval results as an OTel trace and return its trace id."""
    if not otel.init_tracing():
        return None

    skill_name = config_path.parent.name
    user_query = _user_query_for_case(case, is_sequential)
    last_output = all_runs[-1].get("agent_output", "") if all_runs else ""
    meta = agent_metadata or {}

    with otel.eval_trace(
        skill_name=skill_name,
        case_key=case_key,
        case_name=case.get("name", case_key),
        run_name=run_name,
        num_runs=effective_runs,
        user_query=user_query,
    ) as root_span:
        trace_id = otel.trace_id_hex(root_span)

        # Build tags: verdict, skill, agent name, tools used
        tags = ["skill-eval", "PASS" if agg["gating_passed"] else "FAIL", skill_name]
        if meta.get("name"):
            tags.append(meta["name"])
        tools_used = _collect_tools_used(all_runs)
        tags.extend(tools_used)

        otel.set_attributes(root_span, {
            "langfuse.trace.output": json.dumps(last_output, default=str),
            "langfuse.trace.tags": json.dumps(tags),
            "langfuse.trace.metadata.gating_passed": agg["gating_passed"],
            "langfuse.trace.metadata.tools_used": json.dumps(tools_used),
            "eval.gating.passed": agg["gating_passed"],
        })

        # Agent metadata on root trace
        if meta:
            agent_attrs = {}
            for key in ("id", "name", "description", "provider", "model", "version"):
                val = meta.get(key)
                if val is not None:
                    agent_attrs[f"eval.agent.{key}"] = val
                    agent_attrs[f"langfuse.trace.metadata.agent_{key}"] = val
            if meta.get("provider"):
                agent_attrs["gen_ai.system"] = meta["provider"]
            if meta.get("model"):
                agent_attrs["gen_ai.request.model"] = meta["model"]
            otel.set_attributes(root_span, agent_attrs)

        for index, run in enumerate(all_runs, 1):
            gating_ok = all(success for _, _, _, success, _ in run.get("gating", []))
            with otel.span("eval.attempt", {
                "eval.run.index": index,
                "eval.run.total": effective_runs,
                "eval.gating.passed": gating_ok,
                "langfuse.observation.type": "span",
                "langfuse.observation.metadata.run_index": index,
                "langfuse.observation.metadata.gating_passed": gating_ok,
            }):
                _record_generation_spans(run, user_query, is_sequential, meta)
                _record_run_metric_spans(run)

        with otel.span("eval.aggregate", {
            "eval.gating.passed": agg["gating_passed"],
            "langfuse.observation.type": "span",
            "langfuse.observation.metadata.gating_passed": agg["gating_passed"],
        }):
            _record_aggregate_metric_spans(agg)

    otel.flush_tracing()
    print(f"[OTEL] Trace exported with id {trace_id}")
    return trace_id


def _user_query_for_case(case: dict, is_sequential: bool) -> str:
    """Return the representative user query for trace input metadata."""
    user_query = case.get("user_query", "")
    if user_query or not is_sequential:
        return user_query
    yaml_turns = case.get("turns", [])
    return yaml_turns[0]["content"] if yaml_turns else ""


def _collect_tools_used(all_runs: List[dict]) -> List[str]:
    """Collect deduplicated tool names across all runs, preserving order."""
    seen = set()
    tools = []
    for run in all_runs:
        for name in run.get("tools_called", []):
            if name not in seen:
                seen.add(name)
                tools.append(name)
    return tools


def _span_name(prefix: str, name: str) -> str:
    """Build a stable, readable span name from a prefix and result name."""
    safe = "_".join(str(name).strip().lower().split())
    return f"{prefix}.{safe[:60]}" if safe else prefix


def _record_generation_spans(
    run: dict, user_query: str, is_sequential: bool, agent_metadata: Optional[dict] = None,
) -> None:
    """Record agent response generations for a single eval run."""
    meta = agent_metadata or {}
    provider = meta.get("provider", "librechat")
    model = meta.get("model") or meta.get("name") or "agent"

    if is_sequential and run.get("conversation_history"):
        user_msg = None
        turn_index = 0
        for message in run["conversation_history"]:
            if message["role"] == "user":
                user_msg = message["content"]
                continue
            if message["role"] != "assistant" or user_msg is None:
                continue
            with otel.span("gen_ai.agent.turn", {"eval.turn.index": turn_index}) as span:
                otel.record_generation(
                    span,
                    provider=provider,
                    model=model,
                    input_value=user_msg,
                    output_value=message["content"],
                )
            user_msg = None
            turn_index += 1
        return

    with otel.span("gen_ai.agent.response") as span:
        otel.record_generation(
            span,
            provider=provider,
            model=model,
            input_value=user_query,
            output_value=run.get("agent_output", ""),
        )


def _record_run_metric_spans(run: dict) -> None:
    """Record per-run metric, probe, and turn assertion spans."""
    for phase in ("gating", "diagnostic", "conversational"):
        for name, score, threshold, success, reason in run.get(phase, []):
            with otel.span(_span_name(f"eval.metric.{phase}", name)) as span:
                otel.record_metric_result(
                    span,
                    name=name,
                    score=score,
                    threshold=threshold,
                    success=success,
                    reason=reason,
                    phase=phase,
                )

    for name, score, reason in run.get("probes", []):
        with otel.span(_span_name("eval.probe", name)) as span:
            otel.set_attributes(span, {
                "langfuse.observation.type": "span",
                "langfuse.observation.metadata.probe_name": name,
                "langfuse.observation.metadata.probe_score": score,
                "langfuse.observation.metadata.probe_reason": reason,
                "eval.probe.name": name,
                "eval.probe.score": score,
                "eval.probe.reason": reason,
            })

    for assertion in run.get("turn_results", []):
        with otel.span(_span_name("eval.turn_assertion", assertion["name"])) as span:
            otel.set_attributes(span, {
                "langfuse.observation.type": "span",
                "langfuse.observation.metadata.assertion_name": assertion["name"],
                "langfuse.observation.metadata.assertion_type": assertion["type"],
                "langfuse.observation.metadata.assertion_passed": assertion["passed"],
                "langfuse.observation.metadata.assertion_reason": assertion["reason"],
                "eval.turn.index": assertion["turn"],
                "eval.assertion.name": assertion["name"],
                "eval.assertion.type": assertion["type"],
                "eval.assertion.passed": assertion["passed"],
                "eval.assertion.score": assertion.get("score"),
                "eval.assertion.reason": assertion["reason"],
            })


def _record_aggregate_metric_spans(agg: dict) -> None:
    """Record aggregate metric, probe, and assertion summary spans."""
    for phase, key in (("gating", "gating_results"), ("diagnostic", "diagnostic_results")):
        for name, avg, threshold, success, scores in agg[key]:
            with otel.span(_span_name(f"eval.aggregate.{phase}", name)) as span:
                otel.record_metric_result(
                    span,
                    name=name,
                    score=avg,
                    threshold=threshold,
                    success=success,
                    reason="aggregate",
                    phase=phase,
                    scores=scores,
                )

    for name, avg, threshold, success, scores in agg.get("conversational_results", []):
        with otel.span(_span_name("eval.aggregate.conversational", name)) as span:
            otel.record_metric_result(
                span,
                name=name,
                score=avg,
                threshold=threshold,
                success=success,
                reason="aggregate",
                phase="conversational",
                scores=scores,
            )

    for name, avg, scores in agg["probe_results"]:
        with otel.span(_span_name("eval.aggregate.probe", name)) as span:
            otel.set_attributes(span, {
                "langfuse.observation.type": "span",
                "langfuse.observation.metadata.probe_name": name,
                "langfuse.observation.metadata.probe_score": avg,
                "eval.probe.name": name,
                "eval.probe.score": avg,
                "eval.probe.scores": json.dumps(scores, default=str),
            })

    for summary in agg.get("turn_assertion_summary", []):
        with otel.span(_span_name("eval.aggregate.turn_assertion", summary["name"])) as span:
            otel.set_attributes(span, {
                "langfuse.observation.type": "span",
                "langfuse.observation.metadata.assertion_name": summary["name"],
                "langfuse.observation.metadata.assertion_pass_rate": summary["pass_rate"],
                "eval.turn.index": summary["turn"],
                "eval.assertion.name": summary["name"],
                "eval.assertion.pass_rate": summary["pass_rate"],
                "eval.assertion.passed_runs": summary["passed"],
                "eval.assertion.total_runs": summary["total"],
            })