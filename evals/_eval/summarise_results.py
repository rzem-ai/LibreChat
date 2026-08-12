"""
Rich-formatted summary of any skill's latest eval run.

Reads the JSON saved by runner.py and displays gating metrics, diagnostic
metrics, and leading question probe results in styled tables.

Usage:
    eval-summary "Pre engagement nda reviewer"
    eval-summary "Contract Analyser" --latest
    eval-summary --file "evals/skills/Meeting Summariser/.results/case_1.json"
"""

import json
import argparse
from pathlib import Path

from rich.console import Console
from rich.table import Table
from rich import box
from rich.text import Text
from rich.rule import Rule


def _score_color(score: float, success: bool) -> str:
    """Return a Rich color string based on metric success."""
    if success:
        return "green"
    return "red"


def _score_range(scores: list) -> str:
    """Format a min–max range string from a list of per-run scores."""
    valid = [s for s in scores if s is not None]
    if not valid:
        return "N/A"
    lo, hi = min(valid), max(valid)
    return f"{lo:.2f}–{hi:.2f}"


def _probe_verdict(score: float) -> Text:
    """Return a styled verdict label for a leading question probe score."""
    if score is None:
        return Text("ERROR", style="bold red")
    if score >= 0.7:
        return Text("✓ OK", style="bold green")
    elif score >= 0.5:
        return Text("~ MED", style="bold yellow")
    return Text("⚠ LOW", style="bold red")


