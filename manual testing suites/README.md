# Manual testing suites

Version-controlled functional tests for manual testing sessions (UAT, beta patch sign-off). There is
one JSON file per epic. Every test lives in exactly one suite.

| Command | Purpose |
|---|---|
| `npm run manual-tests:validate` | Check every suite against the rules below |
| `npm run manual-tests:collate [path]` | Collate all suites into one Excel sheet (default `./manual-testing-session.xlsx`) |
| `npm run test:manual-tests` | Unit tests for the validator and the Excel generator |

Skills: `deloitte-manual-test-drafter` drafts or updates tests from a PR, and
`deloitte-manual-test-reviewer` reviews suites for accuracy and duplicates afterwards.

## Suites

| File | Epic | ID prefix |
|---|---|---|
| `core.json` | Core Chat Experience | `CORE` |
| `history.json` | Message History & Branching | `HIST` |
| `tools.json` | Tools (Artifacts, Code Interpreter) | `TOOLS` |
| `models.json` | Models & Model Specs | `MODEL` |
| `mcp.json` | MCP Connectors | `MCP` |
| `skills.json` | Skills | `SKILL` |
| `agents.json` | Agents & Agent Builder | `AGENT` |
| `files.json` | Files (upload, file search, document Q&A) | `FILES` |
| `settings.json` | Settings | `SETTING` |
| `memory.json` | Memory | `MEMORY` |
| `prompts.json` | Prompts Library | `LIBRARY` |
| `projects.json` | Projects | `PROJECTS` |
| `sidebar.json` | Conversations, Sidebar & Bookmarks | `CSB` |
| `websearch.json` | Web Search | `WEB` |
| `academy.json` | MyAssist Academy | `ACADEMY` |
| `admin.json` | Admin Panel | `ADMIN` |
| `ux.json` | General UX, Branding & Auth | `UXERR` |

Fixes and beta-patch changes belong in the epic they affect, not in a release-specific suite. Add a new
suite file only for a genuinely new epic, and add it to the table above.

## Template

The machine-readable definition is [`suite.schema.json`](./suite.schema.json).

```json
{
  "$schema": "./suite.schema.json",
  "suite": "Skills",
  "idPrefix": "SKILL",
  "tests": [
    {
      "id": "SKILL-014",
      "goal": "View access for shared skill",
      "dateUpdated": "02 Nov 2026",
      "author": { "name": "afulton_deloitte", "url": "https://github.com/afulton_deloitte" },
      "lastPr": { "name": "#1850", "url": "https://github.com/Deloitte-Australia/tt-librechat/pull/1850" },
      "steps": [
        { "action": "Ensure the target skill has been shared with \"Viewer\" permissions.", "acceptanceCriteria": [] },
        {
          "action": "Open the Skills side panel and click on the skill.",
          "acceptanceCriteria": ["The skill opens", "There is no Edit button"]
        }
      ]
    }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | `PREFIX-NNN`, unique across all suites, prefix matches the suite's `idPrefix`. Never reuse or renumber an id. |
| `goal` | Short title: the purpose of the test. |
| `dateUpdated` | Human readable `DD Mon YYYY` (e.g. `02 Nov 2026`). Bump it whenever the test changes. |
| `author` | `{ name, url }` for the author of the last relevant PR. `null` only for tests migrated from the old spreadsheet. |
| `lastPr` | `{ name, url }` for the last relevant PR (`name` like `#1850`). `null` only for migrated tests. |
| `steps` | Ordered `{ action, acceptanceCriteria[] }`. Each criterion states what the tester must observe after that action. Every test needs at least one criterion. |

## Writing good tests

- Update an existing test when a PR changes behaviour it already covers; add a new one only for new behaviour.
- Do not duplicate: search the suite (and neighbouring suites) for the same goal or steps first.
- Write steps a tester unfamiliar with the feature can follow, and make criteria observable and specific.
- Keep environment-neutral: say "the environment under test", not a hostname.

## Excel sheet

`npm run manual-tests:collate` produces one row per test with these columns: Test Suite, Test ID, Goal,
Testing Steps, Date Updated, Author, Last PR, Comments, Overall Result, then `Tester 1` to `Tester 20`
(testers replace the header with their name).

- **Tester cells** start as `not started` with a dropdown (`not started`, `skipped`, `minor bug`,
  `major bug`, `pass`) coloured white, grey, amber, red and green respectively.
- **Overall Result** is a formula over that row's tester cells: any `major bug` gives `major bug`, otherwise any
  `minor bug` gives `minor bug`, otherwise two or more `pass` gives `pass`, otherwise `insufficient testers`.
  It has the same dropdown and colours (white, green, amber, red).
