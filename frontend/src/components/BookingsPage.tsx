import { useState } from "react";
import { X } from "lucide-react";
import { ROOM_TYPES } from "../lib/data";
import {
  dayNumber,
  durationLabel,
  hoursPhrase,
  intervalHours,
  intervalLabel,
  money,
  monthShort,
  plural,
  weekdayShort,
} from "../lib/format";
import { useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";

export function BookingsPage({ onSearch }: { onSearch: () => void }) {
  const { bookings, user, cancelBooking } = useApp();
  const { t, language } = useLanguage();
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const myBookings = bookings
    .filter((booking) => booking.customerId === user?.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const hours = myBookings.reduce((sum, booking) => sum + intervalHours(booking.startTime, booking.endTime), 0);
  const spent = myBookings.reduce((sum, booking) => sum + booking.total, 0);

  async function handleCancel(bookingId: number, date: string, time: string) {
    const confirmed = window.confirm(
      `${t("Отменить бронь №")}${bookingId}?\n${date} · ${time}\n\n${t("Выбранный интервал снова станет доступен для бронирования.")}`,
    );
    if (!confirmed) return;
    setCancellingId(bookingId);
    setCancelError(null);
    try {
      await cancelBooking(bookingId);
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
                  ])} · ${hoursPhrase(hours)} · ${money(spent)}`
                : t("Здесь появятся оплаченные брони.")}
            </p>
          </div>

          {myBookings.length > 0 && (
            <button type="button" onClick={onSearch} className="btn btn-quiet h-10">
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
              {t("Выберите зал, бассейн или кабинет на нужный час — бронь появится здесь вместе с фотографией, номером для вахты и суммой.")}
            </p>
            <button type="button" onClick={onSearch} className="btn btn-primary mt-5 h-10">
              {t("Найти пространство")}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <div className="photo-frame aspect-[16/9] lg:first:hidden">
              <img
                src="/photos/hall-01.jpg"
                alt="Актовый зал с рядами сидений и сценой"
                loading="lazy"
              />
            </div>
            <div className="photo-frame aspect-[16/9]">
              <img
                src="/photos/pool-01.jpg"
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
                    {t("оплачено")}
                  </p>
                </div>

                <div className="photo-frame aspect-[4/3] w-full">
                  <img
                    src={booking.listing.image}
                    alt={`${ROOM_TYPES[booking.listing.type].label} «${booking.listing.room}»`}
                    loading="lazy"
                  />
                  <span className="index-tag">{String(index + 1).padStart(2, "0")}</span>
                </div>

                <div className="min-w-0 self-center">
                  <p className="truncate text-[12px] text-ink-soft">
                    {t(booking.listing.school)} · {t(booking.listing.uo)}
                  </p>
                  <h2 className="mt-1 truncate text-[19px] leading-tight tracking-[-0.02em] sm:text-[21px]">
                    {booking.listing.room}
                  </h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                    {booking.listing.address} · {t(ROOM_TYPES[booking.listing.type].label)} ·{" "}
                    {intervalLabel(booking.startTime, booking.endTime)}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between gap-3 sm:hidden">
                    <p className="font-serif text-[16px] font-medium tabular-nums">
                      {money(booking.total)}
                    </p>
                    <p className="font-mono text-[10.5px] text-ink-mute">
                      №{booking.id} · {durationLabel(intervalHours(booking.startTime, booking.endTime), language)}
                    </p>
                  </div>
                  {booking.source === "client" && (
                    <button
                      type="button"
                      onClick={() => handleCancel(
                        booking.id,
                        booking.date,
                        intervalLabel(booking.startTime, booking.endTime),
                      )}
                      disabled={cancellingId === booking.id}
                      className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-[12px] font-semibold text-orange hover:text-ink disabled:cursor-wait disabled:opacity-60 sm:mt-2"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      {cancellingId === booking.id ? t("Отменяем…") : t("Отменить бронь")}
                    </button>
                  )}
                </div>

                <div className="hidden text-right sm:block">
                  <p className="font-serif text-[18px] font-medium tabular-nums">
                    {money(booking.total)}
                  </p>
                  <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-ink-mute">
                    №{booking.id}
                    <br />
                    {durationLabel(intervalHours(booking.startTime, booking.endTime), language)}
                  </p>
                  {booking.source === "client" && (
                    <button
                      type="button"
                      onClick={() => handleCancel(
                        booking.id,
                        booking.date,
                        intervalLabel(booking.startTime, booking.endTime),
                      )}
                      disabled={cancellingId === booking.id}
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-[12px] font-semibold text-orange hover:text-ink disabled:cursor-wait disabled:opacity-60"
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
            {t("Отмена бесплатна за 2 часа до начала. На вахте назовите номер брони — пропуск выпишут на месте.")}
          </p>
        </>
      )}
    </div>
  );
}
