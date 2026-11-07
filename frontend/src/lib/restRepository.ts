import { PEXELS_ROOM_IMAGES } from "./data";
import { canonicalCity, canonicalDistrict, cityFromAddress } from "./belarus";
import { intervalHours, minskClock, minskDate } from "./format";
import { BOOKING_STEP_MINUTES, minutesToTime, timeToMinutes } from "./intervals";
import { PartialBookingError, RepositoryError, type AppRepository, type AppSnapshot, type BookingHistoryPage, type CaptchaChallenge, type LoginInput, type NewListingInput, type RegisterInput, type UoBookingSummary, type UpdateListingInput, type UoInstitution } from "./repository";
import type { Booking, BookingRequest, BookingState, CustomerSuggestion, GuardScanResult, Listing, RentalAgreement, RoomType, Slot, User, WeeklyReservationInput } from "./types";

type ApiRoomType = "sport_hall" | "assembly_hall" | "it_lab" | "workshop" | "pool";
const roomTypes: Record<RoomType, ApiRoomType> = {
  gym: "sport_hall", hall: "assembly_hall", it: "it_lab", classroom: "workshop", pool: "pool",
};
const uiTypes: Record<ApiRoomType, RoomType> = {
  sport_hall: "gym", assembly_hall: "hall", it_lab: "it", workshop: "classroom", pool: "pool",
};
interface ApiRoom extends ApiRoomListing {
  date: string;
  available_slots: { start_time: string; end_time: string; price: string | number }[];
}
interface ApiCompactRoom extends ApiRoomListing {
  availability: { date: string; ranges: { start_time: string; end_time: string }[] }[];
}
interface ApiCompactCatalog {
  listings: ApiCompactRoom[];
}
interface ApiRoomListing {
  id: number;
  school: string;
  type_room: ApiRoomType;
  room: string;
  uo?: string | null;
  owner_id?: string | null;
  address?: string | null;
  city?: string | null;
  city_district?: string | null;
  capacity?: number | null;
  price?: string | number;
  available_from?: string;
  available_to?: string;
  image_url?: string | null;
}
interface ApiBooking {
  id: number;
  listing_id: number;
  school: string;
  type_room: ApiRoomType;
  room: string;
  date: string;
  start_time: string;
  end_time: string;
  price: string | number;
  state: BookingState;
  code: string | null;
  user_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_id?: number;
  agreement_text?: string | null;
  agreement_accepted_at?: string | null;
}
interface ApiUoBookingSummary {
  total: number;
  total_hours: number;
  total_revenue: string | number;
  listings: { listing_id: number; count: number; has_active_bookings: boolean }[];
}
interface ApiWeeklyReservation extends ApiBooking {
  series_label: string;
  weekdays: number[];
  customer_name?: string;
  ends_on?: string | null;
}
type ApiReservedVisit = Pick<ApiBooking, "listing_id" | "date" | "start_time" | "end_time"> & {
  reservation_id: number;
  series_label: string;
};
interface ApiQrScanResult {
  access_granted: boolean;
  reason: string;
  code: string;
  school: string;
  room: string;
  date: string;
  session_start: string;
  session_end: string;
  slots_count: number;
  total_price: string | number;
  user: { name: string; phone: string };
}
interface ApiUser extends Omit<User, "firstName" | "surname" | "patronymic" | "email"> {
  surname?: string | null;
  first_name?: string | null;
  patronymic?: string | null;
  email?: string | null;
}

function mapApiUser(user: ApiUser): User {
  return {
    id: user.id,
    user_id: user.user_id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    rating: user.rating,
    surname: user.surname ?? undefined,
    firstName: user.first_name ?? undefined,
    patronymic: user.patronymic ?? undefined,
    email: user.email ?? null,
  };
}
const TOKEN_KEY = "plyacouka-api-token-v1";
const BOOKING_HISTORY_PAGE_SIZE = 50;
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const retryableProxyStatuses = new Set([502, 503, 504]);

