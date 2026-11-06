import type { Role } from "./types";

/** UI names for the two roles. Backend values stay `tenant` / `master`. */
export const ROLE_LABEL: Record<Role, string> = {
  tenant: "Клиент",
  master: "УО",
};

export const ROLE_CAPTION: Record<Role, string> = {
  tenant: "Арендую пространство",
  master: "Сдаю пространство",
};
