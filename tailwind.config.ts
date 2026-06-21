import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
      },
      boxShadow: {
        "glow-accent": "0 8px 30px -8px rgb(var(--color-accent) / 0.55)",
      },
    },
  },
  plugins: [],
};
export default config;
