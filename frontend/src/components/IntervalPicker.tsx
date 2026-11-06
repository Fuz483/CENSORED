import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { BookingRequest, Listing, Slot } from "../lib/types";
import { intervalHours, intervalPrice, money } from "../lib/format";
import { BOOKING_STEP_MINUTES, isRangeAvailable, MIN_BOOKING_MINUTES, timeToMinutes } from "../lib/intervals";
import { useLanguage } from "../lib/i18n";

export function IntervalPicker({
  listing,
  date,
  slots,
  selected,
  onChange,
}: {
  listing: Listing;
  date: string;
  slots: Slot[];
  selected?: BookingRequest;
  onChange: (startTime: string, endTime: string) => void;
}) {
  const { t } = useLanguage();
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
  const [startTime, setStartTime] = useState(selected?.startTime ?? min);
  const [endTime, setEndTime] = useState(selected?.endTime ?? nextHour(min));
  const activeHandle = useRef<"start" | "end" | null>(null);

  useEffect(() => {
    if (selected) {
      setStartTime(selected.startTime);
      setEndTime(selected.endTime);
    } else {
      setStartTime(min);
      setEndTime(nextHour(min));
    }
  }, [date, min, selected?.startTime, selected?.endTime]);

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
    onChange(nextStart, nextEnd);
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
    <div className="interval-picker" onClick={(event) => event.stopPropagation()}>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-2 border border-line bg-paper/50 px-3 py-2">
          <span className="text-[13px] text-ink-soft">{t("Начало")}</span>
          <span className="font-mono text-[16px] font-medium tabular-nums text-ink">{startTime}</span>
        </div>
        <div className="flex items-center justify-between gap-2 border border-line bg-paper/50 px-3 py-2">
          <span className="text-[13px] text-ink-soft">{t("Окончание")}</span>
          <span className="font-mono text-[16px] font-medium tabular-nums text-ink">{endTime}</span>
        </div>
      </div>

      <div
        className="interval-slider mt-3"
        style={{ "--range-start": `${startPercent}%`, "--range-end": `${endPercent}%` } as CSSProperties}
        onPointerDown={beginPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div className="interval-slider__rail" />
        {availableRanges.map((range, index) => (
          <div
            key={`${range.start}-${range.end}-${index}`}
            className="interval-slider__availability"
            style={{
              "--range-start": `${(range.start / (maxMinutes - minMinutes)) * 100}%`,
              "--range-width": `${((range.end - range.start) / (maxMinutes - minMinutes)) * 100}%`,
            } as CSSProperties}
          />
        ))}
        <div className="interval-slider__selection" />
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

      <div className="mt-2 flex justify-between font-mono text-[12px] tabular-nums text-ink-soft" aria-hidden="true">
        <span>{min}</span>
        <span>{formatTime(minMinutes + Math.round(maxIndex / 2) * BOOKING_STEP_MINUTES)}</span>
        <span>{max}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-soft">
        <span className="inline-flex items-center gap-2"><i className="size-3 rounded-[2px] bg-blue" />{t("Доступное время")}</span>
        <span className="inline-flex items-center gap-2"><i className="size-3 rounded-[2px] bg-orange" />{t("Ваш выбор")}</span>
      </div>

      <div className="mt-3 flex min-h-9 items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-[14px] font-medium text-ink">
          {intervalHours(startTime, endTime)} ч
          {!valid && <span className="ml-2 text-[13px] font-normal text-orange">{t("Интервал недоступен")}</span>}
        </p>
        <p className="font-serif text-[20px] font-semibold tabular-nums">{money(intervalPrice(listing.price, startTime, endTime))}</p>
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
