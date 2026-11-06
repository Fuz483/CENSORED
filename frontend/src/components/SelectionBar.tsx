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
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/15 bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-[76px] max-w-[1180px] items-center gap-4 px-5 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:px-8">
        <div className="min-w-0">
          <p className="font-serif text-[19px] leading-none font-semibold">
            {durationLabel(hours, language)}
          </p>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            {t("Итого за интервал")} · {money(total)}
          </p>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="ml-auto hidden text-[14px] text-ink-mute underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-orange sm:block"
        >
          Сбросить
        </button>

        <button type="button" onClick={onBook} disabled={disabled} className="btn btn-primary h-12 px-5 text-[15px] disabled:cursor-not-allowed disabled:opacity-50">
          {t("Забронировать всё")}
        </button>
      </div>
    </div>
  );
}
