# Banned patterns

Named so they're easy to recognise and reject, not just vague taste. Each
entry says what to do instead. Run this list as a self-check before
delivering any output.

## Colour

- **No hardcoded hex/rgb/hsl in page or section CSS.** Every colour comes
  from a `--gel-*` token in `design-tokens.md`. The single exception is the
  logo SVG's own fixed fill values — that's reproducing a locked asset, not
  styling a surface.
- **No second accent colour.** `--gel-primary` is the only interaction
  colour. Don't add a blue "info" tag or a purple "premium" highlight.
  Static/decorative elements use foreground or muted tokens, never primary —
  primary signals "this is clickable."
- **No default green on icons.** A content icon (feature card, resource
  list) is informational, not a button — it defaults to `color: inherit`
  (see `.gel-icon` in `design-tokens.md`). Reserve `--gel-primary`/
  `--gel-primary-strong` for something the icon sits *inside*, e.g. a badge
  or chip already using that colour — never as the icon's default state.
- **GEL's info/success/warning/critical status tokens exist — use them
  correctly, not decoratively.** They live in `packages/core/css/custom.css`
  (a sibling file to `shadcn.css`, easy to miss if you only check the base
  token file — see `design-tokens.md` for the full table and provenance).
  The bare token (`--gel-info`, `--gel-success`, `--gel-warning`,
  `--gel-critical`) is a tinted background; the `-solid` suffix is the icon/
  accent color for *that same tinted background* — never a `-solid` icon
  floating on the plain page background, never any of them as body text
  color, and never as a substitute for `--gel-primary` (brand interaction)
  or `--gel-destructive` (irreversible actions — `--gel-critical` is a
  distinct, separate token for status callouts specifically). Use sparingly:
  a page with a different status color on every callout reads as noise. And
  regardless of which token is available, never rely on colour alone to
  carry a status distinction (WCAG 1.4.1) — pair it with an icon or label.
- **`--gel-destructive` only for irreversible actions.** Not for "cancel,"
  not for general emphasis, not to make a number look urgent.
- **No decorative gradients, glows, blobs, or textures.** Flat, professional
  surfaces. A gradient is never acceptable as page decoration.

## Units

