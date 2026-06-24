import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fadeUp .45s cubic-bezier(.2,.8,.2,1) both",
      },
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-2) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          hover: "rgb(var(--color-accent-hover) / <alpha-value>)",
          soft: "rgb(var(--color-accent-soft) / <alpha-value>)",
        },
        ok: "rgb(var(--color-ok) / <alpha-value>)",
        bad: "rgb(var(--color-bad) / <alpha-value>)",
        yellow: "rgb(var(--color-yellow) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)",
        violet: "rgb(var(--color-violet) / <alpha-value>)",
      },
      boxShadow: {
        "glow-accent": "0 8px 30px -8px rgb(var(--color-accent) / 0.55)",
      },
    },
  },
  plugins: [],
};
export default config;
