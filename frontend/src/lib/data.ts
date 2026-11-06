import type { Listing, RoomType, Slot } from "./types";
import { BOOKING_STEP_MINUTES, timeToMinutes } from "./intervals";

export const HOURS = [14, 15, 16, 17, 18, 19, 20];
export const DAYS_AHEAD = 7;

export const ROOM_TYPES: Record<
  RoomType,
  { label: string; short: string; capacity: number; price: number }
> = {
  gym: { label: "Спортзал", short: "Спортзал", capacity: 60, price: 30 },
  pool: { label: "Бассейн", short: "Бассейн", capacity: 24, price: 45 },
  hall: { label: "Актовый зал", short: "Актовый зал", capacity: 120, price: 26 },
  it: { label: "Класс информатики", short: "Информатика", capacity: 18, price: 18 },
  classroom: { label: "Мастерская", short: "Мастерская", capacity: 30, price: 12 },
};

export const ROOM_TYPE_LIST: RoomType[] = ["gym", "pool", "hall", "it", "classroom"];

export const PEXELS_ROOM_IMAGES: Record<RoomType, string> = {
  gym: "https://images.pexels.com/photos/7201151/pexels-photo-7201151.jpeg?auto=compress&cs=tinysrgb&w=1200",
  hall: "https://images.pexels.com/photos/5506053/pexels-photo-5506053.jpeg?auto=compress&cs=tinysrgb&w=1200",
  it: "https://images.pexels.com/photos/18471531/pexels-photo-18471531.jpeg?auto=compress&cs=tinysrgb&w=1200",
  classroom: "https://images.pexels.com/photos/36388551/pexels-photo-36388551.jpeg?auto=compress&cs=tinysrgb&w=1200",
  pool: "https://images.pexels.com/photos/7430320/pexels-photo-7430320.jpeg?auto=compress&cs=tinysrgb&w=1200",
};

const roomImage = (type: RoomType) => PEXELS_ROOM_IMAGES[type];

export const UO_LIST = [
  "УО Заводского района",
  "УО Ленинского района",
  "УО Московского района",
  "УО Октябрьского района",
  "УО Партизанского района",
  "УО Первомайского района",
  "УО Советского района",
  "УО Фрунзенского района",
  "УО Центрального района",
];

/** The account behind the demo UO login. All three «СШ № 24» spaces belong to it. */
export const DEMO_UO_ID = "uo-demo";
export const DEMO_UO_SCHOOL = "СШ № 24";
export const DEMO_UO_DISTRICT = "УО Заводского района";

type Seed = {
  school: string;
  uo: string;
  address: string;
  type: RoomType;
  room: string;
  image: string;
};

const SEEDS: Seed[] = [
  {
    school: "СШ № 24",
    uo: "УО Заводского района",
    address: "Адрес уточняется",
    type: "gym",
    room: "Большой зал",
    image: roomImage("gym"),
  },
  {
    school: "Гимназия № 7",
    uo: "УО Ленинского района",
    address: "Адрес уточняется",
    type: "hall",
    room: "Актовый зал",
    image: roomImage("hall"),
  },
  {
    school: "СШ № 61",
    uo: "УО Московского района",
    address: "Адрес уточняется",
    type: "gym",
    room: "Зал 1",
    image: roomImage("gym"),
  },
  {
    school: "СШ № 3",
    uo: "УО Октябрьского района",
    address: "Адрес уточняется",
    type: "pool",
    room: "Бассейн 25 м",
    image: roomImage("pool"),
  },
  {
    school: "Гимназия № 12",
    uo: "УО Партизанского района",
    address: "Адрес уточняется",
    type: "hall",
    room: "Актовый зал",
    image: roomImage("hall"),
  },
  {
    school: "СШ № 88",
    uo: "УО Первомайского района",
    address: "Адрес уточняется",
    type: "it",
    room: "Кабинет 301",
    image: roomImage("it"),
  },
  {
    school: "СШ № 45",
    uo: "УО Советского района",
    address: "Адрес уточняется",
    type: "gym",
    room: "Большой зал",
    image: roomImage("gym"),
  },
  {
    school: "СШ № 19",
    uo: "УО Фрунзенского района",
    address: "Адрес уточняется",
    type: "pool",
    room: "Бассейн 25 м",
    image: roomImage("pool"),
  },
  {
    school: "Гимназия № 4",
    uo: "УО Центрального района",
    address: "Адрес уточняется",
    type: "hall",
    room: "Актовый зал",
    image: roomImage("hall"),
  },
  {
    school: "СШ № 102",
    uo: "УО Заводского района",
    address: "Адрес уточняется",
    type: "gym",
    room: "Зал 2",
    image: roomImage("gym"),
  },
  {
    school: "СШ № 33",
    uo: "УО Московского района",
    address: "Адрес уточняется",
    type: "classroom",
    room: "Кабинет 17",
    image: roomImage("classroom"),
  },
  {
    school: "СШ № 56",
    uo: "УО Октябрьского района",
    address: "Адрес уточняется",
    type: "gym",
    room: "Зал 1",
    image: roomImage("gym"),
  },
  {
    school: "Гимназия № 9",
    uo: "УО Первомайского района",
    address: "Адрес уточняется",
    type: "hall",
    room: "Актовый зал",
    image: roomImage("hall"),
  },
  {
    school: "СШ № 71",
    uo: "УО Фрунзенского района",
    address: "Адрес уточняется",
    type: "classroom",
    room: "Кабинет 31",
    image: roomImage("classroom"),
  },
  {
    school: "СШ № 24",
    uo: "УО Заводского района",
    address: "Адрес уточняется",
    type: "pool",
    room: "Бассейн 25 м",
    image: roomImage("pool"),
  },
  {
    school: "Гимназия № 7",
    uo: "УО Ленинского района",
    address: "Адрес уточняется",
    type: "classroom",
    room: "Кабинет 12",
    image: roomImage("classroom"),
  },
  {
    school: "СШ № 61",
    uo: "УО Московского района",
    address: "Адрес уточняется",
    type: "it",
    room: "Кабинет 15",
    image: roomImage("it"),
  },
  {
    school: "СШ № 3",
    uo: "УО Октябрьского района",
    address: "Адрес уточняется",
    type: "classroom",
    room: "Кабинет 8",
    image: roomImage("classroom"),
  },
  {
    school: "Гимназия № 12",
    uo: "УО Партизанского района",
    address: "Адрес уточняется",
    type: "gym",
    room: "Малый зал",
    image: roomImage("gym"),
  },
  {
    school: "СШ № 88",
    uo: "УО Первомайского района",
    address: "Адрес уточняется",
    type: "classroom",
    room: "Кабинет 22",
    image: roomImage("classroom"),
  },
  {
    school: "СШ № 45",
    uo: "УО Советского района",
    address: "Адрес уточняется",
    type: "hall",
    room: "Актовый зал",
    image: roomImage("hall"),
  },
  {
    school: "СШ № 19",
    uo: "УО Фрунзенского района",
    address: "Адрес уточняется",
    type: "it",
    room: "Кабинет 108",
    image: roomImage("it"),
  },
  {
    school: "Гимназия № 4",
    uo: "УО Центрального района",
    address: "Адрес уточняется",
    type: "classroom",
    room: "Кабинет 5",
    image: roomImage("classroom"),
  },
  {
    school: "СШ № 33",
    uo: "УО Московского района",
    address: "Адрес уточняется",
    type: "it",
    room: "Кабинет 210",
    image: roomImage("it"),
  },
  {
    school: "СШ № 71",
    uo: "УО Фрунзенского района",
    address: "Адрес уточняется",
    type: "pool",
    room: "Бассейн 16 м",
    image: roomImage("pool"),
  },
  {
    school: "СШ № 24",
    uo: "УО Заводского района",
    address: "Адрес уточняется",
    type: "it",
    room: "Кабинет 204",
    image: roomImage("it"),
  },
];

