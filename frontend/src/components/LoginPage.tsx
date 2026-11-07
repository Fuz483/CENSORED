import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Eye, EyeOff, ScanLine, X } from "lucide-react";

import { ROOM_TYPES, ROOM_TYPE_LIST, toISODate } from "../lib/data";
import { money } from "../lib/format";
import type { CaptchaChallenge } from "../lib/repository";
import { freeHourCount, useApp } from "../state/AppState";
import { Logo } from "./Logo";
import { SchoolDirectory } from "./SchoolDirectory";
import { WeekAvailability } from "./WeekAvailability";
import { LanguageToggle, useLanguage } from "../lib/i18n";

export function LoginPage() {
  const { login, register, getCaptcha, slots, listings, loadError } = useApp();
  const { t } = useLanguage();
  const HERO_SPACES = ROOM_TYPE_LIST.flatMap((type) => {
    const listing = listings.find((item) => item.type === type);
    return listing ? [listing] : [];
  });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authOpen, setAuthOpen] = useState(false);
  const [role, setRole] = useState<"tenant" | "master">("tenant");
  const [surname, setSurname] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [heroSpace, setHeroSpace] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const swipedPhoto = useRef<{ x: number; y: number; at: number } | null>(null);

  const freeToday = freeHourCount(slots, toISODate(new Date()));
  const registering = authOpen && authMode === "register" && role === "tenant";

  const refreshCaptcha = () => {
    setCaptcha(null);
    setCaptchaAnswer("");
    setCaptchaError(false);
    setCaptchaAttempt((attempt) => attempt + 1);
  };

  useEffect(() => {
    if (!registering) return;
    let active = true;
    getCaptcha().then((challenge) => {
      if (active) setCaptcha(challenge);
    }).catch(() => {
      if (active) setCaptchaError(true);
    });
    return () => { active = false; };
  }, [captchaAttempt, getCaptcha, registering]);

  useEffect(() => {
    if (!authOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setAuthOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authOpen, submitting]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (registering && (!captcha || captchaAnswer.length !== 5)) return;
    setSubmitting(true);
    try {
      if (registering && captcha) {
        const failure = await register({
          surname, firstName, patronymic: "", email: "", phone, password, captchaId: captcha.id, captchaAnswer,
        });
        setError(failure);
        if (failure) refreshCaptcha();
      } else {
        setError(await login({ role, phone, password }));
      }
    } finally { setSubmitting(false); }
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
            <button type="button" onClick={() => { setAuthMode("login"); setAuthOpen(true); setError(null); }} className="inline-flex min-h-10 shrink-0 items-center border-b border-orange px-1 text-[12px] font-medium transition-colors hover:text-orange sm:text-[13px]">{t("Войти")}</button>
            <button type="button" onClick={() => { refreshCaptcha(); setAuthMode("register"); setRole("tenant"); setAuthOpen(true); setError(null); }} className="btn btn-primary h-10 px-3 text-[11px] sm:px-4 sm:text-[12px]">{t("Зарегистрироваться")}</button>
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
              <button type="button" onClick={() => { setAuthMode("login"); setAuthOpen(true); setError(null); }} className="btn btn-primary h-12 px-6">{t("Войти и выбрать")}</button>
              <a href="#spaces" className="archive-link text-[13px] font-medium">
                {t("Посмотреть пространства")}
              </a>
            </div>

          </div>

          <figure className="group relative min-w-0 self-stretch" aria-label={t("Арендуемые пространства")} aria-roledescription={t("карусель пространств")}>
            <div className="photo-frame aspect-[4/5] h-full min-h-[440px] sm:aspect-[5/4] lg:aspect-auto lg:min-h-[560px]">
              {HERO_SPACES.length === 0 && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-ink-soft">{t("Нет данных")}</div>}
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
                  {t("свободно сегодня")}
              </span>
              <span className="mt-1 block font-serif text-[17px] leading-none">
                  {loadError ? t("Нет данных") : `${freeToday} ${t("ч")}`}
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
            {t("Каталог получен от сервера. Фотографии и точные адреса пока не предоставлены.")}
          </p>
        </div>

        <div className="mt-8 grid auto-rows-[160px] grid-cols-2 gap-2 sm:auto-rows-[200px] sm:gap-3 lg:auto-rows-[210px] lg:grid-cols-12">
          {HERO_SPACES.map((space, index) => {
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
                key={space.id}
                href="#login"
                className={`photo-link group relative min-h-0 overflow-hidden bg-navy ${placement}`}
                aria-label={`${space.room} — ${money(space.price)}`}
              >
                <div className="photo-frame absolute inset-0">
                  <img
                    src={space.image}
                    alt=""
                    decoding="async"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-navy/95 via-navy/25 to-navy/5" />
                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-paper/70 uppercase">
                    {String(index + 1).padStart(2, "0")} / {String(HERO_SPACES.length).padStart(2, "0")}
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
                        {t(ROOM_TYPES[space.type].label)}
                      </h3>
                      <p
                        className={`mt-1.5 max-w-[30ch] text-[12.5px] leading-snug text-paper/65 ${
                          index === 0 ? "" : "hidden sm:block"
                        }`}
                      >
                        {space.school} · {space.room}
                      </p>
                    </div>
                    <p className="shrink-0 font-serif text-[15px] font-medium tabular-nums text-orange-soft sm:text-[17px]">
                      {money(space.price)}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section id="login" className="border-b border-ink/15">
        <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 sm:py-12 lg:py-14">
          <div className="flex flex-col items-start gap-5">
            <div className="max-w-[700px]">
              <h2 className="text-[clamp(2.2rem,4.5vw,3.8rem)] leading-[1.02] tracking-[-0.04em]">
                {t("Клиент арендует —")}
                <br />
                <span className="text-blue italic">{t("школа оживает после звонка.")}</span>
              </h2>
              <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-ink-soft">{t("Создайте аккаунт арендатора, выберите помещение и время с шагом 15 минут.")}</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={() => { setAuthMode("login"); setAuthOpen(true); setError(null); }} className="btn btn-quiet h-12 px-6">{t("Войти")}</button>
              <button type="button" onClick={() => { refreshCaptcha(); setAuthMode("register"); setRole("tenant"); setAuthOpen(true); setError(null); }} className="btn btn-primary h-12 px-6">{t("Зарегистрироваться")}</button>
            </div>
          </div>
        </div>
      </section>

      {authOpen && <div className="overlay-in fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-navy/65 p-2 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setAuthOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="auth-dialog relative w-full max-w-[560px] border border-ink/15 bg-paper shadow-2xl">
            <div className="auth-dialog-content">
              <div className="auth-dialog-header flex items-start justify-between gap-4 border-b border-line">
                <div><span className="mono-label">{t(role === "tenant" ? "Аккаунт арендатора" : "Кабинет УО")}</span><h2 id="auth-title" className="auth-dialog-title mt-1 font-serif leading-none tracking-[-0.04em]">{t(authMode === "register" ? "Создать аккаунт" : "Войти")}</h2></div>
                <button type="button" onClick={() => setAuthOpen(false)} disabled={submitting} className="grid size-10 shrink-0 place-items-center border border-line text-ink-mute transition-colors hover:border-ink hover:text-ink" aria-label={t("Закрыть")}><X className="size-4" /></button>
              </div>

              {authMode === "login" && <div className="auth-dialog-role grid grid-cols-2 gap-2" role="group" aria-label={t("Роль")}>
                {(["tenant", "master"] as const).map((item) => <button key={item} type="button" disabled={submitting} aria-pressed={role === item} onClick={() => { setRole(item); setAuthMode("login"); setPassword(""); setError(null); }} className={`btn h-11 ${role === item ? "border border-orange/45 bg-orange/10 text-ink" : "btn-quiet"}`}>{t(item === "tenant" ? "Арендатор" : "УО")}</button>)}
              </div>}
              {role === "master" && <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{t("Лицей БГУ")} · {t("Введите пароль, выданный администратором.")}</p>}

              <form className="auth-dialog-form" onSubmit={submit}>
                {authMode === "register" && role === "tenant" && <>
                  <div><label htmlFor="surname" className="auth-dialog-label label block">{t("Фамилия")}</label><input id="surname" name="surname" type="text" required autoComplete="family-name" value={surname} onChange={(event) => { setSurname(event.target.value); setError(null); }} className="auth-dialog-field field" /></div>
                  <div><label htmlFor="first-name" className="auth-dialog-label label block">{t("Имя")}</label><input id="first-name" name="first_name" type="text" required autoComplete="given-name" value={firstName} onChange={(event) => { setFirstName(event.target.value); setError(null); }} className="auth-dialog-field field" /></div>
                </>}
                {role === "tenant" && <div><label htmlFor="phone" className="auth-dialog-label label block">{t("Телефон")}</label><input id="phone" name="phone" type="tel" required inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setError(null); }} placeholder="+375 (29) 123-45-67" aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} className="auth-dialog-field field" /></div>}
                <div><label htmlFor="password" className="auth-dialog-label label block">{t("Пароль")}</label><div className="relative"><input id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete={authMode === "register" ? "new-password" : "current-password"} minLength={authMode === "register" ? 8 : undefined} value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} placeholder="••••••••" aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} className="auth-dialog-field field pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 bottom-1 grid size-8 place-items-center text-ink-mute transition-colors hover:text-ink" aria-label={t(showPassword ? "Скрыть пароль" : "Показать пароль")}>{showPassword ? <EyeOff className="size-4" strokeWidth={1.8} /> : <Eye className="size-4" strokeWidth={1.8} />}</button></div>{authMode === "register" && role === "tenant" && <p className="mt-1 text-[11px] text-ink-mute">{t("Не менее 8 символов")}</p>}</div>
                {registering && (
                  <div>
                    <label htmlFor="captcha-answer" className="auth-dialog-label label block">{t("Введите пять цифр с картинки")}</label>
                    <div className="my-2 flex flex-wrap items-center gap-2">
                      {captcha ? <img src={captcha.image} width={172} height={56} alt={t("Картинка с кодом проверки")} />
                        : <p role={captchaError ? "alert" : "status"} className="text-[12px] text-ink-soft">{t(captchaError ? "Не удалось загрузить капчу." : "Загружаем капчу…")}</p>}
                      <button type="button" onClick={refreshCaptcha} disabled={submitting} className="btn btn-quiet">{t("Новая картинка")}</button>
                    </div>
                    <input id="captcha-answer" required inputMode="numeric" autoComplete="off" maxLength={5} pattern="[0-9]{5}"
                      value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value.replace(/[^0-9]/g, ""))}
                      className="auth-dialog-field field" />
                  </div>
                )}
                {error && <p id="login-error" role="alert" className="text-[12.5px] leading-relaxed text-orange">{t(error)}</p>}
                <button type="submit" disabled={submitting || (registering && !captcha)} className="btn btn-primary h-11 w-full">{submitting ? t("Подождите…") : authMode === "register" ? t("Зарегистрироваться") : t("Войти")}</button>
              </form>
              {role === "tenant" && <p className="auth-dialog-footer text-[12px] text-ink-soft">
                {authMode === "register" ? t("Уже есть аккаунт?") : t("Нет аккаунта?")} {" "}
                <button type="button" disabled={submitting} onClick={() => { if (authMode === "login") refreshCaptcha(); setAuthMode(authMode === "register" ? "login" : "register"); setError(null); }} className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:text-orange">
                  {authMode === "register" ? t("Войти") : t("Зарегистрироваться")}
                </button>
              </p>}
            </div>
        </section>
      </div>}

      <div className="mx-auto max-w-[1180px] px-5 pb-8 sm:px-8">
        <SchoolDirectory />
      </div>

      <footer className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-mute">
            <span>{t("Беларусь · 2026")}</span>
            <a href="/guard" className="inline-flex min-h-9 items-center gap-1.5 border border-ink/20 px-2.5 font-sans text-[11px] font-semibold tracking-normal normal-case text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper">
              <ScanLine className="size-3.5" aria-hidden="true" />
              {t("Перейти к сканеру")}
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
