import { useRef, type CSSProperties, type PointerEvent } from "react";

import { BOOKING_STEP_MINUTES, MIN_BOOKING_MINUTES, timeToMinutes } from "../lib/intervals";
import { useLanguage } from "../lib/i18n";

const OPENING_MINUTES = 14 * 60;
const CLOSING_MINUTES = 21 * 60;
const MAX_INDEX = (CLOSING_MINUTES - OPENING_MINUTES) / BOOKING_STEP_MINUTES;
const MIN_WINDOW_STEPS = MIN_BOOKING_MINUTES / BOOKING_STEP_MINUTES;

export function AvailabilityWindowPicker({
  startTime,
  endTime,
  onChange,
}: {
  startTime: string;
  endTime: string;
  onChange: (startTime: string, endTime: string) => void;
}) {
  const { t } = useLanguage();
  const startMinutes = timeToMinutes(startTime) ?? OPENING_MINUTES;
  const endMinutes = timeToMinutes(endTime) ?? CLOSING_MINUTES;
  const startIndex = clamp(Math.round((startMinutes - OPENING_MINUTES) / BOOKING_STEP_MINUTES), 0, MAX_INDEX - MIN_WINDOW_STEPS);
  const endIndex = clamp(Math.round((endMinutes - OPENING_MINUTES) / BOOKING_STEP_MINUTES), startIndex + MIN_WINDOW_STEPS, MAX_INDEX);
  const startPercent = (startIndex / MAX_INDEX) * 100;
  const endPercent = (endIndex / MAX_INDEX) * 100;
  const activeHandle = useRef<"start" | "end" | null>(null);

  const updateStart = (index: number) => {
    const next = clamp(index, 0, endIndex - MIN_WINDOW_STEPS);
    onChange(formatTime(OPENING_MINUTES + next * BOOKING_STEP_MINUTES), endTime);
  };
  const updateEnd = (index: number) => {
    const next = clamp(index, startIndex + MIN_WINDOW_STEPS, MAX_INDEX);
    onChange(startTime, formatTime(OPENING_MINUTES + next * BOOKING_STEP_MINUTES));
  };
  const updateFromPointer = (event: PointerEvent<HTMLDivElement>, handle: "start" | "end") => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const usableWidth = Math.max(1, bounds.width - 22);
    const progress = clamp((event.clientX - bounds.left - 11) / usableWidth, 0, 1);
    const index = Math.round(progress * MAX_INDEX);
    if (handle === "start") updateStart(index);
    else updateEnd(index);
  };
  const beginPointer = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const usableWidth = Math.max(1, bounds.width - 22);
    const progress = clamp((event.clientX - bounds.left - 11) / usableWidth, 0, 1);
    const index = progress * MAX_INDEX;
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
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-2 border border-line bg-paper/50 px-3 py-2">
          <span className="text-[13px] text-ink-soft">{t("Начало доступности")}</span>
          <span className="font-mono text-[16px] font-medium tabular-nums">{startTime}</span>
        </div>
        <div className="flex items-center justify-between gap-2 border border-line bg-paper/50 px-3 py-2">
          <span className="text-[13px] text-ink-soft">{t("Конец доступности")}</span>
          <span className="font-mono text-[16px] font-medium tabular-nums">{endTime}</span>
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
        <div className="interval-slider__selection interval-slider__selection--availability" />
        <span className="interval-slider__thumb interval-slider__thumb--availability" style={{ left: `clamp(11px, ${startPercent}%, calc(100% - 11px))` }} aria-hidden="true" />
        <span className="interval-slider__thumb interval-slider__thumb--availability" style={{ left: `clamp(11px, ${endPercent}%, calc(100% - 11px))` }} aria-hidden="true" />
        <input type="range" min={0} max={MAX_INDEX} step={1} value={startIndex}
          onChange={(event) => updateStart(Number(event.target.value))}
          className="interval-slider__input interval-slider__input--start interval-slider__input--availability"
          aria-label={t("Начало доступности")} aria-valuetext={startTime} />
        <input type="range" min={0} max={MAX_INDEX} step={1} value={endIndex}
          onChange={(event) => updateEnd(Number(event.target.value))}
          className="interval-slider__input interval-slider__input--end interval-slider__input--availability"
          aria-label={t("Конец доступности")} aria-valuetext={endTime} />
      </div>

      <div className="mt-2 flex justify-between font-mono text-[12px] tabular-nums text-ink-soft" aria-hidden="true">
        <span>14:00</span><span>17:30</span><span>21:00</span>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-mute">
        {t("Клиенты смогут бронировать только внутри этого окна. Минимальная бронь — 1 час; шаг — 15 минут.")}
      </p>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
