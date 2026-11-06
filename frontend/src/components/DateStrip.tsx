import { dayNumber, monthShort, weekdayShort } from "../lib/format";
import { useLanguage } from "../lib/i18n";

interface DateStripProps {
  days: string[];
  active: string;
  counts: Record<string, number>;
  onSelect: (date: string) => void;
}

export function DateStrip({ days, active, counts, onSelect }: DateStripProps) {
  const { language } = useLanguage();
  return (
    <div className="relative">
      <div className="no-scrollbar -mx-5 flex overflow-x-auto border-b border-ink/20 px-5 sm:mx-0 sm:px-0">
        {days.map((date, index) => {
        const selected = date === active;
        const count = counts[date] ?? 0;

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={selected}
              className={`relative flex min-w-[78px] shrink-0 flex-col items-start gap-1 border-r border-line py-3 pr-4 pl-3 text-left transition-colors duration-150 first:pl-0 last:border-r-0 sm:min-w-[88px] sm:pl-4 ${
                selected ? "text-ink" : "text-ink-mute hover:text-ink"
              }`}
            >
              <span
                className={`font-mono text-[10px] tracking-[0.08em] uppercase ${
                  selected ? "text-orange" : ""
                }`}
              >
                {index === 0 ? (language === "be" ? "сёння" : "сегодня") : index === 1 ? (language === "be" ? "заўтра" : "завтра") : weekdayShort(date, language)}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-serif text-[19px] leading-none font-medium tabular-nums">
                  {dayNumber(date)}
                </span>
                <span className="font-mono text-[10px] lowercase text-ink-mute">
                  {monthShort(date, language)}
                </span>
              </span>
              <span className="font-mono text-[10px] leading-none tabular-nums text-ink-mute">
                {count > 0 ? `${Number(count.toFixed(2))} ч` : "—"}
              </span>
              {selected && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 bg-orange" />
              )}
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper to-transparent sm:hidden" />
    </div>
  );
}
