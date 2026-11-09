export type Theme = "light" | "dark";

export function readTheme(): Theme {
  try {
    return localStorage.getItem("rtboard.theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#0a0a0a" : "#fafafa",
  );
}

export function saveTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem("rtboard.theme", theme);
  } catch {
    // The switch still works when browser storage is unavailable.
  }
}
