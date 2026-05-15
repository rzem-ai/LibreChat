"""
Langfuse score reporter for the eval framework.

Pushes DeepEval metric scores to Langfuse as a trace with attached scores,
giving visibility into eval results alongside production traces.

Opt-in via --langfuse CLI flag or EVAL_PUSH_LANGFUSE=1 env var.
"""

import os
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

from dotenv import load_dotenv

load_dotenv()

_REGISTERED_CONFIGS: Set[str] = set()


def _langfuse_enabled(cli_flag: bool) -> bool:
    return cli_flag or os.environ.get("EVAL_PUSH_LANGFUSE", "").strip() in ("1", "true", "yes")


def _resolve_langfuse_host() -> str:
    """Return the Langfuse base URL suitable for host-side eval runs."""
    return (
        os.environ.get("EVAL_LANGFUSE_BASE_URL", "").strip()
        or os.environ.get("LANGFUSE_BASE_URL", "").strip()
        or "http://localhost:3000"
    )


_DETERMINISTIC_ASSERTION_TYPES = {"contains_any", "not_contains", "expected_tools"}
_LANGFUSE_NAME_RE = re.compile(r"[^\w .()-]", re.UNICODE)
_LANGFUSE_NAME_PREFIX_RE = re.compile(r"^Leading Q[_: ]+", re.IGNORECASE)
_LANGFUSE_NAME_MAX = 35


def _sanitize_name(name: str) -> str:
    """Strip known prefixes, replace invalid chars, and truncate to Langfuse's limit."""
    sanitized = _LANGFUSE_NAME_PREFIX_RE.sub("", name)
    sanitized = _LANGFUSE_NAME_RE.sub("_", sanitized).strip()
    return sanitized[:_LANGFUSE_NAME_MAX]


def _collect_score_configs(
    gating_results: list,
    diagnostic_results: list,
    probe_results: list,
    conversational_results: Optional[list],
    turn_results: Optional[List[dict]],
) -> List[Dict]:
    """Build score config definitions from the actual results being pushed."""
    configs: List[Dict] = [
        {"name": "verdict", "data_type": "BOOLEAN",
         "description": "Overall gating pass/fail verdict"},
    ]
    numeric: Dict = {"data_type": "NUMERIC", "min_value": 0.0, "max_value": 1.0}

    for name, *_ in gating_results:
        configs.append({"name": _sanitize_name(name), **numeric, "description": f"Gating: {name}"})

    if conversational_results:
        for name, *_ in conversational_results:
            configs.append({"name": _sanitize_name(name), **numeric, "description": f"Conversational: {name}"})

    if turn_results:
        seen: Set[str] = set()
        for tr in turn_results:
            score_name = _sanitize_name(tr['name'])
            if score_name in seen:
                continue
            seen.add(score_name)
            if tr.get("type") in _DETERMINISTIC_ASSERTION_TYPES:
                configs.append({"name": score_name, "data_type": "BOOLEAN",
                                "description": f"Turn assertion (deterministic): {tr['name']}"})
            else:
                configs.append({"name": score_name, **numeric,
                                "description": f"Turn assertion (LLM-judged): {tr['name']}"})

    return configs


def ensure_score_configs(langfuse, configs: List[Dict]) -> None:
    """Register score configs in Langfuse if they don't already exist."""
    global _REGISTERED_CONFIGS
    try:
        from langfuse.api import ConfigCategory

        if not _REGISTERED_CONFIGS:
            existing = langfuse.api.score_configs.get(limit=100)
            _REGISTERED_CONFIGS.update(sc.name for sc in existing.data)

        new_count = 0
        for cfg in configs:
            if cfg["name"] in _REGISTERED_CONFIGS:
                continue
            kwargs = {"name": cfg["name"], "data_type": cfg["data_type"]}
            if "min_value" in cfg:
                kwargs["min_value"] = cfg["min_value"]
            if "max_value" in cfg:
                kwargs["max_value"] = cfg["max_value"]
            if "description" in cfg:
                kwargs["description"] = cfg["description"]
            if "categories" in cfg:
                kwargs["categories"] = [
                    ConfigCategory(value=c["value"], label=c["label"])
                    for c in cfg["categories"]
                ]
            langfuse.api.score_configs.create(**kwargs)
            _REGISTERED_CONFIGS.add(cfg["name"])
            new_count += 1

        print(f"[LANGFUSE] Score configs ensured ({len(_REGISTERED_CONFIGS)} total, {new_count} new)")
    except Exception as exc:
        print(f"[LANGFUSE] Warning: could not register score configs: {exc}")


