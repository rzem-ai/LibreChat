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
import json
import os
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

import yaml
from deepeval.test_case import LLMTestCase, ToolCall
from deepeval.test_case import ConversationalTestCase, Turn
from deepeval.metrics import ToolCorrectnessMetric, SummarizationMetric

from .adapters.base import AgentAdapter, AgentResponse, ToolCallRecord
from .metrics import (
    EvaluatorModel,
    DEFAULT_THRESHOLDS,
    VALID_METRICS,
    CONVERSATIONAL_METRICS,
    build_metrics,
    build_conversational_from_keys,
    build_leading_question_probes,
    build_conversational_metrics,
    evaluate_turn_assertions,
)
from .langfuse_reporter import push_scores_to_langfuse, _langfuse_enabled, link_trace_to_dataset


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NUM_RUNS = 5  # Each case is evaluated this many times; results are averaged.


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_adapter(adapter_path: str) -> AgentAdapter:
    """Dynamically import and instantiate an adapter class from a dotted path.

    Example: '_eval.adapters.agno_adapter.AgnoAdapter'
    """
    module_path, class_name = adapter_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    adapter_cls = getattr(module, class_name)
    return adapter_cls()


def _build_evaluator_from_adapter(adapter: AgentAdapter) -> EvaluatorModel:
    """Create an EvaluatorModel (LLM-as-judge) from the adapter's underlying model.

    Checks (in order):
    1. adapter.get_evaluator() — adapter-provided direct judge (preferred)
    2. adapter._agent.model — Agno model with .response() method
    3. Fallback — routes judge prompts through adapter.invoke_text (slow)
    """
    # Preferred: adapter provides its own evaluator (e.g. direct LLM gateway call)
    if hasattr(adapter, "get_evaluator") and callable(adapter.get_evaluator):
        evaluator = adapter.get_evaluator()
        if evaluator is not None:
            return evaluator

    # If the adapter exposes a model with a response method (e.g. Agno), use it
    if hasattr(adapter, "_agent") and hasattr(adapter._agent, "model"):
        model = adapter._agent.model

        def generate_fn(prompt: str) -> str:
            from agno.agent import Message
            response = model.response(messages=[Message(role="user", content=prompt)])
            return response.content if hasattr(response, "content") else str(response)

        return EvaluatorModel(generate_fn, model_name="Azure-OpenAI-Judge")

    # Fallback: use the adapter itself as judge (less ideal but functional)
    def fallback_generate(prompt: str) -> str:
        resp = adapter.invoke_text(prompt, "")
        return resp.content

    return EvaluatorModel(fallback_generate, model_name="Adapter-Fallback-Judge")


# ---------------------------------------------------------------------------
# YAML loader
# ---------------------------------------------------------------------------

def load_case(case_key: str, config_path: Path) -> dict:
    """Load a single case definition from the YAML config and resolve paths."""
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    cases = config.get("cases", {})
    if case_key not in cases:
        available = ", ".join(sorted(cases.keys()))
        raise ValueError(f"Case '{case_key}' not found in {config_path}. Available: {available}")

    case = dict(cases[case_key])

    # Resolve source_material path
    source_rel = case.get("source_material", "").strip()
    if source_rel:
        case["_source_path"] = (config_path.parent / source_rel).resolve()

    # Resolve source_files paths
    source_files = case.get("source_files", [])
    if source_files:
        case["_source_file_paths"] = [
            (config_path.parent / f.strip()).resolve() for f in source_files
        ]

    return case


