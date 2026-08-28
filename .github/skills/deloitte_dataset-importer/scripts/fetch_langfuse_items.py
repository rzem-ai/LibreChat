#!/usr/bin/env python3
"""Fetch new Langfuse dataset items for the dataset importer skill.

Run this from the project root so `load_dotenv()` can read the workspace `.env`.
It filters out items that were previously synced from `eval_cases.yaml` and
writes the remaining items to `/tmp/langfuse_items.json`.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from langfuse import Langfuse


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skill-name",
        required=True,
        help="Skill directory name used to build the eval dataset name.",
    )
    parser.add_argument(
        "--output",
        default="/tmp/langfuse_items.json",
        help="Path to write the fetched Langfuse items JSON.",
    )
    return parser


def main() -> int:
    args = build_argument_parser().parse_args()

    load_dotenv(override=True)
    host = (
        os.getenv("EVAL_LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_BASE_URL") or ""
    ).strip()
    if not host:
        raise ValueError(
            "Langfuse host is empty. Set EVAL_LANGFUSE_BASE_URL or LANGFUSE_BASE_URL."
        )
    os.environ["LANGFUSE_BASE_URL"] = host
    os.environ["EVAL_LANGFUSE_BASE_URL"] = host
    langfuse = Langfuse(host=host)

    dataset_name = f"evals/{args.skill_name}"
    dataset = langfuse.get_dataset(name=dataset_name)

    new_items = []
    for item in dataset.items:
        meta = item.metadata or {}
        if meta.get("skill") and meta.get("case_name"):
            continue
        new_items.append(item)

    print(f"Found {len(new_items)} new items (out of {len(dataset.items)} total)")

    if not new_items:
        print("Nothing to import. Exiting.")
        return 0

    output = [
        {
            "id": item.id,
            "input": item.input,
            "expected_output": item.expected_output,
            "metadata": item.metadata,
        }
        for item in new_items
    ]

    output_path = Path(args.output)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Saved {len(output)} items to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
