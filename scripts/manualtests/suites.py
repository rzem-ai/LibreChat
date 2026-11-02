"""Loading and validating the manual testing suites."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List

from specs import PLACEHOLDERS, WHERE_KEYS, placeholders_in

SUITES_DIR = Path(__file__).resolve().parents[2] / "manual testing suites"
SCHEMA_FILE = "suite.schema.json"
DATE_RE = re.compile(r"^\d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$")
ID_RE = re.compile(r"^([A-Z]+)-\d{3,}$")

Suite = Dict[str, Any]


def load_suites(directory: Path = SUITES_DIR) -> List[Suite]:
    def load(path: Path) -> Suite:
        try:
            return {"file": path.name, **json.loads(path.read_text(encoding="utf-8"))}
        except json.JSONDecodeError as error:
            raise ValueError(f"{path.name}: invalid JSON ({error})") from error

    files = sorted(p for p in directory.glob("*.json") if p.name != SCHEMA_FILE)
    return [load(path) for path in files]


def _non_empty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_link(value: Any) -> bool:
    if value is None:
        return True
    return (
        isinstance(value, dict)
        and _non_empty(value.get("name"))
        and isinstance(value.get("url"), str)
        and value["url"].startswith("https://")
    )


def _validate_step(step: Any, where: str) -> List[str]:
    if not isinstance(step, dict) or not _non_empty(step.get("action")):
        return [f'{where}: step needs a non-empty "action"']
    criteria = step.get("acceptanceCriteria")
    if isinstance(criteria, list) and all(_non_empty(c) for c in criteria):
        return []
    return [f'{where}: "acceptanceCriteria" must be an array of non-empty strings']


def _validate_repeat(test: Dict[str, Any], where: str) -> List[str]:
    used = placeholders_in(test)
    has_model, has_provider = "perModel" in test, "perProvider" in test
    key = "perModel" if has_model else "perProvider"
    config = test.get(key)
    where_config = config.get("where") if isinstance(config, dict) else None
    bad_keys = (
        [k for k in (where_config or {}) if k not in WHERE_KEYS]
        if isinstance(where_config, dict)
        else []
    )
    errors = [
        f"{where}: unknown placeholder {{{{{p}}}}}"
        for p in used
        if p not in PLACEHOLDERS
    ]
    errors += (
        [f'{where}: use either "perModel" or "perProvider", not both']
        if has_model and has_provider
        else []
    )
    errors += [
        f'{where}: {key}.where key "{k}" must be one of {", ".join(WHERE_KEYS)}'
        for k in bad_keys
    ]
    invalid = (
        (has_model or has_provider)
        and config is not True
        and not isinstance(where_config, dict)
    )
    errors += (
        [f'{where}: "{key}" must be true or {{ "where": {{ ... }} }}']
        if invalid
        else []
    )
    configured = has_model or has_provider
    errors += (
        [f"{where}: {key} test must use {{{{MODEL_NAME}}}} or {{{{PROVIDER_NAME}}}}"]
        if configured and not used
        else []
    )
    provider_uses_model = has_provider and "MODEL_NAME" in used
    errors += (
        [f"{where}: perProvider tests cannot use {{{{MODEL_NAME}}}}"]
        if provider_uses_model
        else []
    )
    errors += (
        [f'{where}: placeholders require "perModel" or "perProvider"']
        if not configured and used
        else []
    )
    return errors


def _validate_test(test: Any, suite: Suite, seen: Dict[str, str]) -> List[str]:
    test = test if isinstance(test, dict) else {}
    test_id = test.get("id")
    where = f"{suite['file']} {test_id or '<no id>'}"
    match = ID_RE.match(test_id) if isinstance(test_id, str) else None
    duplicate = (
        [f"{where}: duplicate id (also in {seen[test_id]})"] if test_id in seen else []
    )
    seen.setdefault(test_id, suite["file"])
    raw_steps = test.get("steps")
    steps = raw_steps if isinstance(raw_steps, list) else []
    has_criterion = any(
        isinstance(s, dict) and s.get("acceptanceCriteria") for s in steps
    )
    errors = duplicate
    errors += [] if match else [f"{where}: id must look like PREFIX-001"]
    errors += (
        [f"{where}: id prefix must be {suite.get('idPrefix')}"]
        if match and match.group(1) != suite.get("idPrefix")
        else []
    )
    errors += [] if _non_empty(test.get("goal")) else [f'{where}: missing "goal"']
    errors += (
        []
        if DATE_RE.match(str(test.get("dateUpdated")))
        else [f'{where}: "dateUpdated" must be DD Mon YYYY']
    )
    errors += (
        []
        if _is_link(test.get("author"))
        else [f'{where}: "author" must be null or {{ name, url }}']
    )
    errors += (
        []
        if _is_link(test.get("lastPr"))
        else [f'{where}: "lastPr" must be null or {{ name, url }}']
    )
    errors += [] if steps else [f"{where}: needs at least one step"]
    for index, step in enumerate(steps, 1):
        errors += _validate_step(step, f"{where} step {index}")
    errors += _validate_repeat(test, where)
    errors += (
        [] if has_criterion else [f"{where}: needs at least one acceptance criterion"]
    )
    return errors


def validate_suites(suites: List[Suite]) -> List[str]:
    seen: Dict[str, str] = {}
    errors: List[str] = []
    for suite in suites:
        tests = suite.get("tests")
        tests = tests if isinstance(tests, list) else []
        errors += (
            []
            if _non_empty(suite.get("suite"))
            else [f'{suite["file"]}: missing "suite"']
        )
        errors += (
            []
            if re.match(r"^[A-Z]+$", str(suite.get("idPrefix") or ""))
            else [f'{suite["file"]}: "idPrefix" must be uppercase letters']
        )
        errors += [] if tests else [f"{suite['file']}: needs at least one test"]
        for test in tests:
            errors += _validate_test(test, suite, seen)
    return errors
