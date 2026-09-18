---
name: deloitte-microsite
description: Generate a self-contained, Deloitte GEL-branded HTML page — a microsite (event, programme, project, training) or a smaller single-purpose asset (a one-page brief, an announcement, a CTA banner) — as one copy-paste .html file with real GEL design tokens, typography, and the official logo. Use this when the user asks to "create a Deloitte microsite", "build a landing page", "make an on-brand HTML page/asset", or wants a GEL-accurate alternative to a generic AI-generated page. Confirms purpose, audience, and sections before generating; brand colours and typography are fixed to GEL, not user-customisable.
---

# deloitte-microsite

Generate a self-contained Deloitte GEL-branded HTML page in one file. No
build step, no external CSS/JS beyond the Open Sans font request — the file
works by double-clicking it or dropping it on any static host.

This skill covers **microsites and standalone assets** — event pages,
programme/training sites, project recaps, one-page briefs, CTA banners. It
does not cover production application UI (that's `gel-design-review` in the
GEL platform repo) or data-heavy report pages with calculators/complex
charts (out of scope — the comparison-table pattern here covers simple
lookups only).

## Brand is fixed, not a per-site input

This skill does not ask the user to pick hex colours — GEL brand green,
radius, and type scale are constants, grounded directly in the actual GEL
design system (see `references/design-tokens.md` for provenance). Letting
each site invent its own palette while calling it "Deloitte-branded" is
itself a brand violation, so treat the token set as fixed and move straight
to composition and content.

## Workflow

### Step 1 — Intake (blocking)

Confirm before generating anything, in one consolidated message if not
already provided:

| Field | Question |
|---|---|
| Site/asset name | What is this called? |
| Purpose | Event, programme, training, project recap, internal tool docs, or a smaller single-purpose asset? |
| Audience | Internal Deloitte staff, client-facing, or public? |
| Primary action | What is the one thing a visitor should do or take away? |
| Stage | Early/internal share, or something that needs to be genuinely polished? |

Then work out which sections are actually needed — see
`references/composition-principles.md` before defaulting to a long list.
For a full microsite, offer this menu and let the user confirm, cut, or
reorder:

| # | Section | When to include |
|---|---|---|
| 1 | Nav | Always |
| 2 | Hero | Always |
| 3 | Overview / stats | Most sites — brief "what is this" plus real figures |
| 4 | Feature / card grid | 3–6 true-peer topics or capabilities |
| 5 | Timeline / schedule | Programmes, events with an ordered sequence |
| 6 | Team / speakers | Named contributors |
| 7 | Resources / links | Downloads, external references |
| 8 | Comparison table | Options/tiers that need exact side-by-side values |
| 9 | CTA band | Conversion — always present unless the hero CTA is the only ask |
| 10 | FAQ | Recurring questions |
| 11 | Footer | Always |
| 12 | Status callout | Rare — a specific warning/caveat that genuinely needs to interrupt reading, not general commentary dressed up in a coloured box |

For a smaller single-purpose asset, most of this list won't apply — build
from only the two or three blocks the content actually needs.

### Step 2 — Read the references

Read these in full before writing any HTML:

- `references/design-tokens.md` — the exact colours, radius, type scale, and
  logo rule. Non-negotiable.
- `references/composition-principles.md` — how to choose a structure that
  fits this content instead of defaulting to a template.
- `references/banned-patterns.md` — the reject list. Check output against
  it before delivering, not just while writing.

Then read only the needed blocks of `references/section-patterns.md` — skip
patterns for sections that aren't in this build.

### Step 3 — Assemble

1. Start from `assets/microsite-template.html` — it already has the correct
   token block, Open Sans loading, official logo in the nav, and base styles
   wired up. Don't recreate these from scratch. Note the real `Footer`
   component has no logo — only the nav does.
2. Replace `{{SECTIONS}}` with the concatenated section blocks from
   `section-patterns.md`, and `{{NAV_LINKS}}` with `<li><a href="#id">Label</a></li>`
   for each section — this only appears once now, in the nav. The footer's
   policy links (Privacy policy / Terms of use / Contact us) are separate,
   already in the template, and use their own `href="#"` placeholders — see
   step 5 of the verify checklist below.
