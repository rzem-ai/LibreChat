---
name: edit-or-create-document
description: Create, analyze, proofread, validate, and modify Office documents (.docx, .xlsx, .pptx) using OfficeCLI in the code-execution sandbox. Use for document inspection, formatting checks, tables, charts, and Office document edits.
---
# OfficeCLI

OfficeCLI is the document CLI for `.docx`, `.xlsx`, and `.pptx`. It is available in the code-execution sandbox. Use it through the existing Bash tool only.

## Prerequisites

This skill will only run successfully if the user has "Run Code" enabled. If the AI encounters issues with this skill, please ask the user to enable "Run Code", so the AI can access the code sandbox.

## Sandbox Rules

- Work only under `/mnt/data`.
- Never install OfficeCLI, run `npx`, use `curl`, or download dependencies. The binary is supplied by the sandbox image.
- Preserve uploaded source documents. Copy an input to a clearly named output file before editing it.
- The sandbox is ephemeral. Every deliverable must be saved under `/mnt/data` and named explicitly in the final response.
- OfficeCLI resident mode is disabled in this environment. Do not use `open`, `save`, or `close` to manage a persistent OfficeCLI session.
- Do not use `officecli watch`, `unwatch`, `goto`, `mark`, `unmark`, `get-marks`, `mcp`, or `plugins`. They require persistent processes, browser access, or unsupported runtime capabilities.
- Use `raw`, `raw-set`, or `add-part` only when normal document operations cannot complete the request.

## Workflow

1. Identify the input file in `/mnt/data` and create a separate output filename before changing an uploaded document.
2. Read or inspect before editing. Use `view`, `get`, or `query`.
3. Use `officecli help` before guessing command syntax, properties, element types, or paths.
4. Prefer L1 read operations, then L2 DOM operations. Use L3 raw OpenXML only as a last resort.
5. Use `batch` for multiple related mutations. It is atomic by default.
6. Validate every output document before returning it.

```bash
cp /mnt/data/source.docx /mnt/data/revised-report.docx
officecli view /mnt/data/revised-report.docx outline --json
officecli validate /mnt/data/revised-report.docx --json
officecli view /mnt/data/revised-report.docx issues --json
```

## Help System

Always ask OfficeCLI for exact schema details rather than inventing flags or properties.

```bash
officecli help
officecli help docx
officecli help docx paragraph
officecli help docx set paragraph
officecli help xlsx cell
officecli help pptx shape
officecli help pptx chart --json
```

Format aliases are `word` for `docx`, `excel` for `xlsx`, and `ppt` or `powerpoint` for `pptx`.

Use `--json` whenever command output will be consumed by a later command or needs reliable structured inspection.

## Addressing And Paths

OfficeCLI paths are 1-based unless a command explicitly documents otherwise. Quote every path containing brackets so Bash cannot expand it.

```bash
officecli get /mnt/data/report.docx '/body/p[3]' --depth 2 --json
officecli get /mnt/data/deck.pptx '/slide[1]/shape[2]' --depth 1 --json
officecli get /mnt/data/data.xlsx '/Sheet1/B2' --json
```

Prefer stable IDs returned by `get` over positional paths in multi-step edits. For example:

```text
/slide[1]/shape[@id=550950021]
/body/p[@paraId=1A2B3C4D]
```

## L1: Create, Read, And Inspect

```bash
officecli create /mnt/data/report.docx
officecli create /mnt/data/data.xlsx
officecli create /mnt/data/slides.pptx

officecli view /mnt/data/report.docx outline
officecli view /mnt/data/report.docx text --start 1 --end 50
officecli view /mnt/data/report.docx stats --json
officecli view /mnt/data/report.docx issues --json

officecli get /mnt/data/report.docx /body --depth 2 --json
officecli query /mnt/data/report.docx 'paragraph[style=Normal] > run[font!=Arial]' --json
officecli query /mnt/data/slides.pptx 'shape[fill=FF0000]' --json

officecli validate /mnt/data/report.docx --json
```

Useful `view` modes are `outline`, `stats`, `issues`, `text`, and `annotated`. `html` can be used only as a static inspection result; do not start a watch server.

## L2: Document Operations

Use `set` to modify an existing node:

```bash
officecli set /mnt/data/report.docx '/body/p[1]' --prop style=Heading1
officecli set /mnt/data/data.xlsx /Sheet1/A1 --prop value='Metric' --prop bold=true
officecli set /mnt/data/slides.pptx '/slide[1]/shape[2]' --prop text='Updated title'
```

Use `--find` and `--replace` for text replacement. The path controls the search scope.

```bash
officecli set /mnt/data/report.docx / --find draft --replace final
officecli set /mnt/data/report.docx '/body/p[1]' --find weather --prop bold=true --prop color=red
officecli set /mnt/data/slides.pptx / --find draft --replace final
```

Use `add` for new elements:

