// const { fontFamily } = require("tailwindcss/defaultTheme");
const {
	createTailwindColors,
} = require("../packages/client/src/theme/utils/createTailwindColors.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./src/**/*.{js,jsx,ts,tsx}",
		"../packages/client/src/**/*.{js,jsx,ts,tsx}",
	],
	darkMode: ["class"],
	theme: {
		fontFamily: {
			sans: ["Open Sans Variable", "ui-sans-serif", "sans-serif", "system-ui"],
			mono: ["Roboto Mono", "monospace"],
		},
		extend: {
			width: {
				authPageWidth: "370px",
			},
			keyframes: {
				"accordion-down": {
					from: { height: 0 },
					to: { height: "var(--radix-accordion-content-height)" },
				},
				"accordion-up": {
					from: { height: "var(--radix-accordion-content-height)" },
					to: { height: 0 },
				},
				"slide-in-right": {
					"0%": { transform: "translateX(100%)" },
					"100%": { transform: "translateX(0)" },
				},
				"slide-in-left": {
					"0%": { transform: "translateX(-100%)" },
					"100%": { transform: "translateX(0)" },
				},
				"slide-out-left": {
					"0%": { transform: "translateX(0)" },
					"100%": { transform: "translateX(-100%)" },
				},
				"slide-out-right": {
					"0%": { transform: "translateX(0)" },
					"100%": { transform: "translateX(100%)" },
				},
				"shortcut-shake": {
					"0%, 100%": { transform: "translateX(0)" },
					"25%": { transform: "translateX(-3px)" },
					"75%": { transform: "translateX(3px)" },
				},
				/** Named distinctly: `blink` is already taken by keyframes in style.css. */
				"logo-blink": {
					"0%, 100%": { opacity: "1" },
					"50%": { opacity: "0" },
				},
			},
			animation: {
				"fade-in": "fadeIn 0.5s ease-out forwards",
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
				"slide-in-right":
					"slide-in-right 300ms cubic-bezier(0.25, 0.1, 0.25, 1)",
				"slide-in-left": "slide-in-left 300ms cubic-bezier(0.25, 0.1, 0.25, 1)",
				"slide-out-left":
					"slide-out-left 300ms cubic-bezier(0.25, 0.1, 0.25, 1)",
				"slide-out-right":
					"slide-out-right 300ms cubic-bezier(0.25, 0.1, 0.25, 1)",
				"shortcut-shake": "shortcut-shake 0.25s ease-in-out",
				"logo-blink": "logo-blink 3s infinite",
			},
			colors: {
				/* Hardcoded palettes used for legacy/utility classes */
				gray: {
					20: "#ececf1",
					50: "#f7f7f8",
					100: "#ececec",
					200: "#e3e3e3",
					300: "#cdcdcd",
					400: "#999696",
					500: "#595959",
					600: "#424242",
					700: "#2f2f2f",
					800: "#212121",
					850: "#171717",
					900: "#0d0d0d",
				},
				green: {
					50: "#f1f9f7",
					100: "#def2ed",
					200: "#a6e5d6",
					300: "#6dc8b9",
					400: "#41a79d",
					500: "#10a37f",
					550: "#349072",
					600: "#126e6b",
					700: "#0a4f53",
					800: "#06373e",
					900: "#031f29",
				},
				/* CSS-variable-based semantic tokens (shared with packages/client) */
				...createTailwindColors(),
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
		},
	},
	plugins: [
		require("tailwindcss-animate"),
		require("tailwindcss-radix"),
		// require("@tailwindcss/typography"),
	],
};
