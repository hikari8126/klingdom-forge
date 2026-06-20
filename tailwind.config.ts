import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        surface: "#14171f",
        "surface-2": "#1b1f2a",
        border: "#262b38",
        muted: "#8b93a4",
        accent: { DEFAULT: "#7c5cff", hover: "#6b4af0", soft: "#a78bfa" },
        ok: "#34d399",
        bad: "#f87171",
      },
      boxShadow: { "glow-accent": "0 8px 30px -8px rgba(124,92,255,0.55)" },
    },
  },
  plugins: [],
};
export default config;
