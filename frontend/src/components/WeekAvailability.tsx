import { nextDays, toISODate } from "../lib/data";
import { longDate, weekdayShort } from "../lib/format";
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

  const rows = days.map((date) => ({
    date,
    count: freeSlotHours(slots.filter((slot) => slot.date === date)),
  }));

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const peak = Math.max(...rows.map(({ count }) => count));
  const targetStep = Math.max(1, peak / 4);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step = Math.ceil(([1, 2, 2.5, 5, 10].find((size) => size * magnitude >= targetStep) ?? 10) * magnitude);
  const scaleMax = step * 4;
  const axisTicks = [4, 3, 2, 1, 0].map((level) => level * step);

  if (loadError && !listings.length) return <p role="status" className="border-t border-on-navy/25 py-6 text-on-navy/75">{t("Нет данных")}</p>;

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-4 sm:pb-5">
        <div>
          <p className="text-sm font-medium text-on-navy/80">{t("Свободные часы на неделе")}</p>
          <p className="mt-2 font-serif text-[38px] leading-none font-bold tracking-[-0.045em] tabular-nums sm:text-[46px]">
            {total}
            <span className="ml-2 font-sans text-base font-normal tracking-normal text-on-navy/75">
              {t("часов")}
            </span>
          </p>
        </div>
        <span className="mb-0.5 inline-flex items-center gap-2 rounded-lg border border-on-navy/15 bg-on-navy/[0.06] px-2.5 py-1.5 text-sm font-medium text-on-navy/85">
          <span className="size-1.5 rounded-full bg-chart-series" aria-hidden="true" />
          {listings.length} {t("пространств")}
        </span>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 rounded-xl border border-on-navy/15 bg-on-navy/[0.035] px-3 pt-4 pb-3 [--chart-height:7rem] sm:gap-3 sm:px-4 sm:[--chart-height:9rem]">
        <div className="-mt-[7px] flex h-[calc(var(--chart-height)+14px)] flex-col items-end justify-between font-mono text-[13px] leading-[14px] text-on-navy/80" aria-hidden="true">
          {axisTicks.map((tick) => <span key={tick}>{tick}</span>)}
        </div>
        <div className="relative min-w-0">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[var(--chart-height)] flex-col justify-between" aria-hidden="true">
            {axisTicks.map((tick) => <div key={tick} className="border-t border-on-navy/15 last:border-on-navy/35" />)}
          </div>
          <ol className="relative grid grid-cols-7" aria-label={t("Свободные часы на неделе")}>
            {rows.map((row, index) => {
              const today = index === 0;
              const date = longDate(row.date, language);
              return (
                <li key={row.date} className="min-w-0 text-center">
                  <div className="relative h-[var(--chart-height)]" role="img" aria-label={`${date}: ${row.count} ${t("свободных часов")}`} title={date}>
                    <div
                      className={`availability-bar absolute inset-x-[20%] bottom-0 rounded-t-sm ${today ? "availability-bar-today" : "availability-bar-other"}`}
                      style={{ height: `${(row.count / scaleMax) * 100}%`, animationDelay: `${index * 35}ms` }}
                    />
                  </div>
                  <span className={`mt-2 block text-[13px] font-semibold uppercase ${today ? "text-chart-highlight-text" : "text-on-navy/80"}`} aria-hidden="true">
                    {weekdayShort(row.date, language)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
