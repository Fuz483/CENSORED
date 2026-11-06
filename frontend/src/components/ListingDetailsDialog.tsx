import { useEffect, useRef } from "react";
import { ArrowUpRight, MapPin, X } from "lucide-react";

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
  const addressKnown = listing.address.trim().toLowerCase() !== "адрес уточняется";
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mapUrl = addressKnown
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(listing.address)}`
    : undefined;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const meta = ROOM_TYPES[listing.type];

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/55 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-details-title"
        ref={dialogRef}
        className="sheet-in flex max-h-[94dvh] w-full max-w-[700px] flex-col overflow-y-auto rounded-t-[10px] border border-line bg-surface sm:rounded-[6px] sm:shadow-[0_24px_80px_rgba(13,36,55,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[13px] text-ink-soft">{t(listing.school)} · {t(listing.uo)}</p>
            <h2
              id="listing-details-title"
              className="mt-1 text-[24px] leading-tight tracking-[-0.025em] sm:text-[28px]"
            >
              {t(listing.room)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            className="grid size-9 shrink-0 place-items-center text-ink-mute transition-colors hover:text-ink"
            aria-label={t("Закрыть подробности")}
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="photo-frame aspect-[16/9] w-full bg-paper-2">
          <img
            src={listing.image}
            alt={`${t(meta.label)} «${t(listing.room)}» в ${t(listing.school)}`}
          />
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3 border-b border-line pb-5">
            <div className="flex min-w-0 flex-1 gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-orange" strokeWidth={1.8} />
              <div>
                <p className="text-[14px] leading-relaxed text-ink">
                  {addressKnown ? listing.address : t("Точный адрес пока не указан")}
                </p>
                {mapUrl && (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-blue hover:underline"
                  >
                    {t("Открыть на карте")} <ArrowUpRight className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
            <p className="shrink-0 font-serif text-[22px] font-medium tabular-nums">
              {money(listing.price)} <span className="font-sans text-[13px] font-normal">/ {language === "be" ? "гадзіну" : "час"}</span>
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-y-4 border-b border-line py-5 sm:grid-cols-3">
            <div>
              <dt className="text-[13px] text-ink-mute">{t("Тип помещения")}</dt>
              <dd className="mt-1 text-[14px] font-medium">{meta.label}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-mute">{t("Вместимость")}</dt>
              <dd className="mt-1 text-[14px] font-medium">{listing.capacity === null ? t("Не указана") : `${t("До ")}${listing.capacity}${t(" человек")}`}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[13px] text-ink-mute">{t("Учреждение")}</dt>
              <dd className="mt-1 text-[14px] font-medium">{listing.school}</dd>
            </div>
          </dl>

          <div className="pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-medium">{t("Выберите интервал · ")}{longDate(date, language)}</h3>
            </div>
            <div className="mt-3">
              <IntervalPicker listing={listing} date={date} slots={availability} selected={selected} onChange={onRangeChange} />
            </div>
          </div>

          <div className="mt-6 flex justify-end border-t border-line pt-4">
            <button type="button" onClick={onClose} className="btn btn-quiet h-10 px-5">
              {t("Готово")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
