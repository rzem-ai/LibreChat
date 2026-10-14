/**
 * Single source of truth for the Tailwind semantic color palette.
 *
 * Both Tailwind configs consume this so the `client` SPA and the
 * `@librechat/client` package generate identical color utilities and can
 * never drift apart:
 *   - client/tailwind.config.cjs
 *   - packages/client/tailwind.config.js
 *
 * Semantic/app-specific tokens resolve to CSS custom properties defined in
 * client/src/style.css (`html`, `.dark`, `.gizmo` blocks). Those variables hold
 * bare `R G B` channel triplets, so `cssVar` wraps them as
 * `rgb(var(--x) / <alpha-value>)`. This makes opacity modifiers work, e.g.
 * `bg-surface-primary/50`. Tokens with an intrinsic alpha use a companion
 * `--x-alpha` variable that is multiplied by Tailwind's opacity modifier. Every
 * such token is an `R G B` triplet, so a direct `var(--token)` usage in plain
 * CSS must wrap the channel triplet itself, e.g. `color: rgb(var(--text-primary))`.
 *
 * Deloitte Custom Change: the GEL design-system primitives (`--background`,
 * `--primary`, `--card`, `--border`, `--sidebar*`, `--chart-*`, etc.) are a
 * second tier of tokens that still hold full `oklch(...)` values in
 * style.css, not bare triplets — `withAlpha` wraps those via `color-mix()`
 * instead, since `rgb(var(--x))` is invalid CSS when `--x` holds an oklch()
 * expression. Keep every key below on the wrapper that matches how its CSS
 * custom property is actually stored in style.css, or Tailwind's opacity
 * modifiers (`bg-primary/50`) will silently break at build time.
 */

/**
 * Wraps a CSS variable in color-mix() so Tailwind opacity modifiers
 * (e.g. `bg-primary/50`, `border-primary/20`) work correctly even when the
 * variable holds a full oklch(...) expression rather than bare channel values.
 *
 * Tailwind sets `<alpha-value>` to 1 when no /N modifier is used, so the
 * wrapped colour matches the raw token value in the common case.  Tokens that
 * carry a built-in alpha channel compose multiplicatively, which is the
 * expected behaviour.
 */
function withAlpha(variableName) {
  return `color-mix(in oklab, var(${variableName}) calc(<alpha-value> * 100%), transparent)`;
}

const palette = {
  gray: {
    20: '#ececf1',
    50: '#f7f7f8',
    100: '#ececec',
    200: '#e3e3e3',
    300: '#cdcdcd',
    400: '#999696',
    500: '#595959',
    600: '#424242',
    650: '#393939',
    700: '#2f2f2f',
    800: '#212121',
    850: '#171717',
    900: '#0d0d0d',
  },
  green: {
    50: '#f1f9f7',
    100: '#def2ed',
    200: '#a6e5d6',
    300: '#6dc8b9',
    400: '#41a79d',
    500: '#10a37f',
    550: '#349072',
    600: '#126e6b',
    700: '#0a4f53',
    800: '#06373e',
    900: '#031f29',
  },
};

const cssVar = (name) => `rgb(var(${name}) / <alpha-value>)`;
const cssVarWithAlpha = (name) => `rgb(var(${name}) / calc(var(${name}-alpha, 1) * <alpha-value>))`;

/**
 * Creates the Tailwind `theme.extend.colors` object backed by CSS variables.
 * This allows dynamic theme switching by changing CSS variable values at
 * runtime (see ThemeProvider / applyTheme).
 */
