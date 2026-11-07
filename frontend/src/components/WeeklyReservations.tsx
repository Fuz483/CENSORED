import { useState, type FormEvent } from "react";

import { toISODate } from "../lib/data";
import { intervalLabel, longDate, weekdayShort } from "../lib/format";
import { timeToMinutes } from "../lib/intervals";
import { useLanguage } from "../lib/i18n";
import { errorMessage } from "../lib/repository";
import type { Listing } from "../lib/types";
import { useApp } from "../state/AppState";
import { CustomerPhoneField } from "./CustomerPhoneField";

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const CLOCK = Array.from({ length: 29 }, (_, index) =>
  `${14 + Math.floor(index / 4)}:${String((index % 4) * 15).padStart(2, "0")}`,
);
const dayLabel = (day: number, language: "ru" | "be") => weekdayShort(`2024-01-0${day + 1}`, language);

export function WeeklyReservations({ listings }: { listings: Listing[] }) {
  const { weeklyReservations, createWeeklyReservation, linkWeeklyCustomer, setWeeklyEndDate, cancelWeeklyReservation } = useApp();
  const { t, language } = useLanguage();
  const [listingId, setListingId] = useState<number>();
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [endsOn, setEndsOn] = useState("");
  const [days, setDays] = useState<number[] | null>(null);
  const [phone, setPhone] = useState("");
  const [customerId, setCustomerId] = useState<string>();
  const [linkId, setLinkId] = useState<number | null>(null);
  const [linkPhone, setLinkPhone] = useState("");
  const [linkCustomerId, setLinkCustomerId] = useState<string>();
  const [endId, setEndId] = useState<number | null>(null);
  const [editedEnd, setEditedEnd] = useState("");
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("17:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listing = listings.find((item) => item.id === listingId) ?? listings[0];
  const selectedDays = days ?? [date ? (new Date(`${date}T12:00:00`).getDay() + 6) % 7 : 0];
  const allowed = listing ? CLOCK.filter((time) => time >= listing.availableFrom && time <= listing.availableTo) : [];
  const starts = allowed.slice(0, -4);
  const start = starts.includes(startTime) ? startTime : starts[0] ?? "";
  const ends = allowed.filter((time) => (timeToMinutes(time) ?? 0) >= (timeToMinutes(start) ?? 0) + 60);
  const end = ends.includes(endTime) ? endTime : ends[0] ?? "";

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (caught) { setError(errorMessage(caught, "Не удалось сохранить изменения.")); }
    finally { setBusy(false); }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!listing || busy || !selectedDays.length || !start || !end) return;
    void run(async () => {
      await createWeeklyReservation({ listingId: listing.id, label, date, startTime: start, endTime: end,
        weekdays: selectedDays, customerPhone: phone, customerId, endsOn });
      setLabel("");
      setPhone("");
      setCustomerId(undefined);
    });
  };

  return (
    <section className="grid gap-7 py-6 md:grid-cols-2" aria-labelledby="weekly-title">
      <div>
        <h2 id="weekly-title" className="text-[24px]">{t("Постоянные клиенты")}</h2>
        <p className="mt-2 max-w-[48ch] text-[14px] leading-relaxed text-ink-soft">
          {t("Выберите дату начала, время и один или несколько дней недели. Эти часы будут закрыты до отмены серии.")}
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
              {t("Дата начала серии")}
              <input className="field-box mt-1" type="date" required min={toISODate(new Date())}
                value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="label">
              {t("Дата окончания серии")} · {t("необязательно")}
              <input className="field-box mt-1" type="date" min={date}
                value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
            </label>
            <fieldset>
              <legend className="label mb-2">{t("Дни недели")}</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button key={day} type="button" aria-pressed={selectedDays.includes(day)}
                    onClick={() => setDays(selectedDays.includes(day) ? selectedDays.filter((item) => item !== day) : [...selectedDays, day])}
                    className={`btn px-2.5 ${selectedDays.includes(day) ? "btn-primary" : "btn-quiet"}`}>
                    {dayLabel(day, language)}
                  </button>
                ))}
              </div>
            </fieldset>
            <CustomerPhoneField value={phone} onChange={(value, id) => { setPhone(value); setCustomerId(id); }} />
            <div className="grid grid-cols-2 gap-3">
              <label className="label">
                {t("Начало")}
                <select className="field-box mt-1" required value={start} onChange={(event) => setStartTime(event.target.value)}>
                  {starts.map((time) => <option key={time}>{time}</option>)}
                </select>
              </label>
              <label className="label">
                {t("Окончание")}
                <select className="field-box mt-1" required value={end} onChange={(event) => setEndTime(event.target.value)}>
                  {ends.map((time) => <option key={time}>{time}</option>)}
                </select>
              </label>
            </div>
            <button type="submit" disabled={busy || !label.trim() || !selectedDays.length || !start || !end} className="btn btn-primary h-11 justify-self-start">
              {t("Закрепить время")}
            </button>
          </form>
        ) : <p className="mt-4 text-[14px]">{t("Сначала добавьте хотя бы одно пространство.")}</p>}
        {error && <p role="alert" className="mt-3 border-l-2 border-orange pl-3 text-[14px] text-ink">{t(error)}</p>}
      </div>

      <div>
        <h3 className="text-[20px]">{t("Активные серии")}</h3>
        {weeklyReservations.length === 0 && <p className="mt-2 text-[14px] text-ink-soft">{t("Еженедельных резервов пока нет.")}</p>}
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {weeklyReservations.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-[14px] text-ink-soft">{listings.find((room) => room.id === item.listingId)?.room}</p>
                <p className="text-[14px] text-ink-soft">
                  {item.weekdays.map((day) => dayLabel(day, language)).join(", ")} · {intervalLabel(item.startTime, item.endTime)} · {t("с")} {longDate(item.date, language)}
                </p>
                <p className="text-[14px] text-ink-soft">{item.customerName ?? t("Клиент не привязан")}</p>
                {item.endsOn && <p className="text-[14px] text-ink-soft">{t("Дата окончания серии")} · {item.endsOn}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => {
                  setEndId(null); setLinkId(item.id); setLinkPhone(""); setLinkCustomerId(undefined); setError(null);
                }}
                  className="btn btn-quiet">{t(item.customerName ? "Заменить клиента" : "Привязать клиента")}</button>
                <button type="button" disabled={busy} onClick={() => {
                  setLinkId(null); setEndId(item.id); setEditedEnd(item.endsOn ?? ""); setError(null);
                }} className="btn btn-quiet">{t("Изменить дату окончания")}</button>
                <button type="button" disabled={busy} onClick={() => void run(() => cancelWeeklyReservation(item.id))}
                  className="btn btn-quiet">{t("Отменить серию")}</button>
              </div>
              {endId === item.id && (
                <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  void run(async () => { await setWeeklyEndDate(item.id, editedEnd); setEndId(null); });
                }}>
                  <label className="label min-w-[180px] flex-1">{t("Дата окончания серии")}
                    <input className="field-box mt-1" type="date" required min={toISODate(new Date())}
                      value={editedEnd} onChange={(event) => setEditedEnd(event.target.value)} />
                  </label>
                  <button type="submit" disabled={busy} className="btn btn-primary">{t("Сохранить")}</button>
                  <button type="button" disabled={busy} onClick={() => setEndId(null)} className="btn btn-quiet">{t("Отмена")}</button>
                </form>
              )}
              {linkId === item.id && (
                <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  void run(async () => { await linkWeeklyCustomer(item.id, linkPhone, linkCustomerId); setLinkId(null); });
                }}>
                  <CustomerPhoneField key={item.id} value={linkPhone} required
                    onChange={(value, id) => { setLinkPhone(value); setLinkCustomerId(id); }} />
                  <button type="submit" disabled={busy} className="btn btn-primary">{t("Привязать")}</button>
                  <button type="button" disabled={busy} onClick={() => setLinkId(null)} className="btn btn-quiet">{t("Отмена")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
