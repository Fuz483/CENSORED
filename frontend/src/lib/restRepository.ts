import { nextDays, PEXELS_ROOM_IMAGES, toISODate } from "./data";
import { intervalHours } from "./format";
import { isRangeAvailable } from "./intervals";
import { PartialBookingError, RepositoryError, type AppRepository, type AppSnapshot, type LoginInput, type NewListingInput, type RegisterInput } from "./repository";
import type { Booking, BookingRequest, BookingState, GuardScanResult, Listing, RoomType, Slot, User } from "./types";

type ApiRoomType = "sport_hall" | "assembly_hall" | "it_lab" | "workshop" | "pool";
const roomTypes: Record<RoomType, ApiRoomType> = {
  gym: "sport_hall", hall: "assembly_hall", it: "it_lab", classroom: "workshop", pool: "pool",
};
const uiTypes: Record<ApiRoomType, RoomType> = {
  sport_hall: "gym", assembly_hall: "hall", it_lab: "it", workshop: "classroom", pool: "pool",
};
interface ApiRoom {
  school: string;
  type_room: ApiRoomType;
  room: string;
  date: string;
  price: string | number;
  capacity: number | null;
  address: string | null;
  uo?: string | null;
  owner_id?: string | null;
  available_from?: string;
  available_to?: string;
  image_url?: string;
  available_slots: { start_time: string; end_time: string; price: string | number }[];
}
interface ApiRoomListing {
  id?: number;
  school: string;
  type_room: ApiRoomType;
  room: string;
  uo?: string | null;
  owner_id?: string | null;
  address?: string | null;
  capacity?: number | null;
  price?: string | number;
  available_from?: string;
  available_to?: string;
  image_url?: string;
}
interface ApiBooking {
  id: number;
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
}
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
const TOKEN_KEY = "plyacouka-api-token-v1";
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const retryableProxyStatuses = new Set([502, 503, 504]);

function resolveImageUrl(url: string): string {
  return url.startsWith("/media/") && baseUrl ? `${baseUrl}${url}` : url;
}

async function fetchWithTransientProxyRetry(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const retrySafe = !init.method || init.method.toUpperCase() === "GET";
  const delays = retrySafe ? [250, 600, 1200] : [];

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init);
    if (!retrySafe || !retryableProxyStatuses.has(response.status) || attempt >= delays.length) {
      return response;
    }
    await response.body?.cancel();
    await new Promise((resolve) => window.setTimeout(resolve, delays[attempt]));
  }
}

export class RestRepository implements AppRepository {
  private token: string | null = this.readToken();
  private listings = new Map<string, Listing>();

  private readToken(): string | null {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  logout(): void {
    this.token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* Keep in-memory logout working. */ }
  }

