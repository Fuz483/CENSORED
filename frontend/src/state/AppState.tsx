// @refresh reset
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { RestRepository } from "../lib/restRepository";
import { PartialBookingError, RepositoryError, errorMessage, type AppRepository, type CaptchaChallenge, type LoginInput, type ManualBookingInput, type NewListingInput, type ProfileInput, type RegisterInput, type UpdateListingInput, type UoBookingSummary, type UoInstitution } from "../lib/repository";
import type { Booking, BookingRequest, CustomerSuggestion, GuardScanResult, Listing, RentalAgreement, ReservedVisit, Slot, User, WeeklyReservation, WeeklyReservationInput } from "../lib/types";
import { timeToMinutes } from "../lib/intervals";

interface AppContextValue {
  user: User | null;
  listings: Listing[];
  slotsByDate: Map<string, Map<number, Slot[]>>;
  bookings: Booking[];
  hasMoreBookings: boolean;
  loadingMoreBookings: boolean;
  loadMoreBookings: () => Promise<void>;
  uoBookingSummary: UoBookingSummary | null;
  weeklyReservations: WeeklyReservation[];
  reservedVisits: ReservedVisit[];
  ready: boolean;
  sessionReady: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  login: (input: LoginInput) => Promise<string | null>;
  listUoInstitutions: () => Promise<UoInstitution[]>;
  register: (input: RegisterInput) => Promise<string | null>;
  getCaptcha: () => Promise<CaptchaChallenge>;
  updateProfile: (input: ProfileInput) => Promise<string | null>;
  exportPersonalData: () => Promise<Record<string, unknown>>;
  requestErasure: () => Promise<{ requested_at: string }>;
  logout: () => void;
  previewAgreements: (requests: BookingRequest[]) => Promise<RentalAgreement[]>;
  bookSlots: (requests: BookingRequest[], tokens: string[]) => Promise<Booking[]>;
  createWeeklyReservation: (input: WeeklyReservationInput) => Promise<void>;
  linkWeeklyCustomer: (id: number, phone: string, customerId?: string) => Promise<void>;
  searchCustomers: (phone: string) => Promise<CustomerSuggestion[]>;
  setWeeklyEndDate: (id: number, endsOn: string) => Promise<void>;
  cancelWeeklyReservation: (id: number) => Promise<void>;
  scanQr: (code: string) => Promise<GuardScanResult>;
  cancelBooking: (bookingId: number) => Promise<void>;
  addListing: (input: NewListingInput) => Promise<Listing>;
  updateListing: (listingId: number, input: UpdateListingInput) => Promise<Listing>;
  deleteListing: (listingId: number) => Promise<void>;
  uploadRoomPhoto: (listing: Listing, file: File) => Promise<void>;
  createManualBooking: (input: ManualBookingInput) => Promise<Booking>;
}

const AppContext = createContext<AppContextValue | null>(null);
type BookingHistoryCursor = { nextOffset: number | null; loading: boolean };

