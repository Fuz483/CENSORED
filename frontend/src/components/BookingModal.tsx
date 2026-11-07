import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, X } from "lucide-react";

import { useDialog } from "../hooks/useDialog";
import { ROOM_TYPES } from "../lib/data";
import { durationLabel, intervalHours, intervalLabel, longDate } from "../lib/format";
import type { Booking, BookingRequest, Listing, RentalAgreement } from "../lib/types";
import { PartialBookingError, errorMessage } from "../lib/repository";
import { useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";
import { PassQr } from "./PassQr";

interface BookingModalProps {
  requests: BookingRequest[];
  onClose: () => void;
  onGoToBookings: () => void;
}

interface Group {
  listing: Listing;
  request: BookingRequest;
}

type Step = "review" | "processing" | "done";

export function BookingModal({ requests, onClose, onGoToBookings }: BookingModalProps) {
  const { listings, previewAgreements, bookSlots } = useApp();
  const { t, language } = useLanguage();
  const [step, setStep] = useState<Step>("review");
  const [created, setCreated] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<RentalAgreement[] | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useDialog<HTMLDivElement>(onClose, { closeOnEscape: step !== "processing" });

  const groups = useMemo<Group[]>(() => requests.flatMap((request) => {
    const listing = listings.find((item) => item.id === request.listingId);
    return listing ? [{ listing, request }] : [];
  }), [listings, requests]);

  const hours = groups.reduce(
    (sum, group) => sum + intervalHours(group.request.startTime, group.request.endTime), 0,
  );
  const createdHours = created.reduce((sum, booking) => sum + intervalHours(booking.startTime, booking.endTime), 0);
  const date = groups[0]?.request.date ?? "";
  const cover = groups[0]?.listing;

  const submit = async () => {
    if (step !== "review" || !accepted || !agreements?.length) return;
    setStep("processing");
    setError(null);
    try {
      const bookings = await bookSlots(requests, agreements.map((agreement) => agreement.token));
      setCreated(bookings);
      setStep("done");
    } catch (caught) {
      setError(t(errorMessage(caught, "Не удалось оформить бронь. Обновите каталог и попробуйте ещё раз.")));
      if (caught instanceof PartialBookingError) {
        setCreated(caught.created);
        setStep("done");
      } else {
        setAccepted(false);
        setAgreements(null);
        setStep("review");
      }
    }
  };

  useEffect(() => {
    let active = true;
    previewAgreements(requests).then((previews) => {
      if (active) setAgreements(previews);
    }).catch((caught) => {
      if (active) setError(errorMessage(caught, "Не удалось загрузить договор аренды."));
    });
    return () => { active = false; };
  }, [attempt, previewAgreements, requests]);

  useEffect(() => {
    if (step === "done") dialogRef.current?.scrollTo({ top: 0 });
  }, [dialogRef, step]);

  const close = () => {
    if (step === "processing") return;
    onClose();
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-2 sm:items-center sm:p-4"
      onClick={close}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        className="sheet-in max-h-[calc(100dvh-1rem)] w-full max-w-[640px] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface outline-none sm:max-h-[calc(100dvh-2rem)] sm:shadow-[0_24px_80px_rgba(13,36,55,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 py-2.5 sm:px-6 sm:py-4">
          <div>
            <h2
              id="booking-title"
              className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl"
            >
              {t(step === "done" ? "Бронь оформлена" : step === "processing" ? "Оформляем бронь" : "Договор аренды")}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={step === "processing"}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-soft transition-colors hover:bg-sky-soft hover:text-ink disabled:opacity-30"
            aria-label={t("Закрыть")}
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        {step === "done" ? (
          <div className="p-4 sm:p-6">
            {cover && (
              <div className="photo-frame mb-4 aspect-[2/1] rounded-lg sm:aspect-[16/7]">
                <img
                  src={cover.image}
                  alt={`${t(ROOM_TYPES[cover.type].label)} «${t(cover.room)}»`}
                />
              </div>
            )}

            {error && <p role="alert" className="mb-3 text-base text-orange">{error}</p>}
            {cover && <p className="wrap-break-word text-xl font-bold">{t(cover.room)} · {t(cover.school)}</p>}
            <p role="status" className="mt-1 text-base text-ink-soft">{longDate(date, language)} · {t("Бронь подтверждена")}</p>
            {!created.some((booking) => booking.state === "confirmed" && booking.code) && (
              <p role="alert" className="mt-2 text-base text-orange">{t("Сервер не вернул QR-код для брони.")}</p>
            )}
            <p className="mt-3 text-base text-ink-soft">
              {durationLabel(createdHours, language)} · {t("бронь закреплена за вашим номером")}
            </p>
            <p className="mt-2 wrap-break-word text-base text-ink-soft">
              {created.length === 1
                ? `${t("Номер брони")}: ${created[0].id}`
                : `${t("Номера броней")}: ${created.map((booking) => booking.id).join(", ")}`}
            </p>

            {created.length > 1 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {created.map((booking) => (
                  <li key={booking.id} className="flex items-center gap-3">
                    <div className="photo-frame size-10 shrink-0 rounded-lg">
                      <img src={booking.listing.image} alt="" />
                    </div>
                    <span className="min-w-0 flex-1 wrap-break-word text-base">
                      {t(booking.listing.school)} · {t(booking.listing.room)}
                    </span>
                    <span className="text-sm font-medium tabular-nums text-ink-soft">
                      №{booking.id}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {created.filter((booking) => booking.state === "confirmed" && booking.code).map((booking) => (
              <div key={booking.id} className="mt-4 rounded-lg border border-line bg-paper/50 px-4 py-5">
                <PassQr code={booking.code!} />
              </div>
            ))}

            <div className="mt-6 grid gap-2 min-[400px]:grid-cols-2">
              <button type="button" onClick={onGoToBookings} className="btn btn-primary min-h-12 rounded-lg text-base">
                {t("Мои брони")}
              </button>
              <button type="button" onClick={onClose} className="btn btn-quiet min-h-12 rounded-lg text-base">
                {t("Закрыть")}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            {date && (
              <p className="flex items-center gap-2 text-base font-semibold text-ink-soft">
                <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
                <time dateTime={date}>{longDate(date, language)}</time>
              </p>
            )}

            <ul className="mt-3 grid gap-3">
              {groups.map((group) => (
                <li
                  key={`${group.listing.id}-${group.request.date}-${group.request.startTime}`}
                  className="flex items-start gap-3 rounded-lg border border-line bg-paper/70 p-3 sm:gap-4 sm:p-4"
                >
                  <div className="photo-frame size-14 shrink-0 rounded-lg sm:size-20">
                    <img
                      src={group.listing.image}
                      alt={`${t(ROOM_TYPES[group.listing.type].label)} «${t(group.listing.room)}»`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="wrap-break-word text-lg leading-snug font-bold">{t(group.listing.room)}</p>
                    <p className="mt-1 wrap-break-word text-base leading-snug text-ink-soft">
                      {[t(group.listing.school), group.listing.address].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-base font-semibold tabular-nums">
                      <Clock3 className="size-4 shrink-0" aria-hidden="true" />
                      {intervalLabel(group.request.startTime, group.request.endTime)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-sky-soft/65 p-3 text-base sm:p-4">
              <p className="font-semibold">{t("Длительность")} · {durationLabel(hours, language)}</p>
              <p className="text-ink-soft">{t("К оплате 0 BYN. Карта не нужна.")}</p>
            </div>

            <div className="mt-4">
              {step === "processing" ? (
                <div className="flex min-h-12 items-center justify-center gap-2 text-base text-ink-soft" role="status">
                  <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  {t("Отправляем запрос на бронирование…")}
                </div>
              ) : agreements ? (
                <>
                  <div className="space-y-3">
                    {agreements.map((agreement, index) => (
                      <div key={agreement.token} className="rounded-lg border border-line bg-paper/45 p-3.5 sm:p-5">
                        {agreements.length > 1 && <h3 className="mb-2 text-lg font-bold">{t("Договор аренды")} {index + 1}</h3>}
                        <p className="wrap-break-word text-base leading-relaxed whitespace-pre-wrap">{agreement.text}</p>
                      </div>
                    ))}
                  </div>
                  <label className="mt-3 flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-line p-3.5 text-base leading-snug font-semibold sm:p-4">
                    <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)}
                      className="mt-0.5 size-5 shrink-0 accent-orange" />
                    <span>{t(agreements.length === 1 ? "Я согласен с условиями договора аренды" : "Я согласен с условиями всех договоров аренды")}</span>
                  </label>
                  <button type="button" onClick={() => void submit()} disabled={!accepted} className="btn btn-primary mt-3 min-h-12 w-full rounded-lg text-base">
                    {t("Подтвердить и получить QR")}
                  </button>
                </>
              ) : error ? (
                <button type="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }}
                    className="btn btn-quiet min-h-12 w-full rounded-lg text-base">{t("Загрузить договор заново")}</button>
              ) : (
                <p role="status" className="text-base text-ink-soft">{t("Загружаем договор аренды…")}</p>
              )}

              {error && <p role="alert" className="mt-3 text-base text-orange">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
