"""Validate the manual testing suites: python validate.py"""

from __future__ import annotations

import sys

from specs import load_model_specs, unmatched_per_model
from suites import load_suites, validate_suites


def main() -> int:
    try:
        suites = load_suites()
    except ValueError as error:
        print(f"  - {error}", file=sys.stderr)
        return 1
    errors = validate_suites(suites)
    if errors:
        print("\n".join(f"  - {e}" for e in errors), file=sys.stderr)
        print(f"\n{len(errors)} problem(s) in manual testing suites", file=sys.stderr)
        return 1
    total = sum(len(suite["tests"]) for suite in suites)
    unmatched = unmatched_per_model(suites, load_model_specs())
    if unmatched:
        print(
            f"WARNING: no model in librechat.yaml matches {', '.join(unmatched)}; "
            "these tests would not appear in the sheet.",
            file=sys.stderr,
        )
    print(f"manual testing suites OK: {total} tests across {len(suites)} suites")
    return 0


if __name__ == "__main__":
    sys.exit(main())
