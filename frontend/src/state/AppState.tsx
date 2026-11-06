import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DemoRepository } from "../lib/demoRepository";
import { RepositoryError, type AppRepository, type LoginInput, type ManualBookingInput, type NewListingInput, type ProfileInput, type RegisterInput } from "../lib/repository";
import type { Booking, BookingRequest, Listing, Slot, User } from "../lib/types";
import { timeToMinutes } from "../lib/intervals";
import { readLocalSession, saveLocalSession } from "../lib/auth";

interface AppContextValue {
  user: User | null;
  listings: Listing[];
  slots: Slot[];
  bookings: Booking[];
  ready: boolean;
  login: (input: LoginInput) => Promise<string | null>;
  register: (input: RegisterInput) => Promise<string | null>;
  updateProfile: (input: ProfileInput) => Promise<string | null>;
  logout: () => void;
  bookSlots: (requests: BookingRequest[]) => Promise<Booking[]>;
  cancelBooking: (bookingId: number) => Promise<void>;
  addListing: (input: NewListingInput) => Promise<Listing>;
  updateListing: (listingId: number, input: NewListingInput) => Promise<Listing>;
  deleteListing: (listingId: number) => Promise<void>;
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
  const [repo] = useState(() => repository ?? new DemoRepository());
  const [user, setUser] = useState<User | null>(() => readLocalSession());
  const [listings, setListings] = useState<Listing[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (forUser?: User) => {
    const snapshot = await repo.load(forUser);
    setListings(snapshot.listings);
    setSlots(snapshot.slots);
    setBookings(snapshot.bookings);
  }, [repo]);

  useEffect(() => {
    let active = true;
    const initialUser = readLocalSession();
    repo.load(initialUser ?? undefined).then((snapshot) => {
      if (!active) return;
      setListings(snapshot.listings);
      setSlots(snapshot.slots);
      setBookings(snapshot.bookings);
      setReady(true);
    }).catch(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, [repo]);

  const login = useCallback(async (input: LoginInput) => {
    try {
      const nextUser = await repo.login(input);
      await refresh(nextUser);
      saveLocalSession(nextUser);
      setUser(nextUser);
      return null;
    } catch (error) {
      return error instanceof RepositoryError ? error.message : "Не удалось войти. Попробуйте ещё раз.";
    }
  }, [refresh, repo]);

  const register = useCallback(async (input: RegisterInput) => {
    try {
      const nextUser = await repo.register(input);
      await refresh(nextUser);
      saveLocalSession(nextUser);
      setUser(nextUser);
      return null;
    } catch (error) {
      return error instanceof RepositoryError ? error.message : "Не удалось создать аккаунт. Проверьте данные и повторите попытку.";
    }
  }, [refresh, repo]);

  const updateProfile = useCallback(async (input: ProfileInput) => {
    if (!user) return "Войдите, чтобы изменить профиль.";
    try {
      const updated = await repo.updateProfile(user, input);
      saveLocalSession(updated);
      setUser(updated);
      return null;
    } catch (error) {
      return error instanceof RepositoryError ? error.message : "Не удалось сохранить профиль.";
    }
  }, [repo, user]);

  const logout = useCallback(() => {
    saveLocalSession(null);
    setUser(null);
  }, []);

  const bookSlots = useCallback(async (requests: BookingRequest[]) => {
    if (!user) throw new RepositoryError("Войдите, чтобы забронировать часы.");
    const created = await repo.bookSlots(user, requests);
    await refresh(user);
    return created;
  }, [refresh, repo, user]);

  const cancelBooking = useCallback(async (bookingId: number) => {
    if (!user) throw new RepositoryError("Войдите, чтобы отменить бронирование.");
    await repo.cancelBooking(user, bookingId);
    await refresh(user);
  }, [refresh, repo, user]);

  const addListing = useCallback(async (input: NewListingInput) => {
    if (!user) throw new RepositoryError("Войдите, чтобы добавить пространство.");
    const listing = await repo.addListing(user, input);
    await refresh(user);
    return listing;
  }, [refresh, repo, user]);

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

  const createManualBooking = useCallback(async (input: ManualBookingInput) => {
    if (!user) throw new RepositoryError("Войдите, чтобы создать бронь.");
    const booking = await repo.createManualBooking(user, input);
    await refresh(user);
    return booking;
  }, [refresh, repo, user]);

  const value = useMemo(() => ({
    user, listings, slots, bookings, ready, login, register, updateProfile, logout, bookSlots, cancelBooking, addListing, updateListing, deleteListing, createManualBooking,
  }), [user, listings, slots, bookings, ready, login, register, updateProfile, logout, bookSlots, cancelBooking, addListing, updateListing, deleteListing, createManualBooking]);

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