export function AppProvider({
  children,
  repository,
  initialize = true,
}: {
  children: ReactNode;
  repository?: AppRepository;
  initialize?: boolean;
}) {
  const [repo] = useState(() => repository ?? new RestRepository());
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [uoBookingSummary, setUoBookingSummary] = useState<UoBookingSummary | null>(null);
  const [historyCursor, setHistoryCursor] = useState<BookingHistoryCursor>({ nextOffset: null, loading: false });
  const historyRef = useRef(historyCursor);
  const [weeklyReservations, setWeeklyReservations] = useState<WeeklyReservation[]>([]);
  const [reservedVisits, setReservedVisits] = useState<ReservedVisit[]>([]);
  const [ready, setReady] = useState(false);
  const [sessionReady, setSessionReady] = useState(() => !repo.hasSession?.());
  const [loadError, setLoadError] = useState<string | null>(null);
  const sessionRevision = useRef(0);

  const setHistory = useCallback((nextOffset: number | null, loading = false) => {
    const cursor = { nextOffset, loading };
    historyRef.current = cursor;
    setHistoryCursor(cursor);
    return cursor;
  }, []);

  const setSessionUser = useCallback((nextUser: User | null) => {
    setUser(nextUser);
    setBookings([]);
    setUoBookingSummary(null);
    setHistory(null);
    setWeeklyReservations([]);
    setReservedVisits([]);
  }, [setHistory]);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<AppRepository["load"]>>) => {
    setListings(snapshot.listings);
    setSlots(snapshot.slots);
    setBookings(snapshot.bookings);
    setUoBookingSummary(snapshot.uoBookingSummary ?? null);
    setHistory(snapshot.nextBookingHistoryOffset ?? null);
    setWeeklyReservations(snapshot.weeklyReservations ?? []);
    setReservedVisits(snapshot.reservedVisits ?? []);
    setLoadError(null);
  }, [setHistory]);

  const refresh = useCallback(async (forUser: User | undefined, session: number) => {
    if (session !== sessionRevision.current) return;
    try {
      const snapshot = await repo.load(forUser);
      if (session === sessionRevision.current) applySnapshot(snapshot);
    } finally {
      if (session === sessionRevision.current) setReady(true);
    }
  }, [applySnapshot, repo]);

  const logout = useCallback(() => {
    const session = ++sessionRevision.current;
    repo.logout?.();
    setSessionUser(null);
    setSessionReady(true);
    setLoadError(null);
    if (initialize) {
      void refresh(undefined, session).catch((error) => {
        if (session === sessionRevision.current) setLoadError(errorMessage(error, "Не удалось загрузить данные."));
      });
    }
  }, [initialize, refresh, repo, setSessionUser]);

  const handleLoadError = useCallback((error: unknown, session: number, fallback: string) => {
    if (session !== sessionRevision.current) return;
    if (error instanceof RepositoryError && error.code === "401") {
      logout();
      return;
    }
    setLoadError(errorMessage(error, fallback));
  }, [logout]);

  const loadMoreBookings = useCallback(async () => {
    const { nextOffset, loading } = historyRef.current;
    if (!user || !repo.loadBookingHistory || nextOffset === null || loading) return;
    const pending = setHistory(nextOffset, true);
    try {
      const page = await repo.loadBookingHistory(user, nextOffset);
      if (historyRef.current !== pending) return;
      setBookings((current) => {
        const byId = new Map(current.map((booking) => [booking.id, booking]));
        for (const booking of page.bookings) {
          if (!byId.has(booking.id)) byId.set(booking.id, booking);
        }
        return [...byId.values()];
      });
      setHistory(page.nextOffset);
    } catch (error) {
      if (historyRef.current !== pending) return;
      setHistory(nextOffset);
      if (error instanceof RepositoryError && error.code === "401") logout();
      throw error;
    }
  }, [logout, repo, setHistory, user]);

  useEffect(() => {
    if (!initialize) return;
    let active = true;
    const session = sessionRevision.current;
    (async () => {
      const initialUser = await repo.restoreSession?.() ?? null;
      if (!active || session !== sessionRevision.current) return null;
      setUser(initialUser);
      setSessionReady(true);
      return repo.load(initialUser ?? undefined);
    })().then((snapshot) => {
      if (!active || !snapshot || session !== sessionRevision.current) return;
      applySnapshot(snapshot);
      setReady(true);
    }).catch((error) => {
      if (active && session === sessionRevision.current) {
        setSessionReady(true);
        handleLoadError(error, session, "Не удалось загрузить данные.");
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [applySnapshot, handleLoadError, initialize, repo]);

  const reload = useCallback(async () => {
    const session = sessionRevision.current;
    try {
      const restored = user ?? await repo.restoreSession?.() ?? null;
      if (session !== sessionRevision.current) return;
      setUser(restored);
      await refresh(restored ?? undefined, session);
    }
    catch (error) { handleLoadError(error, session, "Не удалось загрузить данные."); }
  }, [handleLoadError, refresh, repo, user]);

  const refreshAfterMutation = useCallback(async (forUser: User | undefined, session: number) => {
    try { await refresh(forUser, session); }
    catch (error) { handleLoadError(error, session, "Не удалось обновить данные."); }
  }, [handleLoadError, refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const session = ++sessionRevision.current;
    try {
      const nextUser = await repo.login(input);
      if (session !== sessionRevision.current) return null;
      setSessionUser(nextUser);
      setSessionReady(true);
      await refreshAfterMutation(nextUser, session);
      return null;
    } catch (error) {
      if (!ready) void refreshAfterMutation(undefined, session);
      return error instanceof RepositoryError ? error.message : "Не удалось войти. Попробуйте ещё раз.";
    }
  }, [ready, refreshAfterMutation, repo, setSessionUser]);

  const register = useCallback(async (input: RegisterInput) => {
    const session = ++sessionRevision.current;
    try {
      const nextUser = await repo.register(input);
      if (session !== sessionRevision.current) return null;
      setSessionUser(nextUser);
      setSessionReady(true);
      await refreshAfterMutation(nextUser, session);
      return null;
    } catch (error) {
      if (!ready) void refreshAfterMutation(undefined, session);
      return error instanceof RepositoryError ? error.message : "Не удалось создать аккаунт. Проверьте данные и повторите попытку.";
    }
  }, [ready, refreshAfterMutation, repo, setSessionUser]);

  const exportPersonalData = useCallback(async () => {
    if (!user) throw new RepositoryError("Войдите в аккаунт.", "401");
    if (!repo.exportPersonalData) throw new RepositoryError("Выгрузка данных недоступна.");
    const session = sessionRevision.current;
    try {
      const result = await repo.exportPersonalData();
      if (session !== sessionRevision.current) throw new RepositoryError("Войдите в аккаунт.", "401");
      return result;
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "401" && session === sessionRevision.current) logout();
      throw error;
    }
  }, [logout, repo, user]);

  const requestErasure = useCallback(async () => {
    if (!user) throw new RepositoryError("Войдите в аккаунт.", "401");
    if (!repo.requestErasure) throw new RepositoryError("Запрос на удаление данных недоступен.");
    const session = sessionRevision.current;
    try {
      const result = await repo.requestErasure();
      if (session !== sessionRevision.current) throw new RepositoryError("Войдите в аккаунт.", "401");
      return result;
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "401" && session === sessionRevision.current) logout();
      throw error;
    }
  }, [logout, repo, user]);

  const getCaptcha = useCallback(async () => {
    if (!repo.getCaptcha) throw new RepositoryError("Капча недоступна.");
    return repo.getCaptcha();
  }, [repo]);

  const listUoInstitutions = useCallback(async () => repo.listUoInstitutions?.() ?? [], [repo]);

  const updateProfile = useCallback(async (input: ProfileInput) => {
    if (!user) return "Войдите, чтобы изменить профиль.";
    const session = sessionRevision.current;
    try {
      const updated = await repo.updateProfile(user, input);
      if (session === sessionRevision.current) setUser(updated);
      return null;
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "401" && session === sessionRevision.current) logout();
      return error instanceof RepositoryError ? error.message : "Не удалось сохранить профиль.";
    }
  }, [logout, repo, user]);

  const previewAgreements = useCallback(async (requests: BookingRequest[]) => {
    if (!user || !repo.previewAgreements) throw new RepositoryError("Договор аренды недоступен.");
    return repo.previewAgreements(user, requests);
  }, [repo, user]);

  const bookSlots = useCallback(async (requests: BookingRequest[], tokens: string[]) => {
    if (!user) throw new RepositoryError("Войдите, чтобы забронировать часы.");
    const session = sessionRevision.current;
    try {
      const created = await repo.bookSlots(user, requests, tokens);
      if (session === sessionRevision.current) {
        setBookings((current) => [...created, ...current.filter((item) => !created.some((booking) => booking.id === item.id))]);
      }
      await refreshAfterMutation(user, session);
      return created;
    } catch (error) {
      if (error instanceof PartialBookingError && session === sessionRevision.current) {
        setBookings((current) => [...error.created, ...current]);
      }
      await refreshAfterMutation(user, session);
      throw error;
    }
  }, [refreshAfterMutation, repo, user]);

  const createWeeklyReservation = useCallback(async (input: WeeklyReservationInput) => {
    if (user?.role !== "master" || !repo.createWeeklyReservation) throw new RepositoryError("Нет доступа к еженедельным резервам.");
    const session = sessionRevision.current;
    await repo.createWeeklyReservation(input);
    await refreshAfterMutation(user, session);
  }, [refreshAfterMutation, repo, user]);

  const linkWeeklyCustomer = useCallback(async (id: number, phone: string, customerId?: string) => {
    if (user?.role !== "master" || !repo.linkWeeklyCustomer) throw new RepositoryError("Нет доступа к еженедельным резервам.");
    const session = sessionRevision.current;
    await repo.linkWeeklyCustomer(id, phone, customerId);
    await refreshAfterMutation(user, session);
  }, [refreshAfterMutation, repo, user]);

  const searchCustomers = useCallback(async (phone: string) => {
    return user?.role === "master" && repo.searchCustomers ? repo.searchCustomers(phone) : [];
  }, [repo, user]);

  const setWeeklyEndDate = useCallback(async (id: number, endsOn: string) => {
    if (user?.role !== "master" || !repo.setWeeklyEndDate) throw new RepositoryError("Нет доступа к еженедельным резервам.");
    const session = sessionRevision.current;
    await repo.setWeeklyEndDate(id, endsOn);
    await refreshAfterMutation(user, session);
  }, [refreshAfterMutation, repo, user]);

  const cancelWeeklyReservation = useCallback(async (id: number) => {
    if (user?.role !== "master" || !repo.cancelWeeklyReservation) throw new RepositoryError("Нет доступа к еженедельным резервам.");
    const session = sessionRevision.current;
    await repo.cancelWeeklyReservation(id);
    await refreshAfterMutation(user, session);
  }, [refreshAfterMutation, repo, user]);

  const scanQr = useCallback((code: string) => repo.scanQr(code), [repo]);

  const cancelBooking = useCallback(async (bookingId: number) => {
    if (!user) throw new RepositoryError("Войдите, чтобы отменить бронирование.");
    const session = sessionRevision.current;
    await repo.cancelBooking(user, bookingId);
    if (session === sessionRevision.current) {
      setBookings((current) => current.map((booking) => booking.id === bookingId ? { ...booking, state: "cancelled" } : booking));
    }
    await refreshAfterMutation(user, session);
  }, [refreshAfterMutation, repo, user]);

  const addListing = useCallback(async (input: NewListingInput) => {
    if (!user) throw new RepositoryError("Войдите, чтобы добавить пространство.");
    const session = sessionRevision.current;
    const listing = await repo.addListing(user, input);
    await refreshAfterMutation(user, session);
    return listing;
  }, [refreshAfterMutation, repo, user]);

  const updateListing = useCallback(async (listingId: number, input: UpdateListingInput) => {
    if (!user) throw new RepositoryError("Войдите, чтобы изменить пространство.");
    const session = sessionRevision.current;
    const listing = await repo.updateListing(user, listingId, input);
    if (session === sessionRevision.current) {
      setListings((current) => current.map((item) => item.id === listingId ? listing : item));
    }
    await refreshAfterMutation(user, session);
    return listing;
  }, [refreshAfterMutation, repo, user]);

  const deleteListing = useCallback(async (listingId: number) => {
    if (!user) throw new RepositoryError("Войдите, чтобы удалить пространство.");
    const session = sessionRevision.current;
    await repo.deleteListing(user, listingId);
    if (session === sessionRevision.current) {
      setListings((current) => current.filter((item) => item.id !== listingId));
      setSlots((current) => current.filter((slot) => slot.listingId !== listingId));
    }
    await refreshAfterMutation(user, session);
  }, [refreshAfterMutation, repo, user]);

  const uploadRoomPhoto = useCallback(async (listing: Listing, file: File) => {
    if (!user) throw new RepositoryError("Войдите, чтобы изменить фото.");
    const session = sessionRevision.current;
    await repo.uploadRoomPhoto(user, listing, file);
    await refreshAfterMutation(user, session);
  }, [refreshAfterMutation, repo, user]);

  const createManualBooking = useCallback(async (input: ManualBookingInput) => {
    if (!user) throw new RepositoryError("Войдите, чтобы создать бронь.");
    const session = sessionRevision.current;
    const booking = await repo.createManualBooking(user, input);
    await refresh(user, session);
    return booking;
  }, [refresh, repo, user]);

  const slotsByDate = useMemo(() => {
    const dates = new Map<string, Map<number, Slot[]>>();
    for (const slot of slots) {
      let listings = dates.get(slot.date);
      if (!listings) dates.set(slot.date, listings = new Map());
      let daySlots = listings.get(slot.listingId);
      if (!daySlots) listings.set(slot.listingId, daySlots = []);
      daySlots.push(slot);
    }
    return dates;
  }, [slots]);

  const value = useMemo(() => ({
    user, listings, slotsByDate, bookings, hasMoreBookings: historyCursor.nextOffset !== null,
    loadingMoreBookings: historyCursor.loading, loadMoreBookings, uoBookingSummary, weeklyReservations, reservedVisits, ready,
    sessionReady, loadError, reload, login, listUoInstitutions, register, getCaptcha, updateProfile, exportPersonalData,
    requestErasure, logout, previewAgreements, bookSlots, createWeeklyReservation, linkWeeklyCustomer, searchCustomers,
    setWeeklyEndDate, cancelWeeklyReservation, scanQr, cancelBooking, addListing, updateListing, deleteListing,
    uploadRoomPhoto, createManualBooking,
  }), [user, listings, slotsByDate, bookings, historyCursor, loadMoreBookings, uoBookingSummary, weeklyReservations, reservedVisits, ready,
    sessionReady, loadError, reload, login, listUoInstitutions, register, getCaptcha, updateProfile, exportPersonalData,
    requestErasure, logout, previewAgreements, bookSlots, createWeeklyReservation, linkWeeklyCustomer, searchCustomers,
    setWeeklyEndDate, cancelWeeklyReservation, scanQr, cancelBooking, addListing, updateListing, deleteListing,
    uploadRoomPhoto, createManualBooking]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}

export function freeSlotsForDay(slots: Slot[], from = 14, to = 21): Slot[] {
  return slots
    .filter((slot) => isFreeWithinHours(slot, from, to))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function freeSlotHours(slots: Slot[], from = 0, to = 24): number {
  const minutes = slots.reduce((sum, slot) =>
    isFreeWithinHours(slot, from, to) ? sum + slotDuration(slot) : sum,
  0);
  return Math.round((minutes / 60) * 100) / 100;
}

function isFreeWithinHours(slot: Slot, from: number, to: number): boolean {
  const hour = Number(slot.startTime.slice(0, 2));
  return slot.state === 0 && hour >= from && hour < to;
}

function slotDuration(slot: Slot): number {
  const start = timeToMinutes(slot.startTime);
  const end = timeToMinutes(slot.endTime);
  return start === null || end === null ? 0 : Math.max(0, end - start);
}
