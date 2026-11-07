import { ArrowLeft } from "lucide-react";
import { LanguageToggle, useLanguage } from "../lib/i18n";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const sections = [
  ["Что хранится", "Для аккаунта сохраняются имя, телефон и пароль в виде хеша. Электронная почта и отчество добавляются по желанию. В истории хранятся время, помещение и условия договора, которые вы приняли."],
  ["Кому видны данные", "Учреждение видит имя и телефон клиентов своих бронирований. Любой человек с копией действующего QR-кода может увидеть имя и телефон, указанные при оформлении брони, пока она действует. Камера проверяет QR в браузере и отправляет на сервер только код."],
  ["Хранение в браузере и внешние ссылки", "Сессия хранится в текущей вкладке. Язык и тема сохраняются в браузере. Часть фотографий загружается с Pexels. Ссылка в карточке помещения открывает Яндекс Карты с адресом учреждения."],
  ["Как получить или удалить данные", "В профиле можно исправить контакты, скачать копию своих данных или отправить запрос на удаление. Запрос сохраняется в демоверсии для проверки администратором. Данные хранятся до обработки запроса или очистки тестовой базы."],
] as const;

export function PrivacyPolicy() {
  const { t } = useLanguage();

  return (
    <main className="page-shell min-h-dvh py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <Logo size="compact" />
        <div className="flex items-center gap-2">
          <LanguageToggle compact />
          <ThemeToggle />
        </div>
      </div>
      <div className="mx-auto max-w-2xl py-8">
        <a href="/" className="archive-link inline-flex items-center gap-2 text-[15px]">
          <ArrowLeft className="size-4" aria-hidden="true" />{t("На главную")}
        </a>
        <h1 className="mt-5 text-3xl leading-tight sm:text-4xl">{t("Политика обработки персональных данных")}</h1>
        <p className="mt-4 leading-relaxed text-ink-soft">{t("Пляцоўка работает в деморежиме. Для проверки используйте вымышленные данные.")}</p>
        {sections.map(([title, copy]) => (
          <section key={title} className="mt-6 rounded-lg border border-line bg-surface p-4 sm:p-5">
            <h2 className="text-xl">{t(title)}</h2>
            <p className="mt-2 leading-relaxed text-ink-soft">{t(copy)}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
