---
name: release-notes
description: Generate release notes for a UAT (develop) → MAIN merge in this repo — a technical "Release Summary" for the GitHub PR description plus a simplified, user-facing announcement. Use when the user asks to "generate release notes", "write the release summary", "draft release notes for the merge", or says they're "merging UAT into main" / "develop into main" and wants notes for it. Takes an optional PR number or version string via $ARGUMENTS.
---

# /release-notes — UAT (develop) → MAIN release notes

Produces two documents for a `develop` → `main` release merge:

1. **GitHub Release Notes** — the technical PR description. Grouped by
   feature area, written for engineers/PMs, includes stats and PR/commit
   references.
2. **Simplified User-Facing Release Notes** — a friendly announcement for
   end users of MyAssist. No jargon, no file/function names, no PR numbers,
   no purely internal items. These should be need-to-know only. Include the 
   key highlights a user would be interested in, not trivial items.

Both follow the structure of the real example from PR #1128
("Merge: Develop into Main (7.0.2)") — lead with a one-line summary per
section, emoji + bold theme headers, most user-impactful themes first,
internal/infra stuff last (and dropped entirely from the user-facing doc).

## Step 1 — resolve context

```bash
origin_url=$(git remote get-url origin)   # e.g. git@github.com:Deloitte-Australia/tt-librechat.git
git fetch origin main develop --quiet
```

Derive the `OWNER/REPO` slug from `origin_url` for `gh` calls below.

Find the last release that actually landed on `main` and when it landed:

```bash
last_tag=$(git tag --merged origin/main | sort -V | tail -1)
last_tag_date=$(TZ=UTC git log -1 --date=format-local:'%Y-%m-%dT%H:%M:%SZ' --format=%ad "$last_tag")
```

Propose the next version by bumping `last_tag`'s patch number (e.g.
`v7.0.2` → `v7.0.3`). **Confirm the version with the user** rather than
assuming — whether it's a patch/minor/major bump is a product decision,
not something derivable from the diff. If `$ARGUMENTS` already contains a
version string, use that instead of asking.

## Step 2 — find the merge PR

```bash
gh pr list --repo <owner/repo> --base main --head develop --state open \
  --json number,url,title
```

- If `$ARGUMENTS` names a PR number, use it directly.
- If exactly one open PR is found, use it.
- If multiple open PRs are found, show their numbers and titles and ask the
  user which one to use.
- If none exists yet, proceed without a PR link (placeholder `PR #TBD`) and
  tell the user you'll need the number once they open it — don't invent one.

## Step 3 — gather the raw changes

Stats for the summary line:

```bash
git diff --shortstat "$last_tag"..origin/develop
git rev-list --count "$last_tag"..origin/develop
```

Full commit log in range, oldest first — **do not add `-n`/`--max-count`,
`| head`, or any other truncation here.** The entire range is the point of
the exercise; a summary built from only the newest N commits silently
drops everything earlier in the release (easy to do by accident on a
400+ commit release):

```bash
git log "$last_tag"..origin/develop --reverse --format='%h %s'
git rev-list --count "$last_tag"..origin/develop   # total commit count — your accounting target
```

Pull PR numbers out of *every* subject in that full log (`Merge pull
request #1234 from ...` and inline `(#1234)` references — not just the
most recent ones), then fetch their titles/bodies in one batch rather
than one `gh pr view` per PR. Use `--paginate` so `gh` walks every page
instead of stopping at its default page size — a release of 400+ commits
easily has 100+ merged PRs, well past one page, and a fixed `--limit`
quietly truncates to "whatever fit":

```bash
gh api --paginate "repos/<owner/repo>/pulls?state=closed&base=develop&per_page=100" \
  | jq -s --arg since "$last_tag_date" \
    '[.[][] | select(.merged_at != null and .merged_at > $since) | {number, title, body, mergedAt: .merged_at, url: .html_url}]'
```

Use the full commit log as the coverage ledger: verify that every PR number
extracted from a subject has fetched metadata, and classify every remaining
commit as either represented by one of those PRs or a direct commit. Fetch
metadata for any missing PR number directly before writing; do not compare
the number of PRs with the commit count because one PR can contain multiple
commits.
write the notes from a partial set because "the first page looked like
enough."

