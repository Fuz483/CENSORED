import { useEffect, useMemo, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import { ROOM_TYPES, nextDays, toISODate } from "../lib/data";
import { dayNumber, durationLabel, intervalHours, intervalLabel, intervalPrice, money, monthShort, weekdayShort } from "../lib/format";
import type { Booking } from "../lib/types";
import { errorMessage } from "../lib/repository";
import { freeSlotHours, freeSlots, useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";
import { IntervalPicker } from "./IntervalPicker";
import { isRangeAvailable } from "../lib/intervals";

interface ManualBookingDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (booking: Booking) => void;
}

export function ManualBookingDialog({
  open,
  onClose,
  onSaved,
}: ManualBookingDialogProps) {
  const { user, listings, slots, createManualBooking } = useApp();
  const { t, language } = useLanguage();
  const ownListings = useMemo(
    () => listings.filter((listing) => listing.ownerId === user?.user_id),
    [listings, user?.user_id],
  );
  const dates = useMemo(() => nextDays(7).map(toISODate), []);

  const [listingId, setListingId] = useState<number>(() => ownListings[0]?.id ?? 0);
  const [date, setDate] = useState(dates[0]);
  const [startTime, setStartTime] = useState(() => {
    const firstFree = freeSlots(slots, ownListings[0]?.id ?? 0, dates[0])[0]?.startTime;
    return firstFree ?? "14:00";
  });
  const [endTime, setEndTime] = useState(() => {
    const firstFree = freeSlots(slots, ownListings[0]?.id ?? 0, dates[0])[0]?.startTime ?? "14:00";
    return nextHour(firstFree);
  });
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const listing = ownListings.find((item) => item.id === listingId);
  const free = listing ? freeSlots(slots, listing.id, date) : [];
  const selectedRequest = listing ? { listingId: listing.id, date, startTime, endTime } : undefined;
  const validRange = Boolean(listing && isRangeAvailable(slots, listing.id, date, startTime, endTime));
  const selectedHours = intervalHours(startTime, endTime);
  const total = listing ? intervalPrice(listing.price, startTime, endTime) : 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);

  if (!open || !user) return null;

  const changeListing = (id: number) => {
    setListingId(id);
    const firstFree = freeSlots(slots, id, date)[0]?.startTime ?? "14:00";
    setStartTime(firstFree);
    setEndTime(nextHour(firstFree));
    setError(null);
  };

  const changeDate = (next: string) => {
    setDate(next);
    const firstFree = freeSlots(slots, listingId, next)[0]?.startTime ?? "14:00";
    setStartTime(firstFree);
    setEndTime(nextHour(firstFree));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!listing) {
        setError(t("Сначала выберите пространство."));
      return;
    }
    if (!validRange) {
        setError(t("Выберите доступный интервал."));
      return;
    }
    if (!customerName.trim()) {
        setError(t("Укажите имя клиента или название группы."));
      return;
    }
    if (customerPhone.replace(/\D/g, "").length < 9) {
        setError(t("Укажите телефон клиента в формате +375…"));
      return;
    }

    try {
      const booking = await createManualBooking({
        listingId: listing.id,
        date,
        startTime,
        endTime,
        customerName,
        customerPhone,
        note,
      });
      onSaved(booking);
    } catch (caught) {
        setError(t(errorMessage(caught, "Не удалось создать бронь: проверьте поля и свободные часы.")));
      return;
    }
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-booking-title"
        className="sheet-in flex max-h-[94dvh] w-full max-w-[580px] flex-col overflow-y-auto rounded-t-[10px] border border-line bg-surface sm:rounded-[6px] sm:shadow-[0_24px_80px_rgba(13,36,55,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2
              id="manual-booking-title"
              className="text-[22px] tracking-[-0.025em]"
            >
              {t("Забронировать для клиента")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center text-ink-mute transition-colors hover:text-ink"
            aria-label={t("Закрыть")}
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        {ownListings.length === 0 ? (
          <div className="px-5 py-8 sm:px-6">
            <p className="text-[14px]">{t("Сначала добавьте хотя бы одно пространство.")}</p>
            <button type="button" onClick={onClose} className="btn btn-quiet mt-4">
              {t("Закрыть")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-5 sm:px-6">
            <div>
              <label htmlFor="booking-space" className="label mb-1.5 block">
                {t("Пространство")}
              </label>
              <select
                id="booking-space"
                value={listingId}
                onChange={(event) => changeListing(Number(event.target.value))}
                className="field-box cursor-pointer"
              >
                {ownListings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.room)} · {t(ROOM_TYPES[item.type].label)} · {item.address}
                  </option>
                ))}
              </select>
            </div>

            {listing && (
              <div className="mt-4 flex items-center gap-3 border border-line bg-paper/45 p-2.5">
                <div className="photo-frame aspect-[4/3] w-[72px] shrink-0">
                  <img src={listing.image} alt={`${t(listing.room)}, ${t(listing.school)}`} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">
                    {t(listing.school)} · {t(listing.room)}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                    {listing.address} · до {listing.capacity} человек · {money(listing.price)} за час
                  </p>
                </div>
              </div>
            )}

            <div className="mt-5">
              <span className="label mb-2 block">{t("Дата")}</span>
              <div className="grid grid-cols-7 gap-1">
                {dates.map((item, index) => {
                  const active = item === date;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => changeDate(item)}
                      aria-pressed={active}
                      className={`flex flex-col items-center gap-1 border px-1 py-2 transition-colors ${
                        active
                          ? "border-orange bg-orange text-white"
                          : "border-line text-ink-soft hover:border-blue"
                      }`}
                    >
                      <span className="font-mono text-[11px] tracking-[0.02em] uppercase opacity-85">
                        {index === 0 ? t("сегодня") : weekdayShort(item, language)}
                      </span>
                      <span className="font-serif text-[15px] leading-none font-medium tabular-nums">
                        {dayNumber(item)}
                      </span>
                      <span className="font-mono text-[10px] leading-none opacity-85">
                        {monthShort(item, language)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="label">{t("Доступность")}</span>
                <span className="font-mono text-[12px] uppercase tracking-[0.04em] text-ink-soft">
                  {freeSlotHours(free)} ч
                </span>
              </div>
              {free.length > 0 ? (
                <IntervalPicker
                  listing={listing!}
                  date={date}
                  slots={slots}
                  selected={selectedRequest}
                  onChange={(start, end) => { setStartTime(start); setEndTime(end); setError(null); }}
                />
              ) : (
                <p className="border border-line bg-paper/45 px-3 py-3 text-[14px] text-ink-soft">
                  {t("На этот день свободных часов нет. Выберите другую дату.")}
                </p>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="booking-name" className="label mb-1.5 block">
                  {t("Клиент или группа")}
                </label>
                <input
                  id="booking-name"
                  value={customerName}
                  onChange={(event) => {
                    setCustomerName(event.target.value);
                    setError(null);
                  }}
                  placeholder={t("Например, секция волейбола")}
                  autoComplete="off"
                  className="field-box"
                />
              </div>
              <div>
                <label htmlFor="booking-phone" className="label mb-1.5 block">
                  {t("Телефон")}
                </label>
                <input
                  id="booking-phone"
                  type="tel"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(event) => {
                    setCustomerPhone(event.target.value);
                    setError(null);
                  }}
                  placeholder="+375 (29) 000-00-00"
                  autoComplete="off"
                  className="field-box"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="booking-note" className="label mb-1.5 block">
                  {t("Комментарий")} <span className="font-normal text-ink-mute">— {t("необязательно")}</span>
                </label>
                <textarea
                  id="booking-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder={t("Что важно знать администратору")}
                  className="w-full resize-none rounded-[3px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-mute/70 focus:border-blue"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-[12px] leading-relaxed text-orange">
                {error}
              </p>
            )}

            <div className="mt-6 border-t border-line pt-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[12.5px] text-ink-soft">
                  {validRange
                    ? `${durationLabel(selectedHours, language)} · ${intervalLabel(startTime, endTime)}`
                    : t("Интервал недоступен")}
                </span>
                <span className="font-serif text-[22px] font-medium tabular-nums">
                  {money(total)}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={onClose} className="btn btn-quiet flex-1">
                  {t("Отмена")}
                </button>
                <button type="submit" disabled={!validRange} className="btn btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50">
                  {t("Создать бронь")}
                </button>
              </div>
              <p className="mt-3 text-center text-[11.5px] text-ink-mute">
                {t("Бронь сразу займёт выбранный интервал и появится в списке.")}
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function nextHour(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const endMinutes = hour * 60 + minute + 60;
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
}
