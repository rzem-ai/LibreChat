# Design tokens

Generated snapshot of the values needed for a standalone HTML export. Source
of truth is the Deloitte GEL platform repo — `packages/specs/design/DESIGN.md`
and `packages/core/css/shadcn.css`, read via the repo's `gel-design-review`
skill (`references/brand-standards.md`, `assets/gel-tokens.css`,
`assets/DeloitteLogo.tsx`). If those change, refresh this file to match —
this file is the copy, the GEL repo is the original.

All colors are OKLCH, matching the canonical CSS exactly. Every evergreen
browser (Chrome 111+, Safari 15.4+, Firefox 113+) supports `oklch()` natively
— do not convert to hex. Never introduce a color that isn't listed here.

## Color tokens

Declare all of these in `:root`. Every custom property is prefixed `--gel-`.

| Token | Light (`:root`) | Usage |
|---|---|---|
| `--gel-background` | `oklch(0.985 0 0)` | Page background |
| `--gel-foreground` | `oklch(0.145 0 0)` | Body text, headings |
| `--gel-surface-contrast` | `oklch(0.985 0 0)` (equal to background) | Only meaningful once flipped inside a `.dark` band — see below |
| `--gel-card` | `oklch(0.99 0 0)` | Card surfaces |
| `--gel-card-foreground` | `oklch(0.145 0 0)` | Text on card |
| `--gel-primary` | `oklch(0.5519 0.1748 140.7437)` | Deloitte brand green — the ONLY interaction color. Buttons, links, active states. |
| `--gel-primary-foreground` | `oklch(1 0 0)` | Text on primary |
| `--gel-primary-hover` | `oklch(0.45 0.1748 140.7437)` | Hover state for primary buttons/links |
| `--gel-primary-strong` | `oklch(0.507 0.1608 141.2369)` | Higher-contrast green for text/icons/thin strokes (~5:1 on light surfaces) — use this, never `--gel-primary`, when green needs to sit under body-text-sized copy |
| `--gel-secondary` | `oklch(0.94 0 0)` | Secondary buttons |
| `--gel-secondary-foreground` | `oklch(0.205 0 0)` | Text on secondary |
| `--gel-muted` | `oklch(0.948 0 0)` | Subtle backgrounds, striping |
| `--gel-muted-foreground` | `oklch(0.317 0 0)` | Secondary text, metadata, captions |
| `--gel-accent` | `oklch(0.95 0 0)` | Hover background for ghost/outline buttons |
| `--gel-accent-foreground` | `oklch(0.145 0 0)` (identical to `--gel-foreground`) | Text on a `--gel-accent` background — confirmed against `packages/core/css/shadcn.css` |
| `--gel-destructive` | `oklch(0.577 0.245 27.325)` | Irreversible actions ONLY — see banned-patterns.md |
| `--gel-border` | `oklch(0.80 0 0)` | Card/component borders |
| `--gel-ring` | `oklch(0.5 0.134 242.749)` | Focus ring — a neutral blue, deliberately not brand green |

### Status colors (info / success / warning / critical)

