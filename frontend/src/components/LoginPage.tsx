import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Eye, EyeOff } from "lucide-react";

import { DEMO_PASSWORD, demoPhone } from "../lib/auth";
import { LISTINGS, ROOM_TYPES, ROOM_TYPE_LIST, SPACE_SHOWCASE, toISODate } from "../lib/data";
import { money } from "../lib/format";
import { ROLE_CAPTION, ROLE_LABEL } from "../lib/roles";
import type { Role } from "../lib/types";
import { freeHourCount, useApp } from "../state/AppState";
import { Logo } from "./Logo";
import { WeekAvailability } from "./WeekAvailability";
import { LanguageToggle, useLanguage } from "../lib/i18n";

const ROLE_CTA: Record<Role, string> = {
  tenant: "Войти как клиент",
  master: "Войти как УО",
};

const HERO_SPACES = ROOM_TYPE_LIST.flatMap((type) => {
  const listing = LISTINGS.find((item) => item.type === type);
  return listing ? [listing] : [];
});

export function LoginPage() {
  const { login, register, slots } = useApp();
  const { t } = useLanguage();
  const [role, setRole] = useState<Role>("tenant");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [surname, setSurname] = useState("");
  const [firstName, setFirstName] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [phone, setPhone] = useState(() => demoPhone("tenant"));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroSpace, setHeroSpace] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const swipedPhoto = useRef<{ x: number; y: number; at: number } | null>(null);

  const freeToday = freeHourCount(slots, toISODate(new Date()));

  const switchRole = (next: Role) => {
    setRole(next);
    setAuthMode("login");
    setPhone(demoPhone(next));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(authMode === "register"
      ? await register({ surname, firstName, patronymic, phone, password })
      : await login({ role, phone, password }));
  };

  return (
    <div id="top" className="overflow-x-clip">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex h-[88px] max-w-[1180px] items-center justify-between gap-2 px-3 sm:h-[104px] sm:gap-6 sm:px-8">
          <a href="#top" aria-label="Пляцоўка — наверх" className="shrink-0">
            <Logo size="compact" />
          </a>
          <div className="flex shrink-0 items-center gap-2 sm:gap-7">
            <LanguageToggle />
            <a
              href="#login"
              className="inline-flex shrink-0 items-center gap-1 border-b border-orange pb-0.5 text-[12px] font-medium transition-colors hover:text-orange sm:gap-1.5 sm:text-[13px]"
            >
              {t("Войти")}
              <ArrowUpRight className="size-3.5" strokeWidth={1.8} />
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <div className="grid gap-9 pt-8 pb-12 sm:pt-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-stretch lg:gap-12 lg:pt-14 lg:pb-16">
          <div className="flex min-w-0 flex-col">
            <h1 className="text-[clamp(2.3rem,6.2vw,5rem)] leading-[0.92] tracking-[-0.055em]">
              <span className="block">{t("После звонка")}</span>
              <span className="block">{t("школа не")}</span>
              <span className="block text-blue italic">{t("заканчивается.")}</span>
            </h1>

            <p className="mt-6 max-w-[46ch] text-[15.5px] leading-[1.65] text-ink-soft sm:text-[17px]">
              {t("Спортзалы, бассейны, актовые залы и кабинеты информатики сдаются после уроков. Для секций, репетиторов и всех, кому нужно место на час.")}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a href="#login" className="btn btn-primary h-12 px-6">
                {t("Войти и выбрать")}
              </a>
              <a href="#spaces" className="archive-link text-[13px] font-medium">
                {t("Посмотреть пространства")}
              </a>
            </div>

          </div>

          <figure className="group relative min-w-0 self-stretch" aria-label={t("Арендуемые пространства")} aria-roledescription={t("карусель пространств")}>
            <div className="photo-frame aspect-[4/5] h-full min-h-[440px] sm:aspect-[5/4] lg:aspect-auto lg:min-h-[560px]">
              <div
                className="hero-carousel-track"
                style={{ transform: `translateX(-${heroSpace * 100}%)` }}
                onPointerDown={(event) => { touchStartX.current = event.clientX; }}
                onPointerUp={(event) => {
                  if (touchStartX.current === null) return;
                  const delta = event.clientX - touchStartX.current;
                  touchStartX.current = null;
                  if (Math.abs(delta) < 44) return;
                  swipedPhoto.current = { x: event.clientX, y: event.clientY, at: Date.now() };
                  setHeroSpace((current) => (current + (delta < 0 ? 1 : -1) + HERO_SPACES.length) % HERO_SPACES.length);
                }}
                onPointerCancel={() => { touchStartX.current = null; }}
              >
                {HERO_SPACES.map((space, index) => (
                  <article className="hero-carousel-slide" key={space.id} aria-hidden={heroSpace !== index}>
                    <button
                      type="button"
                      className="absolute inset-0 z-0 h-full w-full cursor-pointer border-0 bg-transparent p-0 text-left"
                      onClick={(event) => {
                        const swipe = swipedPhoto.current;
                        swipedPhoto.current = null;
                        if (
                          swipe && event.detail > 0 && Date.now() - swipe.at < 300 &&
                          Math.hypot(event.clientX - swipe.x, event.clientY - swipe.y) < 32
                        ) {
                          event.preventDefault();
                          return;
                        }
                        setHeroSpace((current) => (current + 1) % HERO_SPACES.length);
                      }}
                      aria-label={t("Следующее пространство")}
                      tabIndex={heroSpace === index ? 0 : -1}
                    >
                      <img
                        src={space.image}
                        alt={`${space.room}, ${space.school}`}
                        fetchPriority={index === 0 ? "high" : undefined}
                        decoding={index === 0 ? "sync" : "async"}
                        draggable={false}
                      />
                    </button>
                    <span className="index-tag pointer-events-none">
                      {String(index + 1).padStart(2, "0")} / {t(ROOM_TYPES[space.type].short)}
                    </span>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-navy via-navy/65 to-transparent px-4 pt-16 pb-4 text-paper sm:px-5 sm:pb-5">
                      <div className="flex items-end justify-between gap-3 sm:gap-4">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] leading-snug tracking-[0.08em] text-paper/65 uppercase sm:text-[10.5px]">
                            {t(space.school)} / {t(space.uo.replace(/^УО\s+/, ""))}
                          </p>
                          <p className="mt-1 font-serif text-[23px] leading-tight tracking-[-0.02em]">
                            {t(space.room)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-serif text-[19px] leading-none font-medium tabular-nums">
                            {money(space.price)}
                          </p>
                          <p className="mt-1 text-[12px] text-paper/75">
                            {t("за час")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="absolute bottom-[116px] left-4 z-20 flex items-center gap-2 sm:bottom-[124px] sm:left-5" role="group" aria-label={t("Выбрать пространство")}>
                {HERO_SPACES.map((space, index) => (
                  <button
                    key={space.id}
                    type="button"
                    aria-label={`${t("Показать пространство")}: ${t(space.room)}`}
                    aria-pressed={heroSpace === index}
                    onClick={() => setHeroSpace(index)}
                    className={`hero-photo-dot ${heroSpace === index ? "is-active" : ""}`}
                  />
                ))}
              </div>
            </div>
            <figcaption className="absolute top-4 right-4 max-w-[190px] bg-orange px-3 py-2 text-white">
              <span className="block font-mono text-[9.5px] tracking-[0.1em] uppercase text-white/75">
                свободно сегодня
              </span>
              <span className="mt-1 block font-serif text-[17px] leading-none">
                {freeToday} ч
              </span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-y border-navy bg-navy text-paper">
        <div className="mx-auto grid max-w-[1180px] gap-9 px-5 py-12 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)] lg:items-end lg:gap-16">
          <div>
            <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] leading-[1.03] tracking-[-0.04em]">
              {t("Свободные часы")}
              <br />
              <span className="text-orange-soft italic">{t("для ваших занятий.")}</span>
            </h2>
            <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-paper/70">
              {t("Реальные свободные часы по дням недели с 14:00 до 21:00 — выбирайте время для занятий.")}
            </p>
          </div>
          <WeekAvailability />
        </div>
      </section>

      <section id="spaces" className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="text-[clamp(2rem,4vw,3.2rem)] leading-[1.02] tracking-[-0.045em]">
              {t("Что можно снять")}
            </h2>
          </div>
          <p className="max-w-[38ch] text-[14px] leading-relaxed text-ink-soft">
            {t("Фото, адрес, цена и вместимость помогут выбрать пространство до звонка.")}
          </p>
        </div>

        <div className="mt-8 grid auto-rows-[160px] grid-cols-2 gap-2 sm:auto-rows-[200px] sm:gap-3 lg:auto-rows-[210px] lg:grid-cols-12">
          {SPACE_SHOWCASE.map((space, index) => {
            const wide = index === 0;
            const placement = wide
              ? "col-span-2 row-span-2 lg:col-span-5"
              : index === 1
                ? "lg:col-span-4"
                : index === 2
                  ? "lg:col-span-3"
                  : index === 3
                    ? "lg:col-span-4"
                    : "lg:col-span-3";

            return (
              <a
                key={space.type}
                href="#login"
                className={`photo-link group relative min-h-0 overflow-hidden bg-navy ${placement}`}
                aria-label={`${space.title} — от ${ROOM_TYPES[space.type].price} BYN за час`}
              >
                <div className="photo-frame absolute inset-0">
                  <img
                    src={space.image}
                    alt={`${space.title}: интерьер пространства, доступного для аренды`}
                    decoding="async"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-navy/95 via-navy/25 to-navy/5" />
                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-paper/70 uppercase">
                    {String(index + 1).padStart(2, "0")} / 05
                  </span>
                  <ArrowUpRight
                    className="size-4 text-paper/60 transition-colors group-hover:text-orange"
                    strokeWidth={1.5}
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3 text-paper sm:p-4">
                  <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[18px] leading-tight tracking-[-0.02em] sm:text-[22px]">
                        {space.title}
                      </h3>
                      <p
                        className={`mt-1.5 max-w-[30ch] text-[12.5px] leading-snug text-paper/65 ${
                          index === 0 ? "" : "hidden sm:block"
                        }`}
                      >
                        {space.note}
                      </p>
                    </div>
                    <p className="shrink-0 font-serif text-[15px] font-medium tabular-nums text-orange-soft sm:text-[17px]">
                      {money(ROOM_TYPES[space.type].price)}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section id="login" className="border-b border-ink/15">
        <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-24">
            <div>
              <h2 className="text-[clamp(2.2rem,4.5vw,3.8rem)] leading-[1.02] tracking-[-0.04em]">
                {t("Клиент арендует.")}
                <br />
                <span className="text-blue italic">{t("УО сдаёт.")}</span>
              </h2>
              <p className="mt-6 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
                {t("Один вход для обеих сторон. Роль меняет только то, что вы видите после входа: каталог свободных часов или кабинет с пространствами и бронями.")}
              </p>

              <dl className="mt-8 grid max-w-[430px] grid-cols-2 gap-x-6 gap-y-5 border-t border-ink/20 pt-5 sm:grid-cols-3">
                <div>
                  <dt className="mono-label">Пароль</dt>
                  <dd className="mt-2 font-mono text-[13px]">{DEMO_PASSWORD}</dd>
                </div>
                <div>
                  <dt className="mono-label">Номер</dt>
                  <dd className="mt-2 text-[12.5px]">подставляется</dd>
                </div>
                <div>
                  <dt className="mono-label">Оплата</dt>
                  <dd className="mt-2 text-[12.5px]">демо</dd>
                </div>
              </dl>

              <p className="mt-8 max-w-[36ch] border-l-2 border-orange pl-4 font-serif text-[15px] leading-relaxed text-ink-soft italic">
                Демо-пароль для обеих ролей — {DEMO_PASSWORD}. Данные не покидают
                браузер.
              </p>
            </div>

            <div className="border border-ink/15 bg-surface p-5 sm:p-7">
              <div className="flex items-center justify-between border-b border-ink/15 pb-4">
                <span className="mono-label">{t("Выберите роль")}</span>
              </div>

              <div
                className="mt-4 grid grid-cols-2 border-b border-line"
                role="group"
                aria-label="Роль"
              >
                {(["tenant", "master"] as Role[]).map((item) => {
                  const active = role === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={active}
                      onClick={() => switchRole(item)}
                      className={`relative h-11 text-left text-[14px] font-medium transition-colors duration-150 ${
                        active ? "text-ink" : "text-ink-mute hover:text-ink"
                      }`}
                    >
                      {t(ROLE_LABEL[item])}
                      {active && (
                        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-orange" />
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
                {t(ROLE_CAPTION[role])}
              </p>

              {role === "tenant" && (
                <div className="mt-5 flex border-b border-line" role="group" aria-label={t("Действие с аккаунтом")}>
                  <button type="button" aria-pressed={authMode === "login"} onClick={() => { setAuthMode("login"); setError(null); }} className={`h-10 flex-1 border-b-2 text-left text-[13px] font-medium ${authMode === "login" ? "border-orange text-ink" : "border-transparent text-ink-mute"}`}>
                    {t("Войти")}
                  </button>
                  <button type="button" aria-pressed={authMode === "register"} onClick={() => { setAuthMode("register"); setError(null); }} className={`h-10 flex-1 border-b-2 text-left text-[13px] font-medium ${authMode === "register" ? "border-orange text-ink" : "border-transparent text-ink-mute"}`}>
                    {t("Создать аккаунт")}
                  </button>
                </div>
              )}

              <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
                {authMode === "register" && role === "tenant" && (
                  <>
                    <TextField id="register-surname" label={t("Фамилия")} value={surname} onChange={setSurname} autoComplete="family-name" />
                    <TextField id="register-first-name" label={t("Имя")} value={firstName} onChange={setFirstName} autoComplete="given-name" />
                    <TextField id="register-patronymic" label={t("Отчество")} value={patronymic} onChange={setPatronymic} autoComplete="additional-name" />
                  </>
                )}
                <div>
                  <label htmlFor="phone" className="label mb-1 block">
                    {t("Телефон")}
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      setError(null);
                    }}
                    placeholder="+375 (29) 123-45-67"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className="field"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="label mb-1 block">
                    {t("Пароль")}
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={authMode === "register" ? "new-password" : "current-password"}
                      minLength={authMode === "register" ? 8 : undefined}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError(null);
                      }}
                      placeholder="••••••••"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "login-error" : undefined}
                      className="field pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-0 bottom-2 grid size-8 place-items-center text-ink-mute transition-colors hover:text-ink"
                      aria-label={t(showPassword ? "Скрыть пароль" : "Показать пароль")}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" strokeWidth={1.8} />
                      ) : (
                        <Eye className="size-4" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    id="login-error"
                    role="alert"
                    className="text-[12.5px] leading-relaxed text-orange"
                  >
                    {error}
                  </p>
                )}

                <button type="submit" className="btn btn-primary mt-2 h-12 w-full">
                  {authMode === "register" ? t("Зарегистрироваться") : t(ROLE_CTA[role])}
                </button>
              </form>

              <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
                {t("Демо-режим: данные не отправляются на сервер, оплата имитируется.")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-mute">
            <span>{t("Минск · 2026 · демо")}</span>
            <a href="/guard" className="archive-link" aria-label={t("Открыть сканер для охраны")}>
              {t("Сканер")}
            </a>
            <a
              href="https://www.pexels.com"
              target="_blank"
              rel="noreferrer"
              className="archive-link"
            >
              фото — Pexels
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label mb-1 block">{label}</label>
      <input id={id} name={id} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className="field" required />
    </div>
  );
}