**If the range is large (roughly >60 commits or >30 PRs)**, don't try to
read every PR body inline — dispatch a subagent (Explore or
general-purpose) with the commit log and PR list above, and ask it to
return a structured list of `{area, summary, prRefs[]}` entries. Do the
thematic grouping and writing yourself from that structured output; don't
let the subagent write the final prose, since tone/grouping is the part
that needs judgment.

Noise to recognize and collapse, not list individually:
- `Update Docker image tag with develop tag` (repeated commits)
- dependency bumps with no behavior change (`chore: bump <pkg>`)
- merge commits that just fold a feature branch into `develop` (the
  feature's own commits already cover the change)

## Step 4 — categorize into themes

Group the real changes into feature-area sections, each `## <emoji>
<Theme Name>`. Pick emoji/theme names that fit what's actually in this
range — don't force-fit last release's categories (MyAssist Academy,
Connectors & MCP, Citations, Web Search, Skills) if this release touched
different areas. Order sections roughly by user impact — flagship
features first, routine maintenance last.

Always end the technical doc with a catch-all `## ⚙️ Internal /
Infrastructure` section for: security hardening with no user-visible
behavior change, CI/test changes, dependency/Docker bumps, and other
routine commits. Say "no functional changes" explicitly for pure noise
items — don't make them sound like features.

For each bullet, describe the **user-visible effect**, not the
implementation — "Citations no longer get corrupted inside code blocks,"
not "fixed anchor offset calculation in citation parser." Pull the "why"
from the PR body/title when available; fall back to the commit subject
only when no PR is found for it.

If a user-facing bullet would need a specific UI detail you can't verify
from commits/PR bodies alone (e.g. exactly which button or menu something
lives behind), write it without that detail and flag it to the user as
"needs verification" rather than inventing a location.

## Step 5 — write the GitHub Release Notes (technical)

Read `references/github-release-notes-example.md` (the real v7.0.2 PR
#1128 body) before writing, and match its shape exactly — heading levels,
emoji-prefixed theme headers, bullet tone, and the `Internal /
Infrastructure` catch-all as the last section.

Template:

```markdown
# Release Summary: v<version>

PR [#<number>](https://github.com/<owner/repo>/pull/<number>) — Merge: Develop into Main (<version>)
<N> commits, <M> files changed, `develop` → `main`.

## <emoji> <Theme>
- <bullet>
- <bullet>

## ⚙️ Internal / Infrastructure
- <bullet>
```

If no PR exists yet, write `PR #TBD — Merge: Develop into Main (<version>)`
and note it needs the number filled in once opened.

## Step 6 — write the Simplified User-Facing Release Notes

Read `references/user-facing-notes-example.md` (the real v7.0.2 version
of this doc) before writing, and match its shape exactly — header line,
the "📢 General" intro sentence, plain section headers with no `##`
markdown, and the terse, instructional bullet style.

Template:

```markdown
# 🚀 MyAssist NextGen Platform Update: New Improvements Ready for Testing! (v<version>)
📢 General We've just released a range of enhancements to improve MyAssist NextGen! Here's what's new 👇

<emoji> <Theme>
- <one or two plain-English sentences per item, no PR numbers, no file names>
```

Rules for this doc:
- Drop the Internal/Infrastructure section entirely — nothing in it is
  user-facing by definition.
- Drop any bullet that's purely internal (security hardening, refactors,
  test infra) even if its theme section otherwise survives.
- Prefer instructive phrasing ("Enable web search in Anthropic Global
  models") over changelog phrasing ("Native web search can now be
  toggled per model") when the audience is end users deciding whether to
  try something.
- Keep it shorter than the technical doc — consolidate related bullets
  into one sentence where the real doc split them for precision.

## Step 7 — deliver

Present both documents in the chat response as markdown. Do **not**
automatically push either document anywhere:

- If the user wants the technical doc applied to the PR description,
  that's `gh pr edit <number> --body-file <file>` — confirm with the user
  first since it changes a shared, visible artifact, then run it.
- If they want the user-facing notes posted somewhere (Slack, Teams,
  email), ask where and confirm before sending — this skill only drafts
  content, it doesn't have a standing integration to post through.
