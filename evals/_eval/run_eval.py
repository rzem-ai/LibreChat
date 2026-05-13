"""
Standalone CLI entry point for the eval framework.

Usage:
    PYTHONPATH="evals:$PYTHONPATH" python -m _eval.run_eval --config "evals/<Skill>/eval_cases.yaml" --case case_1
    PYTHONPATH="evals:$PYTHONPATH" python -m _eval.run_eval --config "evals/<Skill>/eval_cases.yaml" --all
    PYTHONPATH="evals:$PYTHONPATH" python -m _eval.run_eval --config "evals/<Skill>/eval_cases.yaml" --case case_1 --metrics hallucination,task_completion
    PYTHONPATH="evals:$PYTHONPATH" python -m _eval.run_eval --config "evals/<Skill>/eval_cases.yaml" --all --num-runs 3
"""

import argparse
import sys
from pathlib import Path

import yaml

# Ensure the _eval package is importable when run as a script
_EVAL_DIR = Path(__file__).resolve().parent
if str(_EVAL_DIR.parent) not in sys.path:
    sys.path.insert(0, str(_EVAL_DIR.parent))

from _eval.runner import run_eval


def main():
    parser = argparse.ArgumentParser(
        description="Agent Skill Evaluation Runner (wrapper-agnostic)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            '  python -m _eval.run_eval --config "evals/Meeting Summariser/eval_cases.yaml" --case case_1\n'
            '  python -m _eval.run_eval --config "evals/Meeting Summariser/eval_cases.yaml" --all\n'
            '  python -m _eval.run_eval --config "..." --case case_1 --metrics hallucination,task_completion\n'
        ),
    )
    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--case", help="Case key from eval_cases.yaml (e.g. case_1)")
    group.add_argument(
        "--all", action="store_true", default=False,
        help="Run every case defined in the config YAML sequentially (default if --case is omitted).",
    )
    parser.add_argument(
        "--config", required=True,
        help="Path to the skill's eval_cases.yaml config file.",
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
        help="Push metric scores to Langfuse after evaluation.",
    )
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    if not config_path.exists():
        print(f"ERROR: Config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    if not args.case:
        # Default to --all when no --case is specified
        with open(config_path) as f:
            all_case_keys = list(yaml.safe_load(f).get("cases", {}).keys())
        errors = []
        for key in all_case_keys:
            print(f"\n{'='*60}\nRunning: {key}\n{'='*60}")
            try:
                run_eval(
                    case_key=key,
                    config_path=config_path,
                    metrics_override=args.metrics,
                    num_runs=args.num_runs,
                    push_langfuse=args.langfuse,
                )
            except Exception as exc:
                print(f"[FAIL] {key}: {exc}")
                errors.append((key, exc))
        if errors:
            failed = ", ".join(k for k, _ in errors)
            raise SystemExit(f"\n{len(errors)} case(s) failed: {failed}")
    else:
        run_eval(
            case_key=args.case,
            config_path=config_path,
            metrics_override=args.metrics,
            num_runs=args.num_runs,
            push_langfuse=args.langfuse,
        )


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
