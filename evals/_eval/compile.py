"""Compile eval_cases.yaml into dataset.jsonl for Langfuse dataset sync."""

import json
from pathlib import Path

from _eval.loader import load_config


def compile_skill(config_path: Path) -> Path:
    """Read eval_cases.yaml and write dataset.jsonl as a sibling file.

    Returns the path to the generated JSONL file.
    """
    config_path = Path(config_path).resolve()
    config = load_config(config_path)
    skill_name = config_path.parent.name
    cases = config.get("cases", {})
    jsonl_path = config_path.parent / "dataset.jsonl"

    rows = []
    for case_key, case in cases.items():
        case_no = None
        if case_key.startswith("case_"):
            case_no_raw = case_key.removeprefix("case_")
            if case_no_raw.isdigit():
                case_no = int(case_no_raw)

        turns = case.get("turns", [])
        invoke_method = case.get("invoke_method", config.get("invoke_method", "invoke_text"))

        if invoke_method == "invoke_sequential" and turns:
            input_data = {
                "turns": [
                    {"content": turn["content"], "attach_source": turn.get("attach_source", False)}
                    for turn in turns
                ],
                "source_material": case.get("source_material"),
            }
        else:
            user_query = turns[0]["content"] if turns else case.get("user_query", "")
            input_data = {
                "query": user_query,
                "source_material": case.get("source_material"),
            }

        row = {
            "case_key": case_key,
            "input": input_data,
            "expected_output": case.get("expected_output", ""),
            "metadata": {
                "skill": skill_name,
                "source_material": case.get("source_material", ""),
                "category": case.get("category", ""),
                "invoke_method": invoke_method,
                "case_name": case.get("name", case_key),
                "case_no": case_no,
            },
        }
        rows.append(row)

    rows.sort(key=lambda r: (r["metadata"]["case_no"] is None, r["metadata"]["case_no"] or 0, r["case_key"]))

    with open(jsonl_path, "w") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"[COMPILE] Wrote {len(rows)} rows to {jsonl_path}")
    return jsonl_path
