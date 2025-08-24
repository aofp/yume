import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";

interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <SunIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
      ) : (
        <MoonIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
      )}
    </button>
  );
}
