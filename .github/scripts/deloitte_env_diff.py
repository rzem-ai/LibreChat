#!/usr/bin/env python3
"""Write a markdown report of differences between two env files.

Usage:
    python .github/scripts/deloitte_env_diff.py [--base .env.example] [--other .env.deloitte]
                             [--out env-diff.md] [--show-values]

Values are redacted by default since the files may contain secrets.
Commented-out assignments (`# KEY=value`) are tracked as "commented".
"""

import argparse
import re
from pathlib import Path

ASSIGN = re.compile(r"^\s*(#\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")


def parse(path: Path) -> dict[str, tuple[bool, str]]:
    """Map KEY -> (is_active, value). Active assignments win over commented ones."""
    result: dict[str, tuple[bool, str]] = {}
    for line in path.read_text().splitlines():
        match = ASSIGN.match(line)
        if not match:
            continue
        commented, key, value = (
            bool(match.group(1)),
            match.group(2),
            match.group(3).strip(),
        )
        if commented and key in result:
            continue
        result[key] = (not commented, value)
    return result


def fmt(entry: tuple[bool, str], show: bool) -> str:
    active, value = entry
    shown = (value or "(empty)") if show else ("<set>" if value else "(empty)")
    return f"`{shown}`" + ("" if active else " _(commented)_")


def table(rows: list[tuple[str, ...]], headers: tuple[str, ...]) -> list[str]:
    if not rows:
        return ["_None_", ""]
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return lines + [""]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=".env.example")
    parser.add_argument("--other", default=".env.deloitte")
    parser.add_argument("--out", default="env-diff.md")
    parser.add_argument("--show-values", action="store_true")
    args = parser.parse_args()

    base, other = parse(Path(args.base)), parse(Path(args.other))
    show = args.show_values

    only_base = sorted(base.keys() - other.keys())
    only_other = sorted(other.keys() - base.keys())
    changed = sorted(k for k in base.keys() & other.keys() if base[k] != other[k])

    out = [
        f"# Env diff: `{args.base}` vs `{args.other}`",
        "",
        f"- Keys in `{args.base}`: {len(base)}",
        f"- Keys in `{args.other}`: {len(other)}",
        f"- Only in `{args.base}`: {len(only_base)}",
        f"- Only in `{args.other}`: {len(only_other)}",
        f"- Different: {len(changed)}",
        "",
        f"## Only in `{args.other}`",
        "",
        *table([(f"`{k}`", fmt(other[k], show)) for k in only_other], ("Key", "Value")),
        f"## Only in `{args.base}` (missing from `{args.other}`)",
        "",
        *table([(f"`{k}`", fmt(base[k], show)) for k in only_base], ("Key", "Value")),
        "## Different values / active state",
        "",
        *table(
            [(f"`{k}`", fmt(base[k], show), fmt(other[k], show)) for k in changed],
            ("Key", args.base, args.other),
        ),
    ]
    Path(args.out).write_text("\n".join(out))
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
