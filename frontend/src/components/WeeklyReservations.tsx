import { useState, type FormEvent } from "react";

import { toISODate } from "../lib/data";
import { intervalLabel, longDate, weekdayFull } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { errorMessage } from "../lib/repository";
import type { Listing } from "../lib/types";
import { useApp } from "../state/AppState";

export function WeeklyReservations({ listings }: { listings: Listing[] }) {
  const { weeklyReservations, createWeeklyReservation, cancelWeeklyReservation } = useApp();
  const { t, language } = useLanguage();
  const [listingId, setListingId] = useState<number>();
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("17:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listing = listings.find((item) => item.id === listingId) ?? listings[0];

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (caught) { setError(errorMessage(caught, "Не удалось сохранить изменения.")); }
    finally { setBusy(false); }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!listing || busy) return;
    void run(async () => {
      await createWeeklyReservation({ listingId: listing.id, label, date, startTime, endTime });
      setLabel("");
    });
  };

  return (
    <section className="grid gap-7 py-6 md:grid-cols-2" aria-labelledby="weekly-title">
      <div>
        <h2 id="weekly-title" className="text-[24px]">{t("Постоянные клиенты")}</h2>
        <p className="mt-2 max-w-[48ch] text-[14px] leading-relaxed text-ink-soft">
          {t("Выберите первую дату и время. Интервал будет закрыт для других клиентов в этот день недели до отмены серии.")}
        </p>
        {listing ? (
          <form onSubmit={submit} className="mt-5 grid gap-3">
            <label className="label">
              {t("Пространство")}
              <select className="field-box mt-1" value={listing.id} onChange={(event) => setListingId(Number(event.target.value))}>
                {listings.map((item) => <option key={item.id} value={item.id}>{t(item.room)}</option>)}
              </select>
            </label>
            <label className="label">
              {t("Клиент или группа")}
              <input className="field-box mt-1" required maxLength={120} value={label}
                onChange={(event) => setLabel(event.target.value)} placeholder={t("Например, секция волейбола")} />
            </label>
            <label className="label">
              {t("Первое занятие")}
              <input className="field-box mt-1" type="date" required min={toISODate(new Date())}
                value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="label">
                {t("Начало")}
                <input className="field-box mt-1" type="time" required step={900} min={listing.availableFrom}
                  max={listing.availableTo} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </label>
              <label className="label">
                {t("Окончание")}
                <input className="field-box mt-1" type="time" required step={900} min={listing.availableFrom}
                  max={listing.availableTo} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </label>
            </div>
            <button type="submit" disabled={busy || !label.trim()} className="btn btn-primary h-11 justify-self-start">
              {t("Закрепить время")}
            </button>
          </form>
        ) : <p className="mt-4 text-[14px]">{t("Сначала добавьте хотя бы одно пространство.")}</p>}
        {error && <p role="alert" className="mt-3 text-[13px] text-orange">{t(error)}</p>}
      </div>

      <div>
        <h3 className="text-[20px]">{t("Активные серии")}</h3>
        {weeklyReservations.length === 0 && <p className="mt-2 text-[14px] text-ink-soft">{t("Еженедельных резервов пока нет.")}</p>}
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {weeklyReservations.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-[13px] text-ink-soft">{listings.find((room) => room.id === item.listingId)?.room}</p>
                <p className="text-[13px] text-ink-soft">
                  {weekdayFull(item.date, language)} · {intervalLabel(item.startTime, item.endTime)} · {t("с")} {longDate(item.date, language)}
                </p>
              </div>
              <button type="button" disabled={busy} onClick={() => void run(() => cancelWeeklyReservation(item.id))}
                className="btn btn-quiet">{t("Отменить серию")}</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
