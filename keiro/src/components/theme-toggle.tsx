"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle(){
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button aria-label="Toggle theme"
      onClick={()=> setTheme(isDark ? "light" : "dark")}
      className="lux-btn-ghost flex items-center gap-2">
      {isDark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
      <span className="text-[12px]">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
