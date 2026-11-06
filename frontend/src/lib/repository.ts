import type { Booking, BookingRequest, GuardScanResult, Listing, Slot, User } from "./types";

export interface LoginInput {
  role: User["role"];
  phone: string;
  password: string;
}

export interface RegisterInput {
  surname: string;
  firstName: string;
  patronymic: string;
  phone: string;
  password: string;
}

export type ProfileInput = Pick<RegisterInput, "surname" | "firstName" | "patronymic" | "phone">;

export interface NewListingInput {
  school: string;
  uo: string;
  address: string;
  type: Listing["type"];
  room: string;
  capacity: number;
  price: number;
  availableFrom: string;
  availableTo: string;
  image: string;
}

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
}

/**
 * Application-facing data boundary. Implementations may use in-memory demo data,
 * REST, or another transport; UI components must not depend on transport details.
 */
export interface AppRepository {
  restoreSession?(): Promise<User | null>;
  logout?(): void;
  /** Anonymous load returns the public catalog; authenticated load includes role-visible bookings. */
  load(user?: User): Promise<AppSnapshot>;
  uploadRoomPhoto(user: User, listing: Listing, file: File): Promise<void>;
  login(input: LoginInput): Promise<User>;
  register(input: RegisterInput): Promise<User>;
  updateProfile(user: User, input: ProfileInput): Promise<User>;
  bookSlots(user: User, requests: BookingRequest[]): Promise<Booking[]>;
  scanQr(code: string): Promise<GuardScanResult>;
  cancelBooking(user: User, bookingId: number): Promise<void>;
  addListing(user: User, input: NewListingInput): Promise<Listing>;
  updateListing(user: User, listingId: number, input: NewListingInput): Promise<Listing>;
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
