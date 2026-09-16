import { describe, expect, it } from "vitest";
import { applyColorTheme, isDarkTheme, themeFromDarkMode } from "./theme";

describe("theme helpers", () => {
  it("maps the Settings switch to a color theme", () => {
    expect(themeFromDarkMode(true)).toBe("dark");
    expect(themeFromDarkMode(false)).toBe("light");
  });

  it("treats only dark as dark", () => {
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("light")).toBe(false);
    expect(isDarkTheme(undefined)).toBe(false);
  });

  it("adds the dark class for dark theme", () => {
    const classes = new Set<string>();
    applyColorTheme("dark", {
      classList: {
        add: (c) => {
          classes.add(c);
        },
        remove: (c) => {
          classes.delete(c);
        },
      },
    });
    expect(classes.has("dark")).toBe(true);
    expect(classes.has("light")).toBe(false);
  });

  it("removes the dark class for light theme", () => {
    const classes = new Set<string>(["dark"]);
    applyColorTheme("light", {
      classList: {
        add: (c) => {
          classes.add(c);
        },
        remove: (c) => {
          classes.delete(c);
        },
      },
    });
    expect(classes.has("dark")).toBe(false);
    expect(classes.has("light")).toBe(true);
  });
});
