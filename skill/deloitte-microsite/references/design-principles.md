# Design Principles

Non-negotiable rules. Every microsite this skill produces must follow these.

## 1. Self-contained single file

- One `.html` file. All CSS and JS are inline in `<style>` / `<script>`.
- No external CDN links (`<link rel="stylesheet" href="...">`), no `<script src="...">`. Images may be referenced by relative path or embedded as data URIs.
- The site must work by double-clicking the file or hosting it on any static server — no Node, no build step.

## 2. Token-driven color system

- All colors live in `--*` CSS custom properties on `:root`. Every token must be declared.
- **Never hardcode hex values inside section HTML.** All colors in markup and section CSS must reference `var(--)` tokens.
- Required tokens: `--brand`, `--brand-dark`, `--accent`, `--dark`, `--charcoal`, `--light-bg`, `--white`, `--border`, `--gray-mid`, `--gray-light`, `--font-sans`.

## 3. Deloitte visual identity

| Rule | Detail |
|---|---|
| **Green Dot** | Always circular (`border-radius: 50%`), always in `--brand` (#86BC25 default). Appears on the brand mark in nav and footer. Never tilted, outlined, or recoloured. |
| **Corner radius** | `0` by default. Use `2–4px` only as a deliberate exception (e.g. avatar circles). Never pill buttons or rounded cards. |
| **Borders** | Cards use `1px solid var(--border)` on light backgrounds. No drop shadows on light-bg cards. `box-shadow` is allowed inside dark sections. |
| **Typography** | Open Sans for all copy. ExtraBold (800) for brand mark. 700 for card titles and eyebrows. 300–400 for body. |
| **Australian English** | *organisation*, *optimise*, *programme*, *colour*, *behaviour*, *recognised*. |
| **No emoji** | Use inline SVG icons with `stroke="currentColor"` if iconography is needed. |
| **Purple/blue gradients** | Forbidden on any Deloitte-branded surface. |
| **Glassmorphism** | Forbidden. |

## 4. Typography hierarchy

- **h1 (hero headline):** `clamp(2.5rem, 5vw, 4rem)`, weight 300, `letter-spacing: -0.02em`. Light + tight = premium.
- **h2 (section headline):** `clamp(1.75rem, 3vw, 2.5rem)`, weight 700. Sentence case.
- **h3 (card / sub-section title):** `clamp(1.2rem, 2vw, 1.5rem)`, weight 700.
- **Eyebrow:** `0.75rem`, weight 700, `letter-spacing: 0.18em`, `text-transform: uppercase`. Use `--brand-dark` on light backgrounds, `--brand` on dark.
- **Body:** `1rem`, weight 400, `line-height: 1.65`, `max-width: 68ch`.
- **Caption / small:** `0.82rem`, `color: var(--gray-mid)`.
- All sizes use `rem`, `em`, `vw`, or `clamp()`. **Never raw `px` for typography.**

## 5. Buttons (square corners — non-negotiable)

| Variant | Style |
|---|---|
| `.btn--primary` | `--brand` bg, white text, `--brand` border. Hover → `--brand-dark`. |
| `.btn--ghost` | Transparent bg, white text, white border. Use on dark sections. Hover → white bg, dark text. |
| `.btn--outline` | Transparent bg, `--brand-dark` text and border. Use on light sections. |

- `border-radius: 0`. Always.
- Uppercase text, `letter-spacing: 0.06em`, weight 700, `font-size: 0.9rem`.

## 6. Headings use accent spans — one per heading

- Use `<span class="accent">` to colour the key word(s) in a headline.
- On light backgrounds: `color: var(--brand-dark)`.
- On dark backgrounds: `color: var(--brand)` (class `.accent--light`).
- Never accent more than one phrase per heading.

## 7. Nav is sticky and dark

- `position: sticky; top: 0; z-index: 200`.
- Background: `var(--dark)`. Bottom border: `3px solid var(--brand)`.
- Mobile hamburger toggle required — test that it opens and closes.
- Active link highlighted with `color: var(--brand)` on scroll.

## 8. Responsive design — all sections must collapse gracefully

| Breakpoint | Rule |
|---|---|
| `max-width: 900px` | 3-col and 4-col grids collapse to 2 columns |
| `max-width: 768px` | Nav shows hamburger; 2-col overview layout stacks |
| `max-width: 600px` | All grids collapse to 1 column |

- Use CSS Grid with `grid-template-columns` + `@media` breakpoints. No JS for layout.
- The hamburger uses a JavaScript `classList.toggle('is-open')` — it is already wired in the template.

## 9. Accessibility

- `<html lang="en-AU">` required.
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` required.
- All interactive elements have `:focus-visible` styles.
- Buttons have `aria-label` where text content is not self-descriptive.
- Images need `alt` text. Decorative images use `alt=""`.
- Nav toggle button has `aria-expanded` state toggled by the script.
- Color contrast: body text on `--white` ≥ 4.5:1; hero text on `--dark` ≥ 4.5:1.

## 10. Section ID anchors and deep links

- Every top-level `<section>` needs an `id` attribute (e.g. `id="about"`, `id="programme"`).
- Nav links must resolve to valid `#id` anchors in the page.
- `html { scroll-behavior: smooth }` — already set in the template.
- `@media (prefers-reduced-motion: reduce)` sets `scroll-behavior: auto` — already handled.

## 11. Footer is always present

- Background: `#111111`. Top border: `3px solid var(--brand)`.
- Must include `© <year> Deloitte Touche Tohmatsu` copyright.
- Repeat top-level nav links in footer.
- Legal disclaimer text must be present verbatim (see template).

## 12. Animations — subtle, purposeful, respects reduced motion

- Entrance animations (fade + translateY) on section headings and cards are optional but encouraged.
- Transition durations: hover states `150ms`, entrance `300–500ms`.
- `@media (prefers-reduced-motion: reduce)` block in the template disables all animations globally — do not override this.
- Forbidden: spinning, pulsing, parallax, looping decorative animations.

## 13. No purple/blue gradients

Deloitte brand forbids purple and blue gradients. The hero uses a subtle green-tinted radial overlay on `--dark`. Any gradient must use shades of black, dark charcoal, or brand green family only.

## 14. SVG icons

- Inline SVG. `stroke="currentColor"`, `stroke-width="1.5"–"2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`.
- Icon wrappers: `width: 40px; height: 40px; background: var(--light-bg); display: flex; align-items: center; justify-content: center;`.
- No icon fonts (Font Awesome, Material Icons, etc.).
