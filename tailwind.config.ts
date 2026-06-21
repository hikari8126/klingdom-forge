import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0d10",
        surface: "#141a20",
        "surface-2": "#1a212a",
        border: "#262b38",
        muted: "#8c99a6",
        accent: { DEFAULT: "#2A7B9B", hover: "#3aa6d0", soft: "#5fb8dd" },
        ok: "#5fd08e",
        bad: "#f87171",
        yellow: "#f2e463",
      },
      boxShadow: { "glow-accent": "0 8px 30px -8px rgba(42,123,155,0.55)" },
    },
  },
  plugins: [],
};
export default config;