def push_scores_to_langfuse(
    case_key: str,
    case_name: str,
    user_query: str,
    agent_output: str,
    gating_results: list,
    diagnostic_results: list,
    probe_results: list,
    num_runs: int,
    gating_passed: bool,
    skill_name: Optional[str] = None,
    conversation_history: Optional[List[dict]] = None,
    turn_results: Optional[List[dict]] = None,
    conversational_results: Optional[list] = None,
    failure_reasons: Optional[Dict[str, List[str]]] = None,
) -> Optional[str]:
    """Create a Langfuse trace for this eval run and attach metric scores.

    Args:
        case_key: The YAML case key (e.g. "case_1").
        case_name: Human-readable case name.
        user_query: The input query sent to the agent.
        agent_output: The final agent response text (from last run).
        gating_results: Aggregated gating metric tuples (name, avg, threshold, success, scores).
        diagnostic_results: Aggregated diagnostic metric tuples.
        probe_results: Aggregated probe tuples (name, avg, scores).
        num_runs: Number of evaluation runs averaged.
        gating_passed: Whether all gating metrics passed.
        skill_name: Optional skill name for tagging (derived from config path if not given).
    """
    try:
        from langfuse import Langfuse
        from langfuse.api import IngestionEvent_TraceCreate, TraceBody
    except ImportError:
        print("[LANGFUSE] langfuse package not installed — skipping score push.")
        return None

    try:
        host = _resolve_langfuse_host()
        os.environ["LANGFUSE_BASE_URL"] = host
        langfuse = Langfuse(host=host)
    except Exception as exc:
        print(f"[LANGFUSE] Could not connect to Langfuse: {exc}")
        return None

    try:
        configs = _collect_score_configs(
            gating_results, diagnostic_results, probe_results,
            conversational_results, turn_results,
        )
        ensure_score_configs(langfuse, configs)
    except Exception:
        pass  # already logged inside ensure_score_configs

    try:
        tags = ["skill-eval", "PASS" if gating_passed else "FAIL"]
        if skill_name:
            tags.append(skill_name)

        trace_id = langfuse.create_trace_id()
        now = datetime.now(timezone.utc).isoformat()

        langfuse.api.ingestion.batch(batch=[
            IngestionEvent_TraceCreate(
                id=str(uuid.uuid4()),
                type="trace-create",
                timestamp=now,
                body=TraceBody(
                    id=trace_id,
                    name=f"{skill_name}/{case_key}",
                    input=user_query,
                    output=agent_output,
                    tags=tags,
                    metadata={
                        "case_key": case_key,
                        "case_name": case_name,
                        "num_runs": num_runs,
                        "gating_passed": gating_passed,
                    },
                ),
            )
        ])

        # Overall verdict
        langfuse.create_score(
            trace_id=trace_id,
            name="verdict",
            value=1 if gating_passed else 0,
            data_type="BOOLEAN",
            comment=f"Overall gating verdict | runs={num_runs}",
        )

        reasons_map = failure_reasons or {}

        for name, avg, threshold, success, _scores in gating_results:
            if avg is not None:
                comment = f"gating | threshold={threshold}, passed={success}, runs={num_runs}"
                reasons = reasons_map.get(name)
                if reasons and not success:
                    for i, reason in enumerate(reasons, 1):
                        comment += f"\n\n[Run {i}] {reason}"
                langfuse.create_score(
                    trace_id=trace_id,
                    name=_sanitize_name(name),
                    value=avg,
                    data_type="NUMERIC",
                    comment=comment,
                )

        # Conversational metrics (session-level)
        if conversational_results:
            for name, avg, threshold, success, _scores in conversational_results:
                if avg is not None:
                    comment = f"conversational | threshold={threshold}, passed={success}, runs={num_runs}"
                    reasons = reasons_map.get(name)
                    if reasons and not success:
                        for i, reason in enumerate(reasons, 1):
                            comment += f"\n\n[Run {i}] {reason}"
                    langfuse.create_score(
                        trace_id=trace_id,
                        name=_sanitize_name(name),
                        value=avg,
                        data_type="NUMERIC",
                        comment=comment,
                    )

        # Per-turn child spans
        if conversation_history:
            from langfuse.api import IngestionEvent_GenerationCreate, CreateGenerationBody

            turn_pairs = []
            user_msg = None
            for msg in conversation_history:
                if msg["role"] == "user":
                    user_msg = msg["content"]
                elif msg["role"] == "assistant" and user_msg is not None:
                    turn_pairs.append((user_msg, msg["content"]))
                    user_msg = None

            for turn_idx, (user_input, assistant_output) in enumerate(turn_pairs):
                gen_id = str(uuid.uuid4())
                langfuse.api.ingestion.batch(batch=[
                    IngestionEvent_GenerationCreate(
                        id=str(uuid.uuid4()),
                        type="generation-create",
                        timestamp=now,
                        body=CreateGenerationBody(
                            id=gen_id,
                            trace_id=trace_id,
                            name=f"turn_{turn_idx}",
                            input=user_input,
                            output=assistant_output,
                            metadata={"turn_index": turn_idx},
                        ),
                    )
                ])

                # Attach turn assertion scores to this generation span
                if turn_results:
                    for tr in turn_results:
                        if tr.get("turn") == turn_idx and tr.get("score") is not None:
                            is_deterministic = tr.get("type") in _DETERMINISTIC_ASSERTION_TYPES
                            langfuse.create_score(
                                trace_id=trace_id,
                                observation_id=gen_id,
                                name=_sanitize_name(tr['name']),
                                value=int(tr["score"]) if is_deterministic else tr["score"],
                                data_type="BOOLEAN" if is_deterministic else "NUMERIC",
                                comment=f"turn assertion: {tr['reason']}",
                            )

        langfuse.flush()
        print(f"[LANGFUSE] Scores pushed to trace {trace_id}")
        return trace_id
    except Exception as exc:
        print(f"[LANGFUSE] Error pushing scores (eval results are saved): {exc}")
        return None


