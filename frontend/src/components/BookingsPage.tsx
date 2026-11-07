import { useEffect, useState } from "react";
import { ArrowRight, Check, QrCode, X } from "lucide-react";
import { ROOM_TYPES } from "../lib/data";
import {
  dayNumber,
  hoursPhrase,
  intervalHours,
  intervalLabel,
  longDate,
  monthShort,
  plural,
  weekdayShort,
} from "../lib/format";
import { useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";
import { PassQr } from "./PassQr";

const statusLabels = {
  pending: "Бронь создана", confirmed: "Подтверждена", paid: "Оплачено",
  active: "Активно", completed: "Завершено", cancelled: "Отменено",
};

export function BookingsPage({ onSearch }: { onSearch: () => void }) {
  const { bookings, user, cancelBooking } = useApp();
  const { t, language } = useLanguage();
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ bookingId: number; room: string; date: string; time: string } | null>(null);
  const [selectedQr, setSelectedQr] = useState<{ bookingId: number; code: string; room: string; date: string; startTime: string; endTime: string } | null>(null);

  useEffect(() => {
    if (!cancelTarget) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && cancellingId !== cancelTarget.bookingId) setCancelTarget(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelTarget, cancellingId]);

  useEffect(() => {
    if (!selectedQr) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedQr(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedQr]);

  const myBookings = bookings
    .filter((booking) => booking.customerId === user?.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const currentQrBooking = selectedQr
    ? myBookings.find((booking) => booking.id === selectedQr.bookingId && booking.state !== "cancelled" && booking.code === selectedQr.code)
    : undefined;

  const hours = myBookings.reduce((sum, booking) => sum + intervalHours(booking.startTime, booking.endTime), 0);

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
    <div className="mx-auto max-w-[1180px] px-5 py-9 sm:px-8 sm:py-12">
      <div className="border-b border-ink/20 pb-6">
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.02] tracking-[-0.04em]">
              {t("Мои брони")}
            </h1>
            <p className="mt-2 text-[14px] text-ink-soft">
              {myBookings.length > 0
                ? `${myBookings.length} ${plural(myBookings.length, [
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
              className="btn btn-primary h-12 w-full px-5 text-[15px] shadow-[0_8px_24px_rgba(197,83,37,0.2)] transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(197,83,37,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange sm:w-auto"
            >
              <span className="grid size-7 place-items-center rounded-full bg-white/15">
                <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
              </span>
              {t("Забронировать ещё")}
            </button>
          )}
        </div>
      </div>

      {myBookings.length === 0 ? (
        <div className="grid gap-8 border-b border-line py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] lg:items-center lg:gap-16">
          <div>
            <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] tracking-[-0.03em]">
              {t("Пока пусто.")}
            </h2>
            <p className="mt-3 max-w-[44ch] text-[13px] leading-relaxed text-ink-mute">
              {t("Выберите помещение и время — бронь появится здесь со статусом и QR-пропуском.")}
            </p>
            <button type="button" onClick={onSearch} className="btn btn-primary mt-5 h-10">
              {t("Найти пространство")}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <div className="photo-frame aspect-[16/9] lg:first:hidden">
              <img
                src="https://images.pexels.com/photos/5506053/pexels-photo-5506053.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Актовый зал с рядами сидений и сценой"
                loading="lazy"
              />
            </div>
            <div className="photo-frame aspect-[16/9]">
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
          <div className="border-t border-ink/20">
            {cancelError && (
              <p role="alert" className="border-b border-orange/25 bg-orange-soft px-3 py-2 text-[13px] text-ink">
                {cancelError}
              </p>
            )}
            {myBookings.map((booking, index) => (
              <article
                key={booking.id}
                className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-4 gap-y-4 border-b border-line py-5 sm:grid-cols-[64px_132px_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:py-6"
              >
                <div className="col-span-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:col-span-1 sm:block">
                  <p className="font-serif text-[26px] leading-none font-medium tabular-nums">
                    {dayNumber(booking.date)}
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-ink-mute">
                    {monthShort(booking.date, language)} · {weekdayShort(booking.date, language)}
                  </p>
                  <p className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.06em] uppercase text-ok">
                    <span className="size-1 rounded-full bg-ok" />
                    {t(statusLabels[booking.state ?? "pending"])}
                  </p>
                </div>

                <div className="photo-frame aspect-[4/3] w-full">
                  <img
                    src={booking.listing.image}
                    alt={`${t(ROOM_TYPES[booking.listing.type].label)} «${t(booking.listing.room)}»`}
                    loading="lazy"
                  />
                  <span className="index-tag">{String(index + 1).padStart(2, "0")}</span>
                </div>

                <div className="min-w-0 self-center">
                  <p className="truncate text-[12px] text-ink-soft">
                    {t(booking.listing.school)} · {t(booking.listing.uo)}
                  </p>
                  <h2 className="mt-1 truncate text-[19px] leading-tight tracking-[-0.02em] sm:text-[21px]">
                    {t(booking.listing.room)}
                  </h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                    {booking.listing.address} · {t(ROOM_TYPES[booking.listing.type].label)} ·{" "}
                    {intervalLabel(booking.startTime, booking.endTime)}
                  </p>
                  {booking.agreementText && (
                    <details className="mt-3 text-[13px] text-ink-soft">
                      <summary className="cursor-pointer font-medium text-blue">{t("Договор аренды")}</summary>
                      <p className="mt-2 whitespace-pre-wrap break-words">{booking.agreementText}</p>
                      {booking.agreementAcceptedAt && (
                        <p className="mt-2 text-[12px]">{t("Согласие подтверждено")} · {new Date(booking.agreementAcceptedAt).toLocaleString(language, { timeZone: "Europe/Minsk" })}</p>
                      )}
                    </details>
                  )}
                  {booking.state !== "cancelled" && booking.code ? (
                    <div className="mt-3 flex flex-col items-start gap-2">
                      {booking.state === "confirmed" && (
                        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ok">
                          <Check className="size-3.5" />{t("Пропуск готов")}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedQr({
                          bookingId: booking.id,
                          code: booking.code!,
                          room: booking.listing.room,
                          date: booking.date,
                          startTime: booking.startTime,
                          endTime: booking.endTime,
                        })}
                        className="btn btn-quiet flex h-10 items-center gap-2 px-3 text-[12px]"
                      >
                        <QrCode className="size-4" aria-hidden="true" />
                        {t("Показать QR-код")}
                      </button>
                    </div>
                  ) : null}
                  {booking.source === "client" && booking.state !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelError(null);
                        setCancelTarget({
                          bookingId: booking.id,
                          room: booking.listing.room,
                          date: longDate(booking.date, language),
                          time: intervalLabel(booking.startTime, booking.endTime),
                        });
                      }}
                      disabled={cancellingId === booking.id}
                      className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-[12px] font-semibold text-orange hover:text-ink disabled:cursor-wait disabled:opacity-60 sm:mt-2"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      {cancellingId === booking.id ? t("Отменяем…") : t("Отменить бронь")}
                    </button>
                  )}
                </div>

              </article>
            ))}
          </div>

          <p className="mt-5 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-mute">
            {t("Отмена доступна не позднее чем за 2 часа до начала. QR-пропуск выдаётся сразу после бронирования.")}
          </p>
        </>
      )}

      {cancelTarget && (
        <div
          className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => cancellingId !== cancelTarget.bookingId && setCancelTarget(null)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-booking-title"
            className="sheet-in relative w-full max-w-[460px] rounded-t-[10px] border border-line bg-surface px-5 pb-6 pt-6 shadow-[0_24px_80px_rgba(13,36,55,0.24)] sm:rounded-[6px] sm:px-7 sm:pb-7 sm:pt-7"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              disabled={cancellingId === cancelTarget.bookingId}
              autoFocus
              aria-label={t("Закрыть")}
              className="absolute right-3 top-3 grid size-10 place-items-center text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <p className="font-mono text-[10px] tracking-[0.12em] text-ink-mute uppercase">{t("Подтверждение")}</p>
            <h2 id="cancel-booking-title" className="mt-2 pr-8 text-[23px] leading-tight tracking-[-0.03em]">
              {t("Отменить бронь №")}{cancelTarget.bookingId}?
            </h2>
            <p className="mt-3 text-[14px] font-medium text-ink">
              {t(cancelTarget.room)} · {cancelTarget.date} · {cancelTarget.time}
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              {t("Выбранный интервал снова станет доступен для бронирования.")}
            </p>
            {cancelError && (
              <p role="alert" className="mt-4 border-l-2 border-orange bg-orange-soft px-3 py-2.5 text-[13px] text-ink">
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="pass-qr-title"
            className="sheet-in relative max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-y-auto border border-line bg-surface px-5 pb-6 pt-5 shadow-[0_24px_80px_rgba(13,36,55,0.24)] sm:px-8 sm:pb-8 sm:pt-7"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedQr(null)}
              aria-label={t("Закрыть QR-код")}
              className="absolute right-3 top-3 grid size-10 place-items-center text-ink-soft transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <div className="pr-10">
              <p className="font-mono text-[10px] tracking-[0.12em] text-ink-mute uppercase">{t("QR-пропуск")}</p>
              <h2 id="pass-qr-title" className="mt-1 text-[22px] leading-tight tracking-[-0.03em] sm:text-[26px]">
                {t("Ваш QR-код")}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                {t(selectedQr.room)} · {longDate(selectedQr.date, language)} · {intervalLabel(selectedQr.startTime, selectedQr.endTime)}
              </p>
            </div>
            <div className="mt-5 rounded-lg border border-line bg-paper/50 p-4 sm:p-5">
              <PassQr code={selectedQr.code} large showCode={false} />
            </div>
            <p className="mt-4 text-center text-[13px] text-ink-soft">{t("Покажите код при входе в помещение.")}</p>
          </section>
        </div>
      )}
    </div>
  );
}
