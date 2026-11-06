import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { ROOM_TYPES } from "../lib/data";
import { durationLabel, intervalHours, intervalLabel, intervalPrice, longDate, money, plural, roundMoney } from "../lib/format";
import type { Booking, BookingRequest, Listing } from "../lib/types";
import { errorMessage } from "../lib/repository";
import { useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";

interface BookingModalProps {
  requests: BookingRequest[];
  onClose: () => void;
  onGoToBookings: () => void;
}

interface Group {
  listing: Listing;
  request: BookingRequest;
}

type Step = "confirm" | "processing" | "done";

export function BookingModal({ requests, onClose, onGoToBookings }: BookingModalProps) {
  const { listings, bookSlots } = useApp();
  const { t, language } = useLanguage();
  const [step, setStep] = useState<Step>("confirm");
  const [created, setCreated] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo<Group[]>(() => requests.flatMap((request) => {
    const listing = listings.find((item) => item.id === request.listingId);
    return listing ? [{ listing, request }] : [];
  }), [listings, requests]);

  const estimate = groups.reduce(
    (sum, group) => sum + intervalPrice(group.listing.price, group.request.startTime, group.request.endTime), 0,
  );
  const hours = groups.reduce(
    (sum, group) => sum + intervalHours(group.request.startTime, group.request.endTime), 0,
  );
  const total = roundMoney(created.length ? created.reduce((sum, booking) => sum + booking.total, 0) : estimate);
  const date = groups[0]?.request.date ?? "";
  const cover = groups[0]?.listing;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && step !== "processing") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, step]);

  const confirm = async () => {
    setStep("processing");
    setError(null);
    try {
      const bookings = await bookSlots(requests);
      setCreated(bookings);
      setStep("done");
    } catch (caught) {
      setError(t(errorMessage(caught, "Не удалось оформить бронь. Обновите каталог и попробуйте ещё раз.")));
      setStep("confirm");
    }
  };

  const close = () => {
    if (step === "processing") return;
    onClose();
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center sm:p-4"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        className="sheet-in flex max-h-[92dvh] w-full max-w-[540px] flex-col overflow-y-auto rounded-t-[10px] border border-line bg-surface sm:rounded-[6px] sm:shadow-[0_24px_80px_rgba(13,36,55,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2
              id="booking-title"
              className="text-[22px] leading-tight tracking-[-0.025em]"
            >
              {step === "done" ? t("Бронь оформлена") : t("Проверьте детали")}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={step === "processing"}
            autoFocus
            className="grid size-8 shrink-0 place-items-center text-ink-mute transition-colors hover:text-ink disabled:opacity-30"
            aria-label={t("Закрыть")}
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        {step === "done" ? (
          <div className="px-5 py-6 sm:px-6 sm:py-7">
            {cover && (
              <div className="photo-frame mb-5 aspect-[16/7]">
                <img
                  src={cover.image}
                  alt={`${ROOM_TYPES[cover.type].label} «${cover.room}»`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent" />
                <p className="absolute bottom-3 left-4 font-serif text-[17px] text-paper">
                  {cover.school} · {cover.room}
                </p>
              </div>
            )}

            <p className="text-[14px] text-ink-soft">{longDate(date, language)} · {t("оплачено")}</p>
            <p className="mt-2 font-serif text-[32px] leading-none font-medium tabular-nums">
              {money(total)}
            </p>
            <p className="mt-3 text-[14px] text-ink-soft">
              {durationLabel(hours, language)} · {t("бронь закреплена за вашим номером")}
            </p>
            <p className="mt-2 text-[13px] text-ink-soft">
              {created.length === 1
                ? `${t("Номер брони")}: ${created[0].id}`
                : `${t("Номера броней")}: ${created.map((booking) => booking.id).join(", ")}`}
            </p>

            {created.length > 1 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {created.map((booking) => (
                  <li key={booking.id} className="flex items-center gap-3">
                    <div className="photo-frame size-10 shrink-0">
                      <img src={booking.listing.image} alt="" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {booking.listing.school} · {booking.listing.room}
                    </span>
                    <span className="font-mono text-[12px] text-ink-soft">
                      №{booking.id}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-5 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-soft">
              {t("Оплата демонстрационная — деньги не списываются. Ключ и пропуск выдаёт администратор школы на вахте по номеру брони.")}
            </p>

            <div className="mt-6 flex gap-2">
              <button type="button" onClick={onGoToBookings} className="btn btn-primary flex-1">
                {t("Мои брони")}
              </button>
              <button type="button" onClick={onClose} className="btn btn-quiet flex-1">
                {t("Закрыть")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {cover && (
              <div className="photo-frame aspect-[16/7]">
                <img
                  src={cover.image}
                  alt={`${ROOM_TYPES[cover.type].label} «${cover.room}»`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/15 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 text-paper sm:p-5">
                  <div>
                    <p className="font-mono text-[12px] tracking-[0.04em] text-paper/85">
                      {longDate(date, language)}
                    </p>
                    <p className="mt-1 font-serif text-[20px] leading-tight">
                      {cover.school} · {cover.room}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-[12px] text-paper/85">
                    {groups.length}{" "}
                    {plural(groups.length, [
                      t("пространство"),
                      t("пространства"),
                      t("пространств"),
                    ])}
                  </p>
                </div>
              </div>
            )}

            <div className="px-5 py-5 sm:px-6">
              <div className="divide-y divide-line border-b border-line">
                {groups.map((group, index) => (
                  <div key={group.listing.id} className="flex gap-4 py-4">
                    <div className="photo-frame aspect-square w-[58px] shrink-0 sm:w-[68px]">
                      <img
                        src={group.listing.image}
                        alt={`${ROOM_TYPES[group.listing.type].label} «${group.listing.room}»`}
                      />
                      <span className="absolute top-0 left-0 bg-paper px-1 py-0.5 font-mono text-[11px]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="min-w-0 truncate text-[14px] font-medium">
                          {group.listing.room}
                        </p>
                        <p className="shrink-0 text-[13px] tabular-nums">
                          {money(intervalPrice(group.listing.price, group.request.startTime, group.request.endTime))}
                        </p>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-soft">
                        {group.listing.address} · {group.listing.school} · {ROOM_TYPES[group.listing.type].label}
                      </p>
                      <p className="mt-2 font-mono text-[13px] tabular-nums text-ink-soft">
                        {intervalLabel(group.request.startTime, group.request.endTime)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-auto border-t border-ink/15 px-5 py-5 sm:px-6">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[15px] font-medium text-ink-soft">
                  {t("Итого")} · {durationLabel(hours, language)}
                </span>
                <span className="font-serif text-[24px] font-medium tabular-nums">
                  {money(total)}
                </span>
              </div>

              <button
                type="button"
                onClick={confirm}
                disabled={step === "processing"}
                className="btn btn-primary mt-4 h-12 w-full"
              >
                {step === "processing" ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {t("Оформляем…")}
                  </>
                ) : (
                  <>{t("Оплатить")} {money(total)}</>
                )}
              </button>

              {error && <p role="alert" className="mt-3 text-[12px] text-orange">{error}</p>}

              <p className="mt-3 text-center text-[13px] text-ink-soft">
                {t("Демо-оплата. Реальные деньги не списываются.")}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
