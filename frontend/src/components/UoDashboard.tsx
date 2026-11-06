import { useRef, useState, type ChangeEvent } from "react";
import { CalendarPlus, ImagePlus, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";

import { ROOM_TYPES, toISODate } from "../lib/data";
import {
  dayNumber,
  durationLabel,
  intervalHours,
  intervalLabel,
  longDate,
  money,
  monthShort,
  weekdayShort,
} from "../lib/format";
import type { Booking, BookingSource, Listing } from "../lib/types";
import { freeSlotHours, useApp } from "../state/AppState";
import { AddSpaceDialog } from "./AddSpaceDialog";
import { ManualBookingDialog } from "./ManualBookingDialog";
import { useLanguage } from "../lib/i18n";

type Tab = "spaces" | "bookings";
type BookingFilter = "all" | BookingSource;
// Creation and photo changes are supported; other management actions remain read-only.
const READ_ONLY = true;

export function UoDashboard() {
  const { user, listings, slots, bookings, deleteListing, uploadRoomPhoto, reload } = useApp();
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("spaces");
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>("all");
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | undefined>();
  const [manualOpen, setManualOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
  const ownBookings = bookings
    .filter((booking) => booking.listing.ownerId === user.user_id)
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
    setNotice(`Пространство «${listing.room}» ${editingListing ? "обновлено" : "опубликовано"}. Клиенты уже видят его в каталоге.`);
  };

  const removeSpace = async (listing: Listing) => {
    if (!window.confirm(`Удалить пространство «${listing.room}»? Это действие нельзя отменить.`)) return;
    try {
      await deleteListing(listing.id);
      setNotice(`Пространство «${listing.room}» удалено.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось удалить пространство.");
    }
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

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-9 sm:px-8 sm:py-12">
      <div className="border-b border-ink/20 pb-6">
        <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_240px] md:items-end lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
          <div>
            <h1 className="max-w-[15ch] text-[clamp(2.1rem,4.6vw,3.6rem)] leading-[0.98] tracking-[-0.045em]">
              {t("Лицей БГУ")}
              <span className="block text-blue italic">{t("Кабинет УО")}<span className="text-orange">.</span></span>
            </h1>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
              {t("Помещения, свободные часы и заявки арендаторов вашего учреждения.")}
            </p>
          </div>

          {ownListings[0] && (
            <figure className="relative hidden aspect-[16/10] overflow-hidden bg-navy md:block">
              <img
                src={ownListings[0].image}
                alt={`${ownListings[0].room} в ${ownListings[0].school}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/10 to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 text-paper">
                <span className="min-w-0 truncate font-serif text-[16px] leading-tight">
                  {ownListings[0].room}
                </span>
              </figcaption>
            </figure>
          )}
        </div>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
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
        <div role="tablist" aria-label={t("Кабинет УО")} className="flex gap-6">
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
        </div>

        <button type="button" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await reload(); } finally { setRefreshing(false); } }} className="btn btn-quiet mb-3 h-11">{t(refreshing ? "Подождите…" : "Обновить данные")}</button>
        {tab === "spaces" ? (
          <button
            type="button"
            onClick={() => { setEditingListing(undefined); setSpaceOpen(true); }}
            className="btn btn-primary mb-3 h-10 w-full sm:w-auto"
          >
            <Plus className="size-4" strokeWidth={1.8} />
            {t("Добавить пространство")}
          </button>
        ) : !READ_ONLY ? (
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
          className="mt-4 border-l-2 border-ok pl-3 text-[12px] leading-relaxed text-ink-soft"
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
          onDelete={(listing) => void removeSpace(listing)}
          onChangePhoto={changePhoto}
        />
      ) : (
        <BookingsTab
          bookings={visibleBookings}
          allCount={ownBookings.length}
          filter={bookingFilter}
          filterCounts={filterCounts}
          onFilter={setBookingFilter}
          onCreate={() => setManualOpen(true)}
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
      className={`relative flex items-center gap-2 border-b-2 pb-3 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
        active
          ? "-mb-px border-orange text-ink"
          : "-mb-px border-transparent text-ink-mute hover:text-ink"
      }`}
    >
      {children}
      <span className="font-mono text-[10px] tabular-nums text-ink-mute">
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
  onDelete,
  onChangePhoto,
}: {
  listings: ReturnType<typeof useApp>["listings"];
  slots: ReturnType<typeof useApp>["slots"];
  bookings: Booking[];
  onAdd: () => void;
  onEdit: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
  onChangePhoto: (listing: Listing, file: File) => void;
}) {
  const { t } = useLanguage();
  if (listings.length === 0) {
    return (
      <div className="border-b border-line py-14">
        <h2 className="text-[22px] tracking-[-0.02em]">{t("Пока нет пространств")}</h2>
        <p className="mt-2 max-w-[44ch] text-[13px] leading-relaxed text-ink-mute">
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
        <p className="text-[13px] text-ink-soft">{listings.length} {t("пространств")}</p>
      </div>

      <div className="border-t border-line">
        {listings.map((listing, index) => {
          const free = freeSlotHours(slots.filter(
            (slot) => slot.listingId === listing.id && slot.state === 0,
          ));
          const upcoming = bookings.filter(
            (booking) => booking.listing.id === listing.id,
          ).length;
          const today = toISODate(new Date());
          const hasActiveBookings = bookings.some(
            (booking) => booking.listing.id === listing.id && booking.date >= today,
          );

          return (
            <article
              key={listing.id}
              className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-4 gap-y-4 border-b border-line py-5 sm:grid-cols-[150px_minmax(0,1fr)_250px] sm:items-center sm:gap-6 lg:grid-cols-[180px_minmax(0,1fr)_280px] lg:gap-8"
            >
              <div className="photo-frame aspect-[4/3] w-full">
                <img
                  src={listing.image}
                  alt={`${t(ROOM_TYPES[listing.type].label)} «${t(listing.room)}»`}
                  loading="lazy"
                />
                <span className="index-tag">{String(index + 1).padStart(2, "0")}</span>
              </div>

              <div className="col-span-2 -mt-2 sm:col-span-1 sm:col-start-1">
                <RoomPhotoButton listing={listing} onSelect={onChangePhoto} />
              </div>

              <div className="min-w-0 self-center">
                <p className="truncate text-[12px] text-ink-soft">{t(listing.school)} · {t(listing.uo)}</p>
                <h2 className="mt-1 truncate text-[20px] leading-tight tracking-[-0.025em] sm:text-[23px]">
                  {t(listing.room)}
                </h2>
                <p className="mt-1.5 text-[13px] leading-snug text-ink-soft">
                  {listing.address}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-ink-mute">
                  {t(ROOM_TYPES[listing.type].label)} · {listing.capacity === null ? t("Вместимость не указана") : `${t("до ")}${listing.capacity} ${t("человек")}`}
                </p>
              </div>

              <div className="col-span-2 grid grid-cols-3 gap-3 border-t border-line pt-3 sm:col-span-1 sm:border-0 sm:pt-0">
                <div>
                  <p className="mono-label">{t("Свободно")}</p>
                  <p className="mt-1.5 font-serif text-[17px] leading-none font-medium tabular-nums">
                    {free} ч
                  </p>
                </div>
                <div>
                  <p className="mono-label">{t("Броней")}</p>
                  <p className="mt-1.5 font-serif text-[17px] leading-none font-medium tabular-nums">
                    {String(upcoming).padStart(2, "0")}
                  </p>
                </div>
                <div className="text-right sm:text-left">
                  <p className="mono-label">{t("За час")}</p>
                  <p className="mt-1.5 font-serif text-[17px] leading-none font-medium tabular-nums">
                    {money(listing.price)}
                  </p>
                </div>
              </div>

              {!READ_ONLY && <div className="col-span-2 flex items-center justify-end gap-2 sm:col-start-2 sm:col-span-2 lg:col-start-2">
                <button
                  type="button"
                  onClick={() => onEdit(listing)}
                  disabled={hasActiveBookings}
                  title={hasActiveBookings ? t("Нельзя менять помещение с активными бронями") : t("Редактировать")}
                  className="btn btn-quiet h-9 px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />{t("Редактировать")}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(listing)}
                  disabled={hasActiveBookings}
                  title={hasActiveBookings ? t("Нельзя удалить помещение с активными бронями") : t("Удалить")}
                  className="btn btn-quiet h-9 px-3 text-[12px] text-orange hover:bg-orange-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />{t("Удалить")}
                </button>
                {hasActiveBookings && <span className="text-[10px] text-ink-mute">{t("Есть активные брони")}</span>}
              </div>}
            </article>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-[13px] leading-relaxed text-ink-soft">
          {t("Свободные часы и брони загружаются с сервера. Обновите данные, чтобы увидеть новые заявки.")}
        </p>
        <button type="button" onClick={onAdd} className="archive-link text-[12px] font-medium">
          {t("Добавить ещё")}
        </button>
      </div>
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
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void handleFile(event)} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn btn-quiet h-8 px-2.5 text-[11px] disabled:opacity-50">
        {uploading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-3.5" aria-hidden="true" />}
        {t(uploading ? "Загружаем…" : "Сменить фото")}
      </button>
    </>
  );
}

function BookingsTab({
  bookings,
  allCount,
  filter,
  filterCounts,
  onFilter,
  onCreate,
  today,
}: {
  bookings: Booking[];
  allCount: number;
  filter: BookingFilter;
  filterCounts: Record<BookingFilter, number>;
  onFilter: (filter: BookingFilter) => void;
  onCreate: () => void;
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
          {tabs.filter((item) => !READ_ONLY || item.value !== "uo").map((item) => {
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onFilter(item.value)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors ${
                  active
                    ? "bg-ink text-paper"
                    : "text-ink-mute hover:bg-paper-2 hover:text-ink"
                }`}
              >
                {item.label}
                <span className={active ? "text-paper/60" : "text-ink-mute/70"}>
                  {String(filterCounts[item.value]).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>
        <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-ink-mute">
          {allCount} {t("броней")} · 7 {t("дней")}
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="border-b border-line py-14">
          <h2 className="text-[22px] tracking-[-0.02em]">{t("Здесь пока тихо")}</h2>
          <p className="mt-2 max-w-[44ch] text-[13px] leading-relaxed text-ink-mute">
            {allCount === 0
              ? t("Брони появятся здесь, когда арендаторы выберут помещения Лицея БГУ.")
              : t("В этой выборке нет броней. Покажите все или создайте ручную заявку.")}
          </p>
          {!READ_ONLY && <button type="button" onClick={onCreate} className="btn btn-primary mt-5 h-10">
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
                <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-ink-mute">
                  {monthShort(booking.date, language)} · {weekdayShort(booking.date, language)}
                </p>
                {booking.date === today && (
                  <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-orange">
                    {t("сегодня")}
                  </p>
                )}
              </div>

              <div className="photo-frame aspect-[4/3] w-full">
                <img
                  src={booking.listing.image}
                  alt={`${t(ROOM_TYPES[booking.listing.type].label)} «${t(booking.listing.room)}»`}
                  loading="lazy"
                />
              </div>

              <div className="min-w-0 self-center">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex px-1.5 py-0.5 font-mono text-[10px] tracking-[0.06em] uppercase ${
                      booking.source === "client"
                        ? "bg-sky-soft text-blue-deep"
                        : "bg-orange-soft text-orange"
                    }`}
                  >
                    {booking.source === "client" ? t("клиент") : t("вручную")}
                  </span>
                  <span className="font-mono text-[10px] text-ink-mute">
                    №{booking.id}
                  </span>
                  <span className="text-[11px] text-ink-soft">{t(({ pending: "Бронь создана", confirmed: "Подтверждено", paid: "Оплачено", active: "Активно", completed: "Завершено", cancelled: "Отменено" })[booking.state ?? "pending"])}</span>
                </div>
                <h2 className="mt-1 truncate text-[19px] leading-tight tracking-[-0.02em] sm:text-[21px]">
                  {t(booking.listing.room)}
                </h2>
                <p className="mt-1 truncate text-[11.5px] text-ink-mute">
                  {t(booking.listing.school)} · {t(ROOM_TYPES[booking.listing.type].label)}
                </p>
                <p className="mt-2 font-mono text-[10px] tabular-nums text-ink-soft">
                  {intervalLabel(booking.startTime, booking.endTime)}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-[12px] font-medium">{booking.customerName}</p>
                  <p className="font-mono text-[10.5px] text-ink-mute">
                    {booking.customerPhone}
                  </p>
                </div>
                {booking.note && (
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-mute italic">
                    {booking.note}
                  </p>
                )}
              </div>

              <div className="col-span-2 flex items-baseline justify-between gap-4 border-t border-line pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right">
                <p className="font-serif text-[18px] font-medium tabular-nums">
                  {money(booking.total)}
                </p>
                <p className="mt-1 font-mono text-[10px] leading-relaxed uppercase tracking-[0.04em] text-ink-mute">
                  {durationLabel(intervalHours(booking.startTime, booking.endTime), language)}
                </p>
                <p className="mt-1.5 hidden font-mono text-[10px] uppercase text-ink-mute sm:block">
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
