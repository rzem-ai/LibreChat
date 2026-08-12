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

/**
 * Creates Tailwind color configuration that uses CSS variables.
 * This allows dynamic theme switching by changing CSS variable values.
 *
 * Used by both the component library (packages/client) and the main app
 * (client) so that token definitions stay in one place.
 */
function createTailwindColors() {
  return {
    /* Text */
    'text-primary': `var(--text-primary)`,
    'text-secondary': withAlpha('--text-secondary'),
    'text-secondary-alt': `var(--text-secondary-alt)`,
    'text-tertiary': `var(--text-tertiary)`,
    'text-warning': `var(--text-warning)`,
    'text-destructive': `var(--text-destructive)`,

    /* Ring */
    'ring-primary': `var(--ring-primary)`,

    /* Header */
    'header-primary': `var(--header-primary)`,
    'header-hover': `var(--header-hover)`,
    'header-button-hover': `var(--header-button-hover)`,

    /* Surfaces */
    'surface-active': `var(--surface-active)`,
    'surface-active-alt': `var(--surface-active-alt)`,
    'surface-hover': `var(--surface-hover)`,
    'surface-hover-alt': `var(--surface-hover-alt)`,
    'surface-primary': `var(--surface-primary)`,
    'surface-primary-alt': `var(--surface-primary-alt)`,
    'surface-primary-contrast': `var(--surface-primary-contrast)`,
    'surface-secondary': `var(--surface-secondary)`,
    'surface-secondary-alt': `var(--surface-secondary-alt)`,
    'surface-tertiary': `var(--surface-tertiary)`,
    'surface-tertiary-alt': `var(--surface-tertiary-alt)`,
    'surface-dialog': `var(--surface-dialog)`,
    'surface-chat': `var(--surface-chat)`,
    'surface-contrast': `var(--surface-contrast)`,
    'surface-contrast-foreground': `var(--surface-contrast-foreground)`,
    /* Wrapped for opacity-modifier support (`bg-surface-submit/10` etc.) */
    'surface-submit': withAlpha('--surface-submit'),
    'surface-submit-hover': withAlpha('--surface-submit-hover'),
    'surface-destructive': `var(--surface-destructive)`,
    'surface-destructive-hover': `var(--surface-destructive-hover)`,

    /* Borders */
    'border-light': `var(--border-light)`,
    'border-medium': `var(--border-medium)`,
    'border-medium-alt': `var(--border-medium-alt)`,
    'border-heavy': `var(--border-heavy)`,
    'border-xheavy': `var(--border-xheavy)`,
    'border-destructive': `var(--border-destructive)`,

    /* Brand
    Should remove when we get the chance.
    */
    'brand-purple': `var(--brand-purple)`,

    /*
     * Wrapped in color-mix() so `from-presentation/80`, `via-presentation/50`
     * etc. compose alpha correctly against the oklch(...) dark-mode value.
     */
    presentation: withAlpha('--presentation'),

    /*
     * GEL shadcn-compatible colour utilities.
     *
     * The CSS vars hold full oklch(...) expressions, which Tailwind 3 can't
     * inject alpha into via the standard <alpha-value> substitution.
     * Wrapping in color-mix() lets `bg-primary/10`, `border-primary/20`,
     * `hover:bg-destructive/80`, etc. actually emit CSS.
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
  };
}

module.exports = { createTailwindColors };
