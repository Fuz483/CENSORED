import { authenticate, authenticateLocalAccount, hasLocalAccount, registerLocalAccount, updateLocalProfile } from "./auth";
import { LISTINGS, addDays, buildSlots, toISODate } from "./data";
import {
  RepositoryError,
  type AppRepository,
  type AppSnapshot,
  type LoginInput,
  type ManualBookingInput,
  type NewListingInput,
  type ProfileInput,
  type RegisterInput,
} from "./repository";
import type { Booking, GuardScanResult, Listing, Slot, User } from "./types";
import { intervalPrice } from "./format";
import { isRangeAvailable, isValidAvailabilityWindow } from "./intervals";

interface DemoBookingSpec {
  listingId: number;
  dayOffset: number;
  startTime: string;
  hours: number;
  customerName: string;
  customerPhone: string;
  note: string;
  customerId: number;
}

const DEMO_UO_BOOKINGS: DemoBookingSpec[] = [
  {
    listingId: 1,
    dayOffset: 1,
    startTime: "18:00",
    hours: 2,
    customerName: "Волейбольный клуб «Планета»",
    customerPhone: "+375 (29) 411-27-63",
    note: "Тренировка, 16 человек. Нужны кольца и разметка.",
    customerId: 741,
  },
  {
    listingId: 15,
    dayOffset: 2,
    startTime: "16:00",
    hours: 1,
    customerName: "Акваклуб «Дельфин»",
    customerPhone: "+375 (33) 208-54-19",
    note: "Две дорожки, 12 детей и тренер.",
    customerId: 742,
  },
  {
    listingId: 26,
    dayOffset: 3,
    startTime: "17:00",
    hours: 2,
    customerName: "Кружок робототехники",
    customerPhone: "+375 (29) 774-02-11",
    note: "Нужен проектор и стабильный интернет.",
    customerId: 743,
  },
];

function nextBookingNumber(bookings: Booking[]): number {
  return bookings.reduce((max, booking) => Math.max(max, booking.id), 1200) + 1;
}

