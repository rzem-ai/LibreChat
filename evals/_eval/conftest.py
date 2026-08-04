"""
conftest.py — Shared pytest configuration for the eval framework.

Registers custom CLI options so pytest/deepeval can run skill evaluations:
    deepeval test run evals/_eval/run_eval.py -- --config <path> --case <key>
"""

import yaml
from pathlib import Path


def pytest_addoption(parser):
    """Register custom CLI options for the eval runner."""
    parser.addoption(
        "--case",
        default="case_1",
        help="Case key to evaluate (e.g. case_1). Must exist in eval_cases.yaml.",
    )
    parser.addoption(
        "--all",
        action="store_true",
        default=False,
        help="Run every case defined in the config YAML in a single pytest session.",
    )
    parser.addoption(
        "--metrics",
        default=None,
        help="Comma-separated gating metric keys to override YAML defaults.",
    )
    parser.addoption(
        "--config",
        default=None,
        help="Path to the eval_cases.yaml config file for the skill under test.",
    )
    parser.addoption(
        "--num-runs",
        default=None,
        type=int,
        help="Number of evaluation runs per case (overrides YAML/default).",
    )


def pytest_generate_tests(metafunc):
    """Parametrize test_eval_case over case keys when --all is passed."""
    if "case_key" not in metafunc.fixturenames:
        return

    config_path_str = metafunc.config.getoption("--config")
    config_path = Path(config_path_str)

    if metafunc.config.getoption("--all"):
        with open(config_path) as f:
            cases = yaml.safe_load(f).get("cases", {})
        metafunc.parametrize("case_key", list(cases.keys()))
    else:
        metafunc.parametrize("case_key", [metafunc.config.getoption("--case")])
