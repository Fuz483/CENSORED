import { ROOM_TYPES } from "../lib/data";
import { intervalLabel, money } from "../lib/format";
import type { BookingRequest, Listing } from "../lib/types";
import { ArrowUpRight, MapPin } from "lucide-react";
import { useLanguage } from "../lib/i18n";

interface ListingRowProps {
  listing: Listing;
  selected?: BookingRequest;
  onOpenDetails: () => void;
  index: number;
}

export function ListingRow({
  listing,
  selected,
  onOpenDetails,
  index,
}: ListingRowProps) {
  const { t } = useLanguage();
  const meta = ROOM_TYPES[listing.type];

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpenDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails();
        }
      }}
      className="photo-link group grid cursor-pointer grid-cols-[84px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-4 border-b border-line py-5 transition-colors hover:bg-surface/50 focus-visible:outline-orange sm:grid-cols-[126px_minmax(0,1fr)_auto] sm:gap-x-5 lg:grid-cols-[150px_minmax(0,1fr)_minmax(180px,auto)_118px] lg:items-center lg:gap-8 lg:py-6"
      aria-label={`${t("Подробнее")}: ${t(listing.room)}, ${t(listing.school)}`}
    >
      <div
        className="photo-frame aspect-[4/3] w-full"
      >
        <img
          src={listing.image}
          alt={`${t(meta.label)} «${t(listing.room)}» в ${t(listing.school)}`}
          loading="lazy"
          decoding="async"
        />
        <span className="index-tag">
          {String(index).padStart(2, "0")}
        </span>
      </div>

      <div className="min-w-0 self-center">
        <div className="group/detail block max-w-full text-left">
          <h2 className="truncate text-[20px] leading-tight tracking-[-0.025em] group-hover/detail:text-blue sm:text-[23px]">
            {t(listing.room)}
          </h2>
          <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-ink-soft">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-orange" strokeWidth={1.8} />
            <span>{listing.address}</span>
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-mute">
            {t(meta.label)} · {listing.capacity === null ? t("Вместимость не указана") : `${t("До ")}${listing.capacity}${t(" человек")}`} · {t(listing.school)}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-blue">
            {t("Подробнее")} <ArrowUpRight className="size-3.5" strokeWidth={1.8} />
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right lg:col-start-4 lg:row-start-1">
        <p className="font-serif text-[17px] leading-none font-medium tabular-nums sm:text-[18px]">
          {money(listing.price)}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-mute">
          {t("за час")}
        </p>
        {selected && (
          <p className="mt-2 whitespace-nowrap text-[12px] font-medium text-orange">
            {intervalLabel(selected.startTime, selected.endTime)}
          </p>
        )}
      </div>

      <div className="col-span-3 flex items-center gap-2 text-[12px] text-blue lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:justify-self-end">
        <span>{t("Посмотреть и выбрать время")}</span>
        <ArrowUpRight className="size-3.5 shrink-0" strokeWidth={1.8} />
      </div>
    </article>
  );
}
