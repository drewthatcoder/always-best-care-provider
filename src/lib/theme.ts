export const THEME_STORAGE_KEY = "abc-theme";

export type ColorTheme = "light" | "dark";

export function themeFromDarkMode(enabled: boolean): ColorTheme {
  return enabled ? "dark" : "light";
}

export function isDarkTheme(theme: string | undefined): boolean {
  return theme === "dark";
}

/** Apply or remove the Tailwind `.dark` class on <html>. */
export function applyColorTheme(theme: ColorTheme, root: { classList: { add: (c: string) => void; remove: (c: string) => void } }): void {
  if (theme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
}
