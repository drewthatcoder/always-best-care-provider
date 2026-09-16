import { describe, expect, it } from "vitest";
import { applyColorTheme, applyDocumentTheme, DARK_THEME_COLOR, LIGHT_THEME_COLOR, isDarkTheme, themeFromDarkMode } from "./theme";

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

  it("applies dark class, color-scheme, and theme-color on the document", () => {
    const htmlClasses = new Set<string>();
    const bodyClasses = new Set<string>();
    const htmlStyle = { colorScheme: "" };
    const bodyStyle = { colorScheme: "" };
    const created: { name: string; content: string }[] = [];

    applyDocumentTheme("dark", {
      documentElement: {
        classList: {
          add: (c) => {
            htmlClasses.add(c);
          },
          remove: (c) => {
            htmlClasses.delete(c);
          },
        },
        style: htmlStyle,
      },
      body: {
        classList: {
          add: (c) => {
            bodyClasses.add(c);
          },
          remove: (c) => {
            bodyClasses.delete(c);
          },
        },
        style: bodyStyle,
      },
      head: { appendChild: () => undefined },
      querySelector: () => null,
      createElement: () => {
        const node = {
          setAttribute: (name: string, value: string) => {
            if (name === "name") node.name = value;
            if (name === "content") node.content = value;
          },
          name: "",
          content: "",
        };
        created.push(node);
        return node;
      },
    });

    expect(htmlClasses.has("dark")).toBe(true);
    expect(bodyClasses.has("dark")).toBe(true);
    expect(htmlStyle.colorScheme).toBe("dark");
    expect(bodyStyle.colorScheme).toBe("dark");
    expect(created[0]?.content).toBe(DARK_THEME_COLOR);
  });

  it("clears dark document theme back to light", () => {
    const htmlClasses = new Set<string>(["dark"]);
    const themeColor = { setAttribute: (_n: string, value: string) => {
      themeColor.content = value;
    }, content: DARK_THEME_COLOR };

    applyDocumentTheme("light", {
      documentElement: {
        classList: {
          add: (c) => {
            htmlClasses.add(c);
          },
          remove: (c) => {
            htmlClasses.delete(c);
          },
        },
        style: { colorScheme: "dark" },
      },
      querySelector: () => themeColor,
      createElement: () => themeColor,
      head: { appendChild: () => undefined },
    });

    expect(htmlClasses.has("dark")).toBe(false);
    expect(themeColor.content).toBe(LIGHT_THEME_COLOR);
  });
});
