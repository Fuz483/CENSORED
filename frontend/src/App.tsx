import { lazy, Suspense, useEffect, useState } from "react";

import { BookingsPage } from "./components/BookingsPage";
import { Header, type View } from "./components/Header";
import { LoginPage } from "./components/LoginPage";
import { SearchPage } from "./components/SearchPage";
import { UoDashboard } from "./components/UoDashboard";
import { ProfilePage } from "./components/ProfilePage";
import { AppProvider, useApp } from "./state/AppState";
import { LanguageProvider, useLanguage, type Language } from "./lib/i18n";

const GuardPage = lazy(() => import("./components/GuardPage").then(({ GuardPage }) => ({ default: GuardPage })));

const viewHash: Record<View, string> = { search: "", bookings: "#bookings", profile: "#profile" };

function viewFromLocation(): View {
  if (window.location.hash === viewHash.bookings) return "bookings";
  if (window.location.hash === viewHash.profile) return "profile";
  return "search";
}

function Root() {
  const { user, bookings, ready, loadError, reload } = useApp();
  const { t } = useLanguage();
  const [view, setView] = useState(viewFromLocation);
  const isGuardRoute = window.location.pathname.replace(/\/+$/, "") === "/guard";
  const myBookingCount = user
    ? bookings.filter((booking) => booking.customerId === user.id).length
    : 0;

  useEffect(() => {
    const syncView = () => setView(viewFromLocation());
    window.addEventListener("popstate", syncView);
    window.addEventListener("hashchange", syncView);
    return () => {
      window.removeEventListener("popstate", syncView);
      window.removeEventListener("hashchange", syncView);
    };
  }, []);

  useEffect(() => {
    if (user || !window.location.hash) window.scrollTo(0, 0);
  }, [user, view]);

  function navigate(nextView: View) {
    const hash = viewHash[nextView];
    if (window.location.hash !== hash) {
      const { pathname, search } = window.location;
      window.history.pushState(null, "", `${pathname}${search}${hash}`);
    }
    setView(nextView);
  }

  if (isGuardRoute) {
    return (
      <div data-theme="dark" className="min-h-dvh bg-paper text-ink">
        <Suspense fallback={<div className="min-h-dvh" aria-label="Загрузка сканера" />}>
          <GuardPage />
        </Suspense>
      </div>
    );
  }
  if (!ready) return <div className="min-h-dvh bg-paper" aria-label="Загрузка" />;
  const errorBanner = loadError && <div role="alert" className="border-b border-orange/30 bg-orange-soft px-5 py-3 text-[14px] text-ink">
    {t(loadError)} <button type="button" onClick={() => void reload()} className="ml-3 underline">{t("Повторить")}</button>
  </div>;
  if (!user) return <>{errorBanner}<LoginPage /></>;

  return (
    <div className="min-h-dvh">
      {errorBanner}
      <Header view={view} onNavigate={navigate} bookingCount={myBookingCount} />
      {user.role === "master" ? (
        <UoDashboard />
      ) : view === "profile" ? (
        <ProfilePage onBack={() => navigate("search")} />
      ) : view === "search" ? (
        <SearchPage onGoToBookings={() => navigate("bookings")} />
      ) : (
        <BookingsPage onSearch={() => navigate("search")} />
      )}
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem("plyacouka-language") === "be" ? "be" : "ru";
    } catch {
      return "ru";
    }
  });

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === "be" ? "Пляцоўка — школа пасля званка" : "Пляцоўка — школа после звонка";
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute("content", language === "be"
      ? "Пляцоўка — арэнда школьных памяшканняў па ўсёй Беларусі. Спартыўныя і актавыя залы, басейны і кабінеты пасля ўрокаў."
      : "Пляцоўка — аренда школьных пространств по всей Беларуси. Спортзалы, бассейны, актовые залы и классы после уроков.");
    try { localStorage.setItem("plyacouka-language", language); } catch { /* storage may be disabled */ }
  }, [language]);

  return (
    <LanguageProvider value={{ language, setLanguage }}>
      <AppProvider>
        <Root />
      </AppProvider>
    </LanguageProvider>
  );
}
