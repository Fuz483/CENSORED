import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

import { ROLE_LABEL } from "../lib/roles";
import { useApp } from "../state/AppState";
import { Logo } from "./Logo";
import { LanguageToggle, useLanguage } from "../lib/i18n";

export type View = "search" | "bookings" | "profile";

interface HeaderProps {
  view: View;
  onNavigate: (view: View) => void;
  bookingCount: number;
}

export function Header({ view, onNavigate, bookingCount }: HeaderProps) {
  const { user, logout } = useApp();
  const { t } = useLanguage();
  if (!user) return null;

  const isTenant = user.role === "tenant";

  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-2 px-3 sm:gap-8 sm:px-8">
        <button
          type="button"
          onClick={() => onNavigate("search")}
          className="shrink-0"
          aria-label="Пляцоўка — наверх"
        >
          <Logo />
        </button>

        {isTenant ? (
          <nav
            className="flex h-16 shrink-0 items-center gap-3 sm:gap-7"
            aria-label="Основная навигация"
          >
            <NavLink active={view === "search"} onClick={() => onNavigate("search")}>
              {t("Каталог")}
            </NavLink>
            <NavLink active={view === "bookings"} onClick={() => onNavigate("bookings")}>
              {t("Мои брони")}
              {bookingCount > 0 && (
                <span className="ml-1.5 font-mono text-[11px] tabular-nums text-orange">
                  {String(bookingCount).padStart(2, "0")}
                </span>
              )}
            </NavLink>
            <button type="button" onClick={() => onNavigate("profile")} aria-current={view === "profile" ? "page" : undefined} className={`flex h-16 shrink-0 items-center whitespace-nowrap border-b-2 text-[13px] font-medium transition-colors ${view === "profile" ? "border-orange text-ink" : "border-transparent text-ink-mute hover:text-ink"}`}>
              {t("Профиль")}
            </button>
          </nav>
        ) : (
          <span className="mono-label hidden sm:inline">{t("Кабинет УО")}</span>
        )}

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <LanguageToggle compact />
          <div className="hidden text-right sm:block">
            <div className="text-[12.5px] leading-tight font-medium">{user.name}</div>
            <div className="mt-0.5 font-mono text-[10px] leading-tight tracking-[0.08em] uppercase text-ink-mute">
              {t(ROLE_LABEL[user.role])}
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="grid size-8 place-items-center text-ink-mute transition-colors duration-150 hover:text-orange"
            aria-label={t("Выйти")}
            title={t("Выйти")}
          >
            <LogOut className="size-4" strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-16 items-center gap-0 whitespace-nowrap border-b-2 text-[13px] font-medium transition-colors duration-150 ${
        active
          ? "-mb-px border-orange text-ink"
          : "-mb-px border-transparent text-ink-mute hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
