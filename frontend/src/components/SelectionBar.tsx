import { durationLabel, money } from "../lib/format";
import { useLanguage } from "../lib/i18n";

interface SelectionBarProps {
  count: number;
  hours: number;
  total: number;
  disabled?: boolean;
  onClear: () => void;
  onBook: () => void;
}

export function SelectionBar({ count, hours, total, disabled = false, onClear, onBook }: SelectionBarProps) {
  const { language, t } = useLanguage();
  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl border-t border-line bg-surface/95 shadow-lg backdrop-blur-sm">
      <div className="page-shell grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:flex sm:min-h-[76px] sm:gap-4">
        <div className="min-w-0">
          <p className="font-serif text-[20px] leading-tight font-semibold">
            {durationLabel(hours, language)}
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[14px] leading-snug text-ink-soft sm:text-[15px]">
            <span>{t("Тариф за интервал")} · {money(total)}</span>
            <span className="font-medium text-ink">{t("К оплате 0 BYN")}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="btn btn-quiet h-10 rounded-lg px-2.5 text-[14px] sm:ml-auto sm:px-4"
        >
          {t("Сбросить")}
        </button>

        <button type="button" onClick={onBook} disabled={disabled} className="btn btn-primary col-span-2 h-11 rounded-lg px-4 text-[15px] disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:px-5">
          {t("Забронировать всё")}
        </button>
      </div>
    </div>
  );
}