function resolveImageUrl(url: string): string {
  return url.startsWith("/media/") && baseUrl ? `${baseUrl}${url}` : url;
}

async function fetchWithTransientProxyRetry(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const retrySafe = !init.method || init.method.toUpperCase() === "GET";
  const delays = retrySafe ? [250, 600, 1200] : [];

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(input, init);
      if (!retryableProxyStatuses.has(response.status) || attempt >= delays.length) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= delays.length || init.signal?.aborted) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, delays[attempt]));
  }
}

export class RestRepository implements AppRepository {
  private token: string | null = this.readToken();
  private sessionRevision = 0;
  private listings = new Map<number, Listing>();

  private readToken(): string | null {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  hasSession(): boolean {
    return Boolean(this.token);
  }

  logout(): void {
    if (this.token) void this.request("/auth/logout", "POST", undefined, true).catch(() => {});
    this.clearSession();
  }

  private clearSession(): void {
    this.sessionRevision++;
    this.token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* Keep in-memory logout working. */ }
  }

  private async request<T>(path: string, method = "GET", body?: unknown, authenticated = false, session = this.sessionRevision): Promise<T> {
    const token = this.token;
    if (authenticated && (!token || session !== this.sessionRevision)) throw new RepositoryError("Войдите в аккаунт.", "401");
    const multipart = body instanceof FormData;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), multipart ? 30000 : 20000);
    let response: Response;
    let data: unknown;
    try {
      response = await fetchWithTransientProxyRetry(`${baseUrl}/api/v1${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined || multipart ? {} : { "Content-Type": "application/json" }),
          ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: multipart ? body : JSON.stringify(body),
        signal: controller.signal,
        keepalive: path === "/auth/logout",
      });
      if (response.status === 204) return undefined as T;
      data = await response.json().catch((error: unknown) => {
        if (controller.signal.aborted) throw error;
        return null;
      });
    } catch {
      throw new RepositoryError("Сервер недоступен. Проверьте подключение и повторите попытку.", "NETWORK");
    } finally {
      window.clearTimeout(timeout);
    }
    if (!response.ok) {
      if (response.status === 401 && authenticated && session === this.sessionRevision) this.clearSession();
      const detail = (data as { detail?: unknown } | null)?.detail;
      const message = typeof detail === "string" ? detail : Array.isArray(detail)
        ? detail.map((item: { msg?: string }) => item.msg ?? "Проверьте данные.").join(" ")
        : `Ошибка сервера (${response.status}).`;
      throw new RepositoryError(message, String(response.status));
    }
    if (data === null) throw new RepositoryError("Сервер вернул некорректный ответ.");
    return data as T;
  }

  private supportedUser(user: User): User {
    if (user.role !== "tenant" && user.role !== "master") {
      this.logout();
      throw new RepositoryError("Эта роль не поддерживается.");
    }
    return user;
  }

  async restoreSession(): Promise<User | null> {
    if (!this.token) return null;
    const session = this.sessionRevision;
    try {
      const user = await this.request<ApiUser>("/auth/me", "GET", undefined, true);
      return session === this.sessionRevision ? this.supportedUser(mapApiUser(user)) : null;
    }
    catch (error) {
      if (error instanceof RepositoryError && error.code === "401") return null;
      throw error;
    }
  }

  private async authenticate(path: string, body: unknown): Promise<User> {
    const session = ++this.sessionRevision;
    const result = await this.request<{ access_token: string; user: ApiUser }>(path, "POST", body);
    if (session !== this.sessionRevision) throw new RepositoryError("Войдите в аккаунт.", "401");
    const user = this.supportedUser(mapApiUser(result.user));
    this.token = result.access_token;
    try { sessionStorage.setItem(TOKEN_KEY, this.token); } catch { /* Session remains usable in this tab. */ }
    return user;
  }

  async login(input: LoginInput): Promise<User> {
    if (input.role === "master") return this.authenticate("/auth/uo/login", {
      password: input.password, institution_id: input.institutionId,
    });
    return this.authenticate("/auth/login", { phone: input.phone.trim(), password: input.password });
  }

  listUoInstitutions(): Promise<UoInstitution[]> {
    return this.request("/auth/uo/institutions");
  }

  exportPersonalData(): Promise<Record<string, unknown>> {
    return this.request("/privacy/export", "GET", undefined, true);
  }

  requestErasure(): Promise<{ requested_at: string }> {
    return this.request("/privacy/erasure-request", "POST", undefined, true);
  }

  async register(input: RegisterInput): Promise<User> {
    return this.authenticate("/auth/register", {
      name: [input.firstName, input.patronymic, input.surname].map((part) => part.trim()).filter(Boolean).join(" ") || "Пользователь",
      surname: input.surname.trim() || null, first_name: input.firstName.trim() || null, patronymic: input.patronymic.trim() || null,
      email: input.email.trim() || null, phone: input.phone.trim(), password: input.password,
      captcha_id: input.captchaId, captcha_answer: input.captchaAnswer,
    });
  }

  getCaptcha(): Promise<CaptchaChallenge> {
    return this.request("/auth/captcha");
  }

  private listing(room: ApiRoomListing): Listing {
    const address = room.address ?? "Адрес уточняется";
    const city = room.city ? canonicalCity(room.city) || room.city : cityFromAddress(address);
    const district = room.city_district ?? "";
    return {
      id: room.id,
      school: room.school, room: room.room, type: uiTypes[room.type_room],
      uo: room.uo ?? "",
      address, city, cityDistrict: canonicalDistrict(city, district) || district,
      capacity: room.capacity ?? null,
      price: Number(room.price ?? 0),
      availableFrom: room.available_from?.slice(0, 5) ?? "14:00",
      availableTo: room.available_to?.slice(0, 5) ?? "21:00",
      ownerId: room.owner_id ?? (room.school === "Лицей БГУ" ? "UO-BSU-LYCEUM-DEMO" : ""),
      image: resolveImageUrl(room.image_url ?? PEXELS_ROOM_IMAGES[uiTypes[room.type_room]]),
    };
  }

  private booking(item: ApiBooking, user: User, listings = this.listings): Booking {
    const current = listings.get(item.listing_id);
    const listing = current
      ? { ...current, school: item.school, room: item.room, type: uiTypes[item.type_room] }
      : this.listing({ id: item.listing_id, school: item.school, room: item.room, type_room: item.type_room });
    const startTime = item.start_time.slice(0, 5);
    const endTime = item.end_time.slice(0, 5);
    return {
      id: item.id, listing, date: item.date, startTime, endTime,
      total: Number(item.price), state: item.state, code: item.code,
      agreementText: item.agreement_text, agreementAcceptedAt: item.agreement_accepted_at,
      customerId: item.customer_id ?? user.id, customerName: item.customer_name ?? user.name, customerPhone: item.customer_phone ?? user.phone, source: "client",
      slots: [{ id: item.id, listingId: listing.id, date: item.date, startTime, endTime,
        price: Number(item.price), state: 1, userId: user.id }],
    };
  }

  private bookingsPath(user: User): string {
    return user.role === "master" ? "/uo/bookings" : `/bookings/user/${encodeURIComponent(user.user_id)}`;
  }

  private requestBookingHistory(user: User, offset: number): Promise<ApiBooking[]> {
    return this.request(
      `${this.bookingsPath(user)}?upcoming=false&offset=${offset}&limit=${BOOKING_HISTORY_PAGE_SIZE + 1}`,
      "GET", undefined, true,
    );
  }

  async loadBookingHistory(user: User, offset: number): Promise<BookingHistoryPage> {
    const rows = await this.requestBookingHistory(user, offset);
    return {
      bookings: rows.slice(0, BOOKING_HISTORY_PAGE_SIZE).map((row) => this.booking(row, user)),
      nextOffset: rows.length > BOOKING_HISTORY_PAGE_SIZE ? offset + BOOKING_HISTORY_PAGE_SIZE : null,
    };
  }

  private async requestUoBookingSummary(): Promise<UoBookingSummary | null> {
    try {
      const summary = await this.request<ApiUoBookingSummary>("/uo/bookings/summary", "GET", undefined, true);
      if (typeof summary.total !== "number" || !Array.isArray(summary.listings)) return null;
      return {
        total: summary.total, totalHours: summary.total_hours, totalRevenue: Number(summary.total_revenue),
        listings: summary.listings.map(({ listing_id, count, has_active_bookings }) => ({
          listingId: listing_id, count, hasActiveBookings: has_active_bookings,
        })),
      };
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "404") return null;
      throw error;
    }
  }

  async load(user?: User): Promise<AppSnapshot> {
    const session = this.sessionRevision;
    const startDate = minskDate();
    const isUo = user?.role === "master";
    const [rooms, upcoming, history, summary, weekly, visits] = await Promise.all([
      this.request<ApiCompactCatalog | ApiRoom[]>(`/rooms/catalog?start=${startDate}&days=7&compact=true`),
      user ? this.request<ApiBooking[]>(`${this.bookingsPath(user)}?upcoming=true`, "GET", undefined, true) : [],
      user ? this.requestBookingHistory(user, 0) : [],
      isUo ? this.requestUoBookingSummary() : null,
      isUo ? this.request<ApiWeeklyReservation[]>("/uo/weekly-reservations", "GET", undefined, true) : [],
      user?.role === "tenant" ? this.request<ApiReservedVisit[]>("/bookings/reserved-visits", "GET", undefined, true) : [],
    ]);
    const slots: Slot[] = [];
    const currentListings = new Map<number, Listing>();
    const now = minskClock();
    const addSlot = (listingId: number, date: string, startTime: string, endTime: string, price: number) => {
      if (date < now.date || (date === now.date && startTime <= now.time)) return;
      slots.push({ id: slots.length + 1, listingId, date, startTime, endTime, price, state: 0, userId: null });
    };
    if (Array.isArray(rooms)) {
      // Servers deployed before the compact catalog ignore the new query flag.
      for (const room of rooms) {
        if (!currentListings.has(room.id)) currentListings.set(room.id, this.listing(room));
        for (const slot of room.available_slots) {
          addSlot(room.id, room.date, slot.start_time.slice(0, 5), slot.end_time.slice(0, 5), Number(slot.price));
        }
      }
    } else {
      for (const room of rooms.listings) {
        const listing = this.listing(room);
        currentListings.set(listing.id, listing);
        for (const day of room.availability) {
          for (const range of day.ranges) {
            const start = timeToMinutes(range.start_time.slice(0, 5));
            const end = timeToMinutes(range.end_time.slice(0, 5));
            if (start === null || end === null) continue;
            for (let minute = start; minute + BOOKING_STEP_MINUTES <= end; minute += BOOKING_STEP_MINUTES) {
              addSlot(listing.id, day.date, minutesToTime(minute), minutesToTime(minute + BOOKING_STEP_MINUTES), listing.price / 4);
            }
          }
        }
      }
    }
    if (session === this.sessionRevision) this.listings = currentListings;
    const upcomingIds = new Set(upcoming.map(({ id }) => id));
    // Older servers can ignore the upcoming filter and return the entire history.
    const paginated = (!isUo || summary !== null) && history.length <= BOOKING_HISTORY_PAGE_SIZE + 1 &&
      history.some(({ id }) => !upcomingIds.has(id));
    const bookingRows = isUo && summary === null
      ? await this.request<ApiBooking[]>("/uo/bookings", "GET", undefined, true, session)
      : [...upcoming, ...(paginated ? history.slice(0, BOOKING_HISTORY_PAGE_SIZE) : history)];
    const bookings = new Map(bookingRows.map((booking) => [booking.id, booking]));
    return {
      listings: [...currentListings.values()], slots,
      bookings: user ? [...bookings.values()].map((item) => this.booking(item, user, currentListings)) : [],
      nextBookingHistoryOffset: paginated && history.length > BOOKING_HISTORY_PAGE_SIZE ? BOOKING_HISTORY_PAGE_SIZE : null,
      uoBookingSummary: summary,
      weeklyReservations: weekly.map((item) => ({
        id: item.id, listingId: item.listing_id, label: item.series_label, date: item.date,
        startTime: item.start_time.slice(0, 5), endTime: item.end_time.slice(0, 5),
        weekdays: item.weekdays, customerName: item.customer_name,
        endsOn: item.ends_on ?? undefined,
      })),
      reservedVisits: visits.map((item) => ({
        reservationId: item.reservation_id, listingId: item.listing_id, label: item.series_label, date: item.date,
        startTime: item.start_time.slice(0, 5), endTime: item.end_time.slice(0, 5),
      })),
    };
  }

  async uploadRoomPhoto(user: User, listing: Listing, file: File): Promise<void> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к изменению фото.", "403");
    const form = new FormData();
    form.set("listing_id", String(listing.id));
    form.set("school", listing.school);
    form.set("type_room", roomTypes[listing.type]);
    form.set("room", listing.room);
    form.set("file", file);

    const data = await this.request<{ image_url: string }>("/rooms/photo", "POST", form, true);
    if (typeof data?.image_url !== "string") throw new RepositoryError("Сервер вернул некорректный ответ.");
  }

  private bookingPayload(user: User, request: BookingRequest) {
    const listing = this.listings.get(request.listingId);
    if (!listing) throw new RepositoryError("Помещение не найдено.");
    return { listing_id: listing.id, school: listing.school, type_room: roomTypes[listing.type], room: listing.room,
      date: request.date, start_time: request.startTime, hours: intervalHours(request.startTime, request.endTime),
      user_id: user.user_id, reservation_id: request.reservationId };
  }

  async previewAgreements(user: User, requests: BookingRequest[]): Promise<RentalAgreement[]> {
    return Promise.all(requests.map((item) =>
      this.request<RentalAgreement>("/bookings/agreement", "POST", this.bookingPayload(user, item), true),
    ));
  }

  async bookSlots(user: User, requests: BookingRequest[], agreementTokens: string[]): Promise<Booking[]> {
    if (!requests.length || agreementTokens.length !== requests.length || agreementTokens.some((token) => !token)) {
      throw new RepositoryError("Откройте договор аренды и подтвердите согласие.");
    }
    const session = this.sessionRevision;
    const listings = this.listings;
    const payloads = requests.map((item, index) => ({
      ...this.bookingPayload(user, item), agreement_accepted: true, agreement_token: agreementTokens[index],
    }));
    const created: Booking[] = [];
    for (const payload of payloads) {
      try {
        const result = await this.request<ApiBooking[]>("/bookings", "POST", payload, true, session);
        created.push(...result.map((item) => this.booking(item, user, listings)));
      } catch (error) {
        if (created.length) throw new PartialBookingError("Часть броней создана. Проверьте историю перед повторной попыткой.", created);
        throw error;
      }
    }
    return created;
  }

  async createWeeklyReservation(input: WeeklyReservationInput): Promise<void> {
    await this.request("/uo/weekly-reservations", "POST", {
      listing_id: input.listingId, label: input.label, date: input.date, start_time: input.startTime,
      hours: intervalHours(input.startTime, input.endTime),
      weekdays: input.weekdays, customer_phone: input.customerPhone?.trim() || undefined,
      customer_id: input.customerId,
      ends_on: input.endsOn || undefined,
    }, true);
  }

  async linkWeeklyCustomer(id: number, phone: string, customerId?: string): Promise<void> {
    await this.request(`/uo/weekly-reservations/${id}/customer`, "PATCH", { customer_phone: phone.trim(), customer_id: customerId }, true);
  }

  searchCustomers(phone: string): Promise<CustomerSuggestion[]> {
    return this.request("/uo/customers/search", "POST", { phone }, true);
  }

  async setWeeklyEndDate(id: number, endsOn: string): Promise<void> {
    await this.request(`/uo/weekly-reservations/${id}/end-date`, "PATCH", { ends_on: endsOn }, true);
  }

  async cancelWeeklyReservation(id: number): Promise<void> {
    await this.request(`/uo/weekly-reservations/${id}/cancel`, "PATCH", undefined, true);
  }

  async scanQr(code: string): Promise<GuardScanResult> {
    const result = await this.request<ApiQrScanResult>("/guard/scan-qr", "POST", { code });
    return {
      accessGranted: result.access_granted,
      reason: result.reason,
      code: result.code,
      school: result.school,
      room: result.room,
      date: result.date,
      startTime: result.session_start.slice(0, 5),
      endTime: result.session_end.slice(0, 5),
      slotsCount: result.slots_count,
      totalPrice: Number(result.total_price),
      customerName: result.user.name,
      customerPhone: result.user.phone,
    };
  }

  async cancelBooking(user: User, id: number): Promise<void> {
    if (user.role === "master") {
      await this.request(`/uo/bookings/${id}/cancel`, "PATCH", undefined, true);
    } else {
      await this.request(`/bookings/${id}/state`, "PATCH", { state: "cancelled" }, true);
    }
  }

  async updateProfile(_user: User, input: import("./repository").ProfileInput): Promise<User> {
    const session = this.sessionRevision;
    const updated = await this.request<ApiUser>("/auth/me", "PATCH", {
      surname: input.surname.trim(), first_name: input.firstName.trim(),
      patronymic: input.patronymic.trim() || null, email: input.email.trim() || null, phone: input.phone.trim(),
    }, true);
    if (session !== this.sessionRevision) throw new RepositoryError("Войдите в аккаунт.", "401");
    return this.supportedUser(mapApiUser(updated));
  }
  async addListing(user: User, input: NewListingInput): Promise<Listing> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к добавлению пространства.", "403");
    return this.saveListing("/rooms", "POST", input);
  }

  async updateListing(user: User, listingId: number, input: UpdateListingInput): Promise<Listing> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к изменению пространства.", "403");
    return this.saveListing(`/rooms/${listingId}`, "PATCH", input);
  }

  private async saveListing(path: string, method: "POST" | "PATCH", input: UpdateListingInput): Promise<Listing> {
    if (!this.token) throw new RepositoryError("Войдите в аккаунт.", "401");
    const session = this.sessionRevision;
    const form = new FormData();
    const fields = {
      school: input.school, uo: input.uo, type_room: input.type === undefined ? undefined : roomTypes[input.type],
      room: input.room, address: input.address, city: input.city, city_district: input.cityDistrict,
      capacity: input.capacity, price: input.price, available_from: input.availableFrom, available_to: input.availableTo,
    };
    for (const [name, value] of Object.entries(fields)) {
      if (value !== undefined) form.set(name, String(value ?? "").trim());
    }
    if (input.image !== undefined) {
      let photo: Blob;
      try {
        photo = await (await fetch(input.image)).blob();
      } catch {
        throw new RepositoryError("Не удалось подготовить фотографию помещения.");
      }
      if (!photo.type.startsWith("image/")) throw new RepositoryError("Добавьте фотографию помещения.");
      form.set("file", photo, "room-photo.jpg");
    }
    const data = await this.request<ApiRoomListing>(path, method, form, true, session);
    if (!data || typeof data.id !== "number" || typeof data.school !== "string" || typeof data.room !== "string") {
      throw new RepositoryError("Сервер вернул некорректные данные помещения.");
    }
    const listing = this.listing(data);
    if (session === this.sessionRevision) this.listings.set(listing.id, listing);
    return listing;
  }

  async deleteListing(user: User, listingId: number): Promise<void> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к удалению пространства.", "403");
    const session = this.sessionRevision;
    await this.request<void>(`/rooms/${listingId}`, "DELETE", undefined, true);
    if (session === this.sessionRevision) this.listings.delete(listingId);
  }

  async createManualBooking(): Promise<never> { throw new RepositoryError("Ручное бронирование пока недоступно."); }
}
