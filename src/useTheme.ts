import { useEffect, useState } from "react";

export type Mode = "light" | "dark";

/** Light/dark mode: follows the OS until the user picks one, then remembers it. */
export function useTheme() {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch { /* storage unavailable */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    try { localStorage.setItem("theme", mode); } catch { /* ignore */ }
  }, [mode]);

  return { mode, setMode, toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")) };
}
