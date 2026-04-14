"use client";

import * as React from "react";

type ThemeValue = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemeValue;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeValue) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function resolveSystemTheme() {
  if (typeof window === "undefined") return "light" as const;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeClass(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [theme, setThemeState] = React.useState<ThemeValue>("system");
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const stored = (localStorage.getItem("theme") as ThemeValue | null) || "system";
    setThemeState(stored);

    const currentResolved = stored === "system" ? resolveSystemTheme() : stored;
    setResolvedTheme(currentResolved);
    applyThemeClass(currentResolved);

    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme !== "system") return;
      const nextResolved = resolveSystemTheme();
      setResolvedTheme(nextResolved);
      applyThemeClass(nextResolved);
    };

    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme, mounted]);

  const setTheme = React.useCallback((nextTheme: ThemeValue) => {
    setThemeState(nextTheme);
    localStorage.setItem("theme", nextTheme);

    const nextResolved = nextTheme === "system" ? resolveSystemTheme() : nextTheme;
    setResolvedTheme(nextResolved);
    applyThemeClass(nextResolved);
  }, []);

  const contextValue = React.useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    setTheme,
  }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
