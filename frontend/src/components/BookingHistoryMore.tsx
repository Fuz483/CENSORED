import { useState } from "react";
import { useLanguage } from "../lib/i18n";
import { errorMessage } from "../lib/repository";
import { useApp } from "../state/AppState";

export function BookingHistoryMore() {
  const { hasMoreBookings, loadingMoreBookings, loadMoreBookings } = useApp();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  if (!hasMoreBookings) return null;

  async function loadMore() {
    setError(null);
    try {
      await loadMoreBookings();
    } catch (caught) {
      setError(errorMessage(caught, "Не удалось загрузить данные."));
    }
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-quiet" disabled={loadingMoreBookings} onClick={() => void loadMore()}>
        {t(loadingMoreBookings ? "Подождите…" : "Показать ещё")}
      </button>
      {error && <p role="alert" className="text-[14px] text-ink-soft">{t(error)}</p>}
    </div>
  );
}
