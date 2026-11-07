import { useState } from "react";
import { Moon, Sun } from "lucide-react";

import { useLanguage } from "../lib/i18n";

export function ThemeToggle() {
  const { t } = useLanguage();
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const Icon = dark ? Moon : Sun;

  function toggle() {
    const nextDark = !dark;
    const theme = nextDark ? "dark" : "light";
    const root = document.documentElement;
    root.dataset.theme = theme;
    const background = getComputedStyle(root).getPropertyValue("--color-paper").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
    setDark(nextDark);
    try {
      localStorage.setItem("plyacouka-theme", theme);
    } catch {
      /* The current tab can still switch themes. */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("Ночная тема")}
      aria-pressed={dark}
      title={t(dark ? "Включить дневную тему" : "Включить ночную тему")}
      className="flex size-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:border-blue hover:text-ink sm:size-9 lg:w-auto lg:px-2.5"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="hidden text-sm font-medium lg:inline" aria-hidden="true">{t(dark ? "Ночь" : "День")}</span>
    </button>
  );
}