def summarise(results_path: Path) -> None:
    """Load the results JSON and render Rich tables for all metric tiers."""
    if not results_path.exists():
        raise FileNotFoundError(
            f"Results file not found: {results_path}\n"
            "Run an evaluation first to generate results."
        )

    data = json.loads(results_path.read_text())
    console = Console()

    case_name = data.get("caseName", data.get("caseKey", "unknown"))
    case_key = data.get("caseKey", "unknown")
    gating_passed = data.get("gatingPassed", False)
    duration = data.get("runDuration", 0.0)
    num_runs = data.get("numRuns", 1)

    overall = "[green]PASS[/]" if gating_passed else "[red]FAIL[/]"
    runs_label = f"  |  Runs: [cyan]{num_runs}[/]" if num_runs > 1 else ""

    console.print()
    console.print(Rule(f"[bold]Eval Results — {case_key}[/bold]"))
    console.print(
        f"  Case: [cyan]{case_name}[/]  |  "
        f"Duration: [cyan]{duration:.1f}s[/]  |  "
        f"Gating: {overall}{runs_label}"
    )
    console.print()

    # --- Gating metrics table ---
    gating_metrics = data.get("gatingMetrics", [])
    if gating_metrics:
        gating_table = Table(
            title="Gating Metrics (blocking)",
            title_style="bold white",
            show_lines=True,
            box=box.ROUNDED,
            expand=False,
        )
        gating_table.add_column("Metric", style="bold", min_width=22)
        gating_table.add_column("Score" if num_runs == 1 else "Avg Score", justify="right", min_width=10)
        gating_table.add_column("Threshold", justify="right", min_width=9)
        gating_table.add_column("Status", justify="center", min_width=8)
        if num_runs > 1:
            gating_table.add_column("Range", justify="center", min_width=14)

        for m in gating_metrics:
            score = m.get("score")
            threshold = m.get("threshold")
            success = m.get("success", False)
            scores = m.get("scores", [])

            status = Text("PASSED", style="bold green") if success else Text("FAILED", style="bold red")

            if score is not None and threshold is not None:
                score_text = Text(str(round(score, 2)), style=_score_color(score, success))
            else:
                score_text = Text("N/A", style="dim")

            threshold_str = str(threshold) if threshold is not None else "N/A"

            row = [m["name"], score_text, threshold_str, status]
            if num_runs > 1:
                row.append(_score_range(scores))
            gating_table.add_row(*row)

        console.print(gating_table)
        console.print()

    # --- Diagnostic metrics table ---
    diagnostic_metrics = data.get("diagnosticMetrics", [])
    if diagnostic_metrics:
        diag_table = Table(
            title="Diagnostic Metrics (non-blocking signal)",
            title_style="bold white",
            show_lines=True,
            box=box.ROUNDED,
            expand=False,
        )
        diag_table.add_column("Metric", style="bold", min_width=22)
        diag_table.add_column("Score" if num_runs == 1 else "Avg Score", justify="right", min_width=10)
        diag_table.add_column("Threshold", justify="right", min_width=9)
        diag_table.add_column("Status", justify="center", min_width=8)
        if num_runs > 1:
            diag_table.add_column("Range", justify="center", min_width=14)

        for m in diagnostic_metrics:
            score = m.get("score")
            threshold = m.get("threshold", 0.5)
            success = m.get("success", False)
            scores = m.get("scores", [])

            status = Text("PASSED", style="bold green") if success else Text("FAILED", style="bold red")

            if score is not None:
                score_text = Text(str(round(score, 2)), style=_score_color(score, success))
            else:
                score_text = Text("N/A", style="dim")

            row = [m["name"], score_text, str(threshold), status]
            if num_runs > 1:
                row.append(_score_range(scores))
            diag_table.add_row(*row)

        console.print(diag_table)
        console.print()

    # --- Leading question probes table ---
    probes = data.get("leadingQuestionProbes", [])
    if probes:
        probe_table = Table(
            title="Leading Question Probes (non-blocking — informs custom metric design)",
            title_style="bold white",
            show_lines=True,
            box=box.ROUNDED,
            expand=False,
        )
        probe_table.add_column("Question", style="bold", min_width=30)
        probe_table.add_column("Score" if num_runs == 1 else "Avg Score", justify="right", min_width=10)
        probe_table.add_column("Verdict", justify="center", min_width=8)
        if num_runs > 1:
            probe_table.add_column("Range", justify="center", min_width=14)

        for p in probes:
            score = p.get("score")
            scores = p.get("scores", [])

            probe_success = score is not None and score >= 0.5
            if score is not None:
                score_text = Text(str(round(score, 2)), style=_score_color(score, probe_success))
            else:
                score_text = Text("N/A", style="dim")

            verdict = _probe_verdict(score)
            name = p.get("name", "unknown")
            if name.startswith("Leading Q: "):
                name = name[len("Leading Q: "):]

            row = [name, score_text, verdict]
            if num_runs > 1:
                row.append(_score_range(scores))
            probe_table.add_row(*row)

        console.print(probe_table)
        console.print()

    # --- Turn assertion summary table ---
    turn_assertions = data.get("turnAssertionSummary", [])
    if turn_assertions:
        turn_table = Table(
            title="Turn Assertions (per-turn checks)",
            title_style="bold white",
            show_lines=True,
            box=box.ROUNDED,
            expand=False,
        )
        turn_table.add_column("Turn", justify="center", min_width=5)
        turn_table.add_column("Assertion", style="bold", min_width=25)
        turn_table.add_column("Pass Rate", justify="right", min_width=10)
        turn_table.add_column("Status", justify="center", min_width=8)
        turn_table.add_column("Runs", justify="center", min_width=8)

        for ta in turn_assertions:
            rate = ta.get("pass_rate", 0)
            passed = ta.get("passed", 0)
            total = ta.get("total", 0)
            if rate == 1.0:
                status = Text("PASSED", style="bold green")
                rate_text = Text(f"{rate:.0%}", style="green")
            elif rate == 0.0:
                status = Text("FAILED", style="bold red")
                rate_text = Text(f"{rate:.0%}", style="red")
            else:
                status = Text("PARTIAL", style="bold yellow")
                rate_text = Text(f"{rate:.0%}", style="yellow")
            turn_table.add_row(
                str(ta.get("turn", "?")),
                ta.get("name", "?"),
                rate_text,
                status,
                f"{passed}/{total}",
            )

        console.print(turn_table)
        console.print()

    # --- Conversational metrics table ---
    conv_metrics = data.get("conversationalMetrics", [])
    if conv_metrics:
        conv_table = Table(
            title="Conversational Metrics (session-level)",
            title_style="bold white",
            show_lines=True,
            box=box.ROUNDED,
            expand=False,
        )
        conv_table.add_column("Metric", style="bold", min_width=30)
        conv_table.add_column("Score" if num_runs == 1 else "Avg Score", justify="right", min_width=10)
        conv_table.add_column("Threshold", justify="right", min_width=9)
        conv_table.add_column("Status", justify="center", min_width=8)
        if num_runs > 1:
            conv_table.add_column("Range", justify="center", min_width=14)

        for m in conv_metrics:
            score = m.get("score")
            threshold = m.get("threshold")
            success = m.get("success", False)
            scores = m.get("scores", [])

            status = Text("PASSED", style="bold green") if success else Text("FAILED", style="bold red")
            if score is not None and threshold is not None:
                score_text = Text(str(round(score, 2)), style=_score_color(score, success))
            else:
                score_text = Text("N/A", style="dim")
            threshold_str = str(threshold) if threshold is not None else "N/A"

            row = [m["name"], score_text, threshold_str, status]
            if num_runs > 1:
                row.append(_score_range(scores))
            conv_table.add_row(*row)

        console.print(conv_table)
        console.print()

    # --- Quick summary ---
    total_probes = len(probes)
    low_probes = [p for p in probes if (p.get("score") or 0) < 0.5]
    if low_probes:
        console.print(
            f"[bold yellow]⚠ {len(low_probes)}/{total_probes} leading question probe(s) "
            f"scored below 0.5 — consider creating dedicated custom metrics for:[/]"
        )
        for p in low_probes:
            name = p.get("name", "unknown")
            if name.startswith("Leading Q: "):
                name = name[len("Leading Q: "):]
            console.print(f"   • {name} (score: {p.get('score', 'N/A')})")
        console.print()
    elif probes:
        console.print("[bold green]✓ All leading question probes scored ≥ 0.5[/]")
        console.print()


