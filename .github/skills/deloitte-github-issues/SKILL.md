---
name: deloitte-github-issues
description: >-
  Create GitHub issues in Deloitte-Australia/tt-librechat using the
  repository-specific assignee, label, and epic mappings defined in
  repo_config.yaml.
---

# Deloitte GitHub Issue Creator

Create GitHub issues for `Deloitte-Australia/tt-librechat` from user inputs.

## Required Reference

Read [repo_config.yaml](repo_config.yaml) in this directory before doing anything else. It is the source of truth for:

- the target repository;
- the supported issue labels;
- assignee display-name to GitHub login mappings;
- available epic parent issues;
- the configured GitHub account.

Do not invent or guess any of those mappings when the config is available.

## Workflow

### Step 1 - Read the input and config

Parse the user input into issue rows. Treat the first column as the issue title unless the user explicitly says otherwise.

If the user states a count that does not match the number of issue rows they provided, stop and ask which rows to create.

Read `repo_config.yaml` and use it for all normalization in later steps.

### Step 2 - Normalize labels, assignees, and epic parents

Use these label rules:

- `Alpha` -> `alpha patch`
- `Alpha Patch` -> `alpha patch`
- `Beta` -> `beta`
- `GA` -> `GA`
- `Could do` -> `backlog`

For assignees:

- split multiple names on `/`, `+`, `,`, `--`, or `and`;
- trim whitespace;
- map each name through `repo_config.yaml`;
- if the dev field is blank, leave the issue unassigned;
- if any name is missing from the config, stop and ask instead of guessing.

For epics:

- match the provided epic name against `repo_config.yaml`;
- treat the matched epic issue as the parent issue for the new child issue;
- if no epic mapping exists, stop and ask instead of creating an unlinked issue.

### Step 3 - Check for exact-title duplicates

Before creating anything, check whether an open or closed issue already exists with the exact same title in the target repository.

If an exact match exists, do not create a duplicate unless the user explicitly instructs you to.

### Step 4 - Create the issues

Create each issue in the configured repository with:

- the exact title from the input;
- the normalized label from Step 2;
- the mapped assignees, when present;
- a body that includes the parent epic and any metadata the user supplied, such as severity, ease, timing, dependencies, or requested developers.

Use this body shape unless the user provides a different template:

```md
**Parent epic:** #<epic_number>
**Severity:** <value if provided>
**Ease of implementation:** <value if provided>
**When:** <value if provided>
**Requested devs:** <value if provided>
**Dependencies:** <value if provided>
**Notes:** <value if provided>
```

Use the configured GitHub account from `repo_config.yaml` for non-interactive GitHub API or CLI operations when the available authentication supports account selection.

### Step 5 - Link the created issues back to the epic

After creating child issues for an epic, update the parent epic issue body to include a `## Child issues` section with checklist items in this form:

```md
- [ ] #123
```

If the section already exists, append only missing items. Do not duplicate existing checklist entries.

### Step 6 - Report the outcome

Return the created issue numbers and URLs. Also report any rows skipped because of duplicates, missing mappings, or user-directed omissions.

## Guardrails

- Use [repo_config.yaml](repo_config.yaml) as the authoritative repository mapping.
- Preserve user-provided issue titles verbatim unless the user asks for edits.
- Use non-interactive GitHub APIs or CLI commands.
- If credentials allow issue creation but not project access, say that plainly.
- Do not claim parent-epic linkage unless both the child issue and parent issue update were completed.

## Example Triggers

- "Create these 12 issues in tt-librechat."
- "Use the first column as the issue title and assign from the Devs column."
- "Create alpha patch issues and link them to the right epic."