  private async request<T>(path: string, method = "GET", body?: unknown, authenticated = false): Promise<T> {
    if (authenticated && !this.token) throw new RepositoryError("Войдите в аккаунт.", "401");
    let response: Response;
    try {
      response = await fetchWithTransientProxyRetry(`${baseUrl}/api/v1${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(authenticated ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new RepositoryError("Сервер недоступен. Проверьте подключение и повторите попытку.", "NETWORK");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && authenticated) this.logout();
      const detail = data?.detail;
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
    try { return this.supportedUser(await this.request<User>("/auth/me", "GET", undefined, true)); }
    catch (error) {
      if (error instanceof RepositoryError && error.code === "401") return null;
      throw error;
    }
  }

  private async authenticate(path: string, body: unknown): Promise<User> {
    const result = await this.request<{ access_token: string; user: User }>(path, "POST", body);
    const user = this.supportedUser(result.user);
    this.token = result.access_token;
    try { sessionStorage.setItem(TOKEN_KEY, this.token); } catch { /* Session remains usable in this tab. */ }
    return user;
  }

  async login(input: LoginInput): Promise<User> {
    if (input.role === "master") return this.authenticate("/auth/uo/login", { password: input.password });
    return this.authenticate("/auth/login", { phone: input.phone.trim(), password: input.password });
  }

  async register(input: RegisterInput): Promise<User> {
    return this.authenticate("/auth/register", {
      name: [input.surname, input.firstName, input.patronymic].map((part) => part.trim()).filter(Boolean).join(" "),
      phone: input.phone.trim(), password: input.password,
    });
  }

  private listing(room: ApiRoomListing, details?: ApiRoomListing): Listing {
    const key = JSON.stringify([room.school, room.type_room, room.room]);
    const existing = this.listings.get(key);
    const listing: Listing = {
      id: existing?.id ?? this.listings.size + 1,
      school: room.school, room: room.room, type: uiTypes[room.type_room],
      uo: details?.uo ?? existing?.uo ?? "",
      address: details?.address ?? existing?.address ?? "Адрес уточняется",
      capacity: details?.capacity ?? existing?.capacity ?? null,
      price: details ? Number(details.price) : existing?.price ?? 0,
      availableFrom: details?.available_from?.slice(0, 5) ?? existing?.availableFrom ?? "14:00",
      availableTo: details?.available_to?.slice(0, 5) ?? existing?.availableTo ?? "21:00",
      ownerId: details?.owner_id ?? existing?.ownerId ?? (room.school === "Лицей БГУ" ? "UO-BSU-LYCEUM-DEMO" : ""),
      image: resolveImageUrl(details?.image_url ?? existing?.image ?? PEXELS_ROOM_IMAGES[uiTypes[room.type_room]]),
    };
    this.listings.set(key, listing);
    return listing;
  }

  private booking(item: ApiBooking, user: User): Booking {
    const listing = this.listing(item);
    const startTime = item.start_time.slice(0, 5);
    const endTime = item.end_time.slice(0, 5);
    return {
      id: item.id, listing, date: item.date, startTime, endTime,
      total: Number(item.price), state: item.state, code: item.code,
      customerId: item.customer_id ?? user.id, customerName: item.customer_name ?? user.name, customerPhone: item.customer_phone ?? user.phone, source: "client",
      slots: [{ id: item.id, listingId: listing.id, date: item.date, startTime, endTime,
        price: Number(item.price), state: 1, userId: user.id }],
    };
  }

  async load(user?: User): Promise<AppSnapshot> {
    const pages = await Promise.all(nextDays().flatMap((day) => Object.values(roomTypes).map((type) => {
      const query = new URLSearchParams({ date: toISODate(day), type_room: type });
      return this.request<ApiRoom[]>(`/rooms/available?${query}`);
    })));
    const slots: Slot[] = [];
    const currentListings = new Map<number, Listing>();
    for (const room of pages.flat()) {
      const listing = this.listing(room, room);
      currentListings.set(listing.id, listing);
      for (const slot of room.available_slots) {
        if (new Date(`${room.date}T${slot.start_time}`).getTime() <= Date.now()) continue;
        slots.push({
        id: slots.length + 1, listingId: listing.id, date: room.date,
        startTime: slot.start_time.slice(0, 5), endTime: slot.end_time.slice(0, 5),
        price: Number(slot.price), state: 0, userId: null,
        });
      }
    }
    const history = user ? await this.request<ApiBooking[]>(user.role === "master" ? "/uo/bookings" : `/bookings/user/${encodeURIComponent(user.user_id)}`, "GET", undefined, true) : [];
    return { listings: [...currentListings.values()], slots, bookings: user ? history.map((item) => this.booking(item, user)) : [] };
  }

  async uploadRoomPhoto(user: User, listing: Listing, file: File): Promise<void> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к изменению фото.", "403");
    if (!this.token) throw new RepositoryError("Войдите в аккаунт.", "401");
    const form = new FormData();
    form.set("school", listing.school);
    form.set("type_room", roomTypes[listing.type]);
    form.set("room", listing.room);
    form.set("file", file);

    let response: Response;
    try {
      response = await fetchWithTransientProxyRetry(`${baseUrl}/api/v1/rooms/photo`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${this.token}` },
        body: form,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new RepositoryError("Сервер недоступен. Проверьте подключение и повторите попытку.", "NETWORK");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) this.logout();
      const detail = data?.detail;
      throw new RepositoryError(typeof detail === "string" ? detail : `Ошибка сервера (${response.status}).`, String(response.status));
    }
    if (typeof data?.image_url !== "string") throw new RepositoryError("Сервер вернул некорректный ответ.");
  }

  async bookSlots(user: User, requests: BookingRequest[]): Promise<Booking[]> {
    if (!requests.length) throw new RepositoryError("Выберите интервал для бронирования.");
    const snapshot = await this.load(user);
    const payloads = requests.map((request) => {
      const listing = snapshot.listings.find((item) => item.id === request.listingId);
      if (!listing || !isRangeAvailable(snapshot.slots, listing.id, request.date, request.startTime, request.endTime))
        throw new RepositoryError("Выбранный интервал уже занят или недоступен.");
      return { school: listing.school, type_room: roomTypes[listing.type], room: listing.room,
        date: request.date, start_time: request.startTime, hours: intervalHours(request.startTime, request.endTime), user_id: user.user_id };
    });
    const created: Booking[] = [];
    for (const payload of payloads) {
      try {
        const result = await this.request<ApiBooking[]>("/bookings", "POST", payload, true);
        created.push(...result.map((item) => this.booking(item, user)));
      } catch (error) {
        if (created.length) throw new PartialBookingError("Часть броней создана. Проверьте историю перед повторной попыткой.", created);
        throw error;
      }
    }
    return created;
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

  async cancelBooking(_user: User, id: number): Promise<void> {
    await this.request(`/bookings/${id}/state`, "PATCH", { state: "cancelled" }, true);
  }

  async updateProfile(): Promise<never> { throw new RepositoryError("Изменение профиля пока недоступно."); }
  async addListing(user: User, input: NewListingInput): Promise<Listing> {
    if (user.role !== "master") throw new RepositoryError("Нет доступа к добавлению пространства.", "403");
    if (!this.token) throw new RepositoryError("Войдите в аккаунт.", "401");
    let photo: Blob;
    try {
      photo = await (await fetch(input.image)).blob();
    } catch {
      throw new RepositoryError("Не удалось подготовить фотографию помещения.");
    }
    if (!photo.type.startsWith("image/")) throw new RepositoryError("Добавьте фотографию помещения.");

    const form = new FormData();
    form.set("school", input.school.trim());
    form.set("uo", input.uo.trim());
    form.set("type_room", roomTypes[input.type]);
    form.set("room", input.room.trim());
    form.set("address", input.address.trim());
    form.set("capacity", String(input.capacity));
    form.set("price", String(input.price));
    form.set("available_from", input.availableFrom);
    form.set("available_to", input.availableTo);
    form.set("file", new File([photo], "room-photo.jpg", { type: photo.type }));

    let response: Response;
    try {
      response = await fetchWithTransientProxyRetry(`${baseUrl}/api/v1/rooms`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${this.token}` },
        body: form,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new RepositoryError("Сервер недоступен. Проверьте подключение и повторите попытку.", "NETWORK");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) this.logout();
      const detail = data?.detail;
      throw new RepositoryError(typeof detail === "string" ? detail : `Ошибка сервера (${response.status}).`, String(response.status));
    }
    if (!data || typeof data.school !== "string" || typeof data.room !== "string" || typeof data.image_url !== "string") {
      throw new RepositoryError("Сервер вернул некорректные данные помещения.");
    }
    const apiListing: ApiRoomListing = data;
    const listing = this.listing(apiListing, apiListing);
    this.listings.set(JSON.stringify([apiListing.school, apiListing.type_room, apiListing.room]), listing);
    return listing;
  }
  async updateListing(): Promise<never> { throw new RepositoryError("Управление помещениями пока недоступно."); }
  async deleteListing(): Promise<never> { throw new RepositoryError("Управление помещениями пока недоступно."); }
  async createManualBooking(): Promise<never> { throw new RepositoryError("Ручное бронирование пока недоступно."); }
}
