"use client";

import { useEffect } from "react";

const STORAGE_KEY = "susu-theme";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      document.documentElement.classList.remove(saved === "dark" ? "light" : "dark");
      document.documentElement.classList.add(saved);
    } else {
      document.documentElement.classList.remove("light", "dark");
    }
  }, []);

  return <>{children}</>;
}
