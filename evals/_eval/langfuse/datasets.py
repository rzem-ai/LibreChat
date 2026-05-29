"""Langfuse dataset management for the eval framework.

OpenTelemetry owns trace and observation export. This module keeps the pieces
that are still Langfuse API concerns: dataset creation, dataset item sync, and
linking an exported trace to a dataset run.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()


_DATASET_ITEM_NAMESPACE = uuid.UUID("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")


def _resolve_langfuse_host() -> str:
    """Return the Langfuse base URL suitable for host-side eval runs."""
    return (
        os.environ.get("EVAL_LANGFUSE_BASE_URL", "").strip()
        or os.environ.get("LANGFUSE_BASE_URL", "").strip()
        or "http://localhost:3000"
    )


def _get_langfuse_client():
    """Create and return a Langfuse client."""
    from langfuse import Langfuse

    host = _resolve_langfuse_host()
    os.environ["LANGFUSE_BASE_URL"] = host
    return Langfuse(host=host)


def _deterministic_item_id(dataset_name: str, case_key: str) -> str:
    """Generate a stable UUID5 for a dataset item based on dataset and case key."""
    return str(uuid.uuid5(_DATASET_ITEM_NAMESPACE, f"{dataset_name}/{case_key}"))


def _load_dataset_rows(config_path: Path) -> list:
    """Read dataset.jsonl sibling of config_path and return all rows."""
    jsonl_path = config_path.parent / "dataset.jsonl"
    if not jsonl_path.exists():
        return []
    rows = []
    with open(jsonl_path, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def sync_dataset_to_langfuse(config_path, config: dict) -> None:
    """Upload eval cases to a Langfuse Dataset for benchmarking.

    Reads from dataset.jsonl (compiled from eval_cases.yaml) and syncs
    each row as a dataset item in Langfuse.
    """
    config_path = Path(config_path)
    skill_name = config_path.parent.name
    dataset_name = f"evals/{skill_name}"

    rows = _load_dataset_rows(config_path)
    if not rows:
        print("[LANGFUSE] No rows found in dataset.jsonl — nothing to sync.")
        return

    try:
        langfuse = _get_langfuse_client()
    except Exception as exc:
        print(f"[LANGFUSE] Could not connect to Langfuse: {exc}")
        return

    try:
        langfuse.create_dataset(
            name=dataset_name,
            description=f"Eval benchmark for skill: {skill_name}",
            metadata={"source": str(config_path), "skill": skill_name},
        )
        print(f"[LANGFUSE] Dataset '{dataset_name}' ensured.")
    except Exception as exc:
        if "already exists" in str(exc).lower() or "409" in str(exc):
            print(f"[LANGFUSE] Dataset '{dataset_name}' already exists.")
        else:
            print(f"[LANGFUSE] Error creating dataset: {exc}")
            return

    synced = 0
    for row in rows:
        case_key = row["case_key"]
        try:
            item_id = _deterministic_item_id(dataset_name, case_key)
            langfuse.create_dataset_item(
                dataset_name=dataset_name,
                id=item_id,
                input=row["input"],
                expected_output=row.get("expected_output", ""),
                metadata=row.get("metadata", {}),
            )
            synced += 1
        except Exception as exc:
            print(f"[LANGFUSE] Error syncing {case_key}: {exc}")

    langfuse.flush()
    print(f"[LANGFUSE] Synced {synced}/{len(rows)} cases to dataset '{dataset_name}'.")


def link_trace_to_dataset(
    config_path,
    case_key: str,
    trace_id: str,
    run_name: Optional[str] = None,
) -> None:
    """Link an exported eval trace to its corresponding dataset item/run."""
    config_path = Path(config_path)
    skill_name = config_path.parent.name
    dataset_name = f"evals/{skill_name}"

    if not run_name:
        run_name = f"eval-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"

    try:
        langfuse = _get_langfuse_client()
    except Exception as exc:
        print(f"[LANGFUSE] Could not fetch dataset '{dataset_name}': {exc}")
        return

    try:
        item_id = _deterministic_item_id(dataset_name, case_key)
        langfuse.api.dataset_run_items.create(
            run_name=run_name,
            dataset_item_id=item_id,
            trace_id=trace_id,
        )
        langfuse.flush()
        print(f"[LANGFUSE] Linked trace {trace_id} to dataset item '{case_key}' (run: {run_name})")
    except Exception as exc:
        print(f"[LANGFUSE] Error linking trace to dataset: {exc}")


def post_scores(
    trace_id: str,
    gating_results: List[tuple],
    gating_passed: bool,
) -> None:
    """Post composite eval scores to Langfuse for experiment comparison.

    Posts two scores per trace:
      - eval_score: mean of all gating metric scores (0.0–1.0)
      - gating_passed: binary pass/fail (1 or 0)
    """
    gating_scores = [score for _, score, _, _, _ in gating_results if score is not None]
    composite = sum(gating_scores) / len(gating_scores) if gating_scores else 0.0

    try:
        langfuse = _get_langfuse_client()
    except Exception as exc:
        print(f"[LANGFUSE] Could not post scores: {exc}")
        return

    try:
        langfuse.create_score(trace_id=trace_id, name="eval_score", value=composite, data_type="NUMERIC")
        langfuse.create_score(trace_id=trace_id, name="passed", value=gating_passed, data_type="BOOLEAN")
        langfuse.flush()
        print(f"[LANGFUSE] Posted scores: eval_score={composite:.3f}, passed={gating_passed}")
    except Exception as exc:
        print(f"[LANGFUSE] Error posting scores: {exc}")