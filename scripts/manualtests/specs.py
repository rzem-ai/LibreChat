"""Model specs from librechat.yaml and per-model / per-provider test expansion."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

LIBRECHAT_YAML = Path(__file__).resolve().parents[2] / "librechat.yaml"
PLACEHOLDERS = ("MODEL_NAME", "PROVIDER_NAME")
WHERE_KEYS = ("name", "group", "endpoint", "webSearch")
PLACEHOLDER_RE = re.compile(r"\{\{([A-Z_]+)\}\}")

Spec = Dict[str, Any]
Test = Dict[str, Any]
Suite = Dict[str, Any]


def load_model_specs(file: Path = LIBRECHAT_YAML) -> List[Spec]:
    config = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
    specs = (config.get("modelSpecs") or {}).get("list") or []
    return [
        {
            "name": spec.get("name"),
            "label": spec.get("label"),
            "group": spec.get("group"),
            "endpoint": (spec.get("preset") or {}).get("endpoint"),
            "webSearch": ((spec.get("details") or {}).get("supports") or {}).get(
                "webSearch"
            )
            is True,
        }
        for spec in specs
    ]


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else [value]


def matches_where(spec: Spec, where: Optional[Dict[str, Any]] = None) -> bool:
    return all(
        spec.get(key) in _as_list(expected) for key, expected in (where or {}).items()
    )


def placeholders_in(test: Test) -> List[str]:
    text = json.dumps([test.get("goal"), test.get("steps")])
    return PLACEHOLDER_RE.findall(text)


def repeat_config(test: Test) -> Optional[Dict[str, Any]]:
    """The test's perModel / perProvider setting as {unit, where}, or None."""
    for key, unit in (("perModel", "model"), ("perProvider", "provider")):
        value = test.get(key)
        if value:
            return {"unit": unit, "where": {} if value is True else value.get("where")}
    return None


def _fill(text: str, spec: Spec) -> str:
    return text.replace("{{MODEL_NAME}}", spec["label"]).replace(
        "{{PROVIDER_NAME}}", spec["group"]
    )


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _instantiate(test: Test, spec: Spec, suffix: str) -> Test:
    base = {k: v for k, v in test.items() if k not in ("perModel", "perProvider")}
    return {
        **base,
        "id": f"{test['id']} / {suffix}",
        "goal": _fill(test["goal"], spec),
        "steps": [
            {
                "action": _fill(step["action"], spec),
                "acceptanceCriteria": [
                    _fill(c, spec) for c in step["acceptanceCriteria"]
                ],
            }
            for step in test["steps"]
        ],
    }


def _first_per_provider(specs: List[Spec]) -> List[Spec]:
    first: Dict[str, Spec] = {}
    for spec in specs:
        first.setdefault(spec["group"], spec)
    return list(first.values())


def _expand_test(test: Test, specs: List[Spec]) -> List[Test]:
    config = repeat_config(test)
    if config is None:
        return [test]
    matching = [spec for spec in specs if matches_where(spec, config["where"])]
    if config["unit"] == "model":
        return [_instantiate(test, spec, spec["name"]) for spec in matching]
    return [
        _instantiate(test, spec, _slug(spec["group"]))
        for spec in _first_per_provider(matching)
    ]


def expand_per_model(suites: List[Suite], specs: List[Spec]) -> List[Suite]:
    """Replace each perModel / perProvider test with one test per matching model spec / provider group."""
    return [
        {
            **suite,
            "tests": [t for test in suite["tests"] for t in _expand_test(test, specs)],
        }
        for suite in suites
    ]


def unmatched_per_model(suites: List[Suite], specs: List[Spec]) -> List[str]:
    """Ids of repeated tests whose `where` filter matches no model spec (they would vanish from the sheet)."""

    def unmatched(test: Test) -> bool:
        config = repeat_config(test)
        return config is not None and not any(
            matches_where(s, config["where"]) for s in specs
        )

    return [
        test["id"] for suite in suites for test in suite["tests"] if unmatched(test)
    ]
