import { ArrowUpRight, CalendarDays, MapPin, X } from "lucide-react";

import { useDialog } from "../hooks/useDialog";
import { ROOM_TYPES } from "../lib/data";
import { longDate, money } from "../lib/format";
import type { BookingRequest, Listing, Slot } from "../lib/types";
import { useLanguage } from "../lib/i18n";
import { IntervalPicker } from "./IntervalPicker";

interface ListingDetailsDialogProps {
  listing: Listing;
  date: string;
  availability: Slot[];
  selected?: BookingRequest;
  onRangeChange: (startTime: string, endTime: string) => void;
  onClose: () => void;
}

export function ListingDetailsDialog({
  listing,
  date,
  availability,
  selected,
  onRangeChange,
  onClose,
}: ListingDetailsDialogProps) {
  const { t, language } = useLanguage();
  const dialogRef = useDialog(onClose);
  const address = listing.address.trim();
  const addressKnown = Boolean(address) && address.toLowerCase() !== "адрес уточняется";
  const mapUrl = addressKnown
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`
    : undefined;
  const meta = ROOM_TYPES[listing.type];

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/55 p-2 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-details-title"
        ref={dialogRef}
        tabIndex={-1}
        className="sheet-in max-h-[calc(100dvh-1rem)] w-full max-w-[800px] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface outline-none sm:max-h-[calc(100dvh-2rem)] sm:shadow-[0_24px_80px_rgba(13,36,55,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2
              id="listing-details-title"
              className="wrap-break-word text-xl leading-tight font-bold tracking-tight sm:text-3xl"
            >
              {t(listing.room)}
            </h2>
            <p className="mt-1 wrap-break-word text-sm leading-snug text-ink-soft sm:text-base">
              {[t(listing.school), t(listing.uo)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-soft transition-colors hover:bg-sky-soft hover:text-ink"
            aria-label={t("Закрыть подробности")}
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="photo-frame aspect-[2/1] rounded-lg border border-line sm:aspect-auto sm:min-h-56">
              <img
                src={listing.image}
                alt={`${t(meta.label)} «${t(listing.room)}» в ${t(listing.school)}`}
                className="absolute inset-0"
              />
            </div>
            <div className="min-w-0 rounded-lg border border-line bg-paper/70 p-4 sm:p-5">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-4">
                <div className="min-w-0">
                  <dt className="text-sm text-ink-soft">{t("Тип помещения")}</dt>
                  <dd className="mt-1 wrap-break-word text-base font-semibold">{t(meta.label)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm text-ink-soft">{t("Вместимость")}</dt>
                  <dd className="mt-1 wrap-break-word text-base font-semibold">
                    {listing.capacity === null ? t("Не указана") : `${t("До ")}${listing.capacity}${t(" человек")}`}
                  </dd>
                </div>
                <div className="col-span-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-line pt-3">
                  <dt className="order-2 text-sm text-ink-soft">{t("за час")}</dt>
                  <dd className="order-1 text-xl font-bold tabular-nums">{money(listing.price)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex gap-2.5 border-t border-line pt-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-orange" strokeWidth={1.8} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="wrap-break-word text-base leading-snug">
                    {addressKnown ? address : t("Точный адрес пока не указан")}
                  </p>
                  {mapUrl && (
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-base font-semibold text-blue underline underline-offset-4"
                    >
                      {t("Открыть на карте")}
                      <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <section className="rounded-lg border border-line bg-paper/70 p-3.5 sm:p-5" aria-labelledby="listing-time-title">
            <h3 id="listing-time-title" className="text-xl font-bold tracking-tight sm:text-2xl">
              {t("Выберите время")}
            </h3>
            <p className="mt-1.5 flex items-center gap-2 text-base text-ink-soft">
              <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
              <time dateTime={date}>{longDate(date, language)}</time>
            </p>
            <div className="mt-4">
              <IntervalPicker
                listing={listing}
                date={date}
                slots={availability}
                selected={selected}
                onConfirm={(start, end) => { onRangeChange(start, end); onClose(); }} />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
