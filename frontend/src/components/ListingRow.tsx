import { ROOM_TYPES } from "../lib/data";
import { intervalLabel, money } from "../lib/format";
import type { BookingRequest, Listing } from "../lib/types";
import { ArrowRight, Clock3 } from "lucide-react";
import { useLanguage } from "../lib/i18n";

type ListingRowProps = { listing: Listing } & (
  | { href: string; selected?: never; onOpenDetails?: never }
  | { href?: never; selected?: BookingRequest; onOpenDetails: () => void }
);

export function ListingRow({ listing, selected, onOpenDetails, href }: ListingRowProps) {
  const { t } = useLanguage();
  const meta = ROOM_TYPES[listing.type];
  const Title = href ? "h3" : "h2";
  const room = t(listing.room);
  const school = t(listing.school);
  const action = t(href ? "Войти и выбрать" : "Выбрать время");
  const actionName = `${action}: ${room}, ${school}`;
  const actionClassName = "btn btn-primary min-h-11 w-full cursor-pointer rounded-lg px-3.5 text-[15px] before:absolute before:inset-0 before:rounded-xl sm:w-auto";
  const actionContent = <>{action} <ArrowRight className="size-4 shrink-0" aria-hidden="true" /></>;
  const capacity = listing.capacity === null ? t("Вместимость не указана") : `${t("До ")}${listing.capacity}${t(" человек")}`;

  return (
    <article
      className={`space-card photo-link relative flex flex-wrap items-center gap-x-3 gap-y-3.5 p-4 transition-colors hover:border-line-strong focus-within:border-blue sm:p-5 lg:grid lg:grid-cols-[10rem_minmax(0,1fr)_auto] lg:grid-rows-2 lg:gap-x-5 lg:gap-y-2 ${selected ? "border-orange/55" : ""}`}
    >
      <div className="flex min-w-0 flex-col justify-center gap-1 rounded-lg bg-sky-soft/65 px-3 py-2.5 text-blue-deep lg:row-span-2 lg:self-stretch lg:px-3.5">
        <p className="font-serif text-[18px] leading-tight font-semibold wrap-break-word tabular-nums sm:text-[20px]">
          {money(listing.price)}
        </p>
        <p className="text-sm text-ink-soft">{t("за час")}</p>
      </div>

      {selected && (
        <p className="ml-auto inline-flex items-center gap-1.5 font-mono text-sm font-medium text-blue-deep lg:col-start-3 lg:row-start-1 lg:self-end">
          <Clock3 className="size-4 shrink-0" aria-hidden="true" />
          {intervalLabel(selected.startTime, selected.endTime)}
        </p>
      )}

      <div className="flex min-w-0 basis-full items-start gap-3 sm:gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center">
        <div className="photo-frame space-card-photo">
          <img src={listing.image} alt="" loading="lazy" decoding="async" />
        </div>
        <div className="min-w-0">
          <Title className="space-card-title">{room}</Title>
          <p className="mt-1.5 text-[16px] leading-snug wrap-break-word text-ink-soft">{school}</p>
          <p className="mt-1 text-sm leading-relaxed wrap-break-word text-ink-mute">{t(listing.address)}</p>
          <p className="mt-1 text-sm leading-snug wrap-break-word text-ink-mute">
            {t(meta.label)} · {capacity}
          </p>
        </div>
      </div>

      <div className={`flex basis-full lg:col-start-3 ${selected ? "lg:row-start-2 lg:self-start" : "lg:row-span-2 lg:row-start-1"}`}>
        {href ? (
          <a href={href} aria-label={actionName} className={actionClassName}>{actionContent}</a>
        ) : (
          <button type="button" onClick={onOpenDetails} aria-haspopup="dialog" aria-label={actionName} className={actionClassName}>
            {actionContent}
          </button>
        )}
      </div>
    </article>
  );
}
