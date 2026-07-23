"""Aggregation, reporting (stdout), and persistence (JSON) for eval results."""

import json
from collections import defaultdict
from pathlib import Path
from typing import List, Optional

from .metrics import LOWER_IS_BETTER_METRICS


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def aggregate_results(all_runs: List[dict]) -> dict:
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
                if threshold is None:
                    success = True
                elif name in LOWER_IS_BETTER_METRICS:
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
# Stdout report
# ---------------------------------------------------------------------------

def print_report(
    gating_results, diagnostic_results, probe_results, gating_passed, num_runs,
    conversational_results=None, turn_assertion_summary=None,
):
    """Print the aggregated eval report to stdout."""
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
# JSON persistence
# ---------------------------------------------------------------------------

def save_results(
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
