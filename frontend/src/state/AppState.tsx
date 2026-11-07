// @refresh reset
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { RestRepository } from "../lib/restRepository";
import { PartialBookingError, RepositoryError, errorMessage, type AppRepository, type CaptchaChallenge, type LoginInput, type ManualBookingInput, type NewListingInput, type ProfileInput, type RegisterInput } from "../lib/repository";
import type { Booking, BookingRequest, GuardScanResult, Listing, RentalAgreement, Slot, User, WeeklyReservation } from "../lib/types";
import { timeToMinutes } from "../lib/intervals";

interface AppContextValue {
  user: User | null;
  listings: Listing[];
  slots: Slot[];
  bookings: Booking[];
  weeklyReservations: WeeklyReservation[];
  ready: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  login: (input: LoginInput) => Promise<string | null>;
  register: (input: RegisterInput) => Promise<string | null>;
  getCaptcha: () => Promise<CaptchaChallenge>;
  updateProfile: (input: ProfileInput) => Promise<string | null>;
  logout: () => void;
  previewAgreements: (requests: BookingRequest[]) => Promise<RentalAgreement[]>;
  bookSlots: (requests: BookingRequest[], tokens: string[]) => Promise<Booking[]>;
  createWeeklyReservation: (input: Omit<WeeklyReservation, "id">) => Promise<void>;
  cancelWeeklyReservation: (id: number) => Promise<void>;
  scanQr: (code: string) => Promise<GuardScanResult>;
  cancelBooking: (bookingId: number) => Promise<void>;
  addListing: (input: NewListingInput) => Promise<Listing>;
  updateListing: (listingId: number, input: NewListingInput) => Promise<Listing>;
  deleteListing: (listingId: number) => Promise<void>;
  uploadRoomPhoto: (listing: Listing, file: File) => Promise<void>;
  createManualBooking: (input: ManualBookingInput) => Promise<Booking>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: AppRepository;
}) {
  const [repo] = useState(() => repository ?? new RestRepository());
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [weeklyReservations, setWeeklyReservations] = useState<WeeklyReservation[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async (forUser?: User) => {
    const snapshot = await repo.load(forUser);
    setListings(snapshot.listings);
    setSlots(snapshot.slots);
    setBookings(snapshot.bookings);
    setWeeklyReservations(snapshot.weeklyReservations ?? []);
    setLoadError(null);
  }, [repo]);

  useEffect(() => {
    let active = true;
    (async () => {
      const initialUser = await repo.restoreSession?.() ?? null;
      if (!active) return null;
      setUser(initialUser);
      return repo.load(initialUser ?? undefined);
    })().then((snapshot) => {
      if (!active || !snapshot) return;
      setListings(snapshot.listings);
      setSlots(snapshot.slots);
      setBookings(snapshot.bookings);
      setWeeklyReservations(snapshot.weeklyReservations ?? []);
      setReady(true);
    }).catch((error) => {
      if (active) {
        setLoadError(errorMessage(error, "Не удалось загрузить данные."));
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [repo]);

  const reload = useCallback(async () => {
    try {
      const restored = user ?? await repo.restoreSession?.() ?? null;
      setUser(restored);
      await refresh(restored ?? undefined);
    }
    catch (error) { setLoadError(errorMessage(error, "Не удалось загрузить данные.")); }
  }, [refresh, repo, user]);

  const refreshAfterMutation = useCallback(async (forUser: User) => {
    try { await refresh(forUser); }
    catch (error) { setLoadError(errorMessage(error, "Не удалось обновить данные.")); }
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    try {
      const nextUser = await repo.login(input);
      setUser(nextUser);
      await refreshAfterMutation(nextUser);
      return null;
    } catch (error) {
      return error instanceof RepositoryError ? error.message : "Не удалось войти. Попробуйте ещё раз.";
    }
  }, [refreshAfterMutation, repo]);

  const register = useCallback(async (input: RegisterInput) => {
    try {
      const nextUser = await repo.register(input);
      setUser(nextUser);
      await refreshAfterMutation(nextUser);
      return null;
    } catch (error) {
      return error instanceof RepositoryError ? error.message : "Не удалось создать аккаунт. Проверьте данные и повторите попытку.";
    }
  }, [refreshAfterMutation, repo]);

  const getCaptcha = useCallback(async () => {
    if (!repo.getCaptcha) throw new RepositoryError("Капча недоступна.");
    return repo.getCaptcha();
  }, [repo]);

  const updateProfile = useCallback(async (input: ProfileInput) => {
    if (!user) return "Войдите, чтобы изменить профиль.";
    try {
      const updated = await repo.updateProfile(user, input);
      setUser(updated);
      return null;
    } catch (error) {
      return error instanceof RepositoryError ? error.message : "Не удалось сохранить профиль.";
    }
  }, [repo, user]);

  const logout = useCallback(() => {
    repo.logout?.();
    setUser(null);
    setBookings([]);
    setWeeklyReservations([]);
  }, [repo]);

  const previewAgreements = useCallback(async (requests: BookingRequest[]) => {
    if (!user || !repo.previewAgreements) throw new RepositoryError("Договор аренды недоступен.");
    return repo.previewAgreements(user, requests);
  }, [repo, user]);

  const bookSlots = useCallback(async (requests: BookingRequest[], tokens: string[]) => {
    if (!user) throw new RepositoryError("Войдите, чтобы забронировать часы.");
    try {
      const created = await repo.bookSlots(user, requests, tokens);
      setBookings((current) => [...created, ...current.filter((item) => !created.some((booking) => booking.id === item.id))]);
      await refreshAfterMutation(user);
      return created;
    } catch (error) {
      if (error instanceof PartialBookingError) setBookings((current) => [...error.created, ...current]);
      await refreshAfterMutation(user);
      throw error;
    }
  }, [refreshAfterMutation, repo, user]);

  const createWeeklyReservation = useCallback(async (input: Omit<WeeklyReservation, "id">) => {
    if (user?.role !== "master" || !repo.createWeeklyReservation) throw new RepositoryError("Нет доступа к еженедельным резервам.");
    await repo.createWeeklyReservation(input);
    await refreshAfterMutation(user);
  }, [refreshAfterMutation, repo, user]);

  const cancelWeeklyReservation = useCallback(async (id: number) => {
    if (user?.role !== "master" || !repo.cancelWeeklyReservation) throw new RepositoryError("Нет доступа к еженедельным резервам.");
    await repo.cancelWeeklyReservation(id);
    await refreshAfterMutation(user);
  }, [refreshAfterMutation, repo, user]);

  const scanQr = useCallback((code: string) => repo.scanQr(code), [repo]);

  const cancelBooking = useCallback(async (bookingId: number) => {
    if (!user) throw new RepositoryError("Войдите, чтобы отменить бронирование.");
    await repo.cancelBooking(user, bookingId);
    setBookings((current) => current.map((booking) => booking.id === bookingId ? { ...booking, state: "cancelled" } : booking));
    await refreshAfterMutation(user);
  }, [refreshAfterMutation, repo, user]);

  const addListing = useCallback(async (input: NewListingInput) => {
    if (!user) throw new RepositoryError("Войдите, чтобы добавить пространство.");
    const listing = await repo.addListing(user, input);
    await refreshAfterMutation(user);
    return listing;
  }, [refreshAfterMutation, repo, user]);

  const updateListing = useCallback(async (listingId: number, input: NewListingInput) => {
    if (!user) throw new RepositoryError("Войдите, чтобы изменить пространство.");
    const listing = await repo.updateListing(user, listingId, input);
    await refresh(user);
    return listing;
  }, [refresh, repo, user]);

  const deleteListing = useCallback(async (listingId: number) => {
    if (!user) throw new RepositoryError("Войдите, чтобы удалить пространство.");
    await repo.deleteListing(user, listingId);
    await refresh(user);
  }, [refresh, repo, user]);

  const uploadRoomPhoto = useCallback(async (listing: Listing, file: File) => {
    if (!user) throw new RepositoryError("Войдите, чтобы изменить фото.");
    await repo.uploadRoomPhoto(user, listing, file);
    await refreshAfterMutation(user);
  }, [refreshAfterMutation, repo, user]);

  const createManualBooking = useCallback(async (input: ManualBookingInput) => {
    if (!user) throw new RepositoryError("Войдите, чтобы создать бронь.");
    const booking = await repo.createManualBooking(user, input);
    await refresh(user);
    return booking;
  }, [refresh, repo, user]);

  const value = useMemo(() => ({
    user, listings, slots, bookings, weeklyReservations, ready, loadError, reload, login, register, getCaptcha, updateProfile, logout, previewAgreements, bookSlots, createWeeklyReservation, cancelWeeklyReservation, scanQr, cancelBooking, addListing, updateListing, deleteListing, uploadRoomPhoto, createManualBooking,
  }), [user, listings, slots, bookings, weeklyReservations, ready, loadError, reload, login, register, getCaptcha, updateProfile, logout, previewAgreements, bookSlots, createWeeklyReservation, cancelWeeklyReservation, scanQr, cancelBooking, addListing, updateListing, deleteListing, uploadRoomPhoto, createManualBooking]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}

export function freeSlots(
  slots: Slot[], listingId: number, date: string, from = 14, to = 21,
): Slot[] {
  return slots
    .filter((slot) => {
      if (slot.listingId !== listingId || slot.date !== date || slot.state !== 0) return false;
      const hour = Number(slot.startTime.slice(0, 2));
      return hour >= from && hour < to;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export { isRangeAvailable } from "../lib/intervals";

export function freeHourCount(slots: Slot[], date: string, from = 14, to = 21): number {
  const minutes = slots.filter((slot) => {
    if (slot.date !== date || slot.state !== 0) return false;
    const hour = Number(slot.startTime.slice(0, 2));
    return hour >= from && hour < to;
  }).reduce((sum, slot) => sum + slotDuration(slot), 0);
  return Math.round((minutes / 60) * 100) / 100;
}

export function freeSlotHours(slots: Slot[]): number {
  const minutes = slots.filter((slot) => slot.state === 0).reduce((sum, slot) => sum + slotDuration(slot), 0);
  return Math.round((minutes / 60) * 100) / 100;
}

function slotDuration(slot: Slot): number {
  const start = timeToMinutes(slot.startTime);
  const end = timeToMinutes(slot.endTime);
  return start === null || end === null ? 0 : Math.max(0, end - start);
}
