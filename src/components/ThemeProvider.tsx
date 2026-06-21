"use client";

import { useEffect } from "react";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      const theme = localStorage.getItem("kdf-theme") ?? "teal";
      document.documentElement.dataset.theme = theme === "teal" ? "" : theme;
    } catch {}
  }, []);
  return <>{children}</>;
}
