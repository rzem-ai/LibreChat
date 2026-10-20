---
name: deloitte-github-issues
description: >
  Create GitHub issues in Deloitte-Australia/tt-librechat using the
  repository-specific configuration defined in repo-config.yaml.
---

# Deloitte GitHub Issue Creator

Create and manage GitHub issues for `Deloitte-Australia/tt-librechat`.

## Required Reference

Read `repo-config.yaml` before doing anything else.

It is the authoritative source for:

- repository details
- labels
- assignee mappings
- expertise mappings
- epic definitions
- GitHub account configuration

Do not invent values when configuration exists.

---

# Workflow

## Step 1 - Read the input

Parse the user's request into issue rows.

Assume:

- the first column is the issue title unless otherwise stated;
- each row represents one issue;
- user-provided values take precedence over inferred values.

If the user specifies a count that does not match the supplied rows, stop and ask for clarification.

---

## Step 2 - Load configuration

Read `repo-config.yaml`.

Normalise:

- labels
- assignees
- epic selection
- GitHub usernames

using the configuration only.

---

## Step 3 - Determine the epic

If the user explicitly specifies an epic:

- match it against the configured epic list;
- use that epic.

If no epic is specified:

1. Compare the issue title and description against epic keywords.
2. Select the most appropriate epic.
3. Explain the routing decision.

If multiple epics are plausible:

- present the likely options;
- ask the user to choose.

Never create an issue with no epic unless the user explicitly requests it.

---

## Step 4 - Determine assignee

If the user specifies an assignee:

- map through the assignees section.

If the user does not specify an assignee:

1. Use the epic default assignee.
2. Use expertise mappings to determine whether another configured specialist is a stronger fit.
3. Recommend the specialist and explain why.

If a user-supplied assignee cannot be found in configuration:

- stop and ask.

Never guess GitHub usernames.

---

## Step 5 - Normalize labels

Resolve each requested label against the `labels` section of `repo-config.yaml`.

- Match case-insensitively on the config key (for example `bug`, `Bug` and `BUG` all resolve to `bug`).
- Apply the mapped value exactly as written, including emoji and spacing (for example `bug` → `🐛 bug`).
- Apply only labels that exist in the config.

If a requested label has no match in the config:

- do not create or guess a label;
- list the unmatched labels and ask the user how to proceed.

---

## Step 6 - Check for duplicates

Before creating an issue:

- search open issues;
- search closed issues.

If an exact title match exists:

- report the existing issue;
- do not create a duplicate unless explicitly requested.

---

## Step 7 - Create the issue

Create the issue with:

- title
- body
- labels
- assignees

Use the exact user-provided title.

Use this template unless another template is supplied.

Inputs, taken from the user's report:

- `submitter_email` - who reported it
- `date_reported` - when it was reported
- `feedback_type` - the type of feedback
- `feedback_topic` - the details of the feedback
- `severity_desirability` - the severity or desirability

Output only the complete issue body in markdown, ready to paste into GitHub. Do not add any pre-amble or post-amble.

````md
## Summary
**Issue description:**  
[Add a clear summary of the issue]

**Severity / Desirability:**  
[Repeat from submission]

## Details
**Background / context:**  
[Add any relevant context]

**Observed behaviour:**  
[Describe what is happening now]

**Expected behaviour:**  
[Describe what should happen instead]

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## User quotes
### Quote 1
- **Date:** [DD/MM/YYYY]
- **Email:** [user@example.com]
- **Quote:** “[Insert user quote]”

### Quote 2
- **Date:** [DD/MM/YYYY]
- **Email:** [user@example.com]
- **Quote:** “[Insert user quote]”
````

Only include the User quotes section if quotes are available. Never invent quotes, dates or emails.

---

## Step 8 - Link issue to epic

After issue creation:

1. Open the parent epic.
2. Locate the `## Child Issues` section.
3. Create the section if it does not exist.
4. Add the new issue checklist item.

Example:

```md
## Child Issues

- [ ] #123
```

Do not duplicate existing entries.

---

## Step 9 - Report outcome

Summarise:

- created issues
- issue numbers
- issue URLs
- routed epic
- assigned owners
- labels applied

Also report:

- duplicates skipped
- unresolved mappings
- failed updates

Do not claim epic linkage unless the parent issue update succeeded.

---

# Guardrails

- Preserve titles exactly.
- Never invent labels.
- Never invent epics.
- Never invent assignees.
- Never invent GitHub usernames.
- Always use repo-config.yaml as the source of truth.
- Explain routing decisions when done automatically.
- Report failures clearly.

---

# Example Triggers

- Create these 5 issues in tt-librechat.
- Create alpha patch issues and route them automatically.
- Create these issues and assign the best owner.
- Categorise these issues into epics and create them.
- Create backlog issues and link them to the correct epic.