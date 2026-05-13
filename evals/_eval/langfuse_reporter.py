"""
Langfuse score reporter for the eval framework.

Pushes DeepEval metric scores to Langfuse as a trace with attached scores,
giving visibility into eval results alongside production traces.

Opt-in via --langfuse CLI flag or EVAL_PUSH_LANGFUSE=1 env var.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()


def _langfuse_enabled(cli_flag: bool) -> bool:
    return cli_flag or os.environ.get("EVAL_PUSH_LANGFUSE", "").strip() in ("1", "true", "yes")


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
) -> None:
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
        from langfuse import get_client
        from langfuse.api import IngestionEvent_TraceCreate, TraceBody
    except ImportError:
        print("[LANGFUSE] langfuse package not installed — skipping score push.")
        return

    langfuse = get_client()

    tags = ["skill-eval"]
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
                name=f"eval/{case_key}",
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

    for name, avg, threshold, success, _scores in gating_results:
        if avg is not None:
            langfuse.create_score(
                trace_id=trace_id,
                name=name,
                value=avg,
                data_type="NUMERIC",
                comment=f"gating | threshold={threshold}, passed={success}, runs={num_runs}",
            )

    for name, avg, threshold, success, _scores in diagnostic_results:
        if avg is not None:
            langfuse.create_score(
                trace_id=trace_id,
                name=f"diag_{name}",
                value=avg,
                data_type="NUMERIC",
                comment=f"diagnostic | threshold={threshold}, passed={success}, runs={num_runs}",
            )

    for name, avg, _scores in probe_results:
        if avg is not None:
            langfuse.create_score(
                trace_id=trace_id,
                name=f"probe_{name}",
                value=avg,
                data_type="NUMERIC",
                comment=f"leading question probe | runs={num_runs}",
            )

    # Conversational metrics (session-level)
    if conversational_results:
        for name, avg, threshold, success, _scores in conversational_results:
            if avg is not None:
                langfuse.create_score(
                    trace_id=trace_id,
                    name=f"conv_{name}",
                    value=avg,
                    data_type="NUMERIC",
                    comment=f"conversational | threshold={threshold}, passed={success}, runs={num_runs}",
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
                        langfuse.create_score(
                            trace_id=trace_id,
                            observation_id=gen_id,
                            name=f"turn_{turn_idx}_{tr['name']}",
                            value=tr["score"],
                            data_type="NUMERIC",
                            comment=f"turn assertion: {tr['reason']}",
                        )

    langfuse.flush()
    print(f"[LANGFUSE] Scores pushed to trace {trace_id}")
