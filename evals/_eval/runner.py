"""
Adapter-agnostic evaluation runner.

Two-phase execution repeated NUM_RUNS times per case, then averaged:
  Phase 1 (Gating):     Metrics from YAML `metrics:` list — failures block.
  Phase 2 (Diagnostic): Metrics from YAML `diagnostic_metrics:` list +
                         leading-question probes — scores reported but never block.

Each run calls the agent independently to account for non-deterministic output.
Final pass/fail is determined from the mean score vs threshold.
"""

import importlib
import os
import time
from pathlib import Path
from typing import List, Optional

from deepeval.test_case import LLMTestCase, ToolCall, ConversationalTestCase, Turn
from deepeval.metrics import SummarizationMetric

from .adapters.base import AgentAdapter, AgentResponse
from .langfuse import link_trace_to_dataset, post_scores
from .loader import build_invoke_kwargs, get_source_text, load_case, load_config
from .metrics import (
    DEFAULT_THRESHOLDS,
    VALID_METRICS,
    EvaluatorModel,
    build_metrics,
    build_conversational_from_keys,
    build_leading_question_probes,
    build_conversational_metrics,
    evaluate_turn_assertions,
)
from .results import aggregate_results, print_report, save_results
from .telemetry import (
    eval_trace,
    export_otel_trace,
    flush_tracing,
    init_tracing,
    instrument_openai,
    record_aggregate,
    record_run_metrics,
    span as otel_span,
    telemetry_enabled,
    trace_id_hex,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NUM_RUNS = 5  # Each case is evaluated this many times; results are averaged.


# ---------------------------------------------------------------------------
# Adapter / evaluator wiring
# ---------------------------------------------------------------------------

def load_adapter(adapter_path: str) -> AgentAdapter:
    """Dynamically import and instantiate an adapter class from a dotted path."""
    module_path, class_name = adapter_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    adapter_cls = getattr(module, class_name)
    return adapter_cls()


def build_evaluator_from_adapter(adapter: AgentAdapter) -> EvaluatorModel:
    """Create an EvaluatorModel (LLM-as-judge) from the adapter's underlying model.

    Checks (in order):
    1. adapter.get_evaluator() — adapter-provided direct judge (preferred)
    2. adapter._agent.model — Agno model with .response() method
    3. Fallback — routes judge prompts through adapter.invoke_text (slow)
    """
    if hasattr(adapter, "get_evaluator") and callable(adapter.get_evaluator):
        evaluator = adapter.get_evaluator()
        if evaluator is not None:
            return evaluator

    def fallback_generate(prompt: str) -> str:
        resp = adapter.invoke_text(prompt, "")
        return resp.content

    return EvaluatorModel(fallback_generate, model_name="Adapter-Fallback-Judge")


# ---------------------------------------------------------------------------
# Metric measurement helper
# ---------------------------------------------------------------------------

def measure_metrics(metrics: list, test_case, summarization_test_case) -> list:
    """Measure a list of metrics and return results tuples."""
    results = []
    for metric in metrics:
        try:
            tc = summarization_test_case if isinstance(metric, SummarizationMetric) else test_case
            metric.measure(tc)
            results.append((
                getattr(metric, "name", metric.__name__),
                metric.score,
                metric.threshold,
                metric.is_successful(),
                getattr(metric, "reason", "N/A"),
            ))
        except Exception as exc:
            metric_name = getattr(metric, "name", metric.__name__)
            print(f"  [ERROR] {metric_name}: {exc}")
            results.append((
                metric_name,
                None,
                getattr(metric, "threshold", None),
                False,
                f"ERROR: {exc}",
            ))
    return results


# ---------------------------------------------------------------------------
# Single-turn execution
# ---------------------------------------------------------------------------

def run_single(
    case_key: str,
    case: dict,
    adapter: AgentAdapter,
    invoke_method: str,
    evaluator: EvaluatorModel,
    selected_gating: List[str],
    selected_diagnostic: List[str],
    thresholds: dict,
    leading_questions: List[dict],
    expected_tools: Optional[List[ToolCall]],
) -> dict:
    """Execute one agent call and evaluate all metrics. Returns raw results dict."""

    gating_metrics = build_metrics(
        selected_gating, thresholds, evaluator, has_expected_tools=bool(expected_tools)
    )
    diagnostic_metrics = build_metrics(
        selected_diagnostic, thresholds, evaluator, has_expected_tools=bool(expected_tools)
    )
    all_probes = build_leading_question_probes(leading_questions, evaluator)
    gating_probes = [(p, t) for p, t in all_probes if t == "gating"]
    diagnostic_probes = [(p, t) for p, t in all_probes if t == "diagnostic"]

    # --- Run agent via adapter ---
    invoke_kwargs = build_invoke_kwargs(case, invoke_method)
    agent_response: AgentResponse = adapter.invoke(invoke_method, **invoke_kwargs)

    actual_tools = [
        ToolCall(name=t.name, input_parameters=t.input_parameters)
        for t in agent_response.tools_called
    ]

    # --- Build LLMTestCase ---
    source_material = get_source_text(case)
    test_case_kwargs = dict(
        name=f"{case_key}: {case.get('name', case_key)}",
        input=case["user_query"],
        actual_output=agent_response.content,
        context=[source_material] if source_material else None,
        retrieval_context=[source_material] if source_material else None,
        expected_output=case.get("expected_output"),
    )
    if expected_tools:
        test_case_kwargs["expected_tools"] = expected_tools
        test_case_kwargs["tools_called"] = actual_tools

    test_case = LLMTestCase(**test_case_kwargs)
    summarization_test_case = LLMTestCase(
        name=test_case.name,
        input=source_material or "",
        actual_output=agent_response.content,
    )

    # --- Phase 1: Gating ---
    gating_results = measure_metrics(gating_metrics, test_case, summarization_test_case)
    for probe, _ in gating_probes:
        try:
            probe.measure(test_case)
            gating_results.append((
                probe.name, probe.score, probe.threshold,
                probe.is_successful(), getattr(probe, "reason", "N/A"),
            ))
        except Exception as exc:
            gating_results.append((
                probe.name, None, getattr(probe, "threshold", None), False, f"ERROR: {exc}",
            ))

    # --- Phase 2: Diagnostic ---
    diagnostic_results = measure_metrics(diagnostic_metrics, test_case, summarization_test_case)
    probe_results = []
    for probe, _ in diagnostic_probes:
        try:
            probe.measure(test_case)
            probe_results.append((probe.name, probe.score, getattr(probe, "reason", "N/A")))
        except Exception as exc:
            probe_results.append((probe.name, None, f"ERROR: {exc}"))

    return {
        "gating": gating_results,
        "diagnostic": diagnostic_results,
        "probes": probe_results,
        "agent_output": agent_response.content,
        "tools_called": [t.name for t in agent_response.tools_called],
    }


# ---------------------------------------------------------------------------
# Sequential multi-turn execution
# ---------------------------------------------------------------------------

def run_single_sequential(
    case_key: str,
    case: dict,
    adapter: AgentAdapter,
    evaluator: EvaluatorModel,
    selected_gating: List[str],
    selected_diagnostic: List[str],
    thresholds: dict,
    leading_questions: List[dict],
    expected_tools: Optional[List[ToolCall]],
    conversational_metric_keys: List[str],
    conversational_thresholds: dict,
) -> dict:
    """Execute one sequential multi-turn agent interaction and evaluate."""

    # --- Invoke agent sequentially ---
    invoke_kwargs = build_invoke_kwargs(case, "invoke_sequential")
    responses: List[AgentResponse] = adapter.invoke("invoke_sequential", **invoke_kwargs)
    yaml_turns = case.get("turns", [])

    # --- Per-turn assertions ---
    all_turn_results = []
    for i, (turn_def, response) in enumerate(zip(yaml_turns, responses)):
        assertions = turn_def.get("turn_assertions", [])
        if assertions:
            turn_results = evaluate_turn_assertions(
                turn_index=i,
                assertions=assertions,
                response_content=response.content,
                tools_called=response.tools_called,
                evaluator=evaluator,
                turn_input=turn_def["content"],
            )
            all_turn_results.extend(turn_results)
            for tr in turn_results:
                status = "PASS" if tr.passed else "FAIL"
                print(f"  [Turn {i}] {tr.name}: {status} — {tr.reason}")

    # --- Build ConversationalTestCase for session-level metrics ---
    conv_turns = []
    for i, (turn_def, response) in enumerate(zip(yaml_turns, responses)):
        conv_turns.append(Turn(role="user", content=turn_def["content"]))
        tool_calls = [
            ToolCall(name=t.name, input_parameters=t.input_parameters)
            for t in response.tools_called
        ] or None
        conv_turns.append(Turn(
            role="assistant", content=response.content, tools_called=tool_calls,
        ))

    conv_test_case = ConversationalTestCase(
        chatbot_role=case.get("chatbot_role", "A helpful assistant"),
        turns=conv_turns,
    )

    # --- Conversational metrics ---
    conversational_results = []
    gating_conv_metrics = build_conversational_from_keys(selected_gating, thresholds, evaluator)
    diagnostic_conv_metrics = build_conversational_from_keys(selected_diagnostic, thresholds, evaluator)
    if conversational_metric_keys:
        legacy_conv_metrics = build_conversational_metrics(
            conversational_metric_keys, conversational_thresholds, evaluator,
        )
        gating_conv_metrics.extend(legacy_conv_metrics)

    def _measure_conv(metrics_list):
        results = []
        for metric in metrics_list:
            try:
                metric.measure(conv_test_case)
                results.append((
                    getattr(metric, "name", metric.__name__),
                    metric.score, metric.threshold,
                    metric.is_successful(), getattr(metric, "reason", "N/A"),
                ))
            except Exception as exc:
                metric_name = getattr(metric, "name", metric.__name__)
                print(f"  [ERROR] {metric_name}: {exc}")
                results.append((
                    metric_name, None, getattr(metric, "threshold", None),
                    False, f"ERROR: {exc}",
                ))
        return results

    gating_conv_results = _measure_conv(gating_conv_metrics)
    diagnostic_conv_results = _measure_conv(diagnostic_conv_metrics)
    conversational_results = gating_conv_results + diagnostic_conv_results

    # --- Standard gating/diagnostic on final output ---
    final_response = responses[-1] if responses else AgentResponse(content="")
    source_material = get_source_text(case)

    gating_metrics = build_metrics(
        selected_gating, thresholds, evaluator, has_expected_tools=bool(expected_tools),
    )
    diagnostic_metrics = build_metrics(
        selected_diagnostic, thresholds, evaluator, has_expected_tools=bool(expected_tools),
    )
    all_probes = build_leading_question_probes(leading_questions, evaluator)
    gating_probes = [(p, t) for p, t in all_probes if t == "gating"]
    diagnostic_probes = [(p, t) for p, t in all_probes if t == "diagnostic"]

    all_tools = [
        ToolCall(name=t.name, input_parameters=t.input_parameters)
        for resp in responses for t in resp.tools_called
    ]

    test_case_kwargs = dict(
        name=f"{case_key}: {case.get('name', case_key)}",
        input=case.get("user_query", yaml_turns[0]["content"] if yaml_turns else ""),
        actual_output=final_response.content,
        context=[source_material] if source_material else None,
        retrieval_context=[source_material] if source_material else None,
        expected_output=case.get("expected_output"),
    )
    if expected_tools:
        test_case_kwargs["expected_tools"] = expected_tools
        test_case_kwargs["tools_called"] = all_tools

    test_case = LLMTestCase(**test_case_kwargs)
    summarization_test_case = LLMTestCase(
        name=test_case.name,
        input=source_material or "",
        actual_output=final_response.content,
    )

    gating_results = measure_metrics(gating_metrics, test_case, summarization_test_case)
    gating_results.extend(gating_conv_results)

    for probe, _ in gating_probes:
        try:
            probe.measure(test_case)
            gating_results.append((
                probe.name, probe.score, probe.threshold,
                probe.is_successful(), getattr(probe, "reason", "N/A"),
            ))
        except Exception as exc:
            gating_results.append((
                probe.name, None, getattr(probe, "threshold", None),
                False, f"ERROR: {exc}",
            ))

    diagnostic_results = measure_metrics(diagnostic_metrics, test_case, summarization_test_case)
    diagnostic_results.extend(diagnostic_conv_results)

    probe_results = []
    for probe, _ in diagnostic_probes:
        try:
            probe.measure(test_case)
            probe_results.append((probe.name, probe.score, getattr(probe, "reason", "N/A")))
        except Exception as exc:
            probe_results.append((probe.name, None, f"ERROR: {exc}"))

    # Build conversation history for saving
    conversation_history = []
    for turn_def, response in zip(yaml_turns, responses):
        conversation_history.append({"role": "user", "content": turn_def["content"]})
        conversation_history.append({"role": "assistant", "content": response.content})

    return {
        "gating": gating_results,
        "diagnostic": diagnostic_results,
        "probes": probe_results,
        "conversational": conversational_results,
        "turn_results": [
            {"turn": tr.turn_index, "type": tr.assertion_type, "name": tr.name,
             "passed": tr.passed, "reason": tr.reason, "score": tr.score}
            for tr in all_turn_results
        ],
        "agent_output": final_response.content,
        "conversation_history": conversation_history,
        "tools_called": [t.name for resp in responses for t in resp.tools_called],
    }


# ---------------------------------------------------------------------------
# Core eval logic (public API)
# ---------------------------------------------------------------------------

def run_eval(
    case_key: str,
    config_path: Path,
    metrics_override: Optional[str] = None,
    num_runs: Optional[int] = None,
    push_langfuse: bool = False,
    run_name: Optional[str] = None,
) -> None:
    """Load a case, run the agent NUM_RUNS times, evaluate, then average results.

    Args:
        case_key: Key of the case to run from the YAML config.
        config_path: Path to the eval_cases.yaml file.
        metrics_override: Comma-separated gating metric keys to override YAML.
        num_runs: Number of evaluation runs (defaults to NUM_RUNS constant or YAML).
        push_langfuse: If True, export OpenTelemetry spans to Langfuse after evaluation.
        run_name: Shared Langfuse dataset run name for grouping cases in one experiment.
    """
    os.environ["DO_NOT_TRACK"] = "1"
    run_start = time.time()

    config = load_config(config_path)
    case = load_case(case_key, config_path)

    # --- Resolve number of runs ---
    effective_runs = num_runs or config.get("num_runs", NUM_RUNS)

    # --- Load adapter ---
    adapter_path = config.get("adapter", case.get("adapter"))
    if not adapter_path:
        raise ValueError(
            f"No 'adapter' key found in {config_path}. "
            "Specify e.g. adapter: _eval.adapters.librechat_adapter.LibreChatAdapter"
        )
    adapter = load_adapter(adapter_path)

    # --- Resolve invoke method ---
    invoke_method = case.get("invoke_method", config.get("invoke_method", "invoke_text"))

    # --- Build evaluator (LLM judge) ---
    evaluator = build_evaluator_from_adapter(adapter)

    # --- Determine gating metric keys ---
    yaml_gating: List[str] = case.get("metrics", list(DEFAULT_THRESHOLDS.keys()))
    if metrics_override:
        selected_gating = [m.strip() for m in metrics_override.split(",")]
        unknown = set(selected_gating) - VALID_METRICS
        if unknown:
            raise ValueError(f"Unknown metrics: {unknown}. Valid: {sorted(VALID_METRICS)}")
    else:
        selected_gating = yaml_gating

    # --- Determine diagnostic metric keys ---
    selected_diagnostic: List[str] = case.get("diagnostic_metrics", [])

    # --- Merge thresholds ---
    yaml_thresholds: dict = {
        **(case.get("thresholds") or {}),
        **(case.get("diagnostic_thresholds") or {}),
    }
    thresholds = {**DEFAULT_THRESHOLDS, **yaml_thresholds}

    # --- Load leading questions ---
    leading_questions: List[dict] = case.get("leading_questions", [])

    # --- Resolve expected_tools ---
    expected_tools: Optional[List[ToolCall]] = None
    raw_expected_tools = case.get("expected_tools")
    if raw_expected_tools:
        expected_tools = [
            ToolCall(name=t["name"], input_parameters=t.get("input_parameters", {}))
            for t in raw_expected_tools
        ]

    # --- Conversational metrics (sequential only) ---
    conversational_metric_keys: List[str] = case.get("conversational_metrics", [])
    conversational_thresholds: dict = case.get("conversational_thresholds", {})

    is_sequential = invoke_method == "invoke_sequential"

    # --- Telemetry: init early so OpenAI SDK calls get real spans ---
    tracing_active = telemetry_enabled(push_langfuse)
    live_instrumented = False
    if tracing_active:
        if init_tracing():
            live_instrumented = instrument_openai()

    # --- Determine user_query for trace metadata ---
    user_query = case.get("user_query", "")
    if not user_query and is_sequential:
        yaml_turns = case.get("turns", [])
        user_query = yaml_turns[0]["content"] if yaml_turns else ""

    skill_name = config_path.parent.name

    # --- Execute runs (wrapped in trace context when telemetry active) ---
    from contextlib import nullcontext

    trace_ctx = (
        eval_trace(
            skill_name=skill_name,
            case_key=case_key,
            case_name=case.get("name", case_key),
            run_name=run_name,
            num_runs=effective_runs,
            user_query=user_query,
        )
        if tracing_active
        else nullcontext(None)
    )

    all_runs: List[dict] = []
    trace_id = None

    with trace_ctx as root_span:
        if root_span is not None:
            trace_id = trace_id_hex(root_span)

        for i in range(effective_runs):
            print(f"\n{'='*60}")
            print(f"[RUN {i + 1}/{effective_runs}] {case_key}")
            print(f"{'='*60}")

            attempt_ctx = (
                otel_span("eval.attempt", {
                    "eval.run.index": i + 1,
                    "eval.run.total": effective_runs,
                    "langfuse.observation.type": "span",
                    "langfuse.observation.metadata.run_index": i + 1,
                })
                if tracing_active
                else nullcontext(None)
            )

            with attempt_ctx:
                if is_sequential:
                    run_result = run_single_sequential(
                        case_key=case_key,
                        case=case,
                        adapter=adapter,
                        evaluator=evaluator,
                        selected_gating=selected_gating,
                        selected_diagnostic=selected_diagnostic,
                        thresholds=thresholds,
                        leading_questions=leading_questions,
                        expected_tools=expected_tools,
                        conversational_metric_keys=conversational_metric_keys,
                        conversational_thresholds=conversational_thresholds,
                    )
                else:
                    run_result = run_single(
                        case_key=case_key,
                        case=case,
                        adapter=adapter,
                        invoke_method=invoke_method,
                        evaluator=evaluator,
                        selected_gating=selected_gating,
                        selected_diagnostic=selected_diagnostic,
                        thresholds=thresholds,
                        leading_questions=leading_questions,
                        expected_tools=expected_tools,
                    )

                if tracing_active:
                    record_run_metrics(run_result)

            all_runs.append(run_result)
            gating_ok = all(s for _, _, _, s, _ in run_result["gating"])
            print(f"[RUN {i + 1}/{effective_runs}] Gating: {'PASS' if gating_ok else 'FAIL'}")

        # --- Aggregate ---
        agg = aggregate_results(all_runs)

        if tracing_active and root_span is not None:
            agent_metadata = adapter.get_agent_metadata()
            record_aggregate(root_span, agg, all_runs, skill_name, agent_metadata=agent_metadata)

    # --- Flush tracing ---
    if tracing_active:
        flush_tracing()
        if trace_id:
            print(f"[OTEL] Trace exported with id {trace_id}")

    # --- Print report ---
    print_report(
        gating_results=agg["gating_results"],
        diagnostic_results=agg["diagnostic_results"],
        probe_results=agg["probe_results"],
        gating_passed=agg["gating_passed"],
        num_runs=effective_runs,
        conversational_results=agg.get("conversational_results"),
        turn_assertion_summary=agg.get("turn_assertion_summary"),
    )

    # --- Save ---
    save_results(
        config_path=config_path,
        case_key=case_key,
        case_name=case.get("name", case_key),
        gating_results=agg["gating_results"],
        gating_passed=agg["gating_passed"],
        diagnostic_results=agg["diagnostic_results"],
        probe_results=agg["probe_results"],
        per_run_data=all_runs,
        num_runs=effective_runs,
        run_duration=time.time() - run_start,
        conversational_results=agg.get("conversational_results"),
        turn_assertion_summary=agg.get("turn_assertion_summary"),
    )

    # --- Link trace to Langfuse dataset ---
    if tracing_active and trace_id:
        link_trace_to_dataset(config_path, case_key, trace_id, run_name=run_name)
        post_scores(trace_id, agg["gating_results"], agg["gating_passed"])

    # --- Fallback: post-hoc export for adapters without live instrumentation ---
    if tracing_active and not live_instrumented and trace_id is None:
        agent_metadata = adapter.get_agent_metadata()
        fallback_trace_id = export_otel_trace(
            config_path=config_path,
            case_key=case_key,
            case=case,
            all_runs=all_runs,
            agg=agg,
            effective_runs=effective_runs,
            run_name=run_name,
            is_sequential=is_sequential,
            agent_metadata=agent_metadata,
        )
        if fallback_trace_id:
            link_trace_to_dataset(config_path, case_key, fallback_trace_id, run_name=run_name)
            post_scores(fallback_trace_id, agg["gating_results"], agg["gating_passed"])

    # Raise if gating failed
    if not agg["gating_passed"]:
        failed_summary = "; ".join(
            f"{name} (avg={avg:.2f}, threshold={thresh})" if avg is not None
            else f"{name} (avg=N/A, threshold={thresh})"
            for name, avg, thresh, success, _ in agg["gating_results"]
            if not success
        )
        raise AssertionError(
            f"Gating metrics failed (averaged over {effective_runs} runs): {failed_summary}"
        )


