"""Collate every suite into one Excel sheet for a testing session: python collate.py [path]"""

from __future__ import annotations

import sys
from pathlib import Path

from excel import build_workbook
from specs import expand_per_model, load_model_specs, unmatched_per_model
from suites import load_suites, validate_suites

DEFAULT_OUTPUT = Path("manual-testing-session.xlsx")


def main(argv: list) -> int:
    output = Path(argv[1] if len(argv) > 1 else DEFAULT_OUTPUT).resolve()
    try:
        templates = load_suites()
    except ValueError as error:
        print(f"  - {error}", file=sys.stderr)
        return 1
    errors = validate_suites(templates)
    if errors:
        print("\n".join(f"  - {e}" for e in errors), file=sys.stderr)
        print(
            "\nFix the suites (npm run manual-tests:validate) before generating the sheet.",
            file=sys.stderr,
        )
        return 1
    specs = load_model_specs()
    unmatched = unmatched_per_model(templates, specs)
    if unmatched:
        print(
            f"WARNING: no model in librechat.yaml matches {', '.join(unmatched)}; these tests are not in the sheet.",
            file=sys.stderr,
        )
    suites = expand_per_model(templates, specs)
    output.parent.mkdir(parents=True, exist_ok=True)
    total = build_workbook(suites, output)
    print(f"Wrote {total} tests from {len(suites)} suites to {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
