import { Fragment, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Clock3, FileText, QrCode, X } from "lucide-react";
import { ROOM_TYPES } from "../lib/data";
import {
  dayNumber,
  hoursPhrase,
  intervalHours,
  intervalLabel,
  longDate,
  minskBookingTime,
  monthLong,
  plural,
  weekdayShort,
} from "../lib/format";
import { useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";
import { PassQr } from "./PassQr";
import { BookingModal } from "./BookingModal";
import { BookingHistoryMore } from "./BookingHistoryMore";
import { useDialog } from "../hooks/useDialog";
import type { ReservedVisit } from "../lib/types";

const statusLabels = {
  pending: "Бронь создана", confirmed: "Подтверждено", paid: "Оплачено",
  active: "Активно", completed: "Завершено", cancelled: "Отменено",
};

const statusStyles = {
  pending: "bg-orange-soft text-ink",
  confirmed: "bg-ok/10 text-ok",
  paid: "bg-ok/10 text-ok",
  active: "bg-sky-soft text-blue-deep",
  completed: "bg-paper-2 text-ink-soft",
  cancelled: "bg-paper-2 text-ink",
};

export function BookingsPage({ onSearch }: { onSearch: () => void }) {
  const { bookings, hasMoreBookings, listings, reservedVisits, user, cancelBooking, reload } = useApp();
  const { t, language } = useLanguage();
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ bookingId: number; room: string; date: string; time: string } | null>(null);
  const [selectedQr, setSelectedQr] = useState<{ bookingId: number; code: string; room: string; date: string; startTime: string; endTime: string } | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<ReservedVisit[] | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const timer = window.setInterval(updateNow, 15_000);
    document.addEventListener("visibilitychange", updateNow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateNow);
    };
  }, []);

  const myBookings = bookings
    .filter((booking) => booking.customerId === user?.id)
    .map((booking) => {
      const ended = minskBookingTime(booking.date, booking.endTime) <= now;
      const state = booking.state ?? "pending";
      const upcoming = !ended && state !== "cancelled" && state !== "completed";
      return { booking, state, ended, upcoming, start: minskBookingTime(booking.date, booking.startTime) };
    })
    .sort((a, b) => Number(b.upcoming) - Number(a.upcoming) || (a.upcoming ? a.start - b.start : b.start - a.start));
  const currentQrBooking = selectedQr
    ? myBookings.find(({ booking, state, upcoming }) => booking.id === selectedQr.bookingId && upcoming && state === "confirmed" && booking.code === selectedQr.code)
    : undefined;

  const cancelDialogRef = useDialog(() => setCancelTarget(null), {
    open: cancelTarget !== null, closeOnEscape: cancellingId === null,
  });
  const qrDialogRef = useDialog(() => setSelectedQr(null), { open: Boolean(currentQrBooking) });
  const hours = myBookings.reduce((sum, { booking, state }) =>
    state === "cancelled" ? sum : sum + intervalHours(booking.startTime, booking.endTime), 0);

  async function handleCancel() {
    if (!cancelTarget) return;
    const { bookingId } = cancelTarget;
    setCancellingId(bookingId);
    setCancelError(null);
    try {
      await cancelBooking(bookingId);
      setCancelTarget(null);
    } catch (error) {
      setCancelError(error instanceof Error ? t(error.message) : t("Не удалось отменить бронь. Попробуйте ещё раз."));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="page-shell py-6 sm:py-12">
      <div className="border-b border-ink/20 pb-6">
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.02] tracking-[-0.04em]">
              {t("Мои брони")}
            </h1>
            <p className="mt-2 text-[16px] text-ink-soft">
              {myBookings.length > 0
                ? `${hasMoreBookings ? t("Показано: ") : ""}${myBookings.length} ${plural(myBookings.length, [
                    t("бронь"),
                    t("брони"),
                    t("броней"),
                   ])} · ${hoursPhrase(hours)}`
                 : t("Здесь появятся ваши брони.")}
            </p>
          </div>

          {myBookings.length > 0 && (
            <button
              type="button"
              onClick={onSearch}
              className="btn btn-primary h-12 w-full px-5 text-[15px] shadow-md transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange sm:w-auto"
            >
              <span className="grid size-7 place-items-center rounded-md bg-on-action/15">
                <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
              </span>
              {t("Забронировать ещё")}
            </button>
          )}
        </div>
      </div>

      <section className="border-b border-line py-5" aria-labelledby="reserved-visits-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="reserved-visits-title" className="text-[20px]">{t("Регулярные занятия")}</h2>
          <button type="button" onClick={() => void reload()} className="btn btn-quiet">{t("Обновить данные")}</button>
        </div>
        {reservedVisits.length === 0 && <p className="mt-2 text-[15px] text-ink-soft">{t("Нет занятий, для которых нужно оформить пропуск.")}</p>}
        <ul className="mt-3 divide-y divide-line">
          {reservedVisits.map((visit) => {
            const listing = listings.find((item) => item.id === visit.listingId);
            if (!listing) return null;
            return (
              <li key={`${visit.reservationId}-${visit.date}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{visit.label} · {t(listing.room)}</p>
                  <p className="text-[15px] text-ink-soft">{t(listing.school)} · {longDate(visit.date, language)} · {intervalLabel(visit.startTime, visit.endTime)}</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setSelectedVisit([visit])}>{t("Оформить QR-пропуск")}</button>
              </li>
            );
          })}
        </ul>
      </section>

      {selectedVisit && <BookingModal requests={selectedVisit} onClose={() => setSelectedVisit(null)} onGoToBookings={() => setSelectedVisit(null)} />}

      {myBookings.length === 0 ? (reservedVisits.length === 0 &&
        <div className="grid gap-8 border-b border-line py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] lg:items-center lg:gap-16">
          <div>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] tracking-[-0.03em]">
              {t("Пока пусто.")}
            </h2>
            <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-mute">
              {t("Выберите помещение и время — бронь появится здесь со статусом и QR-пропуском.")}
            </p>
            <button type="button" onClick={onSearch} className="btn btn-primary mt-5 h-10">
              {t("Найти пространство")}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <div className="photo-frame aspect-[16/9] rounded-xl lg:first:hidden">
              <img
                src="https://images.pexels.com/photos/5506053/pexels-photo-5506053.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Актовый зал с рядами сидений и сценой"
                loading="lazy"
              />
            </div>
            <div className="photo-frame aspect-[16/9] rounded-xl">
              <img
                src="https://images.pexels.com/photos/7430320/pexels-photo-7430320.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Дорожки школьного бассейна"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 pt-5">
            {cancelError && (
              <p role="alert" className="rounded-xl border border-orange/25 bg-orange-soft px-3 py-2 text-[15px] text-ink">
                {cancelError}
              </p>
            )}
            {myBookings.map(({ booking, state, ended, upcoming, start }, index) => {
              const code = upcoming && state === "confirmed" ? booking.code : null;
              const canCancel = upcoming && booking.source === "client" && start - now >= 2 * 60 * 60 * 1000;
              const displayState = ended && (state === "confirmed" || state === "paid" || state === "active") ? "completed" : state;
              const interval = intervalLabel(booking.startTime, booking.endTime);

              return (
                <Fragment key={booking.id}>
                {(index === 0 || myBookings[index - 1].upcoming !== upcoming) && (
                  <h2 className="mt-2 text-[15px] font-semibold text-ink-soft">{t(upcoming ? "Предстоящие брони" : "История бронирований")}</h2>
                )}
                <article className="space-card overflow-hidden">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-3.5 p-4 sm:p-5 lg:grid lg:grid-cols-[10rem_minmax(0,1fr)_auto] lg:grid-rows-2 lg:gap-x-5 lg:gap-y-2">
                    <div className="flex flex-col justify-center gap-1 rounded-lg bg-sky-soft/65 px-2.5 py-2.5 text-blue-deep sm:px-3.5 lg:row-span-2 lg:self-stretch">
                      <time dateTime={booking.date} className="text-[15px] leading-tight font-semibold sm:text-[16px]">
                        {dayNumber(booking.date)} {monthLong(booking.date, language)} · {weekdayShort(booking.date, language)}
                      </time>
                      <p className="flex items-center gap-1.5 font-mono text-[16px] leading-tight whitespace-nowrap tabular-nums">
                        <Clock3 className="hidden size-3.5 shrink-0 min-[360px]:block" aria-hidden="true" />
                        {interval}
                      </p>
                    </div>
                    <span className={`ml-auto inline-flex min-h-10 w-[9.5rem] max-w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-center text-base leading-tight font-bold sm:w-44 sm:text-lg lg:col-start-3 lg:row-start-1 ${code ? "lg:self-end" : "lg:row-span-2"} ${statusStyles[displayState]}`}>
                      <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
                      {t(statusLabels[displayState])}
                    </span>
                    <div className="flex min-w-0 basis-full items-start gap-3 sm:gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center">
                      <div className="photo-frame space-card-photo">
                        <img src={booking.listing.image} alt="" loading="lazy" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="space-card-title">
                          {t(booking.listing.room)}
                        </h2>
                        <p className="mt-1.5 text-[15px] leading-snug wrap-break-word text-ink-soft">
                          {[t(booking.listing.school), t(booking.listing.uo)].filter(Boolean).join("\u00a0· ")}
                        </p>
                        <p className="mt-1 text-[14px] leading-relaxed wrap-break-word text-ink-mute">
                          {[t(ROOM_TYPES[booking.listing.type].label), t(booking.listing.address)].filter(Boolean).join("\u00a0· ")}
                        </p>
                      </div>
                    </div>
                    {code && (
                      <button type="button" onClick={() => setSelectedQr({
                        bookingId: booking.id, code, room: booking.listing.room,
                        date: booking.date, startTime: booking.startTime, endTime: booking.endTime,
                      })} className="btn btn-primary w-full rounded-lg px-3.5 text-[15px] sm:w-auto lg:col-start-3 lg:row-start-2 lg:self-start">
                        <QrCode className="size-4 shrink-0" aria-hidden="true" />
                        {t("Показать QR-код")}
                      </button>
                    )}
                  </div>

                  {(canCancel || booking.agreementText) && (
                    <footer className="flex flex-wrap items-start gap-x-2 gap-y-1 border-t border-line/70 bg-paper/50 px-4 py-1.5 sm:px-5">
                      {booking.agreementText && (
                        <details className="group min-w-0 grow text-base leading-relaxed text-ink-soft">
                          <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg font-medium text-blue-deep hover:text-blue [&::-webkit-details-marker]:hidden">
                            <FileText className="hidden size-4 shrink-0 min-[360px]:block" aria-hidden="true" />
                            {t("Договор аренды")}
                            <ChevronDown className="size-3.5 shrink-0 group-open:rotate-180" aria-hidden="true" />
                          </summary>
                          <p className="max-w-[74ch] whitespace-pre-wrap wrap-break-word">{booking.agreementText}</p>
                          {booking.agreementAcceptedAt && (
                            <p className="mt-2 mb-1 text-[14px]">
                              {t("Согласие подтверждено")} · {new Date(booking.agreementAcceptedAt).toLocaleString(language, { timeZone: "Europe/Minsk", hourCycle: "h23" })}
                            </p>
                          )}
                        </details>
                      )}
                      {canCancel && (
                        <button type="button" onClick={() => {
                          setCancelError(null);
                          setCancelTarget({
                            bookingId: booking.id, room: booking.listing.room,
                            date: longDate(booking.date, language), time: interval,
                          });
                        }} disabled={cancellingId === booking.id}
                          className="btn ml-auto h-auto min-h-11 rounded-lg px-2 text-[15px] text-ink-soft hover:bg-paper-2 hover:text-ink disabled:cursor-wait disabled:opacity-60">
                          {cancellingId === booking.id ? t("Отменяем…") : t("Отменить бронь")}
                        </button>
                      )}
                    </footer>
                  )}
                </article>
                </Fragment>
              );
            })}
          </div>

          <BookingHistoryMore />

          <p className="mt-5 max-w-[70ch] text-[14px] leading-relaxed text-ink-mute">
            {t("Отмена доступна не позднее чем за 2 часа до начала. QR-пропуск выдаётся сразу после бронирования.")}
          </p>
        </>
      )}

      {cancelTarget && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/65 p-2 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => cancellingId !== cancelTarget.bookingId && setCancelTarget(null)}
          role="presentation"
        >
          <section
            ref={cancelDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-booking-title"
            className="sheet-in relative max-h-[calc(100dvh-2rem)] w-full max-w-[460px] overflow-y-auto rounded-xl border border-line bg-surface px-5 pt-6 pb-6 shadow-[0_24px_80px_rgba(13,36,55,0.24)] sm:px-7 sm:pt-7 sm:pb-7"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              disabled={cancellingId === cancelTarget.bookingId}
              aria-label={t("Закрыть")}
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <p className="font-mono text-[13px] tracking-[0.12em] text-ink-mute uppercase">{t("Подтверждение")}</p>
            <h2 id="cancel-booking-title" className="mt-2 pr-8 text-[23px] leading-tight tracking-[-0.03em]">
              {t("Отменить бронь №")}{cancelTarget.bookingId}?
            </h2>
            <p className="mt-3 text-[16px] font-medium text-ink">
              {t(cancelTarget.room)} · {cancelTarget.date} · {cancelTarget.time}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
              {t("Выбранный интервал снова станет доступен для бронирования.")}
            </p>
            {cancelError && (
              <p role="alert" className="mt-4 rounded-md border-l-2 border-orange bg-orange-soft px-3 py-2.5 text-[15px] text-ink">
                {cancelError}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={cancellingId === cancelTarget.bookingId}
                className="btn btn-quiet h-11 w-full sm:w-auto"
              >
                {t("Не отменять")}
              </button>
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={cancellingId === cancelTarget.bookingId}
                className="btn h-11 w-full bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700 sm:w-auto"
              >
                {t(cancellingId === cancelTarget.bookingId ? "Отменяем…" : "Подтвердить отмену")}
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedQr && currentQrBooking && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-navy/65 p-4 backdrop-blur-sm"
          onClick={() => setSelectedQr(null)}
          role="presentation"
        >
          <section
            ref={qrDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pass-qr-title"
            className="sheet-in relative max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-xl border border-line bg-surface px-5 pt-5 pb-6 shadow-[0_24px_80px_rgba(13,36,55,0.24)] sm:px-8 sm:pt-7 sm:pb-8"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedQr(null)}
              aria-label={t("Закрыть QR-код")}
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <div className="pr-10">
              <p className="font-mono text-[13px] tracking-[0.12em] text-ink-mute uppercase">{t("QR-пропуск")}</p>
              <h2 id="pass-qr-title" className="mt-1 text-[22px] leading-tight tracking-[-0.03em] sm:text-[26px]">
                {t("Ваш QR-код")}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                {t(selectedQr.room)} · {longDate(selectedQr.date, language)} · {intervalLabel(selectedQr.startTime, selectedQr.endTime)}
              </p>
            </div>
            <div className="mt-5 rounded-lg border border-line bg-paper/50 p-4 sm:p-5">
              <PassQr bookingId={selectedQr.bookingId} code={selectedQr.code} large showCode={false} />
            </div>
            <p className="mt-4 text-center text-[15px] text-ink-soft">{t("Покажите код при входе в помещение.")}</p>
          </section>
        </div>
      )}
    </div>
  );
}
