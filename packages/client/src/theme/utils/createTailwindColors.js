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
    'text-primary': withAlpha('--text-primary'),
    'text-secondary': withAlpha('--text-secondary'),
    'text-secondary-alt': withAlpha('--text-secondary-alt'),
    'text-tertiary': withAlpha('--text-tertiary'),
    'text-warning': withAlpha('--text-warning'),
    'text-destructive': withAlpha('--text-destructive'),

    /* Ring */
    'ring-primary': withAlpha('--ring-primary'),

    /* Header */
    'header-primary': withAlpha('--header-primary'),
    'header-hover': withAlpha('--header-hover'),
    'header-button-hover': withAlpha('--header-button-hover'),

    /* Surfaces */
    'surface-active': withAlpha('--surface-active'),
    'surface-active-alt': withAlpha('--surface-active-alt'),
    'surface-hover': withAlpha('--surface-hover'),
    'surface-hover-alt': withAlpha('--surface-hover-alt'),
    'surface-primary': withAlpha('--surface-primary'),
    'surface-primary-alt': withAlpha('--surface-primary-alt'),
    'surface-primary-contrast': withAlpha('--surface-primary-contrast'),
    'surface-secondary': withAlpha('--surface-secondary'),
    'surface-secondary-alt': withAlpha('--surface-secondary-alt'),
    'surface-tertiary': withAlpha('--surface-tertiary'),
    'surface-tertiary-alt': withAlpha('--surface-tertiary-alt'),
    'surface-dialog': withAlpha('--surface-dialog'),
    'surface-chat': withAlpha('--surface-chat'),
    'surface-contrast': withAlpha('--surface-contrast'),
    'surface-contrast-foreground': withAlpha('--surface-contrast-foreground'),
    /* Wrapped for opacity-modifier support (`bg-surface-submit/10` etc.) */
    'surface-submit': withAlpha('--surface-submit'),
    'surface-submit-hover': withAlpha('--surface-submit-hover'),
    'surface-destructive': withAlpha('--surface-destructive'),
    'surface-destructive-hover': withAlpha('--surface-destructive-hover'),

    /* Borders */
    'border-light': withAlpha('--border-light'),
    'border-medium': withAlpha('--border-medium'),
    'border-medium-alt': withAlpha('--border-medium-alt'),
    'border-heavy': withAlpha('--border-heavy'),
    'border-xheavy': withAlpha('--border-xheavy'),
    'border-destructive': withAlpha('--border-destructive'),

    /* Brand
    Should remove when we get the chance.
    */
    'brand-purple': withAlpha('--brand-purple'),

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
