import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { applyDocumentTheme, isDarkTheme, themeFromDarkMode } from "@/lib/theme";

type DarkModeSwitchProps = {
  className?: string;
};

const DarkModeSwitch = ({ className }: DarkModeSwitchProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && isDarkTheme(resolvedTheme);

  const apply = (enabled: boolean) => {
    const next = themeFromDarkMode(enabled);
    setTheme(next);
    applyDocumentTheme(next);
  };

  return (
    <div
      role="switch"
      aria-checked={isDark}
      aria-label="Dark Mode"
      tabIndex={0}
      className={cn("touch-manipulation cursor-pointer select-none min-h-14", className)}
      onClick={() => apply(!isDark)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          apply(!isDark);
        }
      }}
    >
      <div className="flex items-center gap-3">
        <Moon className="w-5 h-5 text-primary shrink-0" />
        <span className="font-medium text-foreground">Dark Mode</span>
      </div>
      <Switch
        checked={isDark}
        onCheckedChange={apply}
        onClick={(event) => event.stopPropagation()}
        className="pointer-events-auto h-7 w-12 [&>span]:h-6 [&>span]:w-6 data-[state=checked]:[&>span]:translate-x-5"
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
};

export default DarkModeSwitch;