```bash
officecli add /mnt/data/report.docx /body --type paragraph \
  --prop text='Executive Summary' --prop style=Heading1

officecli add /mnt/data/slides.pptx / --type slide \
  --prop title='Q4 Report' --prop background=1A1A2E

officecli add /mnt/data/slides.pptx '/slide[1]' --type shape \
  --prop text='Revenue grew 25%' --prop x=2cm --prop y=5cm \
  --prop font=Arial --prop size=24 --prop color=FFFFFF
```

Other supported L2 operations include `remove`, `move`, `swap`, and `batch`.

Use `--prop` for all element properties. Do not invent top-level flags such as `--name`.

Value examples:

```text
Colors: FF0000, #FF0000, red, rgb(255,0,0), accent1
Spacing: 12pt, 0.5cm, 1.5x, 150%
Dimensions: 2.54cm, 1in, 72pt, 96px
```

## Atomic Batch Changes

Use a batch when a document needs several related changes. The default behavior is atomic: if any operation fails, the document is restored to its previous bytes.

```bash
officecli batch /mnt/data/data.xlsx --commands '[
  {"op":"set","path":"/Sheet1/A1","props":{"value":"Name","bold":"true"}},
  {"op":"set","path":"/Sheet1/B1","props":{"value":"Score","bold":"true"}},
  {"op":"set","path":"/Sheet1/A2","props":{"value":"Alice"}}
]' --json
```

Use `--best-effort` only when partial output is explicitly acceptable. Do not use it for normal user document edits.

## Format Guidance

### Word

Use `paragraph`, `run`, `table`, `row`, `cell`, `image`, `header`, `footer`, `section`, `bookmark`, `comment`, `footnote`, `endnote`, `hyperlink`, `style`, `toc`, and `watermark` where supported.

For text inserted in shell arguments, use single quotes when text contains `$`. Use `\\n` for literal line breaks in a CLI property value.

```bash
officecli add /mnt/data/report.docx '/body/p[1]' --type run \
  --after find:weather --prop text=' (sunny)'

officecli add /mnt/data/report.docx '/body/p[1]' --type table \
  --after 'find:First sentence.' --prop rows=2 --prop cols=2
```

### Excel

Use `sheet`, `row`, `col`, `cell`, `chart`, `image`, `comment`, `table`, `namedrange`, `validation`, `autofilter`, `sparkline`, and conditional-formatting operations where supported.

```bash
officecli set /mnt/data/data.xlsx /Sheet1/A1 --prop value='Name' --prop bold=true
officecli set /mnt/data/data.xlsx /Sheet1/B1 --prop value='Score' --prop bold=true
officecli set /mnt/data/data.xlsx /Sheet1/A2 --prop value='Alice'
officecli set /mnt/data/data.xlsx /Sheet1/B2 --prop value=95
officecli set /mnt/data/data.xlsx /Sheet1 --prop sort='B desc' --prop sortHeader=true
```

Excel row and column add operations use a 1-based `--index`; other `--index` uses are normally 0-based. Run `officecli help xlsx row` or `officecli help xlsx col` before modifying worksheet structure.

### PowerPoint

Use `slide`, `shape`, `picture`, `chart`, `table`, `row`, `connector`, `group`, `paragraph`, `run`, `notes`, `comment`, `transition`, and `animation` where supported.

Do not assume `shape[1]` is presentation content; it is often a title placeholder. Inspect the slide first and use the returned stable path.

```bash
officecli get /mnt/data/slides.pptx '/slide[1]' --depth 1 --json
officecli add /mnt/data/slides.pptx '/slide[1]' --type chart \
  --prop type=bar --prop x=1cm --prop y=3cm --prop w=20cm --prop h=10cm
```

## L3: Raw OpenXML

Use raw OpenXML only after confirming L2 cannot perform the requested operation. Inspect the relevant part first, make the smallest possible change, and validate immediately afterwards.

```bash
officecli raw /mnt/data/report.docx document.xml
officecli raw-set /mnt/data/report.docx document.xml \
  --xpath '//w:body/w:p[1]' --action replace --xml '<w:p>...</w:p>'
officecli validate /mnt/data/report.docx --json
```

## Validation And Delivery

Always run validation before returning an output file. Also inspect detected issues when the request involves formatting, proofreading, or editing an existing document.

```bash
officecli validate /mnt/data/output.docx --json
officecli view /mnt/data/output.docx issues --json
officecli view /mnt/data/output.docx outline --json
```

If validation fails, do not present the file as complete. Diagnose using `view issues`, `get`, `query`, or `help`, correct the smallest relevant operation, then validate again.

## Specialized Skills

OfficeCLI can provide additional local guidance using `officecli load_skill <name>`. Use the most specific one relevant to the document, and load only one skill per artifact.

```text
word              Reports, letters, memos, and proposals
academic-paper    Journal, conference, and thesis documents
pptx              General presentations
pitch-deck        Fundraising presentations only
morph-ppt         Morph-animated presentations
morph-ppt-3d      3D Morph presentations
excel             General workbooks, trackers, and formulas
financial-model   Financial models, projections, and scenarios
data-dashboard    Data-driven dashboards and KPI workbooks
```

Do not use `load_skill` to stack unrelated instructions. For two distinct Office artifacts, load the appropriate skill separately for each artifact.