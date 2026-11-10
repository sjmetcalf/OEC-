const themeKey = "oec-theme";

export function applyDarkTheme() {
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.style.colorScheme = "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#16121f");
  try {
    if (localStorage.getItem(themeKey) !== "dark") localStorage.setItem(themeKey, "dark");
  } catch {
    // Private mode can block storage. Dark still applies for this visit.
  }
}
