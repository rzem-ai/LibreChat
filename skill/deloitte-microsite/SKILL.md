---
name: deloitte-microsite
description: Generate self-contained, Deloitte-branded HTML microsites — responsive single-page or multi-section websites with the standard Deloitte green-dot identity, Open Sans typography, sticky navigation, hero, feature grids, timelines, CTA blocks, and footer. Use this skill when the user asks to "create a Deloitte microsite", "build a landing page", "generate a program/event/project site", "make an HTML website with Deloitte branding", or references the engineering-ai-training-2026 index.html style. Always confirms site purpose, color tokens, and required sections before generating.
---

# deloitte-microsite

Generate self-contained, Deloitte-branded HTML microsites in one file. Responsive, scrollable, no build step required — drop the file on any static host or double-click to preview locally.

## Workflow

Follow these steps in order.

### Step 1 — Intake: purpose and design tokens (BLOCKING)

Before generating any HTML, confirm the following. If not already provided, ask in **one** consolidated message.

#### 1a. Site purpose

| Field | Question |
|---|---|
| Site name / title | What is this microsite called? |
| Purpose | Program? Event? Training? Project? Internal tool docs? |
| Audience | Internal Deloitte staff, client-facing, or public? |
| Primary CTA | What is the single most important action a visitor should take? |

#### 1b. Design tokens

| Token | Purpose | Default |
|---|---|---|
| `BRAND` | Green dot color, accent bar, highlights | `#86BC25` |
| `BRAND_DARK` | Headings on light bg, hover states | `#046A38` |
| `ACCENT` | Secondary highlight (links, tags, badges) | `#00A3E0` |
| `DARK` | Dark header/footer background | `#000000` |
| `CHARCOAL` | Body text | `#222222` |
| `LIGHT_BG` | Off-white section backgrounds | `#F7F7F7` |
| `FONT_SANS` | Type stack | `'Open Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` |
| `SITE_TITLE` | Browser tab title | e.g. `Engineering AI Training 2026` |
| `ORG_LABEL` | Top-left nav label (brand mark) | e.g. `Deloitte` |

**Smart defaults:** if the user says "use Deloitte defaults" or doesn't specify colors, use the default column above verbatim and proceed.

### Step 2 — Confirm content sections

Establish which sections the site needs. Present this list and ask the user to confirm, remove, or reorder:

| # | Section | When to include |
|---|---|---|
| 1 | **Nav** | Always — sticky top navigation with logo and links |
| 2 | **Hero** | Always — full-width opening section with headline, sub, and CTA button |
| 3 | **Overview / About** | Most sites — 2-column text + stat row |
| 4 | **Feature / Card grid** | When there are 3–6 key topics, modules, or capabilities |
| 5 | **Timeline / Schedule** | Programs, events with a sequence of dates or steps |
| 6 | **Team / Speakers** | Named contributors with role and avatar placeholder |
| 7 | **Resources / Links** | Download links, external references |
| 8 | **CTA / Register** | Conversion block — prominent button and supporting copy |
| 9 | **Footer** | Always — links, Deloitte legal, copyright |

If the user has already described their content, infer the sections from context and skip this question.

### Step 3 — Read the references

Before generating the template, load these into context:

- `references/design-principles.md` — non-negotiable brand rules. Read in full.
- `references/section-patterns.md` — copy-paste HTML+CSS blocks for each section. Use the index — only read patterns you need.

### Step 4 — Assemble the microsite

1. Read `assets/microsite-template.html`.
2. Build the output file by:
   - Replacing all `{{TOKEN}}` placeholders in `:root` with the user's values.
   - Replacing `{{SITE_TITLE}}` with the browser tab name.
   - Replacing `{{ORG_LABEL}}` with the nav brand mark.
   - Replacing `{{NAV_LINKS}}` with `<a href="#section-id">Label</a>` links for each section used.
   - Replacing `{{SECTIONS}}` with the concatenated HTML blocks from `references/section-patterns.md`.
3. Keep all CSS and JS inline — no external CDN links, no `<link rel=stylesheet>`, no `<script src=...>`.

### Step 5 — Apply design rules to copy

While writing section content:

- **Headlines:** sentence case, light weight (300), one `<span class="accent">` per heading if an accent is appropriate.
- **Green dot:** append a `<span class="green-dot"></span>` after standalone words that complete a thought (section headers, list items, the brand mark).
- **Buttons:** square corners (`border-radius: 0`). Primary = `--brand` background + white text. Ghost = transparent + `--brand` border.
- **Cards:** 1px `--border` edge, no drop shadow on light bg. `box-shadow` only inside dark sections.
- **Australian English:** *organisation*, *optimise*, *programme*, *colour*.
- **No emoji.** Use inline SVG icons with `stroke="currentColor"` if iconography is needed.

### Step 6 — Verify before delivering

Run these mental checks:

- [ ] No external CDN links or `<script src=...>`.
- [ ] Navigation links resolve to valid `id` anchors in the page.
- [ ] CTA button has a meaningful `href` or `#cta` anchor.
- [ ] All colors come from `var(--)` tokens — no raw hex in markup.
- [ ] Mobile nav hamburger works (JavaScript toggle).
- [ ] `lang="en-AU"` on `<html>`.
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1.0">` present.
- [ ] Footer has `© {{YEAR}} Deloitte Touche Tohmatsu` copyright line.
- [ ] Green dot appears on brand mark in the nav.
- [ ] `prefers-reduced-motion` media query preserved.

Tell the user the file path and that they can open it by double-clicking or hosting on any static server. Mention that `#section-id` deep-links are supported.

## Editing existing microsites

When the user asks to modify a site this skill produced:

- **Add a section** → insert the section HTML block from `references/section-patterns.md` in the right position; add its `<a>` link to `<nav>`.
- **Change colors** → only edit the `:root` variables; never touch section markup.
- **Add a pattern not in `section-patterns.md`** → build from existing primitives (`.card`, `.grid-2/3`, `.stat`, `.pill`, `.btn`) before inventing new classes. If you do invent, document the pattern in `references/section-patterns.md`.
