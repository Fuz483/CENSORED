import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

import { ROLE_LABEL } from "../lib/roles";
import { useApp } from "../state/AppState";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle, useLanguage } from "../lib/i18n";

export type View = "search" | "bookings" | "profile";

interface HeaderProps {
  view: View;
  onNavigate: (view: View) => void;
  bookingCount: number;
}

export function Header({ view, onNavigate, bookingCount }: HeaderProps) {
  const { user, logout, hasMoreBookings } = useApp();
  const { t } = useLanguage();
  if (!user) return null;

  const isTenant = user.role === "tenant";

  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 backdrop-blur-sm">
      <div className="page-shell flex flex-wrap items-center gap-x-1 md:flex-nowrap md:gap-x-6">
        <button
          type="button"
          onClick={() => onNavigate("search")}
          className="flex h-14 shrink-0 items-center md:h-16"
          aria-label="Пляцоўка — наверх"
        >
          <Logo size="compact" />
        </button>

        {isTenant ? (
          <nav
            className="order-last flex h-10 shrink-0 basis-full items-center gap-5 md:order-none md:h-16 md:basis-auto lg:gap-7"
            aria-label={t("Основная навигация")}
          >
            <NavLink active={view === "search"} onClick={() => onNavigate("search")}>
              {t("Каталог")}
            </NavLink>
            <NavLink active={view === "bookings"} onClick={() => onNavigate("bookings")}>
              {t("Мои брони")}
              {bookingCount > 0 && (
                <span className="ml-1.5 rounded-md bg-orange-soft px-1.5 font-mono text-[13px] tabular-nums text-ink">
                  {String(bookingCount).padStart(2, "0")}{hasMoreBookings ? "+" : ""}
                </span>
              )}
            </NavLink>
            <button type="button" onClick={() => onNavigate("profile")} aria-current={view === "profile" ? "page" : undefined} className={`flex h-full shrink-0 items-center whitespace-nowrap border-b-2 text-[14px] font-medium transition-colors ${view === "profile" ? "border-orange text-ink" : "border-transparent text-ink-mute hover:text-ink"}`}>
              {t("Профиль")}
            </button>
          </nav>
        ) : (
          <span className="mono-label hidden md:inline">{t("Кабинет УО")}</span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
          <LanguageToggle compact />
          <ThemeToggle />
          <div className="hidden max-w-40 text-right lg:block">
            <div className="truncate text-[14px] leading-tight font-medium" title={user.name}>{user.name}</div>
            <div className="mt-0.5 font-mono text-[13px] leading-tight tracking-[0.08em] uppercase text-ink-mute">
              {t(ROLE_LABEL[user.role])}
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="grid size-8 place-items-center rounded-lg text-ink-mute transition-colors duration-150 hover:text-orange"
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
      className={`flex h-full items-center gap-0 whitespace-nowrap border-b-2 text-[14px] font-medium transition-colors duration-150 ${
        active
          ? "-mb-px border-orange text-ink"
          : "-mb-px border-transparent text-ink-mute hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
