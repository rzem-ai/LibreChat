"""YAML config loading and case path resolution."""

from pathlib import Path
from typing import Optional

import yaml

from pydantic import ValidationError

from .schema import EvalCase, EvalCasesFile


def _validate_config(data: dict, config_path: Path) -> EvalCasesFile:
    try:
        return EvalCasesFile.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Invalid eval config at {config_path}: {exc}") from exc


def _validate_case(data: dict, config_path: Path, case_key: str) -> EvalCase:
    try:
        return EvalCase.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Invalid eval case '{case_key}' in {config_path}: {exc}") from exc


def load_case(case_key: str, config_path: Path) -> dict:
    """Load a single case definition from the YAML config and resolve paths."""
    config = load_config(config_path)

    cases = config.get("cases", {})
    if case_key not in cases:
        available = ", ".join(sorted(cases.keys()))
        raise ValueError(f"Case '{case_key}' not found in {config_path}. Available: {available}")

    case = _validate_case(dict(cases[case_key]), config_path, case_key).model_dump(
        exclude_none=True,
        exclude_defaults=True,
    )

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
        data = yaml.safe_load(f)

    return _validate_config(data, config_path).model_dump(
        exclude_none=True,
        exclude_defaults=True,
    )


def build_invoke_kwargs(case: dict, invoke_method: str) -> dict:
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


def get_source_text(case: dict) -> Optional[str]:
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