def _get_langfuse_client():
    """Create and return a Langfuse client."""
    from langfuse import Langfuse
    host = _resolve_langfuse_host()
    os.environ["LANGFUSE_BASE_URL"] = host
    return Langfuse(host=host)


# Namespace UUID for deterministic dataset item IDs
_DATASET_ITEM_NAMESPACE = uuid.UUID("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")


def _deterministic_item_id(dataset_name: str, case_key: str) -> str:
    """Generate a stable UUID5 for a dataset item based on dataset + case key."""
    return str(uuid.uuid5(_DATASET_ITEM_NAMESPACE, f"{dataset_name}/{case_key}"))


def sync_dataset_to_langfuse(config_path, config: dict) -> None:
    """Upload eval_cases.yaml cases to a Langfuse Dataset for benchmarking.

    Creates one dataset per skill (named after the parent folder) and one
    dataset item per case, with input/expected_output derived from the YAML.
    """
    from pathlib import Path

    config_path = Path(config_path)
    skill_name = config_path.parent.name
    dataset_name = f"evals/{skill_name}"
    cases = config.get("cases", {})

    if not cases:
        print("[LANGFUSE] No cases found in config — nothing to sync.")
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
    for case_key, case in cases.items():
        turns = case.get("turns", [])
        invoke_method = case.get("invoke_method", config.get("invoke_method", "invoke_text"))

        if invoke_method == "invoke_sequential" and turns:
            input_data = {
                "turns": [{"content": t["content"], "attach_source": t.get("attach_source", False)} for t in turns],
                "source_material": case.get("source_material"),
            }
        else:
            user_query = turns[0]["content"] if turns else case.get("user_query", "")
            input_data = {
                "query": user_query,
                "source_material": case.get("source_material"),
            }

        expected_output = {
            "expected_output": case.get("expected_output", ""),
            "expected_tools": case.get("expected_tools", []),
            "thresholds": case.get("thresholds", {}),
            "leading_questions": [lq.get("name") for lq in case.get("leading_questions", [])],
        }

        try:
            item_id = _deterministic_item_id(dataset_name, case_key)
            langfuse.create_dataset_item(
                dataset_name=dataset_name,
                id=item_id,
                input=input_data,
                expected_output=expected_output,
                metadata={
                    "case_key": case_key,
                    "case_name": case.get("name", case_key),
                    "invoke_method": invoke_method,
                    "category": case.get("category", ""),
                },
            )
            synced += 1
        except Exception as exc:
            print(f"[LANGFUSE] Error syncing {case_key}: {exc}")

    langfuse.flush()
    print(f"[LANGFUSE] Synced {synced}/{len(cases)} cases to dataset '{dataset_name}'.")


def link_trace_to_dataset(
    config_path,
    case_key: str,
    trace_id: str,
    run_name: Optional[str] = None,
) -> None:
    """Link an eval trace to its corresponding dataset item via a dataset run."""
    from pathlib import Path

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
