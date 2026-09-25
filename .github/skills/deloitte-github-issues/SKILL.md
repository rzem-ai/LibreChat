---
name: deloitte-github-issues
description: >
  Create GitHub issues in Deloitte-Australia/tt-librechat using the
  repository-specific configuration defined in repo_config.yaml.
---

# Deloitte GitHub Issue Creator

Create and manage GitHub issues for `Deloitte-Australia/tt-librechat`.

## Required Reference

Read `repo_config.yaml` before doing anything else.

It is the authoritative source for:

- repository details
- labels
- assignee mappings
- expertise mappings
- epic definitions
- routing rules
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

Read `repo_config.yaml`.

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
2. Apply any matching routing rule.
3. Select the most appropriate epic.
4. Explain the routing decision.

If multiple epics are plausible:

- present the likely options;
- ask the user to choose.

Never create an issue with no epic unless the user explicitly requests it.

---

## Step 4 - Determine assignee

If the user specifies an assignee:

- map through the assignees section.

If the user does not specify an assignee:

1. Check applicable routing rules.
2. Use the epic default assignee.
3. Use expertise mappings to determine whether another configured specialist is a stronger fit.
4. Recommend the specialist and explain why.

If a user-supplied assignee cannot be found in configuration:

- stop and ask.

Never guess GitHub usernames.

---

## Step 5 - Normalize labels

Apply the configured label aliases.

Examples:

- Alpha → alpha patch
- Alpha Patch → alpha patch
- Beta → beta
- GA → GA
- Could do → backlog

If no matching label exists:

- ask the user.

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

Use this template unless another template is supplied:

```md
**Parent epic:** #<epic_number>

**Severity*** <value>
**Ease of implementation:** <value>
**When:** <value>
**Requested devs:** <value>
**Dependencies:** <value>

**Notes**
<notes>
```

Only include fields that were provided.

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

# Routing Guidance

When classifying issues automatically:

| Topic | Preferred Epic | Preferred Owner |
|---------|---------|---------|
| Agent Builder | Agents | Sunny |
| Agent Marketplace | Agents | Sunny |
| MCP Integrations | MCPs | Isabelle |
| Tool Calling | MCPs | Isabelle |
| Testing | Testing | Jyotin |
| Evaluation | Evaluation | Kosi |
| File Uploads | File Handling | Ishaq |
| Security | Security | Ally |
| Ways of Working | Ways of Working | Ally |
| Strategy | Strategy Work | Jack |
| Skill Uploads | Skills | Alleena |
| Skill Behaviour | Skills | Sunny |

Routing guidance can be overridden by explicit user instructions.

---

# Guardrails

- Preserve titles exactly.
- Never invent labels.
- Never invent epics.
- Never invent assignees.
- Never invent GitHub usernames.
- Always use repo_config.yaml as the source of truth.
- Explain routing decisions when done automatically.
- Report failures clearly.

---

# Example Triggers

- Create these 5 issues in tt-librechat.
- Create alpha patch issues and route them automatically.
- Create these issues and assign the best owner.
- Categorise these issues into epics and create them.
- Create backlog issues and link them to the correct epic.