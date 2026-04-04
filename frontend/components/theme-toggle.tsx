"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import clsx from "clsx";

export function ThemeToggle({ isCollapsed }: { isCollapsed?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={clsx(
        "flexitems-center rounded-xl text-sm font-bold transition-all text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800",
        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3 flex"
      )}
      title={isCollapsed ? "החלף ערכת נושא" : undefined}
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </div>
      {!isCollapsed && <span className="mr-0 font-bold">מצב לילה</span>}
    </button>
  );
}
