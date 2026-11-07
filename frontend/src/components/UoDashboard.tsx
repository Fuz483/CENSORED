import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Archive, CalendarPlus, ImagePlus, LoaderCircle, Pencil, Plus } from "lucide-react";

import { useDialog } from "../hooks/useDialog";
import { ROOM_TYPES, toISODate } from "../lib/data";
import {
  dayNumber,
  durationLabel,
  intervalHours,
  intervalLabel,
  longDate,
  minskBookingTime,
  money,
  monthShort,
  weekdayShort,
} from "../lib/format";
import { errorMessage } from "../lib/repository";
import type { Booking, BookingSource, Listing } from "../lib/types";
import { freeSlotHours, useApp } from "../state/AppState";
import { AddSpaceDialog } from "./AddSpaceDialog";
import { ManualBookingDialog } from "./ManualBookingDialog";
import { WeeklyReservations } from "./WeeklyReservations";
import { useLanguage } from "../lib/i18n";

type Tab = "spaces" | "bookings" | "weekly";
type BookingFilter = "all" | BookingSource;
const MANUAL_BOOKING_ENABLED = false;

export function UoDashboard() {
  const { user, listings, slots, bookings, weeklyReservations, deleteListing, uploadRoomPhoto, cancelBooking, reload } = useApp();
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("spaces");
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>("all");
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | undefined>();
  const [archiveTarget, setArchiveTarget] = useState<Listing | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const addSpaceButton = useRef<HTMLButtonElement>(null);
  const focusAfterArchive = useRef(false);

  useEffect(() => {
    if (!archiveTarget && focusAfterArchive.current) {
      focusAfterArchive.current = false;
      addSpaceButton.current?.focus({ preventScroll: true });
    }
  }, [archiveTarget]);

  const changePhoto = async (listing: Listing, file: File) => {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setNotice("Поддерживаются фотографии JPG, PNG и WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setNotice("Размер фотографии не должен превышать 8 МБ.");
      return;
    }
    try {
      await uploadRoomPhoto(listing, file);
      setNotice(`Фото помещения «${listing.room}» обновлено.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось обновить фото.");
    }
  };

  if (!user) return null;

  const ownListings = listings.filter((listing) => listing.ownerId === user.user_id);
  const ownBookings = [...bookings]
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime),
    );
  const clientBookings = ownBookings.filter((booking) => booking.source === "client");
  const manualBookings = ownBookings.filter((booking) => booking.source === "uo");
  const activeBookings = ownBookings.filter((booking) => booking.state !== "cancelled");
  const totalHours = activeBookings.reduce((sum, booking) => sum + intervalHours(booking.startTime, booking.endTime), 0);
  const totalRevenue = activeBookings.reduce((sum, booking) => sum + booking.total, 0);
  const today = toISODate(new Date());

  const visibleBookings = ownBookings.filter(
    (booking) => bookingFilter === "all" || booking.source === bookingFilter,
  );

  const filterCounts: Record<BookingFilter, number> = {
    all: ownBookings.length,
    client: clientBookings.length,
    uo: manualBookings.length,
  };

  const savedSpace = (listing: { room: string }) => {
    setSpaceOpen(false);
    setEditingListing(undefined);
    setTab("spaces");
    const message = editingListing ? "Пространство «{room}» обновлено." : "Пространство «{room}» опубликовано.";
    setNotice(t(message).replace("{room}", () => t(listing.room)));
  };

  const removeSpace = async (listing: Listing) => {
    await deleteListing(listing.id);
    setNotice(t("Пространство «{room}» убрано из каталога.").replace("{room}", () => t(listing.room)));
    focusAfterArchive.current = true;
    setArchiveTarget(null);
  };

  const savedBooking = (booking: Booking) => {
    setManualOpen(false);
    setTab("bookings");
    setBookingFilter("all");
    setNotice(
      `Бронь №${booking.id} для «${booking.customerName}» создана: ${longDate(
        booking.date,
      )}, ${intervalLabel(booking.startTime, booking.endTime)}.`,
    );
  };

  const cancelCustomerBooking = async (booking: Booking) => {
    if (cancelling !== null || !window.confirm(`${t("Отменить бронь клиента?")} №${booking.id}`)) return;
    setCancelling(booking.id);
    setNotice(null);
    try {
      await cancelBooking(booking.id);
      setNotice(`${t("Бронь отменена")} · №${booking.id}`);
    } catch (error) {
      setNotice(t(error instanceof Error ? error.message : "Не удалось отменить бронь."));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="page-shell py-9 sm:py-12">
      <div className="border-b border-ink/20 pb-6">
        <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_240px] md:items-end lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
          <div>
            <h1 className="max-w-[15ch] text-[clamp(2.1rem,4.6vw,3.6rem)] leading-[0.98] tracking-[-0.045em]">
              {t(user.name)}
              <span className="block text-blue italic">{t("Кабинет УО")}<span className="text-orange">.</span></span>
            </h1>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
              {t("Помещения, свободные часы и заявки арендаторов вашего учреждения.")}
            </p>
          </div>

          {ownListings[0] && (
            <figure className="relative hidden aspect-[16/10] overflow-hidden rounded-xl bg-navy md:block">
              <img
                src={ownListings[0].image}
                alt={`${ownListings[0].room} в ${ownListings[0].school}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/10 to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 text-on-navy">
                <span className="min-w-0 truncate font-serif text-[16px] leading-tight">
                  {ownListings[0].room}
                </span>
              </figcaption>
            </figure>
          )}
        </div>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <Stat
          label={t("пространства")}
          value={String(ownListings.length).padStart(2, "0")}
        />
        <Stat
          label={t("брони клиентов")}
          value={String(clientBookings.length).padStart(2, "0")}
        />
        <Stat
          label={t("часов занято")}
          value={String(totalHours).padStart(2, "0")}
        />
        <Stat label={t("сумма броней")} value={money(totalRevenue)} />
      </dl>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-ink/20">
        <div role="tablist" aria-label={t("Кабинет УО")} className="flex flex-wrap gap-x-5">
          <TabButton
            active={tab === "spaces"}
            onClick={() => setTab("spaces")}
            count={ownListings.length}
          >
            {t("Пространства")}
          </TabButton>
          <TabButton
            active={tab === "bookings"}
            onClick={() => setTab("bookings")}
            count={ownBookings.length}
          >
            {t("Брони")}
          </TabButton>
          <TabButton active={tab === "weekly"} onClick={() => setTab("weekly")} count={weeklyReservations.length}>
            {t("Постоянные клиенты")}
          </TabButton>
        </div>

        <button type="button" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await reload(); } finally { setRefreshing(false); } }} className="btn btn-quiet mb-3 h-11">{t(refreshing ? "Подождите…" : "Обновить данные")}</button>
        {tab === "spaces" ? (
          <button
            ref={addSpaceButton}
            type="button"
            onClick={() => { setEditingListing(undefined); setSpaceOpen(true); }}
            className="btn btn-primary mb-3 h-10 w-full sm:w-auto"
          >
            <Plus className="size-4" strokeWidth={1.8} />
            {t("Добавить пространство")}
          </button>
        ) : tab === "bookings" && MANUAL_BOOKING_ENABLED ? (
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="btn btn-primary mb-3 h-10 w-full sm:w-auto"
          >
            <CalendarPlus className="size-4" strokeWidth={1.8} />
            {t("Новая бронь")}
          </button>
        ) : null}
      </div>

      {notice && (
        <p
          role="status"
          className="mt-4 border-l-2 border-ok pl-3 text-[14px] leading-relaxed text-ink-soft"
        >
          {notice}
        </p>
      )}

      {tab === "spaces" ? (
        <SpacesTab
          listings={ownListings}
          slots={slots}
          bookings={ownBookings}
          onAdd={() => { setEditingListing(undefined); setSpaceOpen(true); }}
          onEdit={(listing) => { setEditingListing(listing); setSpaceOpen(true); }}
          onArchive={(listing) => { setNotice(null); setArchiveTarget(listing); }}
          onChangePhoto={changePhoto}
        />
      ) : tab === "weekly" ? (
        <WeeklyReservations listings={ownListings} />
      ) : (
        <BookingsTab
          bookings={visibleBookings}
          institutionName={user.name}
          allCount={ownBookings.length}
          filter={bookingFilter}
          filterCounts={filterCounts}
          onFilter={setBookingFilter}
          onCreate={() => setManualOpen(true)}
          onCancel={(booking) => void cancelCustomerBooking(booking)}
          cancelling={cancelling}
          today={today}
        />
      )}

      {spaceOpen && (
        <AddSpaceDialog
          open={spaceOpen}
          onClose={() => setSpaceOpen(false)}
          onSaved={savedSpace}
          listing={editingListing}
        />
      )}
      {archiveTarget && (
        <ArchiveSpaceDialog
          listing={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onArchive={() => removeSpace(archiveTarget)}
        />
      )}
      {manualOpen && (
        <ManualBookingDialog
          open={manualOpen}
          onClose={() => setManualOpen(false)}
          onSaved={savedBooking}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-paper px-3 py-4 sm:px-4 sm:py-5">
      <dt className="mono-label">{label}</dt>
      <dd className="mt-3 font-serif text-[clamp(1.25rem,2.5vw,1.9rem)] leading-none font-medium tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex items-center gap-2 border-b-2 pb-3 text-[14px] font-medium whitespace-nowrap transition-colors ${
        active
          ? "-mb-px border-orange text-ink"
          : "-mb-px border-transparent text-ink-mute hover:text-ink"
      }`}
    >
      {children}
      <span className="font-mono text-[13px] tabular-nums text-ink-mute">
        {String(count).padStart(2, "0")}
      </span>
    </button>
  );
}

function SpacesTab({
  listings,
  slots,
  bookings,
  onAdd,
  onEdit,
  onArchive,
  onChangePhoto,
}: {
  listings: ReturnType<typeof useApp>["listings"];
  slots: ReturnType<typeof useApp>["slots"];
  bookings: Booking[];
  onAdd: () => void;
  onEdit: (listing: Listing) => void;
  onArchive: (listing: Listing) => void;
  onChangePhoto: (listing: Listing, file: File) => void;
}) {
  const { t } = useLanguage();
  const now = Date.now();
  if (listings.length === 0) {
    return (
      <div className="space-card mt-4 p-5 sm:p-7">
        <h2 className="text-[22px] tracking-[-0.02em]">{t("Пока нет пространств")}</h2>
        <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-ink-soft">
          {t("Добавьте первое помещение с фотографией — оно сразу появится в каталоге клиентов.")}
        </p>
        <button type="button" onClick={onAdd} className="btn btn-primary mt-5 h-10">
          <Plus className="size-4" strokeWidth={1.8} />
          {t("Добавить пространство")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-3">
        <p className="text-[14px] text-ink-soft">{listings.length} {t("пространств")}</p>
      </div>

      <div className="grid gap-4">
        {listings.map((listing) => {
          const free = freeSlotHours(slots.filter(
            (slot) => slot.listingId === listing.id && slot.state === 0,
          ));
          const upcoming = bookings.filter(
            (booking) => booking.listing.id === listing.id,
          ).length;
          const hasActiveBookings = bookings.some(
            (booking) => booking.listing.id === listing.id &&
              booking.state !== "cancelled" && booking.state !== "completed" &&
              minskBookingTime(booking.date, booking.endTime) > now,
          );

          return (
            <article key={listing.id} className="space-card overflow-hidden">
              <div className="grid items-center gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-5">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4 lg:items-center">
                  <div className="photo-frame space-card-photo">
                    <img src={listing.image} alt="" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="space-card-title">{t(listing.room)}</h2>
                    <p className="mt-1.5 text-[15px] leading-snug wrap-break-word text-ink-soft">
                      {[t(listing.school), t(listing.uo)].filter(Boolean).join("\u00a0· ")}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed wrap-break-word text-ink-mute">
                      {listing.address}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-mute">
                      {t(ROOM_TYPES[listing.type].label)} · {listing.capacity === null ? t("Вместимость не указана") : `${t("до ")}${listing.capacity} ${t("человек")}`}
                    </p>
                  </div>
                </div>
                <dl className="flex flex-wrap justify-between gap-x-2 gap-y-3 rounded-lg bg-sky-soft/65 px-3 py-2.5 text-blue-deep min-[360px]:gap-x-4 sm:justify-start sm:gap-x-6">
                  <div>
                    <dt className="text-sm text-ink-soft">{t("Свободно")}</dt>
                    <dd className="mt-0.5 text-[17px] font-semibold tabular-nums">{free} {t("ч")}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-soft">{t("Броней")}</dt>
                    <dd className="mt-0.5 text-[17px] font-semibold tabular-nums">{String(upcoming).padStart(2, "0")}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-soft">{t("За час")}</dt>
                    <dd className="mt-0.5 text-[17px] font-semibold tabular-nums">{money(listing.price)}</dd>
                  </div>
                </dl>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 bg-paper/50 px-4 py-2 sm:px-5">
                <RoomPhotoButton listing={listing} onSelect={onChangePhoto} />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(listing)}
                    disabled={hasActiveBookings}
                    title={hasActiveBookings ? t("Нельзя менять помещение с активными бронями") : t("Редактировать")}
                    className="btn btn-quiet h-auto min-h-11 rounded-lg px-3 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />{t("Редактировать")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onArchive(listing)}
                    disabled={hasActiveBookings}
                    title={hasActiveBookings ? t("Нельзя убрать помещение с активными бронями") : t("Убрать из каталога")}
                    className="btn btn-quiet h-auto min-h-11 rounded-lg px-3 text-orange hover:bg-orange-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Archive className="size-3.5" aria-hidden="true" />{t("Убрать из каталога")}
                  </button>
                  {hasActiveBookings && <span className="text-sm text-ink-mute">{t("Есть активные брони")}</span>}
                </div>
              </footer>
            </article>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-[14px] leading-relaxed text-ink-soft">
          {t("Свободные часы и брони загружаются с сервера. Обновите данные, чтобы увидеть новые заявки.")}
        </p>
        <button type="button" onClick={onAdd} className="archive-link text-[14px] font-medium">
          {t("Добавить ещё")}
        </button>
      </div>
    </div>
  );
}

function ArchiveSpaceDialog({ listing, onClose, onArchive }: {
  listing: Listing;
  onClose: () => void;
  onArchive: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog(onClose, { closeOnEscape: !archiving });

  const confirmArchive = async () => {
    setArchiving(true);
    setError(null);
    try {
      await onArchive();
    } catch (caught) {
      setError(t(errorMessage(caught, "Не удалось убрать пространство.")));
      setArchiving(false);
    }
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/55 p-2 sm:items-center sm:p-4"
      onClick={(event) => { if (event.target === event.currentTarget && !archiving) onClose(); }}
      role="presentation"
    >
      <section
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="archive-space-title"
        aria-describedby="archive-space-description"
        className="sheet-in max-h-[calc(100dvh-1rem)] w-full max-w-[460px] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-4 outline-none sm:max-h-[calc(100dvh-2rem)] sm:p-6"
      >
        <h2 id="archive-space-title" className="text-[22px] leading-tight tracking-tight">
          {t("Убрать пространство из каталога?")}
        </h2>
        <p className="mt-3 wrap-break-word text-base font-semibold">{t(listing.room)}</p>
        <p id="archive-space-description" className="mt-2 text-base leading-relaxed text-ink-soft">
          {t("Пространство исчезнет из каталога. История бронирований сохранится.")}
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-orange/25 bg-orange-soft p-3 text-base">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={archiving}>
            {t("Отмена")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void confirmArchive()} disabled={archiving}>
            {t(archiving ? "Подождите…" : "Убрать из каталога")}
          </button>
        </div>
      </section>
    </div>
  );
}

function RoomPhotoButton({ listing, onSelect }: { listing: Listing; onSelect: (listing: Listing, file: File) => void }) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true);
    try { await onSelect(listing, file); }
    finally { setUploading(false); }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void handleFile(event)} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn btn-quiet h-auto min-h-11 rounded-lg px-3 disabled:opacity-50">
        {uploading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-3.5" aria-hidden="true" />}
        {t(uploading ? "Загружаем…" : "Сменить фото")}
      </button>
    </>
  );
}

function BookingsTab({
  bookings,
  institutionName,
  allCount,
  filter,
  filterCounts,
  onFilter,
  onCreate,
  onCancel,
  cancelling,
  today,
}: {
  bookings: Booking[];
  institutionName: string;
  allCount: number;
  filter: BookingFilter;
  filterCounts: Record<BookingFilter, number>;
  onFilter: (filter: BookingFilter) => void;
  onCreate: () => void;
  onCancel: (booking: Booking) => void;
  cancelling: number | null;
  today: string;
}) {
  const { t, language } = useLanguage();
  const tabs: { value: BookingFilter; label: string }[] = [
    { value: "all", label: t("Все") },
    { value: "client", label: t("От клиентов") },
    { value: "uo", label: t("Вручную") },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
        <div className="flex flex-wrap gap-1">
          {tabs.filter((item) => MANUAL_BOOKING_ENABLED || item.value !== "uo").map((item) => {
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onFilter(item.value)}
                aria-pressed={active}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[13px] tracking-[0.06em] uppercase transition-colors ${
                  active
                    ? "bg-ink text-paper"
                    : "text-ink-mute hover:bg-paper-2 hover:text-ink"
                }`}
              >
                {item.label}
                <span className={active ? "text-paper/85" : "text-ink-mute"}>
                  {String(filterCounts[item.value]).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>
        <p className="font-mono text-[13px] tracking-[0.06em] uppercase text-ink-mute">
          {allCount} {t("броней")} · 7 {t("дней")}
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="border-b border-line py-14">
          <h2 className="text-[22px] tracking-[-0.02em]">{t("Здесь пока тихо")}</h2>
          <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed wrap-break-word text-ink-soft">
            {allCount === 0
              ? t("Здесь появятся брони помещений вашего учреждения ({school}).").replace("{school}", () => t(institutionName))
              : t("В этой выборке нет броней. Покажите все или создайте ручную заявку.")}
          </p>
          {MANUAL_BOOKING_ENABLED && <button type="button" onClick={onCreate} className="btn btn-primary mt-5 h-10">
            <CalendarPlus className="size-4" strokeWidth={1.8} />
            {t("Создать бронь")}
          </button>}
        </div>
      ) : (
        <div>
          {bookings.map((booking) => (
            <article
              key={booking.id}
              className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-4 gap-y-4 border-b border-line py-5 sm:grid-cols-[64px_126px_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:py-6"
            >
              <div className="col-span-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:col-span-1 sm:block">
                <p className="font-serif text-[26px] leading-none font-medium tabular-nums">
                  {dayNumber(booking.date)}
                </p>
                <p className="font-mono text-[13px] tracking-[0.06em] uppercase text-ink-mute">
                  {monthShort(booking.date, language)} · {weekdayShort(booking.date, language)}
                </p>
                {booking.date === today && (
                  <p className="font-mono text-[13px] font-medium tracking-[0.06em] uppercase text-ink">
                    {t("сегодня")}
                  </p>
                )}
              </div>

              <div className="photo-frame aspect-[4/3] w-full rounded-lg">
                <img
                  src={booking.listing.image}
                  alt={`${t(ROOM_TYPES[booking.listing.type].label)} «${t(booking.listing.room)}»`}
                  loading="lazy"
                />
              </div>

              <div className="min-w-0 self-center">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-md px-1.5 py-0.5 font-mono text-[13px] tracking-[0.06em] uppercase ${
                      booking.source === "client"
                        ? "bg-sky-soft text-blue-deep"
                        : "bg-orange-soft text-ink"
                    }`}
                  >
                    {booking.source === "client" ? t("клиент") : t("вручную")}
                  </span>
                  <span className="font-mono text-[13px] text-ink-mute">
                    №{booking.id}
                  </span>
                  <span className="text-[14px] text-ink-soft">{t(({ pending: "Бронь создана", confirmed: "Подтверждено", paid: "Оплачено", active: "Активно", completed: "Завершено", cancelled: "Отменено" })[booking.state ?? "pending"])}</span>
                </div>
                <h2 className="mt-1 text-[19px] leading-tight tracking-[-0.02em] wrap-break-word sm:text-[21px]">
                  {t(booking.listing.room)}
                </h2>
                <p className="mt-1 text-[14px] leading-snug wrap-break-word text-ink-mute">
                  {t(booking.listing.school)} · {t(ROOM_TYPES[booking.listing.type].label)}
                </p>
                <p className="mt-2 font-mono text-[14px] tabular-nums text-ink-soft">
                  {intervalLabel(booking.startTime, booking.endTime)}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-[14px] font-medium wrap-break-word">{booking.customerName}</p>
                  <p className="font-mono text-[14px] text-ink-soft">
                    {booking.customerPhone}
                  </p>
                </div>
                {booking.note && (
                  <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-ink-mute italic">
                    {booking.note}
                  </p>
                )}
              </div>

              <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right">
                <p className="font-serif text-[18px] font-medium tabular-nums">
                  {money(booking.total)}
                </p>
                <p className="mt-1 font-mono text-[13px] leading-relaxed uppercase tracking-[0.04em] text-ink-mute">
                  {durationLabel(intervalHours(booking.startTime, booking.endTime), language)}
                </p>
                {booking.source === "client" && ["pending", "confirmed", "paid"].includes(booking.state ?? "") &&
                  minskBookingTime(booking.date, booking.startTime) > Date.now() && (
                    <button type="button" className="btn btn-quiet mt-2" disabled={cancelling !== null} onClick={() => onCancel(booking)}>
                      {t(cancelling === booking.id ? "Подождите…" : "Отменить бронь")}
                    </button>
                  )}
                <p className="mt-1.5 hidden font-mono text-[13px] uppercase text-ink-mute sm:block">
                  {longDate(booking.date, language)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
