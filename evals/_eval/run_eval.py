"""
Standalone CLI entry point for the eval framework.

Usage:
    eval-run "Pre engagement nda reviewer" --langfuse --run-name baseline
    eval-run "Contract Analyser" --case case_1
    eval-run --config "evals/skills/<Skill>/eval_cases.yaml" --all
"""

import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import yaml

# Ensure the _eval package is importable when run as a script
_EVAL_DIR = Path(__file__).resolve().parent
if str(_EVAL_DIR.parent) not in sys.path:
    sys.path.insert(0, str(_EVAL_DIR.parent))

from _eval.runner import run_eval
from _eval.compile import compile_skill
from _eval.langfuse import sync_dataset_to_langfuse
from _eval.langfuse.datasets import resolve_skill_config, list_available_names


def main():
    parser = argparse.ArgumentParser(
        description="Agent Skill Evaluation Runner (wrapper-agnostic)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            '  eval-run "Pre engagement nda reviewer" --langfuse --run-name baseline\n'
            '  eval-run "Contract Analyser" --case case_1\n'
            '  eval-run --config "evals/skills/Meeting Summariser/eval_cases.yaml" --all\n'
        ),
    )
    parser.add_argument(
        "name", nargs="?",
        help="Skill or agent folder name (e.g. 'Pre engagement nda reviewer').",
    )
    case_group = parser.add_mutually_exclusive_group(required=False)
    case_group.add_argument("--case", nargs="+", help="One or more case keys from eval_cases.yaml (e.g. case_1 case_2)")
    case_group.add_argument(
        "--all", action="store_true", default=False,
        help="Run every case defined in the config YAML sequentially (default if --case is omitted).",
    )
    parser.add_argument(
        "--config", default=None,
        help="Path to the skill's eval_cases.yaml config file (alternative to positional name).",
    )
    parser.add_argument(
        "--metrics", default=None,
        help="Comma-separated gating metric keys to override YAML defaults.",
    )
    parser.add_argument(
        "--num-runs", type=int, default=None,
        help="Number of evaluation runs per case (overrides YAML/default of 5).",
    )
    parser.add_argument(
        "--langfuse", action="store_true", default=False,
        help="Export eval spans to Langfuse via OpenTelemetry after evaluation.",
    )
    parser.add_argument(
        "--sync-dataset", action="store_true", default=False,
        help="Sync eval cases to a Langfuse Dataset (benchmark) and exit.",
    )
    parser.add_argument(
        "--run-name", default=None,
        help="Custom name for the Langfuse dataset run (e.g. 'baseline', 'v2-prompt'). Defaults to eval-YYYYMMDD-HHMMSS.",
    )
    parser.add_argument(
        "--no-parallel-runs", action="store_true", default=False,
        help="Run num_runs sequentially within each case (default: parallel).",
    )
    parser.add_argument(
        "--parallelism", type=int, default=1, metavar="N",
        help="Max concurrent cases (default: 1 = sequential cases).",
    )
    args = parser.parse_args()

    if args.config:
        config_path = Path(args.config).resolve()
        if not config_path.exists():
            print(f"ERROR: Config file not found: {config_path}", file=sys.stderr)
            sys.exit(1)
    elif args.name:
        config_path = resolve_skill_config(args.name)
        if config_path is None:
            print(f"ERROR: No eval config found for '{args.name}'", file=sys.stderr)
            available = list_available_names()
            if available:
                print("Available skills/agents:", file=sys.stderr)
                for n in available:
                    print(f"  {n}", file=sys.stderr)
            sys.exit(1)
    else:
        parser.error("Provide a skill/agent name or --config <path>")

    if args.sync_dataset:
        with open(config_path) as f:
            config = yaml.safe_load(f)
        compile_skill(config_path)
        sync_dataset_to_langfuse(config_path, config)
        return

    # Generate a shared run name for this invocation so all cases
    # are grouped under one experiment in Langfuse Datasets.
    run_name = args.run_name or f"eval-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"

    # Resolve which cases to run
    if args.case:
        case_keys = args.case
    else:
        with open(config_path) as f:
            case_keys = list(yaml.safe_load(f).get("cases", {}).keys())

    parallel_runs = not args.no_parallel_runs

    errors: list = []
    errors_lock = threading.Lock()

    def _run_case(key: str) -> None:
        print(f"\n{'='*60}\nRunning: {key}\n{'='*60}")
        try:
            run_eval(
                case_key=key,
                config_path=config_path,
                metrics_override=args.metrics,
                num_runs=args.num_runs,
                push_langfuse=args.langfuse,
                run_name=run_name,
                parallel_runs=parallel_runs,
            )
        except Exception as exc:
            print(f"[FAIL] {key}: {exc}")
            with errors_lock:
                errors.append((key, exc))

    if args.parallelism > 1:
        with ThreadPoolExecutor(max_workers=args.parallelism) as pool:
            list(pool.map(_run_case, case_keys))
    else:
        for key in case_keys:
            _run_case(key)

    if errors:
        failed = ", ".join(k for k, _ in errors)
        raise SystemExit(f"\n{len(errors)} case(s) failed: {failed}")


# Pytest entry point (used by deepeval test run)
def test_eval_case(request, case_key: str) -> None:
    """Pytest-compatible test function. Options are registered in conftest.py."""
    config_path = Path(request.config.getoption("--config")).resolve()
    run_eval(
        case_key=case_key,
        config_path=config_path,
        metrics_override=request.config.getoption("--metrics"),
        num_runs=request.config.getoption("--num-runs"),
    )


if __name__ == "__main__":
    main()