function buildDemoSnapshot(): AppSnapshot {
  let slots = buildSlots(LISTINGS);
  const bookings: Booking[] = [];

  for (const [index, spec] of DEMO_UO_BOOKINGS.entries()) {
    const listing = LISTINGS.find((item) => item.id === spec.listingId);
    if (!listing) continue;

    const date = toISODate(addDays(new Date(), spec.dayOffset));
    const startHour = Number(spec.startTime.slice(0, 2));
    const endTime = `${String(startHour + spec.hours).padStart(2, "0")}:00`;
    const chosen = slots
      .filter(
        (slot) =>
          slot.listingId === listing.id &&
          slot.date === date &&
          Number(slot.startTime.slice(0, 2)) >= startHour &&
          Number(slot.startTime.slice(0, 2)) < startHour + spec.hours,
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (chosen.length !== spec.hours * 4) continue;

    const bookingMarker: Slot = {
      id: slots.reduce((max, slot) => Math.max(max, slot.id), 0) + 1,
      listingId: listing.id, date, startTime: spec.startTime, endTime,
      price: listing.price * spec.hours, state: 1, userId: spec.customerId,
    };

    slots = slots.map((slot) =>
      chosen.some((item) => item.id === slot.id)
        ? { ...slot, state: 1, userId: spec.customerId }
        : slot,
    );
    slots.push(bookingMarker);
    bookings.push({
      id: 1201 + index,
      listing,
      date,
      startTime: spec.startTime,
      endTime,
      slots: [bookingMarker],
      total: bookingMarker.price,
      state: "confirmed",
      code: crypto.randomUUID(),
      customerId: spec.customerId,
      customerName: spec.customerName,
      customerPhone: spec.customerPhone,
      source: "client",
      note: spec.note,
    });
  }

  return { listings: [...LISTINGS], slots, bookings };
}

export class DemoRepository implements AppRepository {
  private snapshot = buildDemoSnapshot();

  async uploadRoomPhoto(_user: User, _listing: Listing, _file: File): Promise<void> {
    throw new RepositoryError("Загрузка фото доступна только при подключении к серверу.");
  }

  async load(_user?: User): Promise<AppSnapshot> {
    return structuredClone(this.snapshot);
  }

  async login(input: LoginInput): Promise<User> {
    if (input.role === "tenant" && hasLocalAccount(input.phone)) {
      const user = await authenticateLocalAccount(input.phone, input.password);
      if (user) return user;
      throw new RepositoryError("Неверный телефон или пароль.", "INVALID_CREDENTIALS");
    }
    const result = authenticate(input.role, input.phone, input.password);
    if (result.error) throw new RepositoryError(result.error, "INVALID_CREDENTIALS");
    if (!result.user) throw new RepositoryError("Не удалось войти. Проверьте данные.", "INVALID_CREDENTIALS");
    return result.user;
  }

  async register(input: RegisterInput): Promise<User> {
    try {
      return await registerLocalAccount(input);
    } catch (error) {
      throw new RepositoryError(error instanceof Error ? error.message : "Не удалось создать аккаунт.", "REGISTRATION_FAILED");
    }
  }

  async updateProfile(user: User, input: ProfileInput): Promise<User> {
    try {
      return updateLocalProfile(user, input);
    } catch (error) {
      throw new RepositoryError(error instanceof Error ? error.message : "Не удалось сохранить профиль.", "PROFILE_UPDATE_FAILED");
    }
  }

  async bookSlots(user: User, requests: import("./types").BookingRequest[]): Promise<Booking[]> {
    if (user.role !== "tenant") throw new RepositoryError("Нет доступа к бронированию.");
    if (!requests.length) throw new RepositoryError("Выберите интервал для бронирования.");

    let nextId = nextBookingNumber(this.snapshot.bookings);
    const markers: Slot[] = [];
    const created = requests.map((request) => {
      const listing = this.snapshot.listings.find((item) => item.id === request.listingId);
      if (!listing) throw new RepositoryError("Пространство не найдено.");
      if (!isRangeAvailable([...this.snapshot.slots, ...markers], listing.id, request.date, request.startTime, request.endTime))
        throw new RepositoryError("Выбранный интервал уже занят или недоступен.", "SLOT_UNAVAILABLE");
      const marker: Slot = {
        id: this.snapshot.slots.reduce((max, slot) => Math.max(max, slot.id), 0) + markers.length + 1,
        listingId: listing.id, date: request.date, startTime: request.startTime, endTime: request.endTime,
        price: intervalPrice(listing.price, request.startTime, request.endTime), state: 1, userId: user.id,
      };
      markers.push(marker);
      const booking: Booking = {
        id: nextId++, listing, date: request.date, startTime: request.startTime, endTime: request.endTime,
        slots: [marker], total: marker.price,
        state: "confirmed", code: crypto.randomUUID(),
        customerId: user.id, customerName: user.name, customerPhone: user.phone, source: "client",
      };
      return booking;
    });

    this.snapshot.slots = [
      ...this.snapshot.slots.map((slot) => {
        const request = requests.find((item) =>
          item.listingId === slot.listingId && item.date === slot.date && slot.state === 0 &&
          item.startTime < slot.endTime && item.endTime > slot.startTime,
        );
        return request ? { ...slot, state: 1 as const, userId: user.id } : slot;
      }),
      ...markers,
    ];
    this.snapshot.bookings = [...created, ...this.snapshot.bookings];
    return created;
  }

  async cancelBooking(user: User, bookingId: number): Promise<void> {
    if (user.role !== "tenant") throw new RepositoryError("Нет доступа к отмене бронирования.");
    const booking = this.snapshot.bookings.find(
      (item) => item.id === bookingId && item.customerId === user.id && item.source === "client",
    );
    if (!booking) throw new RepositoryError("Бронирование не найдено или недоступно.");

    const startsAt = new Date(`${booking.date}T${booking.startTime}:00`);
    if (startsAt.getTime() - Date.now() < 2 * 60 * 60 * 1000) {
      throw new RepositoryError("Отменить бронирование можно не позднее чем за 2 часа до начала.", "CANCELLATION_CUTOFF");
    }

    const bookingSlotIds = new Set(booking.slots.map((slot) => slot.id));
    this.snapshot.slots = this.snapshot.slots
      .filter((slot) => !bookingSlotIds.has(slot.id))
      .map((slot) => slot.listingId === booking.listing.id && slot.date === booking.date &&
        slot.userId === user.id && slot.startTime < booking.endTime && slot.endTime > booking.startTime
        ? { ...slot, state: 0 as const, userId: null }
        : slot);
    this.snapshot.bookings = this.snapshot.bookings.filter((item) => item.id !== bookingId);
  }

  async scanQr(code: string): Promise<GuardScanResult> {
    const booking = this.snapshot.bookings.find((item) => item.code === code);
    if (!booking) throw new RepositoryError("QR-пропуск не зарегистрирован.", "404");
    const accessGranted = booking.state === "confirmed" && booking.date === toISODate(new Date());
    return {
      accessGranted,
      reason: accessGranted ? "Допуск разрешен: бесплатная бронь подтверждена и действует сегодня." : "Допуск запрещен: бронь не подтверждена или действует не сегодня.",
      code,
      school: booking.listing.school,
      room: booking.listing.room,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      slotsCount: booking.slots.length,
      totalPrice: booking.total,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
    };
  }

  async addListing(user: User, input: NewListingInput): Promise<Listing> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к добавлению пространства.");
    if (
      !input.image || !input.room.trim() || !input.school.trim() || !input.address.trim() ||
      !Number.isFinite(input.price) || input.price <= 0 ||
      !Number.isFinite(input.capacity) || input.capacity <= 0 ||
      !isValidAvailabilityWindow(input.availableFrom, input.availableTo)
    ) throw new RepositoryError("Проверьте данные пространства и добавьте фотографию.");

    const listing: Listing = {
      id: this.snapshot.listings.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      school: input.school.trim(), uo: input.uo, address: input.address.trim(),
      type: input.type, room: input.room.trim(),
      capacity: input.capacity, price: input.price, image: input.image,
      availableFrom: input.availableFrom, availableTo: input.availableTo, ownerId: user.user_id,
    };
    const nextSlotId = this.snapshot.slots.reduce((max, slot) => Math.max(max, slot.id), 0) + 1;
    this.snapshot.listings = [...this.snapshot.listings, listing];
    this.snapshot.slots = [...this.snapshot.slots, ...buildSlots([listing], nextSlotId)];
    return listing;
  }

  async updateListing(user: User, listingId: number, input: NewListingInput): Promise<Listing> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к изменению пространства.");
    const existing = this.snapshot.listings.find(
      (item) => item.id === listingId && item.ownerId === user.user_id,
    );
    if (!existing) throw new RepositoryError("Пространство не найдено или недоступно.");
    const today = new Date().toISOString().slice(0, 10);
    if (this.snapshot.bookings.some((booking) => booking.listing.id === listingId && booking.date >= today)) {
      throw new RepositoryError("Нельзя изменить пространство: у него есть занятые часы.", "LISTING_BOOKED");
    }
    if (
      !input.image || !input.room.trim() || !input.school.trim() || !input.address.trim() ||
      !Number.isFinite(input.price) || input.price <= 0 ||
      !Number.isFinite(input.capacity) || input.capacity <= 0 ||
      !isValidAvailabilityWindow(input.availableFrom, input.availableTo)
    ) throw new RepositoryError("Проверьте данные пространства и добавьте фотографию.");

    const updated: Listing = {
      ...existing, school: input.school.trim(), uo: input.uo, address: input.address.trim(),
      type: input.type, room: input.room.trim(), capacity: input.capacity,
      price: input.price, image: input.image,
      availableFrom: input.availableFrom, availableTo: input.availableTo,
    };
    this.snapshot.listings = this.snapshot.listings.map((item) => item.id === listingId ? updated : item);
    const nextSlotId = this.snapshot.slots.reduce((max, slot) => Math.max(max, slot.id), 0) + 1;
    this.snapshot.slots = [
      ...this.snapshot.slots.filter((slot) => slot.listingId !== listingId),
      ...buildSlots([updated], nextSlotId),
    ];
    return updated;
  }

  async deleteListing(user: User, listingId: number): Promise<void> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к удалению пространства.");
    const existing = this.snapshot.listings.find(
      (item) => item.id === listingId && item.ownerId === user.user_id,
    );
    if (!existing) throw new RepositoryError("Пространство не найдено или недоступно.");
    const today = new Date().toISOString().slice(0, 10);
    if (this.snapshot.bookings.some((booking) => booking.listing.id === listingId && booking.date >= today)) {
      throw new RepositoryError("Нельзя удалить пространство: у него есть занятые часы.", "LISTING_BOOKED");
    }
    this.snapshot.listings = this.snapshot.listings.filter((item) => item.id !== listingId);
    this.snapshot.slots = this.snapshot.slots.filter((slot) => slot.listingId !== listingId);
  }

  async createManualBooking(user: User, input: ManualBookingInput): Promise<Booking> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к созданию брони.");
    const listing = this.snapshot.listings.find(
      (item) => item.id === input.listingId && item.ownerId === user.user_id,
    );
    if (!listing) throw new RepositoryError("Пространство не найдено или недоступно.");
    if (!isRangeAvailable(this.snapshot.slots, listing.id, input.date, input.startTime, input.endTime))
      throw new RepositoryError("Выбранный интервал уже занят или недоступен.", "SLOT_UNAVAILABLE");
    const customerName = input.customerName.trim();
    const customerPhone = input.customerPhone.trim();
    if (!customerName || customerPhone.replace(/\D/g, "").length < 9) {
      throw new RepositoryError("Проверьте имя и телефон клиента.");
    }

    const marker: Slot = {
      id: this.snapshot.slots.reduce((max, slot) => Math.max(max, slot.id), 0) + 1,
      listingId: listing.id, date: input.date, startTime: input.startTime, endTime: input.endTime,
      price: intervalPrice(listing.price, input.startTime, input.endTime), state: 1, userId: user.id,
    };
    const booking: Booking = {
      id: nextBookingNumber(this.snapshot.bookings), listing, date: input.date,
      startTime: input.startTime, endTime: input.endTime, slots: [marker],
      total: marker.price,
      customerId: null, customerName, customerPhone, source: "uo", note: input.note?.trim() || undefined,
    };
    this.snapshot.slots = [
      ...this.snapshot.slots.map((slot) =>
        slot.listingId === listing.id && slot.date === input.date && slot.state === 0 &&
        input.startTime < slot.endTime && input.endTime > slot.startTime
          ? { ...slot, state: 1 as const, userId: user.id }
          : slot,
      ),
      marker,
    ];
    this.snapshot.bookings = [booking, ...this.snapshot.bookings];
    return booking;
  }
}