3. Replace `{{SITE_TITLE}}`, `{{META_DESCRIPTION}}`, `{{SITE_TITLE_SHORT}}`
   (or delete the `.gel-nav__lockup` span if there's no product name),
   and `{{YEAR}}` with the current year.
4. Keep all CSS and JS inline — no external CDN links besides the Google
   Fonts request already in the template, no `<script src="...">`. If a
   section uses an icon, add the Material Symbols `<link>` from
   `references/design-tokens.md`'s Icons section to `<head>` — only then,
   not by default.
5. If a section genuinely needs a rule not in the template, add it under
   `{{SECTION_STYLES}}` reading only `--gel-*` tokens — never a raw hex
   value, and never a rule that duplicates something the template already
   provides.

### Step 4 — Apply copy and brand rules

- Sentence case throughout — headings, buttons, nav links. Never uppercase
  outside the badge role.
- No em dashes.
- Australian English: *organisation*, *optimise*, *programme*, *colour*,
  *behaviour*, *recognised*.
- One primary (filled, brand-green) button per section.
- Run the full list in `references/banned-patterns.md`.

### Step 5 — Verify before delivering

- [ ] No `{{TOKEN}}` placeholders left unreplaced.
- [ ] No hardcoded hex/rgb anywhere except the logo SVG's fixed dot fill
      (`#86BC25`) — every other colour is a `var(--gel-*)`.
- [ ] No uppercase outside `.gel-badge`.
- [ ] No gradients, no box-shadow beyond what's already in the template.
- [ ] No decorative left-border accent on a rounded box (reads as an alert,
      not a stat/card).
- [ ] Nav links resolve to real `#id` anchors that exist in `<main>`.
- [ ] `lang="en-AU"` on `<html>`, viewport meta present.
- [ ] Mobile nav toggle opens/closes; scroll-spy highlights the active link.
- [ ] Footer copyright line present verbatim, correct year, disclaimer text
      unedited (see `references/section-patterns.md` #11).
- [ ] Footer policy link URLs replaced with real destinations before a
      production/public launch (they ship as `href="#"` placeholders).
- [ ] `prefers-reduced-motion` block preserved.
- [ ] Every image has real `alt` text, or `alt=""` if decorative.

Tell the user the file path and that they can open it by double-clicking or
hosting it on any static server. Mention `#section-id` deep links work.

**Before a public or client-facing launch:** flag that `assets/deloitte-logo.svg`
— the canonical file the inlined nav/footer logos are copied from — is
sourced from a file the GEL repo itself marks as a placeholder
(`gel-design-review/assets/DeloitteLogo.tsx`). Recommend swapping
`deloitte-logo.svg` for the current production wordmark from Deloitte's
official brand asset source, preserving the same `fill="currentColor"`
treatment on the wordmark (needed so it stays legible on this template's
dark nav/footer) and never altering the green dot's fixed `#86BC25` fill —
then re-copying the updated markup into both inline spots in the template.

## Hard rules — quick reference

Full detail lives in `references/design-tokens.md` and
`references/banned-patterns.md`; this is the distilled version:

- **Font:** Open Sans only, loaded via the Google Fonts link already in the
  template. h1/h2 are weight 300 (light) — that's correct GEL styling.
- **Colour:** Only `--gel-*` tokens. Brand green (`--gel-primary`) is the
  sole interaction colour, never decorative. Destructive red only for
  irreversible actions (rare in a microsite).
- **Radius:** `--gel-radius: 0.4rem` and its derived scale. Never mix radii
  in one group, never a raw `border-radius: 0` or arbitrary value.
- **Dark sections:** apply `class="dark"` to the wrapper (nav, hero, footer,
  CTA) — never hand-author a separate dark palette.
- **Logo:** the official SVG, unmodified except the documented
  `currentColor` wordmark fix — never a text-plus-dot simulation.
- **Buttons:** text-only by default, sentence case, one primary per section.
- **Motion:** stillness by default; respect `prefers-reduced-motion`.

## Editing an existing deloitte-microsite output

- **Add a section** — insert the block from `section-patterns.md` in the
  right position; add its `<li><a></a></li>` to both nav instances.
- **Change content** — edit markup directly; never touch the `:root`/`.dark`
  token block or introduce a hex value.
- **Need a pattern not in `section-patterns.md`** — build from the existing
  primitives (`.gel-card`, `.gel-btn`, `.gel-grid-*`, `.gel-stat-strip`)
  before inventing a new class. If you do add one, name it `.gel-*` and
  document it in `section-patterns.md`.

## Related files

- `references/design-tokens.md` — canonical colours, radius, type scale,
  logo rule; refresh from the GEL repo's `packages/core/css/shadcn.css` /
  `packages/specs/design/DESIGN.md` if those change.
- `references/composition-principles.md` — how to choose structure, not just
  fill in a template.
- `references/banned-patterns.md` — the self-check reject list.
- `references/section-patterns.md` — the section block library.
- `assets/deloitte-logo.svg` — canonical logo file; the template's two
  inline copies must match it exactly.
- `assets/microsite-template.html` — the master skeleton.
