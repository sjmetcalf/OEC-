import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

export const themeKey = "oec-theme";

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(themeKey);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Private mode can block storage. Follow the system until a choice is saved.
  }
  return "system";
}

export function applyTheme(choice: ThemeChoice) {
  const resolved =
    choice === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#16121f" : "#a855f7");
}

export function ThemeControl() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);

  useEffect(() => {
    applyTheme(choice);
    if (choice !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
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
    ["system", "System"],
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