def summarise_all(results_dir: Path) -> None:
    """Summarise all per-case result files in a .results/ directory."""
    if not results_dir.exists():
        raise FileNotFoundError(
            f"Results directory not found: {results_dir}\n"
            "Run an evaluation first to generate results."
        )

    case_files = sorted(
        f for f in results_dir.glob("*.json")
        if not f.name.startswith(".")
    )

    if not case_files:
        raise FileNotFoundError(
            f"No per-case result files found in {results_dir}\n"
            "Run an evaluation with --all to generate per-case results."
        )

    console = Console()
    console.print()
    console.print(Rule(f"[bold]All Cases — {results_dir.parent.name}[/bold]"))
    console.print(f"  Found [cyan]{len(case_files)}[/] case result(s)")
    console.print()

    for case_file in case_files:
        summarise(case_file)


def main():
    from _eval.langfuse.datasets import resolve_skill_config, list_available_names

    parser = argparse.ArgumentParser(
        description="Summarise an eval run with Rich-formatted output.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            '  eval-summary "Pre engagement nda reviewer"\n'
            '  eval-summary "Contract Analyser" --latest\n'
            '  eval-summary --file path/to/.results/case_1.json\n'
        ),
    )
    parser.add_argument(
        "name", nargs="?",
        help="Skill or agent folder name (e.g. 'Pre engagement nda reviewer').",
    )
    parser.add_argument(
        "--config",
        help="Path to the skill's eval_cases.yaml (alternative to positional name).",
    )
    parser.add_argument(
        "--file",
        help="Direct path to the eval run JSON file.",
    )
    parser.add_argument(
        "--latest", action="store_true", default=False,
        help="Show only the latest run. Reads .latest_eval_run.json.",
    )
    args = parser.parse_args()

    if args.file:
        summarise(Path(args.file).resolve())
        return

    if args.config:
        config_path = Path(args.config).resolve()
    elif args.name:
        config_path = resolve_skill_config(args.name)
        if config_path is None:
            import sys
            print(f"ERROR: No eval config found for '{args.name}'", file=sys.stderr)
            available = list_available_names()
            if available:
                print("Available skills/agents:", file=sys.stderr)
                for n in available:
                    print(f"  {n}", file=sys.stderr)
            sys.exit(1)
    else:
        parser.error("Provide a skill/agent name, --config <path>, or --file <path>")

    results_dir = config_path.parent / ".results"
    if args.latest:
        summarise(results_dir / ".latest_eval_run.json")
    else:
        summarise_all(results_dir)


if __name__ == "__main__":
    main()
