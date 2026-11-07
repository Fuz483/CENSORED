import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, ScanLine, X } from "lucide-react";

import { ROOM_TYPE_LIST } from "../lib/data";
import { money } from "../lib/format";
import type { CaptchaChallenge, UoInstitution } from "../lib/repository";
import { useApp } from "../state/AppState";
import { useDialog } from "../hooks/useDialog";
import { ListingRow } from "./ListingRow";
import { Logo } from "./Logo";
import { SchoolDirectory } from "./SchoolDirectory";
import { ThemeToggle } from "./ThemeToggle";
import { WeekAvailability } from "./WeekAvailability";
import { LanguageToggle, useLanguage } from "../lib/i18n";

export function LoginPage() {
  const { login, listUoInstitutions, register, getCaptcha, listings } = useApp();
  const { t } = useLanguage();
  const HERO_SPACES = ROOM_TYPE_LIST.flatMap((type) => {
    const listing = listings.find((item) => item.type === type);
    return listing ? [listing] : [];
  });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authOpen, setAuthOpen] = useState(false);
  const [role, setRole] = useState<"tenant" | "master">("tenant");
  const [institutionId, setInstitutionId] = useState("");
  const [institutions, setInstitutions] = useState<UoInstitution[]>([]);
  const [institutionStatus, setInstitutionStatus] = useState<"loading" | "ready" | "error">("loading");
  const [institutionAttempt, setInstitutionAttempt] = useState(0);
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

  const registering = authOpen && authMode === "register" && role === "tenant";
  const schoolLogin = authOpen && role === "master";
  const authDialogRef = useDialog(() => setAuthOpen(false), { open: authOpen, closeOnEscape: !submitting });

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
    if (!schoolLogin) return;
    let active = true;
    setInstitutionStatus("loading");
    listUoInstitutions().then((available) => {
      if (!active) return;
      setInstitutions(available);
      setInstitutionId((selected) => available.some(({ id }) => id === selected) ? selected : "");
      setInstitutionStatus("ready");
    }).catch(() => {
      if (active) setInstitutionStatus("error");
    });
    return () => { active = false; };
  }, [institutionAttempt, listUoInstitutions, schoolLogin]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (registering && (!captcha || captchaAnswer.length !== 5)) return;
    if (schoolLogin && (institutionStatus !== "ready" || !institutionId)) return;
    setSubmitting(true);
    try {
      if (registering && captcha) {
        const failure = await register({
          surname, firstName, patronymic: "", email: "", phone, password, captchaId: captcha.id, captchaAnswer,
        });
        setError(failure);
        if (failure) refreshCaptcha();
      } else {
        setError(await login({ role, phone, password, institutionId: schoolLogin ? institutionId : undefined }));
      }
    } finally { setSubmitting(false); }
  };

  return (
    <div id="top" className="overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 backdrop-blur-sm">
        <div className="page-shell flex flex-wrap items-center gap-x-2 gap-y-2 py-2.5 min-[560px]:h-[88px] min-[560px]:flex-nowrap min-[560px]:py-0 sm:h-[104px] sm:gap-x-3 md:gap-x-6">
          <a href="#top" aria-label="Пляцоўка — наверх" className="mr-auto shrink-0">
            <Logo size="compact" />
          </a>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LanguageToggle compact />
            <ThemeToggle />
          </div>
          <div className="flex shrink-0 basis-full items-center justify-end gap-2 min-[560px]:basis-auto sm:gap-4">
            <button type="button" onClick={() => { setAuthMode("login"); setAuthOpen(true); setError(null); }} className="inline-flex min-h-10 shrink-0 items-center border-b border-orange px-1 text-[14px] font-medium transition-colors hover:text-orange sm:text-[15px]">{t("Войти")}</button>
            <button type="button" onClick={() => { refreshCaptcha(); setAuthMode("register"); setRole("tenant"); setAuthOpen(true); setError(null); }} className="btn btn-primary h-10 px-3 text-sm sm:px-4">{t("Зарегистрироваться")}</button>
          </div>
        </div>
      </header>

      <section className="page-shell">
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
              <a href="#spaces" className="archive-link text-[15px] font-medium">
                {t("Посмотреть пространства")}
              </a>
            </div>

          </div>

          <figure className="group relative min-w-0 self-stretch" aria-label={t("Арендуемые пространства")} aria-roledescription={t("карусель пространств")}>
            <div className="photo-frame aspect-[4/5] h-full min-h-[440px] w-full rounded-xl sm:aspect-[5/4] lg:aspect-auto lg:min-h-[560px]">
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
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-navy via-navy/65 to-transparent px-4 pt-16 pb-4 text-on-navy sm:px-5 sm:pb-5">
                      <div className="flex flex-col items-start gap-3 min-[360px]:flex-row min-[360px]:items-end min-[360px]:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <p className="font-mono text-[13px] leading-snug tracking-[0.08em] text-on-navy/65 uppercase sm:text-[14px]">
                            {[t(space.school), t(space.uo.replace(/^УО\s+/, ""))].filter(Boolean).join(" · ")}
                          </p>
                          <p className="mt-1 font-serif text-[23px] leading-tight tracking-[-0.02em]">
                            {t(space.room)}
                          </p>
                        </div>
                        <div className="shrink-0 min-[360px]:text-right">
                          <p className="font-serif text-[19px] leading-none font-medium tabular-nums">
                            {money(space.price)}
                          </p>
                          <p className="mt-1 text-[14px] text-on-navy/75">
                            {t("за час")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2" role="group" aria-label={t("Выбрать пространство")}>
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
          </figure>
        </div>
      </section>

      <section className="border-y border-navy bg-navy text-on-navy">
        <div className="page-shell grid gap-9 py-12 sm:py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)] lg:items-end lg:gap-16">
          <div>
            <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] leading-[1.03] tracking-[-0.04em]">
              {t("Свободные часы")}
              <br />
              <span className="text-on-navy-accent italic">{t("для ваших занятий.")}</span>
            </h2>
            <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-on-navy/70">
              {t("Посмотрите, в какие дни проще найти время для занятий.")}
            </p>
          </div>
          <WeekAvailability />
        </div>
      </section>

      <section id="spaces" className="page-shell scroll-mt-28 py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] leading-[1.02] tracking-[-0.045em]">
            {t("Что можно снять")}
          </h2>
          <p className="max-w-[38ch] text-[14px] leading-relaxed text-ink-soft">
            {t("Тестовый каталог. Фотографии и расписание приведены для демонстрации.")}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4">
          {HERO_SPACES.map((space) => <ListingRow key={space.id} listing={space} href="#login" />)}
        </div>
      </section>

      <section id="login" className="scroll-mt-28 border-b border-ink/15">
        <div className="page-shell py-10 sm:py-12 lg:py-14">
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
        <section ref={authDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="auth-title" className="auth-dialog relative w-full max-w-[560px] rounded-xl border border-ink/15 bg-paper shadow-2xl">
            <div className="auth-dialog-content">
              <div className="auth-dialog-header flex items-start justify-between gap-4 border-b border-line">
                <div><span className="mono-label">{t(role === "tenant" ? "Аккаунт арендатора" : "Кабинет УО")}</span><h2 id="auth-title" className="auth-dialog-title mt-1 font-serif leading-none tracking-[-0.04em]">{t(authMode === "register" ? "Создать аккаунт" : "Войти")}</h2></div>
                <button type="button" onClick={() => setAuthOpen(false)} disabled={submitting} className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-ink-mute transition-colors hover:border-ink hover:text-ink" aria-label={t("Закрыть")}><X className="size-4" /></button>
              </div>

              {authMode === "login" && <div className="auth-dialog-role grid grid-cols-2 gap-2" role="group" aria-label={t("Роль")}>
                {(["tenant", "master"] as const).map((item) => <button key={item} type="button" disabled={submitting} aria-pressed={role === item} onClick={() => { setRole(item); setAuthMode("login"); setPassword(""); setError(null); }} className={`btn h-11 ${role === item ? "border border-orange/45 bg-orange/10 text-ink" : "btn-quiet"}`}>{t(item === "tenant" ? "Арендатор" : "УО")}</button>)}
              </div>}
              <form className="auth-dialog-form" onSubmit={submit}>
                {schoolLogin && (
                  <div>
                    <label htmlFor="uo-institution" className="auth-dialog-label label block">{t("Учреждение")}</label>
                    <select id="uo-institution" className="field-box auth-dialog-field" value={institutionId} required
                      disabled={submitting || institutionStatus !== "ready" || institutions.length === 0}
                      onChange={(event) => { setInstitutionId(event.target.value); setPassword(""); setError(null); }}>
                      <option value="" disabled>{t("Выберите учреждение")}</option>
                      {institutions.map(({ id, name }) => <option key={id} value={id}>{t(name)}</option>)}
                    </select>
                    {institutionStatus === "loading" && <p role="status" className="mt-1.5 text-[14px] text-ink-soft">{t("Загружаем список учреждений…")}</p>}
                    {institutionStatus === "ready" && !institutions.length && <p role="status" className="mt-1.5 text-[14px] text-ink-soft">{t("Вход для УО сейчас недоступен.")}</p>}
                    {institutionStatus === "error" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px]">
                        <p role="alert" className="border-l-2 border-orange pl-2 text-ink">{t("Не удалось загрузить список учреждений.")}</p>
                        <button type="button" className="archive-link text-ink" onClick={() => setInstitutionAttempt((attempt) => attempt + 1)}>{t("Повторить")}</button>
                      </div>
                    )}
                  </div>
                )}
                {authMode === "register" && role === "tenant" && <>
                  <div><label htmlFor="surname" className="auth-dialog-label label block">{t("Фамилия")}</label><input id="surname" name="surname" type="text" required autoComplete="family-name" value={surname} onChange={(event) => { setSurname(event.target.value); setError(null); }} className="auth-dialog-field field" /></div>
                  <div><label htmlFor="first-name" className="auth-dialog-label label block">{t("Имя")}</label><input id="first-name" name="first_name" type="text" required autoComplete="given-name" value={firstName} onChange={(event) => { setFirstName(event.target.value); setError(null); }} className="auth-dialog-field field" /></div>
                </>}
                {role === "tenant" && <div><label htmlFor="phone" className="auth-dialog-label label block">{t("Телефон")}</label><input id="phone" name="phone" type="tel" required inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setError(null); }} placeholder="+375 (29) 123-45-67" aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} className="auth-dialog-field field" /></div>}
                <div><label htmlFor="password" className="auth-dialog-label label block">{t("Пароль")}</label><div className="relative"><input id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete={authMode === "register" ? "new-password" : "current-password"} minLength={authMode === "register" ? 8 : undefined} value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} placeholder="••••••••" aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} className="auth-dialog-field field pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 bottom-1 grid size-8 place-items-center text-ink-mute transition-colors hover:text-ink" aria-label={t(showPassword ? "Скрыть пароль" : "Показать пароль")}>{showPassword ? <EyeOff className="size-4" strokeWidth={1.8} /> : <Eye className="size-4" strokeWidth={1.8} />}</button></div>{authMode === "register" && role === "tenant" && <p className="mt-1 text-[14px] text-ink-mute">{t("Не менее 8 символов")}</p>}</div>
                {registering && (
                  <div>
                    <label htmlFor="captcha-answer" className="auth-dialog-label label block">{t("Введите пять цифр с картинки")}</label>
                    <div className="my-2 flex flex-wrap items-center gap-2">
                      {captcha ? <img src={captcha.image} width={172} height={56} className="rounded-lg" alt={t("Картинка с кодом проверки")} />
                        : <p role={captchaError ? "alert" : "status"} className="text-[14px] text-ink-soft">{t(captchaError ? "Не удалось загрузить капчу." : "Загружаем капчу…")}</p>}
                      <button type="button" onClick={refreshCaptcha} disabled={submitting} className="btn btn-quiet">{t("Новая картинка")}</button>
                    </div>
                    <input id="captcha-answer" required inputMode="numeric" autoComplete="off" maxLength={5} pattern="[0-9]{5}"
                      value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value.replace(/[^0-9]/g, ""))}
                      className="auth-dialog-field field" />
                  </div>
                )}
                {registering && (
                  <a href="/privacy" target="_blank" rel="noopener" className="archive-link text-sm">
                    {t("Политика обработки персональных данных")}
                  </a>
                )}
                {error && <p id="login-error" role="alert" className="border-l-2 border-orange pl-2 text-sm leading-relaxed text-ink">{t(error)}</p>}
                <button type="submit" disabled={submitting || (registering && !captcha) || (schoolLogin && (institutionStatus !== "ready" || !institutionId))} className="btn btn-primary h-11 w-full">{submitting ? t("Подождите…") : authMode === "register" ? t("Зарегистрироваться") : t("Войти")}</button>
              </form>
              {role === "tenant" && <p className="auth-dialog-footer text-[14px] text-ink-soft">
                {authMode === "register" ? t("Уже есть аккаунт?") : t("Нет аккаунта?")} {" "}
                <button type="button" disabled={submitting} onClick={() => { if (authMode === "login") refreshCaptcha(); setAuthMode(authMode === "register" ? "login" : "register"); setError(null); }} className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:text-orange">
                  {authMode === "register" ? t("Войти") : t("Зарегистрироваться")}
                </button>
              </p>}
            </div>
        </section>
      </div>}

      <div className="page-shell pb-8">
        <SchoolDirectory />
      </div>

      <footer className="page-shell py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <div className="flex flex-wrap items-center gap-4 font-mono text-[13px] tracking-[0.08em] uppercase text-ink-mute">
            <span>{t("Беларусь · 2026")}</span>
            <a href="/privacy" className="archive-link">{t("Конфиденциальность")}</a>
            <a href="/guard" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ink/20 px-2.5 font-sans text-[14px] font-semibold tracking-normal normal-case text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper">
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
