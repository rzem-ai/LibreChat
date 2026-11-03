---
name: deloitte-manual-test-drafter
description: >-
  Drafts new or updated manual test cases in the `manual testing suites/` JSON
  files from the changes in a pull request. Use when a PR changes user-visible
  behaviour, when asked to "add manual tests for this PR", or when completing
  the PR checklist item requiring updated test suites.
---

# Manual Test Drafter

Turns a PR's changes into manual test cases in `manual testing suites/`. Read
`manual testing suites/README.md` and `suite.schema.json` first; they define the
format and rules.

## Step 1 - Understand the change

1. Get the PR: `gh pr view <n> --json number,title,body,author,url` and
   `gh pr diff <n>`. With no PR number, use the current branch's PR, or the
   working-tree diff if none exists yet.
2. Work out the user-visible behaviour that changed. Prefer the PR description's
   "How should reviewers test" section, then the diff (`../../../client/src` for UI,
   locale strings in `client/src/locales/en/translation.json` for exact labels).
3. If the change has no user-visible behaviour (refactor, CI, docs), stop and say
   no manual test is needed.

## Step 2 - Choose the suite and look for an existing test

1. Pick the epic suite from the README table. Do not create release- or
   PR-named suites.
2. Search that suite and neighbouring ones for tests covering the same behaviour
   (`grep -i` on goal and step text for the feature's key nouns).
3. **Update an existing test** when it already covers the behaviour: edit its steps
   or criteria in place, keep its `id`.
4. **Add a new test** only for genuinely new behaviour, using the next free number
   for the suite's prefix.
5. **Create a new suite** only when the change introduces a genuinely new epic: a
   distinct user-facing feature area (its own entry point, settings or permissions)
   that no existing suite's title covers, and that will need several tests over
   time. Never create one for a single test, a release, a PR, a bug fix or a
   refactor; put those in the epic they affect. If unsure, add the test to the
   closest suite and flag the question in your summary. To create one:
   1. Confirm no suite in the README table already covers the area, and tell the
      user a new epic is being proposed.
   2. Add `<epic>.json`: a single-word lowercase file name, `$schema` set to
      `./suite.schema.json`, a `suite` title, and an `idPrefix` of uppercase
      letters that no other suite uses (see the README table). Start ids at
      `<PREFIX>-001`.
   3. Write the tests as in Step 3.
   4. Add the suite to the README "Suites" table (file, epic, prefix).
   5. Validate in Step 4, then check the generated sheet with
      `npm run manual-tests:collate` includes the new suite.

## Step 3 - Write the test

- `goal`: short title stating the purpose, phrased "Confirm that ..." (e.g. "Confirm that MyAssist Academy contains Release Notes and Common Questions tabs").
- `steps`: ordered `{ action, acceptanceCriteria[] }`. Use exact UI labels from the
  code. Put each observable expectation under the action that triggers it. Cover the
  happy path plus any permission or error behaviour the PR introduces (e.g. viewer
  vs editor).
- Include exact prompts, file types or accounts the tester needs.
- If the behaviour must hold on every model (or every model in a provider group), set `perModel` and use
  `{{MODEL_NAME}}` / `{{PROVIDER_NAME}}` instead of writing one test per model (see the README's
  "Per-model tests"). Use `perProvider` (only `{{PROVIDER_NAME}}`) when once per provider is enough. Never hard-code a
  model name in a test that should cover all models.
- Environment-neutral wording ("the environment under test").
- `dateUpdated`: today in `DD Mon YYYY`.
- `author`: `{ "name": <PR author login>, "url": "https://github.com/<login>" }`.
- `lastPr`: `{ "name": "#<n>", "url": <PR url> }`.

## Step 4 - Validate and report

1. Run `npm run manual-tests:validate` and fix any problems.
2. Summarise: tests added (id, goal), tests updated (id, what changed), and why no
   new test was added where an existing one was extended.
3. Recommend running `deloitte-manual-test-reviewer` on the touched suites.