def load_config(config_path: Path) -> dict:
    """Load the full YAML config (top-level keys like adapter, cases, etc.)."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------------------
# Single-run evaluation
# ---------------------------------------------------------------------------

def _run_single(
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

    # --- Build fresh metric instances (stateful — .measure() writes onto them) ---
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
    invoke_kwargs = _build_invoke_kwargs(case, invoke_method)
    agent_response: AgentResponse = adapter.invoke(invoke_method, **invoke_kwargs)

    # Convert adapter tool records to deepeval ToolCall objects
    actual_tools = [
        ToolCall(name=t.name, input_parameters=t.input_parameters)
        for t in agent_response.tools_called
    ]

    # --- Build LLMTestCase ---
    source_material = _get_source_text(case)
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

    # SummarizationMetric needs input = source material
    summarization_test_case = LLMTestCase(
        name=test_case.name,
        input=source_material or "",
        actual_output=agent_response.content,
    )

    # --- Phase 1: Gating metrics ---
    gating_results = _measure_metrics(gating_metrics, test_case, summarization_test_case)

    # Gating probes
    for probe, _ in gating_probes:
        try:
            probe.measure(test_case)
            gating_results.append((
                probe.name,
                probe.score,
                probe.threshold,
                probe.is_successful(),
                getattr(probe, "reason", "N/A"),
            ))
        except Exception as exc:
            gating_results.append((
                probe.name, None, getattr(probe, "threshold", None), False, f"ERROR: {exc}",
            ))

    # --- Phase 2: Diagnostic metrics + probes ---
    diagnostic_results = _measure_metrics(diagnostic_metrics, test_case, summarization_test_case)

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
    }


def _measure_metrics(metrics: list, test_case, summarization_test_case) -> list:
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


def _build_invoke_kwargs(case: dict, invoke_method: str) -> dict:
    """Build the keyword arguments for the adapter invoke call based on the case config."""
    if invoke_method == "invoke_text":
        source_path = case.get("_source_path")
        if source_path:
            with open(source_path, "r") as f:
                context = f.read()
        else:
            context = case.get("context_text", "")
        return {"query": case["user_query"], "context": context}

    elif invoke_method == "invoke_file":
        file_paths = case.get("_source_file_paths", [])
        return {"query": case["user_query"], "file_paths": file_paths}

    elif invoke_method == "invoke_multi_turn":
        turns = case.get("turns", [])
        return {"turns": turns}

    elif invoke_method == "invoke_sequential":
        turns = case.get("turns", [])
        source_path = case.get("_source_path")
        source_text = None
        if source_path and source_path.exists():
            with open(source_path, "r") as f:
                source_text = f.read()
        else:
            source_text = case.get("context_text")
        return {"turns": turns, "source_text": source_text}

    else:
        raise ValueError(f"Unknown invoke_method: {invoke_method}")


def _get_source_text(case: dict) -> Optional[str]:
    """Read source material text for use as context in LLMTestCase."""
    source_path = case.get("_source_path")
    if source_path and source_path.exists():
        with open(source_path, "r") as f:
            return f.read()

    # For file-based cases, concatenate file contents
    file_paths = case.get("_source_file_paths", [])
    if file_paths:
        parts = []
        for fp in file_paths:
            if fp.exists():
                with open(fp, "r") as f:
                    parts.append(f.read())
        return "\n\n".join(parts) if parts else None

    return case.get("context_text")


# ---------------------------------------------------------------------------
# Sequential multi-turn single-run evaluation
# ---------------------------------------------------------------------------

def _run_single_sequential(
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
    """Execute one sequential multi-turn agent interaction and evaluate.

    Flow:
      1. Call adapter.invoke_sequential(turns, source_text) for real responses
      2. Evaluate per-turn assertions against each response
      3. Build ConversationalTestCase from real conversation and run session metrics
      4. Build LLMTestCase from final output and run standard gating/diagnostic
    """
    # --- Invoke agent sequentially ---
    invoke_kwargs = _build_invoke_kwargs(case, "invoke_sequential")
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

    # --- Conversational metrics (from metrics/diagnostic_metrics + legacy conversational_metrics) ---
    conversational_results = []

    # Build conversational metrics that appear in gating keys
    gating_conv_metrics = build_conversational_from_keys(selected_gating, thresholds, evaluator)
    # Build conversational metrics that appear in diagnostic keys
    diagnostic_conv_metrics = build_conversational_from_keys(selected_diagnostic, thresholds, evaluator)
    # Legacy: conversational_metrics YAML key (backward compat, treated as gating)
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
                    metric.score,
                    metric.threshold,
                    metric.is_successful(),
                    getattr(metric, "reason", "N/A"),
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
    source_material = _get_source_text(case)

    gating_metrics = build_metrics(
        selected_gating, thresholds, evaluator, has_expected_tools=bool(expected_tools),
    )
    diagnostic_metrics = build_metrics(
        selected_diagnostic, thresholds, evaluator, has_expected_tools=bool(expected_tools),
    )
    all_probes = build_leading_question_probes(leading_questions, evaluator)
    gating_probes = [(p, t) for p, t in all_probes if t == "gating"]
    diagnostic_probes = [(p, t) for p, t in all_probes if t == "diagnostic"]

    # Merge tools from all turns for tool_correctness
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

    gating_results = _measure_metrics(gating_metrics, test_case, summarization_test_case)
    # Merge conversational gating metrics into gating results
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

    diagnostic_results = _measure_metrics(diagnostic_metrics, test_case, summarization_test_case)
    # Merge conversational diagnostic metrics into diagnostic results
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
    }


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def _aggregate_results(all_runs: List[dict]) -> dict:
    """Average metric scores across multiple runs."""

    def _avg_metric(runs_data: List[list]) -> list:
        by_name = defaultdict(lambda: {"scores": [], "successes": [], "threshold": None})
        for run in runs_data:
            for name, score, threshold, success, _reason in run:
                by_name[name]["scores"].append(score)
                by_name[name]["successes"].append(success)
                if by_name[name]["threshold"] is None:
                    by_name[name]["threshold"] = threshold

        averaged = []
        for name, data in by_name.items():
            valid_scores = [s for s in data["scores"] if s is not None]
            threshold = data["threshold"]
            if valid_scores:
                avg = sum(valid_scores) / len(valid_scores)
                lower_is_better = any(
                    s is not None and threshold is not None and s < threshold and ok
                    for s, ok in zip(data["scores"], data["successes"])
                )
                if threshold is None:
                    success = True
                elif lower_is_better:
                    success = avg <= threshold
                else:
                    success = avg >= threshold
            else:
                avg = None
                success = False
            averaged.append((name, avg, threshold, success, data["scores"]))
        return averaged

    def _avg_probes(runs_data: List[list]) -> list:
        by_name = defaultdict(list)
        for run in runs_data:
            for name, score, _reason in run:
                by_name[name].append(score)

        averaged = []
        for name, scores in by_name.items():
            valid_scores = [s for s in scores if s is not None]
            avg = sum(valid_scores) / len(valid_scores) if valid_scores else None
            averaged.append((name, avg, scores))
        return averaged

    gating_results = _avg_metric([r["gating"] for r in all_runs])
    diagnostic_results = _avg_metric([r["diagnostic"] for r in all_runs])
    probe_results = _avg_probes([r["probes"] for r in all_runs])
    gating_passed = all(success for _, _, _, success, _ in gating_results)

    # Conversational metrics (may be empty for non-sequential cases)
    conversational_results = []
    if all_runs and all_runs[0].get("conversational"):
        conversational_results = _avg_metric([r["conversational"] for r in all_runs])

    # Turn assertion pass rates across runs
    turn_assertion_summary = []
    if all_runs and all_runs[0].get("turn_results"):
        by_key = defaultdict(lambda: {"passed": 0, "total": 0})
        for run in all_runs:
            for tr in run["turn_results"]:
                key = (tr["turn"], tr["name"])
                by_key[key]["total"] += 1
                if tr["passed"]:
                    by_key[key]["passed"] += 1
        for (turn_idx, name), data in sorted(by_key.items()):
            rate = data["passed"] / data["total"] if data["total"] else 0
            turn_assertion_summary.append({
                "turn": turn_idx,
                "name": name,
                "pass_rate": rate,
                "passed": data["passed"],
                "total": data["total"],
            })

    return {
        "gating_results": gating_results,
        "diagnostic_results": diagnostic_results,
        "probe_results": probe_results,
        "gating_passed": gating_passed,
        "conversational_results": conversational_results,
        "turn_assertion_summary": turn_assertion_summary,
    }


# ---------------------------------------------------------------------------
# Report printer
# ---------------------------------------------------------------------------

def _print_report(
    gating_results, diagnostic_results, probe_results, gating_passed, num_runs,
    conversational_results=None, turn_assertion_summary=None,
):
    label = f" (avg of {num_runs} runs)" if num_runs > 1 else ""

    # Turn assertions
    if turn_assertion_summary:
        print(f"\n{'='*80}")
        print(f"TURN ASSERTIONS{label}")
        print(f"{'='*80}")
        print(f"{'Turn':<6} {'Assertion':<30} {'Pass Rate':>10} {'Runs':>10}")
        print(f"{'-'*6} {'-'*30} {'-'*10} {'-'*10}")
        for ta in turn_assertion_summary:
            status = "\u2713" if ta["pass_rate"] == 1.0 else ("\u2717" if ta["pass_rate"] == 0.0 else "~")
            print(f"{ta['turn']:<6} {ta['name']:<30} {ta['pass_rate']:>9.0%} {status}  {ta['passed']}/{ta['total']}")

    print(f"\n{'='*80}")
    print(f"GATING METRICS{label}")
    print(f"{'='*80}")
    print(f"{'Metric':<25} {'Avg':>7} {'Threshold':>10} {'Pass':>6}  Per-run scores")
    print(f"{'-'*25} {'-'*7} {'-'*10} {'-'*6}  {'-'*30}")
    for name, avg, threshold, success, scores in gating_results:
        status = "\u2713" if success else "\u2717"
        avg_str = f"{avg:.2f}" if avg is not None else "N/A"
        thresh_str = f"{threshold:.2f}" if threshold is not None else "N/A"
        scores_str = ", ".join(f"{s:.2f}" if s is not None else "N/A" for s in scores)
        print(f"{name:<25} {avg_str:>7} {thresh_str:>10} {status:>6}  [{scores_str}]")

    if gating_passed:
        print(f"\n[GATING] All gating metrics PASSED{label}.")
    else:
        failed_names = ", ".join(n for n, _, _, s, _ in gating_results if not s)
        print(f"\n[GATING] Failed metrics{label}: {failed_names}")

    print(f"\n{'='*80}")
    print(f"DIAGNOSTIC METRICS (non-blocking){label}")
    print(f"{'='*80}")
    print(f"{'Metric':<25} {'Avg':>7} {'Threshold':>10} {'Pass':>6}  Per-run scores")
    print(f"{'-'*25} {'-'*7} {'-'*10} {'-'*6}  {'-'*30}")
    for name, avg, threshold, success, scores in diagnostic_results:
        status = "\u2713" if success else "\u2717"
        avg_str = f"{avg:.2f}" if avg is not None else "N/A"
        thresh_str = f"{threshold:.2f}" if threshold is not None else "N/A"
        scores_str = ", ".join(f"{s:.2f}" if s is not None else "N/A" for s in scores)
        print(f"{name:<25} {avg_str:>7} {thresh_str:>10} {status:>6}  [{scores_str}]")

    if probe_results:
        print(f"\n{'='*80}")
        print(f"LEADING QUESTION PROBES (non-blocking){label}")
        print(f"{'='*80}")
        print(f"{'Question':<30} {'Avg':>7} {'Verdict':>8}  Per-run scores")
        print(f"{'-'*30} {'-'*7} {'-'*8}  {'-'*30}")
        for name, avg, scores in probe_results:
            avg_str = f"{avg:.2f}" if avg is not None else "N/A"
            if avg is not None and avg >= 0.7:
                verdict = "\u2713 OK"
            elif avg is not None and avg >= 0.5:
                verdict = "~ MED"
            else:
                verdict = "\u26a0 LOW"
            scores_str = ", ".join(f"{s:.2f}" if s is not None else "N/A" for s in scores)
            print(f"{name:<30} {avg_str:>7} {verdict:>8}  [{scores_str}]")
        print()

    # Conversational metrics
    if conversational_results:
        print(f"{'='*80}")
        print(f"CONVERSATIONAL METRICS (session-level){label}")
        print(f"{'='*80}")
        print(f"{'Metric':<35} {'Avg':>7} {'Threshold':>10} {'Pass':>6}  Per-run scores")
        print(f"{'-'*35} {'-'*7} {'-'*10} {'-'*6}  {'-'*30}")
        for name, avg, threshold, success, scores in conversational_results:
            status = "\u2713" if success else "\u2717"
            avg_str = f"{avg:.2f}" if avg is not None else "N/A"
            thresh_str = f"{threshold:.2f}" if threshold is not None else "N/A"
            scores_str = ", ".join(f"{s:.2f}" if s is not None else "N/A" for s in scores)
            print(f"{name:<35} {avg_str:>7} {thresh_str:>10} {status:>6}  [{scores_str}]")
        print()


# ---------------------------------------------------------------------------
# Result persistence
# ---------------------------------------------------------------------------

def _save_results(
    config_path: Path,
    case_key: str,
    case_name: str,
    gating_results: list,
    gating_passed: bool,
    diagnostic_results: list,
    probe_results: list,
    per_run_data: List[dict],
    num_runs: int,
    run_duration: float,
    conversational_results: Optional[list] = None,
    turn_assertion_summary: Optional[list] = None,
) -> None:
    """Save results to .results/ directory next to the config YAML."""
    results_dir = config_path.parent / ".results"
    results_dir.mkdir(parents=True, exist_ok=True)
    results_file = results_dir / ".latest_eval_run.json"

    def _metric_entry(name, avg, threshold, success, scores):
        return {
            "name": name,
            "score": avg,
            "threshold": threshold,
            "success": success,
            "scores": [round(s, 4) if s is not None else None for s in scores],
        }

    def _probe_entry(name, avg, scores):
        return {
            "name": name,
            "score": avg,
            "scores": [round(s, 4) if s is not None else None for s in scores],
        }

    per_run_json = []
    for i, run in enumerate(per_run_data):
        run_entry = {"run": i + 1, "gating": [], "diagnostic": [], "probes": []}
        for name, score, threshold, success, reason in run["gating"]:
            run_entry["gating"].append({
                "name": name, "score": score, "threshold": threshold,
                "success": success, "reason": reason,
            })
        for name, score, threshold, success, reason in run["diagnostic"]:
            run_entry["diagnostic"].append({
                "name": name, "score": score, "threshold": threshold,
                "success": success, "reason": reason,
            })
        for name, score, reason in run["probes"]:
            run_entry["probes"].append({"name": name, "score": score, "reason": reason})
        if run.get("conversational"):
            run_entry["conversational"] = []
            for name, score, threshold, success, reason in run["conversational"]:
                run_entry["conversational"].append({
                    "name": name, "score": score, "threshold": threshold,
                    "success": success, "reason": reason,
                })
        if run.get("turn_results"):
            run_entry["turn_results"] = run["turn_results"]
        if run.get("conversation_history"):
            run_entry["conversation_history"] = run["conversation_history"]
        per_run_json.append(run_entry)

    results = {
        "caseKey": case_key,
        "caseName": case_name,
        "numRuns": num_runs,
        "gatingPassed": gating_passed,
        "runDuration": run_duration,
        "gatingMetrics": [_metric_entry(*r) for r in gating_results],
        "diagnosticMetrics": [_metric_entry(*r) for r in diagnostic_results],
        "leadingQuestionProbes": [_probe_entry(*r) for r in probe_results],
        "perRunData": per_run_json,
    }
    if conversational_results:
        results["conversationalMetrics"] = [_metric_entry(*r) for r in conversational_results]
    if turn_assertion_summary:
        results["turnAssertionSummary"] = turn_assertion_summary

    results_file.write_text(json.dumps(results, indent=2, default=str))

    # Also save a per-case file that persists across runs
    case_file = results_dir / f"{case_key}.json"
    case_file.write_text(json.dumps(results, indent=2, default=str))

    print(f"\n[SAVED] Results written to {results_file}")
    print(f"[SAVED] Per-case results written to {case_file}")


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
        push_langfuse: If True, push metric scores to Langfuse after evaluation.
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
            "Specify e.g. adapter: _eval.adapters.agno_adapter.AgnoAdapter"
        )
    adapter = _load_adapter(adapter_path)

    # --- Resolve invoke method ---
    invoke_method = case.get("invoke_method", config.get("invoke_method", "invoke_text"))

    # --- Build evaluator (LLM judge) ---
    evaluator = _build_evaluator_from_adapter(adapter)

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

    # --- Execute runs ---
    all_runs: List[dict] = []
    for i in range(effective_runs):
        print(f"\n{'='*60}")
        print(f"[RUN {i + 1}/{effective_runs}] {case_key}")
        print(f"{'='*60}")

        if is_sequential:
            run_result = _run_single_sequential(
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
            run_result = _run_single(
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
        all_runs.append(run_result)

        gating_ok = all(s for _, _, _, s, _ in run_result["gating"])
        print(f"[RUN {i + 1}/{effective_runs}] Gating: {'PASS' if gating_ok else 'FAIL'}")

    # --- Aggregate ---
    agg = _aggregate_results(all_runs)

    # --- Print report ---
    _print_report(
        gating_results=agg["gating_results"],
        diagnostic_results=agg["diagnostic_results"],
        probe_results=agg["probe_results"],
        gating_passed=agg["gating_passed"],
        num_runs=effective_runs,
        conversational_results=agg.get("conversational_results"),
        turn_assertion_summary=agg.get("turn_assertion_summary"),
    )

    # --- Save ---
    _save_results(
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

    # --- Push to Langfuse (opt-in) ---
    if _langfuse_enabled(push_langfuse):
        last_output = all_runs[-1].get("agent_output", "") if all_runs else ""
        skill_name = config_path.parent.name
        user_query = case.get("user_query", "")
        if not user_query and is_sequential:
            yaml_turns = case.get("turns", [])
            user_query = yaml_turns[0]["content"] if yaml_turns else ""

        # Collect failure reasons from all runs for failed metrics
        failure_reasons: Dict[str, List[str]] = {}
        for run in all_runs:
            for name, _score, _thresh, success, reason in run.get("gating", []):
                if not success and reason and reason != "N/A":
                    failure_reasons.setdefault(name, []).append(reason)
            for name, _score, _thresh, success, reason in run.get("conversational", []):
                if not success and reason and reason != "N/A":
                    failure_reasons.setdefault(name, []).append(reason)

        trace_id = push_scores_to_langfuse(
            case_key=case_key,
            case_name=case.get("name", case_key),
            user_query=user_query,
            agent_output=last_output,
            gating_results=agg["gating_results"],
            diagnostic_results=agg["diagnostic_results"],
            probe_results=agg["probe_results"],
            num_runs=effective_runs,
            gating_passed=agg["gating_passed"],
            skill_name=skill_name,
            conversation_history=all_runs[-1].get("conversation_history") if is_sequential else None,
            turn_results=all_runs[-1].get("turn_results") if is_sequential else None,
            conversational_results=agg.get("conversational_results"),
            failure_reasons=failure_reasons,
        )
        if trace_id:
            link_trace_to_dataset(config_path, case_key, trace_id, run_name=run_name)

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
