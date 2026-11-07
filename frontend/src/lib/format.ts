const MONTHS_SHORT_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

const MONTHS_SHORT_BE = ["студз", "лют", "сак", "крас", "трав", "чэрв", "ліп", "жнів", "вер", "каст", "ліст", "снеж"];
const MONTHS_LONG_RU = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_LONG_BE = ["студзеня", "лютага", "сакавіка", "красавіка", "мая", "чэрвеня", "ліпеня", "жніўня", "верасня", "кастрычніка", "лістапада", "снежня"];
const WEEKDAYS_SHORT_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const WEEKDAYS_SHORT_BE = ["нд", "пн", "аў", "ср", "чц", "пт", "сб"];

const WEEKDAYS_FULL = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];
const WEEKDAYS_FULL_BE = ["нядзелю", "панядзелак", "аўторак", "сераду", "чацвер", "пятніцу", "суботу"];
type FormatLanguage = "ru" | "be";

export const MINSK_TIME_ZONE = "Europe/Minsk";
const minskClockFormatter = new Intl.DateTimeFormat("en", {
  timeZone: MINSK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function minskClock(instant = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(minskClockFormatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function minskDate(instant = new Date()): string {
  return minskClock(instant).date;
}

export function addCalendarDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayIndex(iso: string): number {
  return new Date(iso).getUTCDay();
}

export function dayNumber(iso: string): number {
  return new Date(iso).getUTCDate();
}

export function weekdayShort(iso: string, language: FormatLanguage = "ru"): string {
  return (language === "be" ? WEEKDAYS_SHORT_BE : WEEKDAYS_SHORT_RU)[weekdayIndex(iso)];
}

export function weekdayFull(iso: string, language: FormatLanguage = "ru"): string {
  return (language === "be" ? WEEKDAYS_FULL_BE : WEEKDAYS_FULL)[weekdayIndex(iso)];
}

export function monthShort(iso: string, language: FormatLanguage = "ru"): string {
  return (language === "be" ? MONTHS_SHORT_BE : MONTHS_SHORT_RU)[new Date(iso).getUTCMonth()];
}

export function monthLong(iso: string, language: FormatLanguage = "ru"): string {
  return (language === "be" ? MONTHS_LONG_BE : MONTHS_LONG_RU)[new Date(iso).getUTCMonth()];
}

export function dayLabel(iso: string, index: number, language: FormatLanguage = "ru"): string {
  if (index === 0) return language === "be" ? "Сёння" : "Сегодня";
  if (index === 1) return language === "be" ? "Заўтра" : "Завтра";
  return `${weekdayShort(iso, language)}, ${dayNumber(iso)} ${monthShort(iso, language)}`;
}

export function longDate(iso: string, language: FormatLanguage = "ru"): string {
  return `${weekdayFull(iso, language)}, ${dayNumber(iso)} ${monthLong(iso, language)}`;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function slotRange(startTime: string, hours = 1): string {
  const start = Number(startTime.slice(0, 2));
  const end = start + hours;
  return `${String(start).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00`;
}

export function intervalMinutes(startTime: string, endTime: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return Math.max(0, toMinutes(endTime) - toMinutes(startTime));
}

export function intervalHours(startTime: string, endTime: string): number {
  return intervalMinutes(startTime, endTime) / 60;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;
}

export function intervalPrice(hourlyPrice: number, startTime: string, endTime: string): number {
  return roundMoney(hourlyPrice * intervalMinutes(startTime, endTime) / 60);
}

export function intervalLabel(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}

export function minskBookingTime(date: string, time: string): number {
  // Use UTC as a reference to find the Minsk offset for the booking day.
  const reference = Date.parse(`${date}T${time.slice(0, 5)}:00Z`);
  if (!Number.isFinite(reference)) return reference;
  const local = minskClock(new Date(reference));
  const offset = Date.parse(`${local.date}T${local.time}:00Z`) - reference;
  return reference - offset;
}

export function money(value: number): string {
  return `${roundMoney(value).toFixed(2)} BYN`;
}

export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function hoursPhrase(count: number, language: FormatLanguage = "ru"): string {
  return language === "be"
    ? `${count} ${count % 10 === 1 && count % 100 !== 11 ? "гадзіна" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? "гадзіны" : "гадзін"}`
    : `${count} ${plural(count, ["час", "часа", "часов"])}`;
}

export function durationLabel(hours: number, language: FormatLanguage = "ru"): string {
  const value = Number.isInteger(hours) ? String(hours) : hours.toLocaleString(language === "be" ? "be-BY" : "ru-RU", { maximumFractionDigits: 2 });
  return language === "be" ? `${value} гадз.` : `${value} ч`;
}

export function freeHoursWord(count: number, language: FormatLanguage = "ru"): string {
  if (language === "be") return count % 10 === 1 && count % 100 !== 11 ? "вольная гадзіна" : "вольных гадзін";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "свободный час";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "свободных часа";
  return "свободных часов";
}
