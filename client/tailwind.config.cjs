// const { fontFamily } = require('tailwindcss/defaultTheme');

/**
 * Build a color that Tailwind 3 can compose alpha into.
 *
 * Tailwind 3's opacity modifier (e.g. `bg-primary/10`) requires the theme
 * value to contain the `<alpha-value>` placeholder or to be a colour Tailwind
 * can parse itself (hex / rgb / hsl). A bare `var(--primary)` pointing at a
 * full `oklch(...)` expression matches neither, so the utility is silently
 * dropped. Wrapping in color-mix() lets the placeholder participate:
 * `<alpha-value>` is 1 with no modifier (round-trip identical to the raw
 * token) and 0.1/0.2/0.9 with `/10`, `/20`, `/90`.
 */
const mixVar = (name) =>
  `color-mix(in oklab, var(${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    // Include component library files
    '../packages/client/src/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    fontFamily: {
      sans: ['"Open Sans"', 'ui-sans-serif', 'sans-serif', 'system-ui'],
      mono: ['Roboto Mono', 'monospace'],
    },
    // fontFamily: {
    //   sans: ['Söhne', 'sans-serif'],
    //   mono: ['Söhne Mono', 'monospace'],
    // },
    extend: {
      width: {
        authPageWidth: '370px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out-left': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'shortcut-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-3px)' },
          '75%': { transform: 'translateX(3px)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'slide-in-right': 'slide-in-right 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        'slide-in-left': 'slide-in-left 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        'slide-out-left': 'slide-out-left 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        'slide-out-right': 'slide-out-right 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        'shortcut-shake': 'shortcut-shake 0.25s ease-in-out',
      },
      colors: {
        gray: {
          20: '#ececf1',
          50: '#f7f7f8',
          100: '#ececec',
          200: '#e3e3e3',
          300: '#cdcdcd',
          400: '#999696',
          500: '#595959',
          600: '#424242',
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
        'brand-purple': 'var(--brand-purple)',
        /* Wrapped in color-mix() so `from-presentation/80`, `via-presentation/50`
         * etc. compose alpha correctly against the oklch(...) dark-mode value.
         */
        presentation: mixVar('--presentation'),
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-secondary-alt': 'var(--text-secondary-alt)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-warning': 'var(--text-warning)',
        'text-destructive': 'var(--text-destructive)',
        'ring-primary': 'var(--ring-primary)',
        'header-primary': 'var(--header-primary)',
        'header-hover': 'var(--header-hover)',
        'header-button-hover': 'var(--header-button-hover)',
        'surface-active': 'var(--surface-active)',
        'surface-active-alt': 'var(--surface-active-alt)',
        'surface-hover': 'var(--surface-hover)',
        'surface-hover-alt': 'var(--surface-hover-alt)',
        'surface-primary': 'var(--surface-primary)',
        'surface-primary-alt': 'var(--surface-primary-alt)',
        'surface-primary-contrast': 'var(--surface-primary-contrast)',
        'surface-secondary': 'var(--surface-secondary)',
        'surface-secondary-alt': 'var(--surface-secondary-alt)',
        'surface-tertiary': 'var(--surface-tertiary)',
        'surface-tertiary-alt': 'var(--surface-tertiary-alt)',
        'surface-dialog': 'var(--surface-dialog)',
        /* Wrapped for opacity-modifier support (`bg-surface-submit/10`,
         * `hover:bg-surface-submit-hover/50`, etc.) — same reason as the
         * shadcn tokens below.
         */
        'surface-submit': mixVar('--surface-submit'),
        'surface-submit-hover': mixVar('--surface-submit-hover'),
        'surface-destructive': 'var(--surface-destructive)',
        'surface-destructive-hover': 'var(--surface-destructive-hover)',
        'surface-chat': 'var(--surface-chat)',
        'border-light': 'var(--border-light)',
        'border-medium': 'var(--border-medium)',
        'border-medium-alt': 'var(--border-medium-alt)',
        'border-heavy': 'var(--border-heavy)',
        'border-xheavy': 'var(--border-xheavy)',
        'border-destructive': 'var(--border-destructive)',
        /* GEL shadcn-compatible colour utilities.
         *
         * The CSS vars hold full oklch(...) expressions, which Tailwind 3 can't
         * inject alpha into via the standard <alpha-value> substitution.
         * Wrapping in color-mix() lets `bg-primary/10`, `border-primary/20`,
         * `hover:bg-destructive/80`, etc. actually emit CSS — Tailwind sets
         * <alpha-value> to 1 when no /N modifier is used, so the wrapped colour
         * still matches the raw token in the common case. Tokens that carry a
         * built-in alpha channel (e.g. `--border: oklch(1 0 0 / 10%)` in dark
         * mode) compose multiplicatively, which is the expected behaviour.
         */
        border: mixVar('--border'),
        input: mixVar('--input'),
        ['switch-unchecked']: mixVar('--switch-unchecked'),
        ring: mixVar('--ring'),
        background: mixVar('--background'),
        foreground: mixVar('--foreground'),
        primary: {
          DEFAULT: mixVar('--primary'),
          foreground: mixVar('--primary-foreground'),
          hover: mixVar('--primary-hover'),
        },
        secondary: {
          DEFAULT: mixVar('--secondary'),
          foreground: mixVar('--secondary-foreground'),
        },
        destructive: {
          DEFAULT: mixVar('--destructive'),
          foreground: mixVar('--destructive-foreground'),
        },
        muted: {
          DEFAULT: mixVar('--muted'),
          foreground: mixVar('--muted-foreground'),
        },
        accent: {
          DEFAULT: mixVar('--accent'),
          foreground: mixVar('--accent-foreground'),
        },
        card: {
          DEFAULT: mixVar('--card'),
          foreground: mixVar('--card-foreground'),
        },
        /* GEL brand surface tokens */
        'surface-contrast': 'var(--surface-contrast)',
        'surface-contrast-foreground': 'var(--surface-contrast-foreground)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('tailwindcss-radix'),
    // require('@tailwindcss/typography'),
  ],
};
