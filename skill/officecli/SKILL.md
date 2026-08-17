---
name: officecli
description: Create, inspect, validate, and modify Word, Excel, and PowerPoint documents using the OfficeCLI binary in the code-execution sandbox.
---

# Office Documents

Use this skill for `.docx`, `.xlsx`, and `.pptx` work. The `officecli` binary is already installed in the code-execution sandbox; never install it or download dependencies.

## Workflow

1. Work only in `/mnt/data`.
2. Preserve uploaded source documents. Copy an input to a clearly named output file before editing it.
3. Inspect a document before modifying it. Use `officecli view`, `officecli get`, or `officecli query` with `--json` when structured output is useful.
4. Run `officecli help <format> <element>` before using unfamiliar properties or element paths. Do not guess flags or property names.
5. Prefer `officecli batch` for multiple related edits. It is atomic by default.
6. Before returning an edited or generated document, run:
   ```bash
   officecli validate /mnt/data/output.docx --json
   officecli view /mnt/data/output.docx issues --json
   ```
   Substitute the actual output path and format.

## Safe Commands

Use the standard document commands: `create`, `view`, `get`, `query`, `add`, `set`, `remove`, `move`, `swap`, `batch`, `merge`, `dump`, and `validate`.

Always quote paths containing brackets, for example:

```bash
officecli get /mnt/data/report.docx '/body/p[1]' --json
officecli get /mnt/data/deck.pptx '/slide[1]/shape[1]' --json
```

Examples:

```bash
cp /mnt/data/source.docx /mnt/data/revised-report.docx
officecli set /mnt/data/revised-report.docx '/body/p[1]' --prop text='Updated executive summary'
officecli validate /mnt/data/revised-report.docx --json
```

```bash
officecli create /mnt/data/analysis.xlsx
officecli set /mnt/data/analysis.xlsx /Sheet1/A1 --prop value='Metric' --prop bold=true
officecli set /mnt/data/analysis.xlsx /Sheet1/B1 --prop value='Value' --prop bold=true
officecli validate /mnt/data/analysis.xlsx --json
```

## Do Not Use

Do not run `officecli install`, `officecli mcp`, `officecli plugins`, `officecli watch`, or `officecli unwatch`. Do not start servers, install plugins, or use network tools. Do not use `raw-set` or `add-part` unless the standard document operations cannot complete the requested change.

The sandbox is ephemeral. Save all deliverable files under `/mnt/data` and state the resulting paths in the final response.
