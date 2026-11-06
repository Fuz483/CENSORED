import { ArrowLeft, UserRound } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { useApp } from "../state/AppState";

export function ProfilePage({ onBack }: { onBack: () => void }) {
  const { user } = useApp();
  const { t } = useLanguage();
  return (
    <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12">
      <button type="button" onClick={onBack} className="archive-link inline-flex items-center gap-2 text-[13px]">
        <ArrowLeft className="size-4" /> {t("Вернуться в каталог")}
      </button>
      <section className="mt-9 max-w-[560px]">
        <span className="mono-label inline-flex items-center gap-2"><UserRound className="size-4" /> {t("Личный кабинет")}</span>
        <h1 className="mt-5 text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.05em]">{t("Ваш профиль")}</h1>
        <dl className="mt-8 space-y-5 border-t border-line pt-5">
          <div><dt className="label">{t("Имя")}</dt><dd className="mt-2">{user?.name}</dd></div>
          <div><dt className="label">{t("Телефон")}</dt><dd className="mt-2">{user?.phone}</dd></div>
        </dl>
        <p className="mt-6 text-[13px] text-ink-soft">{t("Данные получены с сервера. Изменение профиля пока недоступно.")}</p>
      </section>
    </main>
  );
}