export const LISTINGS: Listing[] = SEEDS.map((seed, index) => ({
  id: index + 1,
  ...seed,
  capacity: ROOM_TYPES[seed.type].capacity,
  price: ROOM_TYPES[seed.type].price,
  availableFrom: "14:00",
  availableTo: "21:00",
  ownerId:
    seed.school === DEMO_UO_SCHOOL ? DEMO_UO_ID : `school-${seed.school.replace(/\D/g, "")}-${index + 1}`,
}));

/** Photography used in the login contact sheet. */
export const SPACE_SHOWCASE: {
  type: RoomType;
  title: string;
  note: string;
  image: string;
}[] = [
  {
    type: "gym",
    title: "Спортзал",
    note: "Разметка, кольца и снаряды. До 60 человек.",
    image: roomImage("gym"),
  },
  {
    type: "pool",
    title: "Бассейн",
    note: "Дорожки 16–25 метров, раздевалки и душ.",
    image: roomImage("pool"),
  },
  {
    type: "hall",
    title: "Актовый зал",
    note: "Сцена, звук и свет для репетиций и показов.",
    image: roomImage("hall"),
  },
  {
    type: "it",
    title: "Класс информатики",
    note: "Компьютеры, проектор и интернет для группы.",
    image: roomImage("it"),
  },
  {
    type: "classroom",
    title: "Учебный класс",
    note: "Столы, доска и тишина для занятий.",
    image: roomImage("classroom"),
  },
];

/* ---------- deterministic demo occupancy ---------- */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function nextDays(count = DAYS_AHEAD): Date[] {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

/**
 * Builds the demo `booking_table` in 15-minute steps, within each listing's daily window.
 * `startId` keeps ids unique when a new UO space is appended to the state.
 */
export function buildSlots(listings: Listing[], startId = 1): Slot[] {
  const slots: Slot[] = [];
  let nextSlotId = startId;
  for (const listing of listings) {
    for (const day of nextDays()) {
      const date = toISODate(day);
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      const busyChance = weekend ? 0.58 : 0.32;
      const opening = timeToMinutes(listing.availableFrom) ?? 14 * 60;
      const closing = timeToMinutes(listing.availableTo) ?? 21 * 60;
      for (let minute = 14 * 60; minute < 21 * 60; minute += BOOKING_STEP_MINUTES) {
        if (minute < opening || minute + BOOKING_STEP_MINUTES > closing) continue;
        const hour = Math.floor(minute / 60);
        const rng = mulberry32(hash(`${listing.id}:${date}:${hour}`));
        const busy = rng() < busyChance;
        slots.push({
          id: nextSlotId++,
          listingId: listing.id,
          date,
          startTime: formatTime(minute),
          endTime: formatTime(minute + BOOKING_STEP_MINUTES),
          price: listing.price,
          state: busy ? 1 : 0,
          userId: busy ? 900 + listing.id : null,
        });
      }
    }
  }
  return slots;
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
