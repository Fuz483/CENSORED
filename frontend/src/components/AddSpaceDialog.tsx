import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";

import { DEMO_UO_DISTRICT, ROOM_TYPE_LIST, ROOM_TYPES, UO_LIST } from "../lib/data";
import { cityFromAddress } from "../lib/belarus";
import { fileToPhoto } from "../lib/images";
import { errorMessage } from "../lib/repository";
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
  const [type, setType] = useState<RoomType>(listing?.type ?? "gym");
  const [uo, setUo] = useState(listing?.uo ?? DEMO_UO_DISTRICT);
  const [room, setRoom] = useState(listing?.room ?? "");
  const [address, setAddress] = useState(listing?.address ?? "");
  const defaultCity = user?.name === "Лицей БГУ" ? "Минск" : "";
  const [city, setCity] = useState(listing?.city || cityFromAddress(listing?.address ?? "") || defaultCity);
  const [cityDistrict, setCityDistrict] = useState(listing?.cityDistrict ?? "");
  const [capacity, setCapacity] = useState(String(listing?.capacity ?? ROOM_TYPES.gym.capacity));
  const [price, setPrice] = useState(String(listing?.price ?? ROOM_TYPES.gym.price));
  const [availableFrom, setAvailableFrom] = useState(listing?.availableFrom ?? "14:00");
  const [availableTo, setAvailableTo] = useState(listing?.availableTo ?? "21:00");
  const [image, setImage] = useState(listing?.image ?? "");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType(listing?.type ?? "gym");
      setUo(listing?.uo ?? DEMO_UO_DISTRICT);
      setRoom(listing?.room ?? "");
      setAddress(listing?.address ?? "");
      setCity(listing?.city || cityFromAddress(listing?.address ?? "") || defaultCity);
      setCityDistrict(listing?.cityDistrict ?? "");
      setCapacity(String(listing?.capacity ?? ROOM_TYPES.gym.capacity));
      setPrice(String(listing?.price ?? ROOM_TYPES.gym.price));
      setAvailableFrom(listing?.availableFrom ?? "14:00");
      setAvailableTo(listing?.availableTo ?? "21:00");
      setImage(listing?.image ?? "");
      setFileName("");
      setError(null);
    }
  }, [defaultCity, listing, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, open, saving]);

  if (!open || !user) return null;

  const changeType = (next: RoomType) => {
    setType(next);
    setCapacity(String(ROOM_TYPES[next].capacity));
    setPrice(String(ROOM_TYPES[next].price));
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
    if (saving || uploading || !city) return;
    const numericCapacity = Number(capacity);
    const numericPrice = Number(price);

    if (!image) {
      setError(t("Добавьте фотографию пространства — без неё объявление не опубликуется."));
      return;
    }
    if (!room.trim()) {
      setError(t("Напишите название пространства."));
      return;
    }
    if (!address.trim()) {
      setError(t("Укажите адрес учреждения."));
      return;
    }
    if (!Number.isFinite(numericCapacity) || numericCapacity < 1) {
      setError(t("Укажите вместимость больше нуля."));
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 1) {
      setError(t("Укажите цену за час больше нуля."));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const input = {
        school: listing?.school ?? user.name,
        uo,
        address,
        city,
        cityDistrict,
        type,
        room,
        capacity: Math.round(numericCapacity),
        price: Math.round(numericPrice),
        availableFrom,
        availableTo,
        image,
      };
      const saved = listing
        ? await updateListing(listing.id, input)
        : await addListing(input);
      onSaved(saved);
    } catch (caught) {
      setError(t(errorMessage(caught, "Не удалось сохранить пространство. Проверьте поля и попробуйте ещё раз.")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center sm:p-4"
      onClick={saving ? undefined : onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-space-title"
        className="sheet-in flex max-h-[94dvh] w-full max-w-[580px] flex-col overflow-y-auto rounded-t-[10px] border border-line bg-surface sm:rounded-[6px] sm:shadow-[0_24px_80px_rgba(13,36,55,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id="add-space-title" className="text-[22px] tracking-[-0.025em]">
              {t(listing ? "Редактировать пространство" : "Добавить пространство")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid size-8 shrink-0 place-items-center text-ink-mute transition-colors hover:text-ink"
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
                value={user.name}
                readOnly
                className="field-box bg-paper-2/60 text-ink-soft"
              />
            </div>

            <LocationFields prefix="space" city={city} district={cityDistrict} required
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
                required
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
                max={500}
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
                min={1}
                max={999}
                inputMode="numeric"
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
                className={`relative flex min-h-[190px] cursor-pointer flex-col items-center justify-center overflow-hidden border border-dashed transition-colors ${
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
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-navy/80 px-3 py-2.5 text-paper">
                      <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.06em]">
                        {fileName || t("фото добавлено")}
                      </span>
                      <span className="shrink-0 text-[12px] text-orange-soft">
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
                    <p className="mt-3 text-[13px] font-medium">
                      {uploading ? t("Готовим фотографию…") : t("Перетащите фото сюда")}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
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
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-mute">
              {t("Фото увидит клиент в каталоге. Лучше всего подходит горизонтальный кадр интерьера.")}
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[12px] leading-relaxed text-orange">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-quiet flex-1"
            >
              {t("Отмена")}
            </button>
            <button
              type="submit"
              disabled={uploading || saving}
              className="btn btn-primary flex-1"
            >
              {t(listing ? "Сохранить изменения" : "Опубликовать")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
