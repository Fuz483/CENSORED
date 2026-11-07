import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { ROOM_TYPES } from "../lib/data";
import { durationLabel, intervalHours, intervalLabel, longDate, plural } from "../lib/format";
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
              {t(step === "done" ? "Бронь оформлена" : step === "processing" ? "Оформляем бронь" : "Договор аренды")}
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
                  alt={`${t(ROOM_TYPES[cover.type].label)} «${t(cover.room)}»`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent" />
                <p className="absolute bottom-3 left-4 font-serif text-[17px] text-paper">
                  {t(cover.school)} · {t(cover.room)}
                </p>
              </div>
            )}

            {error && <p role="alert" className="mb-3 text-[13px] text-orange">{error}</p>}
            <p className="text-[14px] text-ink-soft">{longDate(date, language)} · {t("Бронь подтверждена")}</p>
            {!created.some((booking) => booking.state === "confirmed" && booking.code) && (
              <p role="alert" className="mt-2 text-[13px] text-orange">{t("Сервер не вернул QR-код для брони.")}</p>
            )}
            <p className="mt-3 text-[14px] text-ink-soft">
              {durationLabel(createdHours, language)} · {t("бронь закреплена за вашим номером")}
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
                      {t(booking.listing.school)} · {t(booking.listing.room)}
                    </span>
                    <span className="font-mono text-[12px] text-ink-soft">
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
                  alt={`${t(ROOM_TYPES[cover.type].label)} «${t(cover.room)}»`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/15 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 text-paper sm:p-5">
                  <div>
                    <p className="font-mono text-[12px] tracking-[0.04em] text-paper/85">
                      {longDate(date, language)}
                    </p>
                    <p className="mt-1 font-serif text-[20px] leading-tight">
                      {t(cover.school)} · {t(cover.room)}
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
                  <div key={`${group.listing.id}-${group.request.date}-${group.request.startTime}`} className="flex gap-4 py-4">
                    <div className="photo-frame aspect-square w-[58px] shrink-0 sm:w-[68px]">
                      <img
                        src={group.listing.image}
                        alt={`${t(ROOM_TYPES[group.listing.type].label)} «${t(group.listing.room)}»`}
                      />
                      <span className="absolute top-0 left-0 bg-paper px-1 py-0.5 font-mono text-[11px]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="min-w-0 truncate text-[14px] font-medium">
                          {t(group.listing.room)}
                        </p>
                  <p className="shrink-0 text-[11px] text-ink-mute">{t("Бесплатно")}</p>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-soft">
                        {group.listing.address} · {t(group.listing.school)} · {t(ROOM_TYPES[group.listing.type].label)}
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
                  {durationLabel(hours, language)} · {t("Бесплатно")}
                </span>
              </div>

              {step === "processing" ? (
                <div className="mt-4 flex min-h-12 items-center justify-center gap-2 text-[14px] text-ink-soft" role="status">
                  <span className="size-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  {t("Отправляем запрос на бронирование…")}
                </div>
              ) : agreements ? (
                <>
                  <div className="mt-4 space-y-3">
                    {agreements.map((agreement, index) => (
                      <div key={agreement.token} className="border border-line bg-paper/45 p-3">
                        {agreements.length > 1 && <p className="label mb-2">{t("Договор аренды")} {index + 1}</p>}
                        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-soft">{agreement.text}</p>
                      </div>
                    ))}
                  </div>
                  <label className="mt-4 flex items-start gap-3 text-[14px] font-medium">
                    <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-orange" />
                    <span>{t(agreements.length === 1 ? "Я согласен с условиями договора аренды" : "Я согласен с условиями всех договоров аренды")}</span>
                  </label>
                  <button type="button" onClick={() => void submit()} disabled={!accepted} className="btn btn-primary mt-4 h-12 w-full">
                    {t("Подтвердить и получить QR")}
                  </button>
                </>
              ) : error ? (
                <button type="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }}
                  className="btn btn-quiet mt-4 h-12 w-full">{t("Загрузить договор заново")}</button>
              ) : (
                <p role="status" className="mt-4 text-[13px] text-ink-soft">{t("Загружаем договор аренды…")}</p>
              )}

              {error && <p role="alert" className="mt-3 text-[12px] text-orange">{error}</p>}

              <p className="mt-3 text-center text-[13px] text-ink-soft">
                {t("К оплате 0 BYN. Карта не нужна.")}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