A separate token family for status communication — distinct from
`--gel-primary` (interaction) and `--gel-destructive` (irreversible
actions). Source: `packages/core/css/custom.css` in the GEL repo, imported
alongside `shadcn.css` — a real, documented extension, not the base token
file alone. (If you're checking this yourself: the base `shadcn.css` genuinely
doesn't have these — they live in the sibling `custom.css` file that extends
it. Check both before concluding a token doesn't exist.)

Naming convention, straight from that file's own comment: the bare name is a
**tinted surface** (background for a callout/alert/badge); the `-solid`
suffix is the **solid accent** (icon, indicator, or accent fill only — never
body text color).

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--gel-info` | `oklch(0.9438 0.0118 231.6565)` | `oklch(0.2555 0.0237 248.7749)` | Tinted background, informational callout |
| `--gel-info-solid` | `oklch(0.5552 0.1206 236.668)` | `oklch(0.7101 0.1146 238.8207)` | Icon/accent on an `--gel-info` background |
| `--gel-success` | `oklch(0.9533 0.0191 140.5005)` | `oklch(0.2776 0.0445 144.2604)` | Tinted background, success callout |
| `--gel-success-solid` | `oklch(0.5519 0.1748 140.7437)` | `oklch(0.6514 0.1842 140.073)` | Icon/accent on a `--gel-success` background |
| `--gel-warning` | `oklch(0.9618 0.0186 62.4562)` | `oklch(0.2713 0.0235 72.1722)` | Tinted background, warning callout |
| `--gel-warning-solid` | `oklch(0.6553 0.1684 51.444)` | `oklch(0.7972 0.1638 69.6155)` | Icon/accent on a `--gel-warning` background |
| `--gel-critical` | `oklch(0.95 0.019 25.6)` | `oklch(0.2445 0.0321 19.6391)` | Tinted background, critical/error callout |
| `--gel-critical-solid` | `oklch(0.5746 0.2126 29.553)` | `oklch(0.6403 0.2125 28.7793)` | Icon/accent on a `--gel-critical` background |

Usage rules:

- **Never as body text color.** These exist for callouts/alerts/badges —
  not for coloring a paragraph or heading.
- **A `-solid` icon only appears on its own matching tinted background** —
  `--gel-warning-solid` on `--gel-warning`, never sitting directly on the
  page background. With no tinted background, an icon uses `currentColor`
  (inherit), not a status color — see `banned-patterns.md`.
- **Sparingly.** A page where every callout is a different status color
  reads as noise, not signal. Reserve these for genuine status
  communication (an actual RAG/warning/error state), never as decoration.
- **`--gel-success` is not a substitute for `--gel-primary`.** Success is a
  *status* (this thing succeeded); primary is *brand interaction* (this is
  clickable). `--gel-success-solid` and `--gel-primary` happen to be the
  identical green in light mode — that's a coincidence of this palette, not
  permission to use them interchangeably.
- **`--gel-critical` is distinct from `--gel-destructive`**, per the source
  file's own comment. `--gel-destructive` is for irreversible *actions*
  (delete/remove buttons); `--gel-critical` is for a *status* callout
  (a critical/error state being reported, not a button being pressed).

### `.dark` — the scoped dark-band mechanism

GEL's dark mode is not a page-level light/dark toggle for this skill's
purposes — it's a **scoped override class**. Apply `class="dark"` to a
single wrapper element (a header, hero, footer, or CTA band) and everything
inside that subtree that reads the tokens above flips to its dark
equivalent, automatically, with no separate hand-authored dark palette:

```css
.dark {
  --gel-background: oklch(0.145 0 0);
  --gel-foreground: oklch(0.985 0 0);
  --gel-surface-contrast: oklch(0 0 0); /* pure black — true contrast band */
  --gel-card: oklch(0.205 0 0);
  --gel-card-foreground: oklch(0.985 0 0);
  --gel-primary: oklch(0.5519 0.1748 140.7437); /* unchanged — brand green never shifts */
  --gel-primary-foreground: oklch(1 0 0);
  --gel-primary-hover: oklch(0.45 0.1748 140.7437);
  --gel-primary-strong: oklch(0.6514 0.1842 140.073);
  --gel-secondary: oklch(0.269 0 0);
  --gel-secondary-foreground: oklch(0.985 0 0);
  --gel-muted: oklch(0.269 0 0);
  --gel-muted-foreground: oklch(0.708 0 0);
  --gel-accent: oklch(0.269 0 0);
  --gel-accent-foreground: oklch(0.985 0 0);
  --gel-destructive: oklch(0.704 0.191 22.216);
  --gel-border: oklch(0.28 0 0);
  --gel-ring: oklch(0.5 0.134 242.749);
  background: var(--gel-surface-contrast); /* .dark paints itself — see below */
  color: var(--gel-foreground);
}
```

This is the one and only mechanism for a "dark section" (nav, hero, footer,
CTA band). Never hand-author a second palette (no `--dark`, `--charcoal`,
`--gray-mid`, etc.) — every dark surface in the page must be a `.dark`-scoped
element whose children read the same `--gel-*` names as the light page.
`--gel-primary` is identical in both blocks on purpose — the brand green
never changes with theme.

**`.dark` paints itself — `background`/`color` are part of the class, not a
separate step.** Earlier versions of this template left painting to a
component-specific rule (mirroring the real `Header`/`Footer` components,
which apply `dark`, `bg-surface-contrast`, and `text-foreground` as three
separate Tailwind utilities: `packages/core/brand-components/src/
{header,footer}/*.tsx`). That's correct for a real utility-class system, but
in a hand-authored static file it's an easy step to forget — it happened
twice while building this skill (the footer first, then the hero and CTA
band silently stayed on the light background). Folding the paint into
`.dark` itself removes that failure mode: any element with `class="dark"` is
always a correctly-painted contrast band, full stop. Never add a second,
component-specific `background`/`color` override for a dark band — if one
exists, delete it and rely on `.dark`.

## Radius

Base `--gel-radius: 0.4rem`. Derive the rest with `calc()`, never a raw value:

| Token | Value | Usage |
|---|---|---|
| `--gel-radius-sm` | `0.125rem` | Small indicators |
| `--gel-radius-md` | `0.25rem` | Buttons, inputs, badges |
| `--gel-radius-lg` | `0.4rem` | Cards, larger surfaces |
| `--gel-radius-xl` | `0.625rem` | Pills, chips |
| `--gel-radius-full` | `9999px` | Circular avatars, status dots |

Never mix radii within one component group (e.g. don't put a `lg`-radius
card next to an `xl`-radius card in the same grid).

## Layout width

Two different width rules, don't conflate them:

- **`.gel-container`** — `max-width: 96rem` (1536px, Tailwind's
  `max-w-screen-2xl`) + horizontal padding, centred. Use this for the actual
  page content inside `<main>` (every section pattern in
  `section-patterns.md` wraps its content in `.gel-container`).
- **`.gel-full-bleed`** — horizontal padding only, no `max-width`. Use this
  for the nav and footer's content wrapper. The real `Header`/`Footer`
  components are `"mx-auto w-full px-*"` with no `max-w-*` class at all
  (`packages/core/brand-components/src/{header,footer}/*.tsx`) — their
  content spans the full page width, only the page's own sections get a
  reading-width constraint. Don't put `.gel-container` on a nav/footer
  wrapper; that under-fills the chrome relative to a wide viewport.

## Logo lockup divider

The vertical line between the logo and an optional product-title lockup
(`.gel-nav__divider`) must be a dedicated element with an explicit
`height: 1.5rem` (24px, matching the logo) — never a `border-left` on the
lockup text span itself. A border on the text ties the divider's height to
the text's line-height (24px font at a normal line-height renders ~33px
tall), which reads as visibly oversized next to the 24px logo. This mirrors
`DeloitteLogoLockup`'s real structure: a dedicated `<Separator
orientation="vertical">` inside a fixed `h-6` (24px), `items-stretch`
container — not a border property on the title.

## Typography

Font stack: `"Open Sans", ui-sans-serif, system-ui, -apple-system, sans-serif`.
Load Open Sans from Google Fonts (see the template's `<head>`); the fallback
stack keeps the page legible if the request fails or is blocked, it just
won't be pixel-identical.

Monospace (code, identifiers, SKUs, timestamps only — never prose):
`ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` at
`0.875rem` (14px), weight 400, line-height 1.5.

### Type scale

| Token | Size | Line-height |
|---|---|---|
| `--gel-text-xs` | `0.75rem` (12px) | 1.25 |
| `--gel-text-sm` | `0.875rem` (14px) | 1.25 |
| `--gel-text-base` | `1rem` (16px) | 1.5 |
| `--gel-text-lg` | `1.125rem` (18px) | 1.5 |
| `--gel-text-xl` | `1.25rem` (20px) | 1.375 |
| `--gel-text-2xl` | `1.5rem` (24px) | 1.375 |
| `--gel-text-3xl` | `1.875rem` (30px) | 1.2 |
| `--gel-text-4xl` | `2.25rem` (36px) | 1.2 |
| `--gel-text-5xl` | `3rem` (48px) | 1.167 |
| `--gel-text-6xl` | `3.75rem` (60px) | 1.167 |

### Semantic roles — use these weights exactly, they are NOT the old skill's values

| Role | Size | Weight | Letter-spacing | Notes |
|---|---|---|---|---|
| Hero display | `clamp(var(--gel-text-4xl), 6vw, var(--gel-text-6xl))` | 300 (light) | `-0.025em` | The one full-bleed hero headline only |
| `h1` | `--gel-text-4xl` (36px) | **300** (light) | `-0.025em` | Page title. Light, not bold — this is deliberate GEL styling, not a mistake |
| `h2` | `--gel-text-3xl` (30px) | **300** (light) | `-0.02em` | Section headline |
| `h3` | `--gel-text-2xl` (24px) | **400** (normal) | `-0.025em` | Card/sub-section title |
| `h4` | `--gel-text-xl` (20px) | **600** (semibold) | normal | Nested structure |
| Lead | `--gel-text-xl` (20px) | 400 | normal | One short orientation paragraph, `--gel-muted-foreground` |
| Body | `--gel-text-base` (16px) | 400 | normal | 1.5 line-height, max `68ch` |
| Small | `--gel-text-sm` (14px) | 400 | normal | Captions, secondary copy |
| Label | `--gel-text-xs` (12px) | 400 | normal | `--gel-muted-foreground`, form labels, metadata |
| Badge/chip text | `--gel-text-xs` (12px) | 700 | `0.06em`, uppercase | The ONLY place uppercase is allowed — see banned-patterns.md |
| Button label | `--gel-text-sm` (14px) | **400** | normal, sentence case | No uppercase, no letter-spacing. See the note directly below — the raw CVA class list says `font-medium` (500), but that is NOT what actually renders |
| Logo lockup title | `--gel-text-2xl` (24px) | 400 (normal) | `-0.025em` | Matches `DeloitteLogoLockup` exactly — NOT bold, NOT small. Its `tracking-[-0.6px]` at 24px works out to the same `-0.025em` used for `h1`/`h3` |

**A trap in the button weight specifically:** `packages/core/ui/src/vendor/button.tsx`'s raw CVA class list literally includes `font-medium` (500) — if you check only that file, 500 looks correct, and this skill briefly had that wrong value for exactly this reason. But the actual exported `Button` (`packages/core/ui/src/button/button.tsx`, the proxy every app imports) always layers a `typographyVariants({variant: "small"})` class on top, which resolves to `"font-normal text-sm"` (`packages/core/ui/src/typography/typography.tsx`) — `font-normal` = 400, and it wins the merge over the base CVA's `font-medium`. Confirmed directly against the real rendered output (`apps/web/public/registry/component-html.json`), which shows `font-weight: var(--font-weight-normal)` for every button variant. If you're re-verifying this yourself: reading the vendor CVA alone will mislead you into 500 — check the proxy component and the rendered output, not just the base variants file.

Weights available: 400, 500, 600, 700 (plus 300 "light", used specifically
for `h1`/`h2`/hero display per the table above — Open Sans ships a light
weight and GEL's own semantic mapping uses it there).

## Buttons

Six variants, matching the real Button component exactly. Confirmed
directly against its rendered output — `apps/web/public/registry/
component-html.json` (generated portable HTML per variant), cross-checked
with the CVA in `packages/core/ui/src/vendor/button.tsx` and the GEL-specific
overrides in `packages/core/ui/src/button/button.tsx`. Not guessed, not
carried over from the old skill's invented values.

| Variant | Class | Background | Text | Border | Hover |
|---|---|---|---|---|---|
| Default (primary) | `.gel-btn--primary` | `--gel-primary` | `--gel-primary-foreground` | none | background → `--gel-primary-hover` |
| Secondary | `.gel-btn--secondary` | `--gel-secondary` | `--gel-secondary-foreground` | none | background fades to 80% opacity |
| Destructive | `.gel-btn--destructive` | `--gel-destructive` | `--gel-primary-foreground` (white — reuses this token rather than inventing a new one; the real component hardcodes `#fff`, which is exactly what `--gel-primary-foreground` already resolves to) | none | background fades to 90% opacity |
| Outline | `.gel-btn--outline` | `--gel-background` | `--gel-primary-strong` | `--gel-primary-strong` | background → `--gel-accent`, text → `--gel-accent-foreground` — border colour does NOT change |
| Ghost | `.gel-btn--ghost` | transparent | inherit | none | background → `--gel-accent`, text → `--gel-accent-foreground` |
| Link | `.gel-btn--link` | transparent | `--gel-primary-strong` | none | underline only, no background/color change |

Fixed dimensions, all variants except link (which has no box — just
underlined inline text): `height: 2.25rem` (36px), `padding: 0 1rem`,
border-radius: var(--gel-radius-md)`, `gap: 0.5rem` (for an optional
leading/trailing icon), `font-size: var(--gel-text-sm)`, **weight 400**.

**Size:** default is correct almost everywhere. `.gel-btn--lg` (stack it
with a variant class, e.g. `gel-btn gel-btn--primary gel-btn--lg`) matches
the real component's "lg" size exactly (`component-html.json`'s Large
variant): `height: 2.5rem` (40px), `padding: 0 1.5rem`, `gap: 0.5rem` —
label stays 14px, only the box grows. Reserve it for a hero's CTA pair and
the CTA band, where the default 36px height reads as undersized next to a
display headline — everywhere else (cards, resources, inline actions), the
default size is correct and `--lg` would look oversized for its context.

**Mistakes this skill made before fixing them against the real component —
don't reintroduce them:**

- **Outline does NOT fill solid green on hover.** It gets the same subtle
  `--gel-accent` tint as ghost, keeping its green border but losing its
  green text (text goes to `--gel-accent-foreground`). An earlier version
  of this template inverted this into a solid green fill with white text,
  which is a materially different (and wrong) interaction.
- **Ghost's hover is a subtle `--gel-accent` tint, not an inverted
  foreground/background swap.** An earlier version made ghost hover flip to
  a solid black-fill/white-text look — much more dramatic than the real
  component's quiet tint.
- **Button text weight is 400 (regular), not 500 or 600.** Confirmed
  directly from the rendered output's `font-weight: var(--font-weight-normal)`
  — a "primary" or "featured" action does not get a bolder weight in GEL.
- **Destructive, secondary, and link are real variants — not an incomplete
  set.** "Primary, outline, ghost" is not the full picture; reach for
  destructive on a genuinely destructive action (cancel a registration,
  remove an item), secondary for a lower-emphasis alternative to primary,
  and link for an inline text action that shouldn't look like a button box.
- **Every `:hover` rule must re-declare `color`, even when it isn't
  changing.** These buttons are `<a>` elements, and the page-wide
  `a:hover { color: var(--gel-primary-hover) }` rule beats a bare
  `.gel-btn--primary` class for the `color` property specifically (higher
  specificity once `:hover` is added to the comparison). Without an
  explicit re-declaration on the button's own `:hover` rule, this silently
  repaints the label green on hover regardless of variant — on the primary
  button this produced dark-green text on a dark-green background, failing
  contrast outright. Check any new variant or hover state against this.
- **The default hero button pairing is primary + outline, not primary +
  ghost.** Ghost is for a genuinely low-emphasis secondary action (e.g.
  "Skip for now"), not the default second CTA beside a hero's primary
  button.

## Logo

The canonical file is `assets/deloitte-logo.svg` — the exact Deloitte
wordmark path data, originally read from `DeloitteLogo.tsx` in the GEL repo
(itself flagged there as a placeholder pending the real production asset),
with one deliberate change: the wordmark path uses `fill="currentColor"`
instead of the source's hardcoded `fill="#000"`, so it stays legible on
this skill's dark nav/footer/hero bands. The dot's fill (`#86BC25`) is fixed
and must never change.

This is the one deliberate exception to "no hardcoded hex" anywhere in this
skill: reproducing a locked brand asset byte-for-byte is not the same as
styling a page surface. Never simulate the mark with a text string plus a
decorative `border-radius: 50%` dot span — that is a lookalike, not the
logo, and must not appear anywhere.

`assets/microsite-template.html` inlines this same file's markup directly
(twice — nav and footer) so the exported page stays a single `.html` file
with no external asset reference. If `deloitte-logo.svg` is ever updated
(e.g. swapped for the real production asset), re-copy its markup into both
inline spots in the template — they must always match the canonical file
exactly.

## Icons

GEL's real icon components (`@deloitte-australia/gel-ds-icons/material-icon`
and `.../material-symbol`, used directly in `apps/web/components/custom/
site-header.tsx` — e.g. `<MaterialSymbol name="help" size={20}
variant="outlined" />`) are Google's **Material Symbols**, not hand-drawn
SVGs. Prefer them over inventing custom icon artwork whenever a section
actually needs an icon.

Material Symbols ships as a variable font, so it loads exactly like Open
Sans — a Google Fonts CSS request, no JS icon library, no SVG sprite sheet.
Only add this link if a section genuinely uses an icon; don't include it by
default on an icon-free page.

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" referrerpolicy="no-referrer">
```

```css
.gel-icon {
  font-family: 'Material Symbols Outlined';
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
  font-size: 1.25rem; /* 20px — matches the real component's size={20} default */
  line-height: 1;
  vertical-align: middle;
  color: inherit; /* current foreground — NOT --gel-primary. See banned-patterns.md: an icon is informational, not a button, and green means "clickable." */
}
```

Usage — the element's text content is the icon's programmatic name, which
the font substitutes for a glyph:

```html
<span class="gel-icon" aria-hidden="true">download</span>
```

This does NOT apply to the mobile nav toggle's hamburger/close icon or the
skip-link mechanics in `assets/microsite-template.html` — those are
functional UI chrome already hand-coded as inline SVG and shouldn't gain a
mandatory font dependency just for a control every page needs regardless of
whether it uses content icons. Reserve Material Symbols for *content* icons
(feature cards, resource list items, inline affordances) — see
`references/section-patterns.md`.

## Spacing

Use a plain 4px-based scale (`0.25rem` increments — `0.5rem`, `0.75rem`,
`1rem`, `1.5rem`, `2rem`, `3rem`, `4rem`...) rather than arbitrary values.
GEL doesn't publish a dedicated spacing token scale beyond this; don't
invent one.

**Use `rem`, not `px`, for anything that should scale with a user's font-size
preference** — spacing, component dimensions (nav height, icons, avatars,
toggle buttons), container `max-width`, and `@media` breakpoints. A `px`
breakpoint or a fixed-`px` root ignores a user's browser/OS accessibility
text-size setting; `rem` scales with it. Convert at a 16px root (`1rem =
16px`) — e.g. a 768px breakpoint is `48rem`.

**`px` is still correct** for: border/outline stroke widths (a 1–2px hairline
doesn't need to scale), the `--gel-radius-full: 9999px` token (matches the
documented GEL value exactly — it's a "large enough to force a circle/pill"
trick, not a real dimension), and the two standard accessibility techniques
that specifically require pixel values — `.gel-visually-hidden`'s `1px`/
`-1px` and a skip-link's `-9999px` off-screen offset. Never set an explicit
`font-size` in pixels on `html` — leave the root alone so `rem` actually
tracks the user's preference instead of a fixed number.
