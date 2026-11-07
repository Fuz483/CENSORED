import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";

import { useDialog } from "../hooks/useDialog";
import { DEMO_UO_DISTRICT, ROOM_TYPE_LIST, ROOM_TYPES, UO_LIST } from "../lib/data";
import { cityFromAddress } from "../lib/belarus";
import { fileToPhoto } from "../lib/images";
import { errorMessage, type UpdateListingInput } from "../lib/repository";
import type { Listing, RoomType } from "../lib/types";
import { useApp } from "../state/AppState";
import { useLanguage } from "../lib/i18n";
import { AvailabilityWindowPicker } from "./AvailabilityWindowPicker";
import { LocationFields } from "./LocationFields";

interface AddSpaceDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (listing: Listing) => void;
  listing?: Listing;
}

export function AddSpaceDialog({ open, onClose, onSaved, listing }: AddSpaceDialogProps) {
  const { user, addListing, updateListing } = useApp();
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const initialAddress = listing?.address === "Адрес уточняется" ? "" : listing?.address ?? "";
  const initialCity = listing
    ? listing.city || cityFromAddress(initialAddress)
    : user?.name === "Лицей БГУ" ? "Минск" : "";
  const [type, setType] = useState<RoomType>(listing?.type ?? "gym");
  const [uo, setUo] = useState(listing?.uo ?? DEMO_UO_DISTRICT);
  const [room, setRoom] = useState(listing?.room ?? "");
  const [address, setAddress] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [cityDistrict, setCityDistrict] = useState(listing?.cityDistrict ?? "");
  const [capacity, setCapacity] = useState(String(listing ? listing.capacity ?? "" : ROOM_TYPES.gym.capacity));
  const [price, setPrice] = useState(String(listing?.price ?? ROOM_TYPES.gym.price));
  const [availableFrom, setAvailableFrom] = useState(listing?.availableFrom ?? "14:00");
  const [availableTo, setAvailableTo] = useState(listing?.availableTo ?? "21:00");
  const [image, setImage] = useState(listing?.image ?? "");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog<HTMLDivElement>(onClose, { open: open && Boolean(user), closeOnEscape: !saving });

  useEffect(() => {
    if (open) {
      setType(listing?.type ?? "gym");
      setUo(listing?.uo ?? DEMO_UO_DISTRICT);
      setRoom(listing?.room ?? "");
      setAddress(initialAddress);
      setCity(initialCity);
      setCityDistrict(listing?.cityDistrict ?? "");
      setCapacity(String(listing ? listing.capacity ?? "" : ROOM_TYPES.gym.capacity));
      setPrice(String(listing?.price ?? ROOM_TYPES.gym.price));
      setAvailableFrom(listing?.availableFrom ?? "14:00");
      setAvailableTo(listing?.availableTo ?? "21:00");
      setImage(listing?.image ?? "");
      setFileName("");
      setError(null);
    }
  }, [initialAddress, initialCity, listing, open]);

  if (!open || !user) return null;

  const changeType = (next: RoomType) => {
    setType(next);
    if (!listing) {
      setCapacity(String(ROOM_TYPES[next].capacity));
      setPrice(String(ROOM_TYPES[next].price));
    }
  };

  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const photo = await fileToPhoto(file);
      setImage(photo);
      setFileName(file.name);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t("Не удалось загрузить фото."));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void readPhoto(event.dataTransfer.files[0]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || uploading || (!listing && !city)) return;
    const numericCapacity = Number(capacity);
    const numericPrice = Number(price);
    const nextRoom = room.trim();
    const nextAddress = address.trim();

    if (!listing && !image) {
      setError(t("Добавьте фотографию пространства — без неё объявление не опубликуется."));
      return;
    }
    if (!nextRoom) {
      setError(t("Напишите название пространства."));
      return;
    }
    if (!listing && !nextAddress) {
      setError(t("Укажите адрес учреждения."));
      return;
    }
    if ((!listing || capacity !== "") && (!Number.isInteger(numericCapacity) || numericCapacity < 1)) {
      setError(t("Укажите вместимость больше нуля."));
      return;
    }
    if (!price.trim() || !Number.isFinite(numericPrice) || numericPrice < (listing ? 0 : 1)) {
      setError(t("Укажите цену за час больше нуля."));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (listing) {
        const changes: UpdateListingInput = {};
        const nextCapacity = capacity === "" ? null : numericCapacity;
        if (uo !== listing.uo) changes.uo = uo;
        if (nextAddress !== initialAddress.trim()) changes.address = nextAddress;
        if (city !== initialCity) changes.city = city;
        if (cityDistrict !== (listing.cityDistrict ?? "")) changes.cityDistrict = cityDistrict;
        if (type !== listing.type) changes.type = type;
        if (nextRoom !== listing.room) changes.room = nextRoom;
        if (nextCapacity !== listing.capacity) changes.capacity = nextCapacity;
        if (numericPrice !== listing.price) changes.price = numericPrice;
        if (availableFrom !== listing.availableFrom) changes.availableFrom = availableFrom;
        if (availableTo !== listing.availableTo) changes.availableTo = availableTo;
        if (fileName) changes.image = image;
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        onSaved(await updateListing(listing.id, changes));
      } else {
        onSaved(await addListing({
          school: user.name,
          uo,
          address: nextAddress,
          city,
          cityDistrict,
          type,
          room: nextRoom,
          capacity: numericCapacity,
          price: numericPrice,
          availableFrom,
          availableTo,
          image,
        }));
      }
    } catch (caught) {
      setError(t(errorMessage(caught, "Не удалось сохранить пространство. Проверьте поля и попробуйте ещё раз.")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-2 sm:items-center sm:p-4"
      onClick={saving ? undefined : onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-space-title"
        className="sheet-in flex max-h-[calc(100dvh-1rem)] w-full max-w-[580px] flex-col overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface outline-none sm:max-h-[calc(100dvh-2rem)] sm:shadow-[0_24px_80px_rgba(13,36,55,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 py-2.5 sm:px-6 sm:py-4">
          <div>
            <h2 id="add-space-title" className="text-[22px] tracking-[-0.025em]">
              {t(listing ? "Редактировать пространство" : "Добавить пространство")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-mute transition-colors hover:bg-paper hover:text-ink sm:size-9"
            aria-label={t("Закрыть")}
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="space-school" className="label mb-1.5 block">
                {t("Учреждение")}
              </label>
              <input
                id="space-school"
                value={listing?.school ?? user.name}
                readOnly
                className="field-box bg-paper-2/60 text-ink-soft"
              />
            </div>

            <LocationFields prefix="space" city={city} district={cityDistrict} required={!listing}
              onCityChange={(value) => { setCity(value); setCityDistrict(""); }} onDistrictChange={setCityDistrict} />

            <div>
              <label htmlFor="space-uo" className="label mb-1.5 block">
                {t("УО")}
              </label>
              <select
                id="space-uo"
                value={uo}
                onChange={(event) => setUo(event.target.value)}
                className="field-box cursor-pointer"
              >
                {listing && !UO_LIST.some((item) => item === listing.uo) && (
                  <option value={listing.uo}>{listing.uo || t("Не указан")}</option>
                )}
                {UO_LIST.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="space-type" className="label mb-1.5 block">
                {t("Тип помещения")}
              </label>
              <select
                id="space-type"
                value={type}
                onChange={(event) => changeType(event.target.value as RoomType)}
                className="field-box cursor-pointer"
              >
                {ROOM_TYPE_LIST.map((item) => (
                  <option key={item} value={item}>
                    {ROOM_TYPES[item].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="space-room" className="label mb-1.5 block">
                {t("Название")}
              </label>
              <input
                id="space-room"
                value={room}
                onChange={(event) => {
                  setRoom(event.target.value);
                  setError(null);
                }}
                placeholder={t("Например, большой зал")}
                autoComplete="off"
                className="field-box"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="space-address" className="label mb-1.5 block">
                {t("Адрес учреждения")}
              </label>
              <input
                id="space-address"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setError(null);
                }}
                placeholder={t("Например, ул. Примерная, 10")}
                autoComplete="street-address"
                required={!listing}
                className="field-box"
              />
            </div>

            <div>
              <label htmlFor="space-capacity" className="label mb-1.5 block">
                {t("Вместимость, человек")}
              </label>
              <input
                id="space-capacity"
                type="number"
                min={1}
                max={listing ? 2_147_483_647 : 500}
                inputMode="numeric"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className="field-box tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="space-price" className="label mb-1.5 block">
                {t("Цена за час, BYN")}
              </label>
              <input
                id="space-price"
                type="number"
                min={listing ? 0 : 1}
                max={listing ? 99_999_999.99 : 999}
                step={listing ? 0.01 : 1}
                inputMode={listing ? "decimal" : "numeric"}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="field-box tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <span className="label mb-1.5 block">{t("Доступное время для аренды")}</span>
              <AvailabilityWindowPicker
                startTime={availableFrom}
                endTime={availableTo}
                onChange={(start, end) => { setAvailableFrom(start); setAvailableTo(end); }}
              />
            </div>

            <div className="sm:col-span-2">
              <span className="label mb-1.5 block">{t("Фотография пространства")}</span>
              <label
                htmlFor="space-photo"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`relative flex min-h-[190px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors ${
                  dragging ? "border-orange bg-orange-soft/40" : "border-line-strong bg-paper/60"
                }`}
              >
                {image ? (
                  <>
                    <img
                      src={image}
                      alt={t("Предпросмотр фотографии нового пространства")}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-navy/20" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-navy/80 px-3 py-2.5 text-on-navy">
                      <span className="min-w-0 truncate font-mono text-[13px] uppercase tracking-[0.06em]">
                        {fileName || t("фото добавлено")}
                      </span>
                      <span className="shrink-0 text-[14px] text-on-navy-accent">
                        {t("Заменить")}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="px-6 py-8 text-center">
                    {uploading ? (
                      <LoaderCircle className="mx-auto size-6 animate-spin text-orange" />
                    ) : (
                      <ImagePlus className="mx-auto size-6 text-ink-mute" strokeWidth={1.5} />
                    )}
                    <p className="mt-3 text-[15px] font-medium">
                      {uploading ? t("Готовим фотографию…") : t("Перетащите фото сюда")}
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
                      {t("или нажмите, чтобы выбрать JPG, PNG или WebP")}
                    </p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  id="space-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => void readPhoto(event.target.files?.[0])}
                />
              </label>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                {t("Фото увидит клиент в каталоге. Лучше всего подходит горизонтальный кадр интерьера.")}
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 border-l-2 border-orange pl-3 text-[14px] leading-relaxed text-ink">
              {error}
            </p>
          )}

          <div className="mt-6 grid gap-2 border-t border-line pt-4 min-[440px]:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-quiet"
            >
              {t("Отмена")}
            </button>
            <button
              type="submit"
              disabled={uploading || saving}
              className="btn btn-primary"
            >
              {t(listing ? "Сохранить изменения" : "Опубликовать")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
