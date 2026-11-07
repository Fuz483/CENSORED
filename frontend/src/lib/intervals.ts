import type { Slot } from "./types";

export const BOOKING_STEP_MINUTES = 15;
export const MIN_BOOKING_MINUTES = 60;

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function isValidAvailabilityWindow(startTime: string, endTime: string): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return start !== null && end !== null &&
    start >= 14 * 60 && end <= 21 * 60 &&
    start < end && end - start >= MIN_BOOKING_MINUTES &&
    start % BOOKING_STEP_MINUTES === 0 && end % BOOKING_STEP_MINUTES === 0;
}

export function isRangeAvailable(
  slots: Slot[], listingId: number, date: string, startTime: string, endTime: string,
): boolean {
  return isDayRangeAvailable(slots.filter((slot) => slot.listingId === listingId && slot.date === date), startTime, endTime);
}

export function isDayRangeAvailable(daySlots: Slot[], startTime: string, endTime: string): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (
    start === null || end === null || start >= end ||
    end - start < MIN_BOOKING_MINUTES ||
    start % BOOKING_STEP_MINUTES !== 0 || end % BOOKING_STEP_MINUTES !== 0
  ) return false;
  if (daySlots.some((slot) =>
    slot.state === 1 && start < (timeToMinutes(slot.endTime) ?? 0) && end > (timeToMinutes(slot.startTime) ?? 0),
  )) return false;

  // A range is bookable only if free availability continuously covers it.
  // Checking only for occupied overlaps would incorrectly allow gaps between
  // availability windows.
  let coveredUntil = start;
  const freeSlots = daySlots
    .filter((slot) => slot.state === 0)
    .map((slot) => ({
      start: timeToMinutes(slot.startTime),
      end: timeToMinutes(slot.endTime),
    }))
    .filter((range): range is { start: number; end: number } => range.start !== null && range.end !== null)
    .sort((a, b) => a.start - b.start);

  for (const range of freeSlots) {
    if (range.start > coveredUntil) break;
    if (range.end > coveredUntil) coveredUntil = range.end;
    if (coveredUntil >= end) return true;
  }

  return false;
}