- **No `px` for spacing, component dimensions, container widths, or `@media`
  breakpoints.** Use `rem` (see `design-tokens.md`) so the page scales with
  a user's browser/OS font-size preference instead of ignoring it. `px` is
  still correct for border/outline stroke widths, `--gel-radius-full:
  9999px`, and the two standard accessibility techniques that require pixel
  values (`.gel-visually-hidden`, a skip-link's off-screen offset).
- **Never set an explicit pixel `font-size` on `html`.** That overrides the
  user's accessibility text-size setting instead of scaling with it — leave
  the root alone.

## Depth and surfaces

- **No heavy or arbitrary box-shadows.** Cards use a 1px `--gel-border` on
  light surfaces, not a shadow. Reserve any shadow for genuine overlays (a
  sticky nav's bottom edge, at most).
- **No cards nested inside cards, and don't wrap every section/metric in a
  card.** A stat, a short paragraph, or a single link doesn't need a
  bordered box around it. Use spacing and type hierarchy first; reach for a
  card only when grouping genuinely needs a visible boundary.
- **No mixing radii within one component group.** All cards in a grid share
  the same radius token; don't let one be `lg` and its neighbour `xl`.
- **No coloured accent border on the left of a rounded box.** A rounded
  surface with a `border-left: 4px solid ...` stripe reads as an
  alert/callout component, not a stat block, card, or badge — even when
  that's not the intent. If a stat or callout needs brand presence, put it
  in the value's colour or the label, not a decorative side border.

## Typography

- **No uppercase outside a badge/chip.** Headings, body copy, nav links, and
  buttons are sentence case. Uppercase + tracking is reserved for the small
  badge/label role in `design-tokens.md`.
- **No all-caps eyebrows, kickers, overlines, or decorative numbered section
  labels** (e.g. "01 / ABOUT US"). If a section needs a short context label,
  use a normal-case `h3`/label above the heading, not a tracked-uppercase
  eyebrow.
- **No em dashes, and no bare hyphens standing in as punctuation.** Rewrite
  as two sentences, or use a comma or colon.
- **Curly quotes and apostrophes** (`"` `"`, `'` `'`), not straight ones
  (`"`, `'`). Same for an ellipsis: the single `…` character, not three
  periods.
- **No banned filler/hedge words: "easy", "simple", "quick", "very", "just",
  "really", "simply".** They sound reassuring but read as pressure or padding
  once a reader notices them. Replace with the concrete thing that makes it
  true: not "it's easy to register" but "register in one step".
- **No rhetorical questions in copy.** ("Ready to get started?") They read
  as marketing filler, not information.
- **No more than two font weights doing real work on one screen** beyond the
  documented semantic roles. Don't invent a bold ALL-CAPS treatment on top of
  what `design-tokens.md` already specifies.

## Buttons and CTAs

- **Text-only buttons by default; icons only when they carry meaning the
  label can't** (external-link arrow, download icon). Don't add a decorative
  plus/arrow icon next to "Add" or "Next" just for visual interest.
- **One primary (filled, brand-green) button per section/view.** If there
  are two calls to action, the second is secondary, outline, ghost, or link
  — never a second filled green button competing for attention.
- **There are six real button variants, not three.** `design-tokens.md` has
  the full table — primary, secondary, destructive, outline, ghost, link.
  Reach for the one that matches the action's actual severity/emphasis
  rather than defaulting to primary+ghost for everything.
- **Outline and ghost hover to a subtle `--gel-accent` tint, never a solid
  colour fill or an inverted foreground/background swap.** This skill got
  both of these wrong at one point (outline filling solid green, ghost
  inverting to black-on-white) — verified and fixed against the real
  component's rendered output. Don't reintroduce either.
- **Button text is weight 400 (regular), not 500 or 600.** Verified against
  the real component's rendered `font-weight`. A primary/filled button does
  not get extra boldness on top of its fill color.

## Icons and imagery

- **No decorative icon tiles, oversized icons, or mixed icon styles.** If
  icons are used, keep them a single consistent style and size.
- **Prefer Material Symbols over hand-drawn SVG for content icons.** GEL's
  real icon components (`gel-ds-icons/material-icon`, `.../material-symbol`)
  are Google's Material Symbols, loaded as a font exactly like Open Sans —
  see `design-tokens.md`. Inventing custom SVG glyphs for things like
  document/download/arrow icons drifts from what GEL actually ships. Inline
  SVG is still fine for functional UI chrome that every page needs
  regardless of icon usage (the mobile nav toggle), just not as the default
  for content icons.
- **No stock imagery, decorative AI-generated illustrations, or fake
  screenshots.** Use only supplied logos, diagrams, or photos that are
  genuine evidence for the page; don't fill empty space with a stock photo.
- **The green dot only exists inside the official, unmodified logo SVG.**
  Never simulate the brand mark with a text string plus a decorative
  circular `<span>` — that is a lookalike, not the logo.
- **No colour change on the logo/brand link, on hover or focus — not even
  via a generic `a:hover` rule bleeding onto it.** The real Header component
  (`packages/core/brand-components/src/header/header.tsx`) only applies a
  subtle background wash (`hover:bg-foreground/10`) and a foreground-tinted
  focus ring — the wordmark's `currentColor` fill never repaints. A generic
  `a:hover { color: ... }` rule will silently recolour the wordmark if the
  brand link isn't explicitly excluded; check for this specifically since
  it's easy to introduce without noticing.

## Motion

- **Default to stillness.** No auto-playing marquees, looping pulses,
  parallax, or bounce. A subtle one-time entrance fade on scroll is
  acceptable; always respect `prefers-reduced-motion`.

## Layout

- **No generic centred hero followed by an unrelated card grid** just
  because that's the reflex. Choose the composition in
  `composition-principles.md` deliberately.
- **No repeated section silhouettes** for sections that are answering
  different reader questions — if the timeline section and the team section
  end up structurally identical, at least one of them is probably the wrong
  shape for its content.
- **Don't strand content in a narrow column while usable width sits empty**
  next to it. A comparison table or a five-item feature grid may need the
  full container width rather than being squeezed into a half-width split.
