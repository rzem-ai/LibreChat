---
name: deloitte-github-issues
description: >
  Create and manage GitHub issues in Deloitte-Australia/tt-librechat
  using the repository configuration defined in repo_config.yaml.
---

# Deloitte GitHub Issue Creator

Create one or more GitHub issues for the configured repository.

## Required Reference

Read `repo_config.yaml` before performing any action.

It is the authoritative source for:

- repository information
- label mappings
- assignee mappings
- expertise mappings
- epic definitions

Do not invent values when configuration exists.

---

# Supported Inputs

Accept issue requests in any reasonable format, including:

- plain language instructions
- bullet lists
- numbered lists
- spreadsheets
- tables
- CSV data
- markdown content
- copied GitHub issues
- documents containing issue descriptions

Extract one or more issue candidates from the user's input.

Do not assume a specific structure or input format.

---

# Workflow

## Step 1 - Understand the Request

Identify all issues the user wants created.

For each issue, extract any available information such as:

- title
- description
- notes
- requested assignee
- requested developers
- severity
- priority
- labels
- dependencies
- timing
- epic
- acceptance criteria

If information is not provided, continue using the available data.

---

## Step 2 - Load Configuration

Read `repo_config.yaml`.

Use configuration values for:

- repository selection
- label mapping
- assignee mapping
- expertise matching
- epic routing

Configuration always takes precedence over assumptions.

---

## Step 3 - Determine Epic

Each issue MUST have a parent issue (AKA epic).

f the user specifies an epic:

- validate it against configuration.

If the user does not specify an epic:

1. Compare issue content against epic keywords.
2. Apply matching routing rules.
3. Select the most appropriate epic.
4. Explain the routing decision.

If multiple epics are equally likely:

- ask the user before creating issues.

Do not silently assign an ambiguous epic.

---

## Step 4 - Determine Assignee

If the user specifies an assignee:

- map that person through the configured assignee list.

If the user does not specify an assignee:

1. Apply routing rules.
2. Use the epic default assignee.
3. Consider expertise mappings.
4. Select the most appropriate configured owner.

Explain automatic assignment decisions.

Never invent GitHub usernames.

---

## Step 5 - Add Labels

Labels are not required. Only add one if relevant.

---

## Step 6 - Check for Duplicates

Before creating any issue:

- search open issues
- search closed issues

If an exact title already exists:

- report the duplicate
- skip creation unless the user explicitly requests otherwise

---

## Step 7 - Create Issue

Create issues using the provided information.

Use the exact title supplied by the user.

Unless a different template is requested, use:

```md
**Parent Epic:** #<epic_number>

**Severity:** <value>
**Priority:** <value>
**Ease of Implementation:** <value>
**Dependencies:** <value>

## Notes

<user notes>
```

Only include fields that have values.

---

## Step 8 - Link to Epic

After issue creation:

1. Open the parent epic.
2. Locate the `## Child Issues` section.
3. Create it if required.
4. Add a checklist item for each new issue.

Example:

```md
## Child Issues

- [ ] #123
```

Do not duplicate existing entries.

---

## Step 9 - Report Outcome

Provide a summary including:

- created issues
- issue numbers
- URLs
- selected epic
- assignees
- labels

Also report:

- duplicates skipped
- invalid mappings
- unresolved ambiguity
- failed updates

Only report successful epic linkage when both:
- the issue was created
- the parent epic was successfully updated

---

# Routing Principles

When classification is required:

1. Follow explicit user instructions.
2. Apply routing rules.
3. Match against epic keywords.
4. Use expertise mappings.
5. Use epic defaults as the final fallback.

User instructions always take precedence.

---

# Guardrails

- Preserve issue titles if clear.
- Never invent labels.
- Never invent epic mappings.
- Never invent GitHub usernames.
- Never invent repository information.
- Use repo_config.yaml as the system of record.
- Explain automated routing decisions.
- Clearly report failures and skipped items.
- Prefer asking over making uncertain assumptions.

---

# Example Requests

- Create these GitHub issues.
- Turn these bugs into GitHub issues.
- Create backlog items from this workshop output.
- Create all issues described in this document.
- Categorise these issues and create them.
- Create and link these issues to the appropriate epics.