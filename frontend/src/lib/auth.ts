import type { Role, User } from "./types";
import { ROLE_LABEL } from "./roles";

/** Stub credentials for the demo. Replace with a real auth endpoint later. */
export const DEMO_PASSWORD = "peremena";
export const LOCAL_ACCOUNTS_KEY = "plyacouka-local-accounts-v1";
export const LOCAL_SESSION_KEY = "plyacouka-local-session-v1";

interface LocalAccount {
  user: User;
  salt: string;
  passwordHash: string;
}

const ACCOUNTS: Record<Role, User> = {
  tenant: {
    id: 1,
    user_id: "client-demo",
    name: "Анна Ковалёва",
    phone: "+375 (29) 123-45-67",
    role: "tenant",
    rating: 4.8,
  },
  master: {
    id: 2,
    user_id: "uo-demo",
    name: "СШ № 24",
    phone: "+375 (17) 200-00-00",
    role: "master",
    rating: 4.9,
  },
};

export type LoginResult =
  | { user: User; error: null }
  | { user: null; error: string };

export function demoPhone(role: Role): string {
  return ACCOUNTS[role].phone;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function authenticate(role: Role, phone: string, password: string): LoginResult {
  if (digits(phone).length < 9) {
    return { user: null, error: "Введите номер телефона." };
  }

  if (password.length === 0) {
    return { user: null, error: "Введите пароль." };
  }

  const account = ACCOUNTS[role];

  if (digits(phone) !== digits(account.phone)) {
    return {
      user: null,
      error: `Для роли «${ROLE_LABEL[role]}» демо-номер: ${account.phone}.`,
    };
  }

  if (password !== DEMO_PASSWORD) {
    return { user: null, error: "Неверный пароль. Демо-пароль: peremena." };
  }

  return { user: { ...account }, error: null };
}

export function normalizePhone(phone: string): string {
  return digits(phone);
}

export async function registerLocalAccount(input: {
  surname: string;
  firstName: string;
  patronymic: string;
  phone: string;
  email?: string;
  password: string;
}): Promise<User> {
  const surname = input.surname.trim();
  const firstName = input.firstName.trim();
  const patronymic = input.patronymic.trim();
  const phone = input.phone.trim();
  const phoneDigits = digits(phone);

  const email = input.email?.trim().toLowerCase() ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Укажите корректный адрес электронной почты.");
  if (phoneDigits.length < 9) throw new Error("Введите корректный номер телефона.");
  if (input.password.length < 8) throw new Error("Пароль должен содержать не менее 8 символов.");

  const accounts = readLocalAccounts();
  if (accounts.some((account) => digits(account.user.phone) === phoneDigits)) {
    throw new Error("Аккаунт с таким номером уже существует. Войдите или укажите другой номер.");
  }

  const salt = randomBytes(16);
  const passwordHash = await hashPassword(input.password, salt);
  const user: User = {
    id: Date.now(),
    user_id: `local-${randomBytes(8)}`,
    surname,
    firstName,
    ...(patronymic ? { patronymic } : {}),
    ...(email ? { email } : {}),
    name: [firstName, patronymic, surname].filter(Boolean).join(" ") || "Пользователь",
    phone,
    role: "tenant",
    rating: 5,
  };

  writeLocalAccounts([...accounts, { user, salt, passwordHash }]);
  return user;
}

export async function authenticateLocalAccount(phone: string, password: string): Promise<User | null> {
  const account = readLocalAccounts().find((item) => digits(item.user.phone) === digits(phone));
  if (!account) return null;
  const candidate = await hashPassword(password, account.salt);
  if (!constantTimeEqual(candidate, account.passwordHash)) throw new Error("Неверный телефон или пароль.");
  return { ...account.user };
}

export function hasLocalAccount(phone: string): boolean {
  return readLocalAccounts().some((item) => digits(item.user.phone) === digits(phone));
}

export function updateLocalProfile(user: User, input: {
  surname: string;
  firstName: string;
  patronymic: string;
  phone: string;
  email?: string;
}): User {
  const surname = input.surname.trim();
  const firstName = input.firstName.trim();
  const patronymic = input.patronymic.trim();
  const phone = input.phone.trim();
  const email = input.email?.trim().toLowerCase() ?? "";
  if (!surname || !firstName) throw new Error("Заполните фамилию и имя.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Укажите корректный адрес электронной почты.");
  if (digits(phone).length < 9) throw new Error("Введите корректный номер телефона.");

  const accounts = readLocalAccounts();
  const accountIndex = accounts.findIndex((item) => item.user.user_id === user.user_id);
  if (accountIndex < 0) throw new Error("Редактирование профиля доступно для локального аккаунта клиента.");
  if (accounts.some((item, index) => index !== accountIndex && digits(item.user.phone) === digits(phone))) {
    throw new Error("Аккаунт с таким номером телефона уже существует.");
  }

  const updated: User = {
    ...accounts[accountIndex].user,
    surname,
    firstName,
    ...(patronymic ? { patronymic } : { patronymic: undefined }),
    ...(email ? { email } : { email: null }),
    name: [firstName, patronymic, surname].filter(Boolean).join(" "),
    phone,
  };
  accounts[accountIndex] = { ...accounts[accountIndex], user: updated };
  writeLocalAccounts(accounts);
  return updated;
}

export function readLocalSession(): User | null {
  try {
    const value = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!value) return null;
    const user: unknown = JSON.parse(value);
    if (!user || typeof user !== "object") return null;
    const candidate = user as Partial<User>;
    if (typeof candidate.id !== "number" || typeof candidate.user_id !== "string" ||
      typeof candidate.phone !== "string" || typeof candidate.name !== "string" ||
      (candidate.role !== "tenant" && candidate.role !== "master")) return null;
    if (candidate.role === "tenant" && typeof candidate.user_id === "string" && candidate.user_id.startsWith("local-")) {
      const account = readLocalAccounts().find((item) => item.user.user_id === candidate.user_id);
      return account ? { ...account.user } : null;
    }
    return { ...candidate } as User;
  } catch {
    return null;
  }
}

export function saveLocalSession(user: User | null): void {
  try {
    if (user) localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    // The account remains usable for this tab when browser storage is unavailable.
  }
}

function readLocalAccounts(): LocalAccount[] {
  try {
    const value = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalAccount);
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: LocalAccount[]): void {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    throw new Error("Не удалось сохранить аккаунт в этом браузере. Проверьте доступное место и настройки хранения.");
  }
}

function isLocalAccount(value: unknown): value is LocalAccount {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LocalAccount>;
  return Boolean(item.user && typeof item.user.user_id === "string" && item.user.role === "tenant" &&
    typeof item.salt === "string" && typeof item.passwordHash === "string");
}

function randomBytes(length: number): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Безопасная регистрация недоступна в этом браузере.");
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, saltHex: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Для регистрации откройте сайт в безопасном браузере и повторите попытку.");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
