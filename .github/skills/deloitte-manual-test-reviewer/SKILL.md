---
name: deloitte-manual-test-reviewer
description: >-
  Reviews the manual test suites in `manual testing suites/` for accuracy,
  duplication and quality, typically after new tests are drafted. Use after
  running deloitte-manual-test-drafter, when asked to "review the manual tests",
  or before generating the Excel sheet for a testing session.
---

# Manual Test Reviewer

Reviews suites for correctness against the codebase and for duplication. Read
`manual testing suites/README.md` first. Default scope is the suites changed on
the current branch (`git diff --name-only origin/develop -- "manual testing suites"`);
review all suites if asked.

## Checks

1. **Mechanical**: run `npm run manual-tests:validate`; fix or report every error.
2. **Duplication**: for each new or changed test, search all suites for the same
   goal, overlapping steps or the same acceptance criteria. Recommend merging into
   the older test (keep its `id`) rather than keeping both.
3. **Accuracy against the code**: for each step, confirm UI labels, menu paths,
   routes and settings still exist (`client/src`, `client/src/locales/en/translation.json`,
   `librechat.yaml`). Flag renamed or removed controls and outdated expected values
   (model names, counts such as "24 steps", tab names).
4. **Quality**: every test has at least one specific, observable acceptance
   criterion; steps are ordered and self-contained; prerequisite state (roles, shared
   items, files) is stated; no hostnames or environment-specific wording; the test
   sits in the right epic.
5. **Metadata**: `dateUpdated` is bumped for changed tests; `author` and `lastPr`
   point at the last relevant PR (`null` is only acceptable for tests migrated from
   the old spreadsheet).

## Output

Report findings grouped by test id with the problem and a proposed fix. Apply
clearly mechanical fixes (typos, stale labels you verified) directly; propose
merges, deletions and rewrites for the user to approve rather than doing them
silently. Finish by re-running `npm run manual-tests:validate`.
