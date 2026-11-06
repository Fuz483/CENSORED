import { lazy, Suspense, useEffect, useState } from "react";

import { BookingsPage } from "./components/BookingsPage";
import { Header, type View } from "./components/Header";
import { LoginPage } from "./components/LoginPage";
import { SearchPage } from "./components/SearchPage";
import { UoDashboard } from "./components/UoDashboard";
import { ProfilePage } from "./components/ProfilePage";
import { AppProvider, useApp } from "./state/AppState";
import { LanguageProvider, type Language } from "./lib/i18n";

const GuardPage = lazy(() => import("./components/GuardPage").then(({ GuardPage }) => ({ default: GuardPage })));

function Root() {
  const { user, bookings, ready } = useApp();
  const [view, setView] = useState<View>("search");
  const isGuardRoute = window.location.pathname.replace(/\/+$/, "") === "/guard";
  const myBookingCount = user
    ? bookings.filter((booking) => booking.customerId === user.id).length
    : 0;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [user, view]);

  if (!ready) return <div className="min-h-dvh bg-paper" aria-label="Загрузка" />;
  if (isGuardRoute) return <Suspense fallback={<div className="min-h-dvh bg-navy" aria-label="Загрузка сканера" />}><GuardPage /></Suspense>;
  if (!user) return <LoginPage />;

  return (
    <div className="min-h-dvh">
      <Header view={view} onNavigate={setView} bookingCount={myBookingCount} />
      {user.role === "master" ? (
        <UoDashboard />
      ) : view === "profile" ? (
        <ProfilePage onBack={() => setView("search")} />
      ) : view === "search" ? (
        <SearchPage onGoToBookings={() => setView("bookings")} />
      ) : (
        <BookingsPage onSearch={() => setView("search")} />
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
