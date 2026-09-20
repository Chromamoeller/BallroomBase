import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";

const STORAGE_KEY = "dancefans_theme";
const ThemeContext = createContext(null);

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
  } catch {
    /* localStorage nicht verfügbar – ignorieren */
  }
  return "light";
}

function applyThemeClass(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Diagonale Welle von unten links nach oben rechts: hinter der Kante gilt
// schon das neue Theme.
function runWaveTransition(update) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduceMotion) {
    update();
    return;
  }

  const root = document.documentElement;
  root.classList.add("theme-switching");
  const transition = document.startViewTransition(update);

  transition.ready
    .then(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const reach = w + h;
      root.animate(
        {
          clipPath: [
            `polygon(0px ${h}px, 0px ${h}px, 0px ${h}px)`,
            `polygon(0px ${h}px, ${reach}px ${h}px, 0px ${h - reach}px)`,
          ],
        },
        {
          duration: 1400,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {});

  transition.finished.finally(() => root.classList.remove("theme-switching"));
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* keine Persistenz möglich – egal */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    runWaveTransition(() => {
      applyThemeClass(next);
      flushSync(() => setTheme(next));
    });
  }, [theme]);

  const value = {
    theme,
    isDark: theme === "dark",
    setTheme,
    toggle,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
