export const THEME_STORAGE_KEY = "abc-theme";
export const DARK_THEME_COLOR = "#0c0c1a";
export const LIGHT_THEME_COLOR = "#ffffff";

export type ColorTheme = "light" | "dark";

export function themeFromDarkMode(enabled: boolean): ColorTheme {
  return enabled ? "dark" : "light";
}

export function isDarkTheme(theme: string | undefined): boolean {
  return theme === "dark";
}

/** Apply or remove the Tailwind `.dark` class on <html> or <body>. */
export function applyColorTheme(
  theme: ColorTheme,
  root: { classList: { add: (c: string) => void; remove: (c: string) => void } },
): void {
  if (theme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
}

type ThemeDocument = {
  documentElement: {
    classList: { add: (c: string) => void; remove: (c: string) => void };
    style: { colorScheme: string };
  };
  body?: {
    classList: { add: (c: string) => void; remove: (c: string) => void };
    style: { colorScheme: string };
  } | null;
  head?: { appendChild: (node: unknown) => void } | null;
  querySelector?: (selector: string) => { setAttribute: (name: string, value: string) => void } | null;
  createElement?: (tag: string) => { setAttribute: (name: string, value: string) => void };
};

/**
 * Mobile WebViews (iOS Safari / Capacitor) need the class on html and body,
 * plus color-scheme and theme-color, or the page can stay light.
 */
export function applyDocumentTheme(theme: ColorTheme, doc: ThemeDocument = document): void {
  applyColorTheme(theme, doc.documentElement);
  doc.documentElement.style.colorScheme = theme;
  if (doc.body) {
    applyColorTheme(theme, doc.body);
    doc.body.style.colorScheme = theme;
  }

  if (!doc.querySelector || !doc.createElement || !doc.head) return;
  let meta = doc.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement("meta");
    meta.setAttribute("name", "theme-color");
    doc.head.appendChild(meta);
  }
  meta.setAttribute("content", theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}
