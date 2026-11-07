import { HOURS, nextDays, toISODate } from "../lib/data";
import { dayNumber, monthShort, weekdayShort } from "../lib/format";
import { freeSlotHours, useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";

/**
 * The weekly availability chart on the login screen, built from the same
 * slot data the catalog uses. No decorative fake numbers.
 */
export function WeekAvailability({ className = "" }: { className?: string }) {
  const { slots, listings, loadError } = useApp();
  const { t, language } = useLanguage();
  const days = nextDays(7).map(toISODate);
  const capacity = Math.max(1, listings.length * HOURS.length);

  const rows = days.map((date) => ({
    date,
    count: freeSlotHours(slots.filter((slot) => slot.date === date)),
  }));

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const axisTicks = [capacity, capacity * 0.75, capacity * 0.5, capacity * 0.25, 0];

  if (loadError && !listings.length) return <p role="status" className="border-t border-paper/25 py-6 text-paper/75">{t("Нет данных")}</p>;

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-end justify-between gap-4 pb-4 sm:pb-5">
        <div>
          <p className="font-mono text-[9px] font-medium tracking-[0.16em] text-paper/55 uppercase sm:text-[10px]">{t("Свободные часы на неделе")}</p>
          <p className="mt-2 font-serif text-[38px] leading-none font-bold tracking-[-0.045em] tabular-nums sm:text-[46px]">
            {total}
            <span className="ml-2 font-sans text-[12px] font-normal tracking-normal text-paper/60 sm:text-[13px]">
              {t("часов")}
            </span>
          </p>
        </div>
        <div className="mb-0.5 flex flex-col items-end gap-2.5 text-right">
          <span className="inline-flex items-center gap-2 border border-paper/15 bg-paper/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-paper/80 sm:text-[11px]">
            <span className="size-1.5 rounded-full bg-[#75c9c0] shadow-[0_0_9px_rgba(117,201,192,0.65)]" aria-hidden="true" />
            {listings.length} {t("пространств")}
          </span>
          <p className="font-mono text-[9px] tracking-[0.08em] text-paper/50 sm:text-[10px]">14:00–21:00</p>
        </div>
      </div>

      <div className="border border-paper/15 bg-paper/[0.035] px-2 pt-3 sm:px-4 sm:pt-4">
        <ol className="grid grid-cols-[30px_repeat(7,minmax(0,1fr))] sm:grid-cols-[38px_repeat(7,minmax(0,1fr))]">
          <li aria-hidden="true" />
          {rows.map((row, index) => {
            const today = index === 0;
            return (
              <li
                key={row.date}
                className={`availability-day min-w-0 border-r border-paper/[0.12] pb-2 last:border-r-0 sm:pb-3 ${today ? "availability-day-today" : ""}`}
              >
                <div className="flex min-h-4 justify-center px-0.5 sm:px-1">
                  <span
                    className={`truncate text-[8px] font-semibold uppercase tracking-[0.06em] sm:text-[10px] ${
                      today ? "text-[#f3b08a]" : "text-paper/55"
                    }`}
                  >
                    {today ? t("сегодня") : weekdayShort(row.date, language)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-center gap-1">
                  <p className={`text-[13px] leading-none font-semibold tabular-nums sm:text-[16px] ${today ? "text-paper" : "text-paper/85"}`}>
                    {dayNumber(row.date)}
                  </p>
                  <span className="hidden text-[9px] text-paper/40 sm:inline">{monthShort(row.date, language)}</span>
                </div>
                <span className="sr-only">{`${weekdayShort(row.date, language)} ${dayNumber(row.date)}: ${row.count} ${t("свободных часов")}`}</span>
                <p
                  className={`mt-2 border-r border-paper/[0.08] text-center text-[9px] tabular-nums sm:mt-2.5 sm:text-[11px] ${
                    today ? "font-semibold text-paper" : "font-medium text-paper/65"
                  }`}
                >
                  {row.count} {t("ч")}
                </p>
              </li>
            );
          })}
        </ol>
        <div className="grid grid-cols-[30px_minmax(0,1fr)] sm:grid-cols-[38px_minmax(0,1fr)]">
          <div className="availability-axis relative h-[104px] font-mono text-[8px] leading-none text-paper/40 sm:h-[132px] sm:text-[9px]" aria-hidden="true">
            {axisTicks.map((tick, index) => (
              <span key={index} className={`absolute right-2 ${index === 0 ? "top-0" : index === axisTicks.length - 1 ? "bottom-0" : "-translate-y-1/2"}`} style={index > 0 && index < axisTicks.length - 1 ? { top: `${index * 25}%` } : undefined}>
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </span>
            ))}
          </div>
          <ol className="availability-plot grid h-[104px] grid-cols-7 border-x border-b border-paper/15 sm:h-[132px]" aria-label={t("Свободные часы на неделе")}>
            {rows.map((row, index) => {
              const today = index === 0;
              return (
                <li key={row.date} className="relative min-w-0 border-r border-paper/[0.12] last:border-r-0" role="img" aria-label={`${weekdayShort(row.date, language)} ${dayNumber(row.date)}: ${row.count} ${t("свободных часов")}`}>
                  <div className={`availability-bar absolute inset-x-[3px] bottom-0 ${today ? "availability-bar-today" : "availability-bar-other"}`} style={{ height: `${Math.min(100, Math.max(0, (row.count / capacity) * 100))}%`, animationDelay: `${index * 35}ms` }} title={`${row.count} ${t("свободных часов")}`} />
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
