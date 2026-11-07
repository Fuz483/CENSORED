import type { Booking, BookingRequest, CustomerSuggestion, GuardScanResult, Listing, RentalAgreement, ReservedVisit, Slot, User, WeeklyReservation, WeeklyReservationInput } from "./types";

export interface CaptchaChallenge {
  id: string;
  image: string;
}

export interface LoginInput {
  role: User["role"];
  phone: string;
  password: string;
  institutionId?: string;
}

export interface UoInstitution {
  id: string;
  name: string;
}

export interface RegisterInput {
  surname: string;
  firstName: string;
  patronymic: string;
  phone: string;
  email: string;
  password: string;
  captchaId: string;
  captchaAnswer: string;
}

export type ProfileInput = Pick<RegisterInput, "surname" | "firstName" | "patronymic" | "phone" | "email">;

export interface NewListingInput {
  school: string;
  uo: string;
  address: string;
  city?: string;
  cityDistrict?: string;
  type: Listing["type"];
  room: string;
  capacity: number;
  price: number;
  availableFrom: string;
  availableTo: string;
  image: string;
}

export type UpdateListingInput = Partial<Omit<NewListingInput, "capacity">> & { capacity?: number | null };

export interface ManualBookingInput {
  listingId: number;
  date: string;
  startTime: string;
  endTime: string;
  customerName: string;
  customerPhone: string;
  note?: string;
}

export interface AppSnapshot {
  listings: Listing[];
  slots: Slot[];
  bookings: Booking[];
  nextBookingHistoryOffset?: number | null;
  uoBookingSummary?: UoBookingSummary | null;
  weeklyReservations?: WeeklyReservation[];
  reservedVisits?: ReservedVisit[];
}

export interface BookingHistoryPage {
  bookings: Booking[];
  nextOffset: number | null;
}

export interface UoBookingSummary {
  total: number;
  totalHours: number;
  totalRevenue: number;
  listings: { listingId: number; count: number; hasActiveBookings: boolean }[];
}

/**
 * Application-facing data boundary. Implementations may use in-memory demo data,
 * REST, or another transport; UI components must not depend on transport details.
 */
export interface AppRepository {
  hasSession?(): boolean;
  restoreSession?(): Promise<User | null>;
  logout?(): void;
  /** Anonymous load returns the public catalog; authenticated load includes role-visible bookings. */
  load(user?: User): Promise<AppSnapshot>;
  loadBookingHistory?(user: User, offset: number): Promise<BookingHistoryPage>;
  uploadRoomPhoto(user: User, listing: Listing, file: File): Promise<void>;
  login(input: LoginInput): Promise<User>;
  listUoInstitutions?(): Promise<UoInstitution[]>;
  getCaptcha?(): Promise<CaptchaChallenge>;
  register(input: RegisterInput): Promise<User>;
  updateProfile(user: User, input: ProfileInput): Promise<User>;
  exportPersonalData?(): Promise<Record<string, unknown>>;
  requestErasure?(): Promise<{ requested_at: string }>;
  previewAgreements?(user: User, requests: BookingRequest[]): Promise<RentalAgreement[]>;
  bookSlots(user: User, requests: BookingRequest[], agreementTokens: string[]): Promise<Booking[]>;
  createWeeklyReservation?(input: WeeklyReservationInput): Promise<void>;
  linkWeeklyCustomer?(id: number, phone: string, customerId?: string): Promise<void>;
  searchCustomers?(phone: string): Promise<CustomerSuggestion[]>;
  setWeeklyEndDate?(id: number, endsOn: string): Promise<void>;
  cancelWeeklyReservation?(id: number): Promise<void>;
  scanQr(code: string): Promise<GuardScanResult>;
  cancelBooking(user: User, bookingId: number): Promise<void>;
  addListing(user: User, input: NewListingInput): Promise<Listing>;
  updateListing(user: User, listingId: number, input: UpdateListingInput): Promise<Listing>;
  deleteListing(user: User, listingId: number): Promise<void>;
  createManualBooking(user: User, input: ManualBookingInput): Promise<Booking>;
}

export class RepositoryError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

export class PartialBookingError extends RepositoryError {
  constructor(message: string, readonly created: Booking[]) {
    super(message, "PARTIAL_BOOKING");
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
