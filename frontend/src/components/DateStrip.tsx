import { dayNumber, monthShort, weekdayShort } from "../lib/format";
import { useLanguage } from "../lib/i18n";

interface DateStripProps {
  days: string[];
  active: string;
  counts: Record<string, number>;
  onSelect: (date: string) => void;
}

export function DateStrip({ days, active, counts, onSelect }: DateStripProps) {
  const { language, t } = useLanguage();
  return (
    <div className="relative min-w-0">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0" role="group" aria-label={t("Дата")}>
        {days.map((date, index) => {
          const selected = date === active;
          const count = counts[date] ?? 0;

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={selected}
              className={`flex min-w-[88px] flex-1 flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-offset-[-2px] sm:min-w-[92px] sm:px-4 ${
                selected ? "border-blue/55 bg-sky-soft/65 text-blue-deep" : "border-line bg-surface text-ink hover:border-line-strong"
              }`}
            >
              <span className="text-[13px] font-semibold capitalize">
                {index === 0 ? t("сегодня") : index === 1 ? t("завтра") : weekdayShort(date, language)}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-serif text-[21px] leading-none font-semibold tabular-nums">
                  {dayNumber(date)}
                </span>
                <span className="text-[13px] lowercase text-ink-mute">
                  {monthShort(date, language)}
                </span>
              </span>
              <span className="text-[14px] tabular-nums text-ink-mute">
                {count > 0 ? `${Number(count.toFixed(2))} ${t("ч")}` : "—"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 -right-4 w-7 bg-gradient-to-l from-paper to-transparent md:hidden" />
    </div>
  );
}
