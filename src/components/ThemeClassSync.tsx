import { useEffect } from "react";
import { useTheme } from "next-themes";
import { applyDocumentTheme, isDarkTheme } from "@/lib/theme";

/** Keep html/body/theme-color in sync for mobile WebViews. */
const ThemeClassSync = () => {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "dark" && resolvedTheme !== "light") return;
    applyDocumentTheme(isDarkTheme(resolvedTheme) ? "dark" : "light");
  }, [resolvedTheme]);

  return null;
};

export default ThemeClassSync;
