import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { isDarkTheme, themeFromDarkMode } from "@/lib/theme";

const DarkModeSwitch = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && isDarkTheme(resolvedTheme);

  return (
    <Switch
      checked={isDark}
      onCheckedChange={(enabled) => setTheme(themeFromDarkMode(enabled))}
      aria-label="Dark Mode"
      onClick={(event) => event.stopPropagation()}
    />
  );
};

export default DarkModeSwitch;
