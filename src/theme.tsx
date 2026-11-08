import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark";

export const themeKey = "oec-theme";

function themeFromSystem(): ThemeChoice {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(themeKey);
    if (value === "light" || value === "dark") return value;
    const resolved = themeFromSystem();
    localStorage.setItem(themeKey, resolved);
    return resolved;
  } catch {
    // Private mode can block storage. Use the current system look for this visit only.
    return themeFromSystem();
  }
}

export function applyTheme(choice: ThemeChoice) {
  document.documentElement.setAttribute("data-theme", choice);
  document.documentElement.style.colorScheme = choice;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", choice === "dark" ? "#16121f" : "#a855f7");
}

export function ThemeControl() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);

  useEffect(() => {
    applyTheme(choice);
  }, [choice]);

  function choose(next: ThemeChoice) {
    try {
      localStorage.setItem(themeKey, next);
    } catch {
      // The choice still applies for this visit.
    }
    applyTheme(next);
    setChoice(next);
  }

  const options = [
    ["light", "Light"],
    ["dark", "Dark"],
  ] as const;

  return (
    <div className="theme-control" role="group" aria-label="Color theme">
      {options.map(([value, label]) => (
        <button key={value} type="button" aria-pressed={choice === value} onClick={() => choose(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}