function createTailwindColors() {
  return {
    ...palette,

    /* Deloitte Custom Change: brand-purple/text-warning intentionally track
       upstream's refined values (see style.css for rationale), but the
       token itself remains a bare triplet like the rest of this tier. */
    'brand-purple': cssVar('--brand-purple'),
    presentation: cssVar('--presentation'),

    'text-primary': cssVar('--text-primary'),
    'text-secondary': cssVar('--text-secondary'),
    'text-secondary-alt': cssVar('--text-secondary-alt'),
    'text-tertiary': cssVar('--text-tertiary'),
    'text-muted': cssVar('--text-muted'),
    'chart-widget-surface': cssVar('--chart-widget-surface'),
    'chart-widget-stroke': cssVar('--chart-widget-stroke'),
    'text-warning': cssVar('--text-warning'),
    'text-destructive': cssVar('--text-destructive'),

    link: cssVar('--link'),
    'link-hover': cssVar('--link-hover'),
    'link-visited': cssVar('--link-visited'),

    'accent-primary': cssVar('--accent-primary'),
    'accent-primary-hover': cssVar('--accent-primary-hover'),

    'ring-primary': cssVar('--ring-primary'),

    'header-primary': cssVar('--header-primary'),
    'header-hover': cssVar('--header-hover'),
    'header-button-hover': cssVar('--header-button-hover'),

    'surface-active': cssVar('--surface-active'),
    'surface-active-alt': cssVar('--surface-active-alt'),
    'surface-hover': cssVar('--surface-hover'),
    'surface-hover-alt': cssVar('--surface-hover-alt'),
    'surface-composer-hover': cssVar('--surface-composer-hover'),
    'surface-primary': cssVar('--surface-primary'),
    'surface-primary-alt': cssVar('--surface-primary-alt'),
    'surface-primary-contrast': cssVar('--surface-primary-contrast'),
    'surface-secondary': cssVar('--surface-secondary'),
    'surface-secondary-alt': cssVar('--surface-secondary-alt'),
    'surface-tertiary': cssVar('--surface-tertiary'),
    'surface-tertiary-alt': cssVar('--surface-tertiary-alt'),
    'surface-dialog': cssVar('--surface-dialog'),
    'surface-overlay': cssVar('--surface-overlay'),
    'surface-submit': cssVar('--surface-submit'),
    'surface-submit-hover': cssVar('--surface-submit-hover'),
    'surface-destructive': cssVar('--surface-destructive'),
    'surface-destructive-hover': cssVar('--surface-destructive-hover'),
    'surface-chat': cssVar('--surface-chat'),
    'surface-code': cssVar('--surface-code'),
    'surface-qr': cssVar('--surface-qr'),
    'surface-inverted': cssVar('--surface-inverted'),
    'surface-inverted-hover': cssVar('--surface-inverted-hover'),
    'text-inverted': cssVar('--text-inverted'),
    'surface-fixed': cssVar('--surface-fixed'),
    'surface-fixed-hover': cssVar('--surface-fixed-hover'),
    'text-fixed': cssVar('--text-fixed'),

    /* Deloitte Custom Change: GEL high-contrast surface, no upstream equivalent. */
    'surface-contrast': cssVar('--surface-contrast'),
    'surface-contrast-foreground': cssVar('--surface-contrast-foreground'),

    'border-light': cssVarWithAlpha('--border-light'),
    'border-medium': cssVarWithAlpha('--border-medium'),
    /* Deloitte Custom Change: given its own `-alpha` companion
       (cssVarWithAlpha) instead of upstream's plain `cssVar` — Deloitte's
       design makes border-medium-alt identical to border-medium in both
       modes, and the alpha-aware form avoids a lossy opaque approximation
       for the translucent dark-mode GEL border. See style.css for the
       matching `--border-medium-alt-alpha` custom property. */
    'border-medium-alt': cssVarWithAlpha('--border-medium-alt'),
    'border-heavy': cssVarWithAlpha('--border-heavy'),
    'border-xheavy': cssVarWithAlpha('--border-xheavy'),
    'border-destructive': cssVar('--border-destructive'),

    'status-success': cssVar('--status-success'),
    'status-success-subtle': cssVar('--status-success-subtle'),
    'status-success-border': cssVar('--status-success-border'),
    'status-success-strong': cssVar('--status-success-strong'),
    'status-info': cssVar('--status-info'),
    'status-info-subtle': cssVar('--status-info-subtle'),
    'status-info-border': cssVar('--status-info-border'),
    'status-info-strong': cssVar('--status-info-strong'),
    'status-warning': cssVar('--status-warning'),
    'status-warning-subtle': cssVar('--status-warning-subtle'),
    'status-warning-border': cssVar('--status-warning-border'),
    highlight: cssVar('--highlight'),
    'status-warning-strong': cssVar('--status-warning-strong'),
    'status-error': cssVar('--status-error'),
    'status-error-subtle': cssVar('--status-error-subtle'),
    'status-error-border': cssVar('--status-error-border'),
    'status-error-strong': cssVar('--status-error-strong'),
    'status-neutral': cssVar('--status-neutral'),
    'status-neutral-subtle': cssVar('--status-neutral-subtle'),
    'status-neutral-border': cssVar('--status-neutral-border'),
    'status-verified': cssVar('--status-verified'),
    'text-on-status': cssVar('--text-on-status'),

    'series-1': cssVar('--series-1'),
    'series-2': cssVar('--series-2'),
    'series-3': cssVar('--series-3'),
    'series-4': cssVar('--series-4'),
    'series-5': cssVar('--series-5'),
    'series-6': cssVar('--series-6'),
    'series-7': cssVar('--series-7'),
    'series-8': cssVar('--series-8'),

    /*
     * GEL shadcn-compatible colour utilities.
     *
     * Deloitte Custom Change: these CSS vars hold full oklch(...) expressions
     * in style.css (the GEL base tokens — "DO NOT modify"), which Tailwind 3
     * can't inject alpha into via the standard <alpha-value> substitution.
     * Wrapping in color-mix() via `withAlpha` lets `bg-primary/10`,
     * `border-primary/20`, `hover:bg-destructive/80`, etc. actually emit CSS.
     * Every other key in this object is a bare RGB triplet wrapped in
     * `cssVar`/`cssVarWithAlpha` instead — do not mix the two wrappers for
     * the same custom property.
     */
    border: withAlpha('--border'),
    input: withAlpha('--input'),
    'switch-unchecked': withAlpha('--switch-unchecked'),
    ring: withAlpha('--ring'),
    background: withAlpha('--background'),
    foreground: withAlpha('--foreground'),
    primary: {
      DEFAULT: withAlpha('--primary'),
      foreground: withAlpha('--primary-foreground'),
      hover: withAlpha('--primary-hover'),
    },
    secondary: {
      DEFAULT: withAlpha('--secondary'),
      foreground: withAlpha('--secondary-foreground'),
    },
    destructive: {
      DEFAULT: withAlpha('--destructive'),
      foreground: withAlpha('--destructive-foreground'),
    },
    muted: {
      DEFAULT: withAlpha('--muted'),
      foreground: withAlpha('--muted-foreground'),
    },
    accent: {
      DEFAULT: withAlpha('--accent'),
      foreground: withAlpha('--accent-foreground'),
    },
    card: {
      DEFAULT: withAlpha('--card'),
      foreground: withAlpha('--card-foreground'),
    },
    /* GEL chart palette */
    'chart-1': withAlpha('--chart-1'),
    'chart-2': withAlpha('--chart-2'),
    'chart-3': withAlpha('--chart-3'),
    'chart-4': withAlpha('--chart-4'),
    'chart-5': withAlpha('--chart-5'),
    /* GEL Sidebar */
    sidebar: withAlpha('--sidebar'),
    'sidebar-foreground': withAlpha('--sidebar-foreground'),
    'sidebar-primary': withAlpha('--sidebar-primary'),
    'sidebar-primary-foreground': withAlpha('--sidebar-primary-foreground'),
    'sidebar-accent': withAlpha('--sidebar-accent'),
    'sidebar-accent-foreground': withAlpha('--sidebar-accent-foreground'),
    'sidebar-border': withAlpha('--sidebar-border'),
    'sidebar-ring': withAlpha('--sidebar-ring'),
  };
}

module.exports = { createTailwindColors };
