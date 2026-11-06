import { HOURS, nextDays, toISODate } from "../lib/data";
import { dayNumber, monthShort, weekdayShort } from "../lib/format";
import { freeSlotHours, useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";

/**
 * The weekly availability chart on the login screen, built from the same
 * slot data the catalog uses. No decorative fake numbers.
 */
export function WeekAvailability({ className = "" }: { className?: string }) {
  const { slots, listings } = useApp();
  const { t, language } = useLanguage();
  const days = nextDays(7).map(toISODate);
  const capacity = Math.max(1, listings.length * HOURS.length);

  const rows = days.map((date) => ({
    date,
    count: freeSlotHours(slots.filter((slot) => slot.date === date)),
  }));

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-end justify-between gap-5 border-b border-paper/25 pb-3">
        <div>
          <p className="text-[13px] font-semibold tracking-[-0.02em] text-paper">{t("Свободные часы на неделе")}</p>
          <p className="mt-2 font-serif text-[34px] leading-none font-bold tabular-nums sm:text-[42px]">
            {total}
            <span className="ml-1.5 font-sans text-[12px] font-normal text-paper/65">
              {t("часов")}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="max-w-[19ch] text-right text-[11.5px] leading-relaxed text-paper/65">
            {listings.length} {t("пространств")}
          </p>
          <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.04em] text-paper/75">
            <span className="size-1.5 rounded-full bg-[#75c9c0]" aria-hidden="true" />
            {t("свободно")}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <ol className="grid grid-cols-7 overflow-hidden border-b border-paper/20">
          {rows.map((row, index) => {
            const percent = row.count === 0 ? 0 : Math.max(1, Math.round((row.count / capacity) * 100));
            const today = index === 0;
            return (
              <li
                key={row.date}
                className="availability-day min-w-0 pb-3"
              >
                <div className="flex items-baseline justify-between gap-1 px-1 sm:px-3">
                  <span
                    className={`text-[9.5px] font-semibold uppercase sm:text-[11.5px] ${
                      today ? "text-[#f3b08a]" : "text-paper/65"
                    }`}
                  >
                    {today ? t("сегодня") : weekdayShort(row.date, language)}
                  </span>
                  <span className="hidden text-[11px] text-paper/50 sm:inline">
                    {monthShort(row.date, language)}
                  </span>
                </div>
                <p className="mt-1.5 px-1 text-[17px] leading-none font-bold tabular-nums text-paper sm:px-3 sm:text-[21px]">
                  {dayNumber(row.date)}
                </p>
                <div
                  className="availability-track mt-3 flex h-32 items-end sm:h-40"
                  role="img"
                  aria-label={`${weekdayShort(row.date, language)} ${dayNumber(row.date)}: ${row.count} ${t("свободных часов")}`}
                >
                  <div
                    className={`availability-bar w-full ${today ? "availability-bar-today" : "availability-bar-other"}`}
                    style={{ height: `${percent}%`, animationDelay: `${index * 35}ms` }}
                    title={`${row.count} ${t("свободных часов")}`}
                  />
                </div>
                <p
                  className={`mt-2 px-1 text-[11px] tabular-nums sm:px-3 sm:text-[13px] ${
                    today ? "font-medium text-paper" : "text-paper/75"
                  }`}
                >
                  {row.count} {t("ч")}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

    </div>
  );
}
