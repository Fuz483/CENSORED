import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { BookingRequest, Listing, Slot } from "../lib/types";
import { durationLabel, intervalHours, intervalPrice, money } from "../lib/format";
import { BOOKING_STEP_MINUTES, isRangeAvailable, MIN_BOOKING_MINUTES, timeToMinutes } from "../lib/intervals";
import { useLanguage } from "../lib/i18n";

export function IntervalPicker({
  listing,
  date,
  slots,
  selected,
  onChange,
  onConfirm,
}: {
  listing: Listing;
  date: string;
  slots: Slot[];
  selected?: BookingRequest;
  onChange?: (startTime: string, endTime: string) => void;
  onConfirm?: (startTime: string, endTime: string) => void;
}) {
  const { t, language } = useLanguage();
  const times = useMemo(
    () => slots.filter((slot) => slot.listingId === listing.id && slot.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [date, listing.id, slots],
  );
  const min = times[0]?.startTime ?? "14:00";
  const max = times[times.length - 1]?.endTime ?? "21:00";
  const minMinutes = timeToMinutes(min) ?? 14 * 60;
  const maxMinutes = timeToMinutes(max) ?? 21 * 60;
  const maxIndex = Math.max(1, Math.floor((maxMinutes - minMinutes) / BOOKING_STEP_MINUTES));
  const minDurationSteps = Math.ceil(MIN_BOOKING_MINUTES / BOOKING_STEP_MINUTES);
  const canFitMinimum = maxIndex >= minDurationSteps;
  const availableRanges = times
    .filter((slot) => slot.state === 0)
    .map((slot) => ({
      start: clamp((timeToMinutes(slot.startTime) ?? minMinutes) - minMinutes, 0, maxMinutes - minMinutes),
      end: clamp((timeToMinutes(slot.endTime) ?? maxMinutes) - minMinutes, 0, maxMinutes - minMinutes),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start)
    .reduce<{ start: number; end: number }[]>((merged, range) => {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
      return merged;
    }, []);
  const firstWindow = availableRanges.find(({ start, end }) => end - start >= MIN_BOOKING_MINUTES);
  const initialStart = firstWindow ? formatTime(minMinutes + firstWindow.start) : min;
  const initialEnd = nextHour(initialStart);
  const [startTime, setStartTime] = useState(selected?.startTime ?? initialStart);
  const [endTime, setEndTime] = useState(selected?.endTime ?? initialEnd);
  const activeHandle = useRef<"start" | "end" | null>(null);

  useEffect(() => {
    if (selected) {
      setStartTime(selected.startTime);
      setEndTime(selected.endTime);
    } else {
      setStartTime(initialStart);
      setEndTime(initialEnd);
    }
  }, [date, initialStart, initialEnd, selected?.startTime, selected?.endTime]);

  const startIndex = canFitMinimum
    ? clamp(Math.round(((timeToMinutes(startTime) ?? minMinutes) - minMinutes) / BOOKING_STEP_MINUTES), 0, maxIndex - minDurationSteps)
    : 0;
  const endIndex = canFitMinimum
    ? clamp(Math.round(((timeToMinutes(endTime) ?? maxMinutes) - minMinutes) / BOOKING_STEP_MINUTES), startIndex + minDurationSteps, maxIndex)
    : maxIndex;
  const startPercent = (startIndex / maxIndex) * 100;
  const endPercent = (endIndex / maxIndex) * 100;
  const valid = isRangeAvailable(slots, listing.id, date, startTime, endTime);

  const updateStart = (index: number) => {
    const bounded = clamp(index, 0, endIndex - minDurationSteps);
    update(formatTime(minMinutes + bounded * BOOKING_STEP_MINUTES), endTime);
  };
  const updateEnd = (index: number) => {
    const bounded = clamp(index, startIndex + minDurationSteps, maxIndex);
    update(startTime, formatTime(minMinutes + bounded * BOOKING_STEP_MINUTES));
  };
  const update = (nextStart: string, nextEnd: string) => {
    setStartTime(nextStart);
    setEndTime(nextEnd);
    onChange?.(nextStart, nextEnd);
  };
  const updateFromPointer = (event: PointerEvent<HTMLDivElement>, handle: "start" | "end") => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const usableWidth = Math.max(1, bounds.width - 22);
    const progress = clamp((event.clientX - bounds.left - 11) / usableWidth, 0, 1);
    const index = Math.round(progress * maxIndex);
    if (handle === "start") updateStart(index);
    else updateEnd(index);
  };
  const beginPointer = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const usableWidth = Math.max(1, bounds.width - 22);
    const progress = clamp((event.clientX - bounds.left - 11) / usableWidth, 0, 1);
    const index = progress * maxIndex;
    const handle = Math.abs(index - startIndex) <= Math.abs(index - endIndex) ? "start" : "end";
    activeHandle.current = handle;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event, handle);
  };
  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (activeHandle.current) updateFromPointer(event, activeHandle.current);
  };
  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    activeHandle.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4" onClick={(event) => event.stopPropagation()}>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <div className="min-w-0 rounded-lg border border-line bg-surface p-3 sm:px-4">
          <p className="wrap-break-word text-sm font-medium text-ink-soft sm:text-base">{t("Начало")}</p>
          <p className="mt-1.5 text-[22px] leading-none font-bold tabular-nums sm:text-[26px]">{startTime}</p>
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-surface p-3 sm:px-4">
          <p className="wrap-break-word text-sm font-medium text-ink-soft sm:text-base">{t("Окончание")}</p>
          <p className="mt-1.5 text-[22px] leading-none font-bold tabular-nums sm:text-[26px]">{endTime}</p>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-3 sm:px-4">
        <p className="text-sm leading-snug text-ink-soft sm:text-base">
          {t("Перетащите ползунки, чтобы изменить время.")}
        </p>
        <div
          className="interval-slider mt-2"
          style={{ "--range-start": `${startPercent}%`, "--range-end": `${endPercent}%` } as CSSProperties}
          onPointerDown={beginPointer}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <div className="interval-slider__rail rounded-lg" />
          {availableRanges.map((range, index) => (
            <div
              key={`${range.start}-${range.end}-${index}`}
              className="interval-slider__availability rounded-md"
              style={{
                "--range-start": `${(range.start / (maxMinutes - minMinutes)) * 100}%`,
                "--range-width": `${((range.end - range.start) / (maxMinutes - minMinutes)) * 100}%`,
              } as CSSProperties}
            />
          ))}
          <div className="interval-slider__selection rounded-md" />
          <input
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={startIndex}
            onChange={(event) => updateStart(Number(event.target.value))}
            disabled={!canFitMinimum}
            className="interval-slider__input interval-slider__input--start"
            aria-label={t("Начало")}
            aria-valuetext={startTime}
          />
          <input
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={endIndex}
            onChange={(event) => updateEnd(Number(event.target.value))}
            disabled={!canFitMinimum}
            className="interval-slider__input interval-slider__input--end"
            aria-label={t("Окончание")}
            aria-valuetext={endTime}
          />
        </div>
        <div className="flex justify-between text-sm font-semibold tabular-nums text-ink-soft sm:text-base" aria-hidden="true">
          <span>{min}</span>
          <span>{formatTime(minMinutes + Math.round(maxIndex / 2) * BOOKING_STEP_MINUTES)}</span>
          <span>{max}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-2"><i className="size-3 shrink-0 rounded-sm bg-blue" aria-hidden="true" />{t("Доступное время")}</span>
          <span className="inline-flex items-center gap-2"><i className="size-3 shrink-0 rounded-sm bg-orange" aria-hidden="true" />{t("Ваш выбор")}</span>
        </div>
      </div>

      <div className="rounded-lg bg-sky-soft/65 p-3 sm:px-4">
        <dl className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <dt className="text-sm text-ink-soft">{t("Длительность")}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{durationLabel(intervalHours(startTime, endTime), language)}</dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-sm text-ink-soft">{t("Тариф за интервал")}</dt>
            <dd className="mt-1 wrap-break-word text-lg font-bold tabular-nums sm:text-xl">{money(intervalPrice(listing.price, startTime, endTime))}</dd>
          </div>
        </dl>
        {!valid && <p role="status" className="mt-2.5 rounded-lg border border-orange/25 bg-orange-soft p-2.5 text-sm font-semibold">{t("Интервал недоступен")}</p>}
        {onConfirm && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={!valid}
              onClick={() => onConfirm(startTime, endTime)}
              className="btn btn-primary min-h-12 w-full rounded-lg px-6 text-base disabled:opacity-50 sm:w-auto"
            >
              {t("Готово")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function nextHour(value: string): string {
  const minutes = (timeToMinutes(value) ?? 14 * 60) + MIN_BOOKING_MINUTES;
  return formatTime(minutes);
}
