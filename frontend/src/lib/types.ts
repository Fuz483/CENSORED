export type Role = "tenant" | "master";
export type RoomType = "gym" | "pool" | "hall" | "it" | "classroom";
export type BookingSource = "client" | "uo";
export type BookingState = "pending" | "confirmed" | "paid" | "active" | "completed" | "cancelled";

export interface User {
  id: number;
  user_id: string;
  name: string;
  phone: string;
  role: Role;
  rating: number;
  surname?: string;
  firstName?: string;
  patronymic?: string;
  email?: string | null;
}

export interface Listing {
  id: number;
  school: string;
  uo: string;
  address: string;
  city?: string;
  cityDistrict?: string;
  type: RoomType;
  room: string;
  capacity: number | null;
  price: number;
  availableFrom: string;
  availableTo: string;
  image: string;
  ownerId: string;
}

export interface Slot {
  id: number;
  listingId: number;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  state: 0 | 1;
  userId: number | null;
}

export interface BookingRequest {
  listingId: number;
  date: string;
  startTime: string;
  endTime: string;
  reservationId?: number;
}

export interface RentalAgreement {
  version: string;
  text: string;
  token: string;
}

export interface WeeklyReservation extends BookingRequest {
  id: number;
  label: string;
  weekdays: number[];
  customerName?: string;
  endsOn?: string;
}

export interface CustomerSuggestion {
  user_id: string;
  phone: string;
  name: string;
}

export type WeeklyReservationInput = Omit<WeeklyReservation, "id" | "customerName"> & { customerPhone?: string; customerId?: string };
export type ReservedVisit = BookingRequest & { reservationId: number; label: string };

export interface Booking extends Omit<BookingRequest, "listingId"> {
  id: number;
  listing: Listing;
  slots: Slot[];
  total: number;
  state?: BookingState;
  code?: string | null;
  agreementText?: string | null;
  agreementAcceptedAt?: string | null;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  source: BookingSource;
  note?: string;
}

export interface GuardScanResult {
  accessGranted: boolean;
  reason: string;
  code: string;
  school: string;
  room: string;
  date: string;
  startTime: string;
  endTime: string;
  slotsCount: number;
  totalPrice: number;
  customerName: string;
  customerPhone: string;
}

export interface Filters {
  school: string;
  city: string;
  district: string;
  type: RoomType | "";
  date: string;
  from: number;
  to: number;
}
