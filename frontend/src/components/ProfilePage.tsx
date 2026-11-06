import { useState, type FormEvent } from "react";
import { ArrowLeft, Check, UserRound } from "lucide-react";

import { useLanguage } from "../lib/i18n";
import { useApp } from "../state/AppState";

export function ProfilePage({ onBack }: { onBack: () => void }) {
  const { user, updateProfile } = useApp();
  const { t } = useLanguage();
  const [surname, setSurname] = useState(user?.surname ?? user?.name.split(" ").at(-1) ?? "");
  const [firstName, setFirstName] = useState(user?.firstName ?? user?.name.split(" ")[0] ?? "");
  const [patronymic, setPatronymic] = useState(user?.patronymic ?? user?.name.split(" ")[1] ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const error = await updateProfile({ surname, firstName, patronymic, phone });
    setMessage(error ?? t("Профиль сохранён на этом устройстве."));
    setSaved(!error);
  };

  return (
    <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12">
      <button type="button" onClick={onBack} className="archive-link inline-flex items-center gap-2 text-[13px]">
        <ArrowLeft className="size-4" /> {t("Вернуться в каталог")}
      </button>
      <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-20">
        <section>
          <span className="mono-label inline-flex items-center gap-2"><UserRound className="size-4" /> {t("Личный кабинет")}</span>
          <h1 className="mt-5 text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.05em]">{t("Ваш профиль")}</h1>
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
            {t("Проверьте контактные данные — они будут указаны в бронировании для связи и на вахте.")}
          </p>
          <div className="mt-8 border-t border-ink/15 pt-4">
            <p className="mono-label">{t("Аккаунт")}</p>
            <p className="mt-2 text-[14px]">{user?.name}</p>
            <p className="mt-1 font-mono text-[11px] text-ink-mute">{t("Данные хранятся только в этом браузере")}</p>
          </div>
        </section>

        <form className="max-w-[560px] space-y-5 border-t border-ink/15 pt-5" onSubmit={submit}>
          <ProfileField id="profile-surname" label={t("Фамилия")} value={surname} onChange={setSurname} autoComplete="family-name" />
          <ProfileField id="profile-first-name" label={t("Имя")} value={firstName} onChange={setFirstName} autoComplete="given-name" />
          <ProfileField id="profile-patronymic" label={t("Отчество")} value={patronymic} onChange={setPatronymic} autoComplete="additional-name" />
          <ProfileField id="profile-phone" label={t("Телефон")} value={phone} onChange={setPhone} autoComplete="tel" type="tel" />
          {message && <p role={saved ? "status" : "alert"} className={`text-[13px] ${saved ? "text-ok" : "text-orange"}`}>{message}</p>}
          <button type="submit" className="btn btn-primary h-12 w-full sm:w-auto sm:min-w-56">
            {saved ? <Check className="size-4" /> : null}{saved ? t("Сохранено") : t("Сохранить профиль")}
          </button>
          <p className="text-[12px] leading-relaxed text-ink-mute">{t("Пока аккаунт хранится только в этом браузере. Синхронизация с сервером появится позже.")}</p>
        </form>
      </div>
    </main>
  );
}

function ProfileField({
  id, label, value, onChange, autoComplete, type = "text",
}: {
  id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label mb-1 block">{label}</label>
      <input id={id} type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} required className="field" />
    </div>
  );
}
