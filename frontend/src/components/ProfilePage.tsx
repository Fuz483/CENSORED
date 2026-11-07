import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, UserRound } from "lucide-react";
import { useLanguage } from "../lib/i18n";
import { useApp } from "../state/AppState";

export function ProfilePage({ onBack }: { onBack: () => void }) {
  const { user, updateProfile } = useApp();
  const { t } = useLanguage();
  const initialName = profileNameParts(user);
  const [surname, setSurname] = useState(initialName.surname);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [patronymic, setPatronymic] = useState(initialName.patronymic);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const name = profileNameParts(user);
    setSurname(name.surname);
    setFirstName(name.firstName);
    setPatronymic(name.patronymic);
    setPhone(user.phone);
    setEmail(user.email ?? "");
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateProfile({ surname, firstName, patronymic, phone, email });
      if (result) setError(result);
      else setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-shell min-h-[calc(100dvh-4rem)] py-8 sm:py-12">
      <button type="button" onClick={onBack} className="archive-link inline-flex items-center gap-2 text-[15px]">
        <ArrowLeft className="size-4" /> {t("Вернуться в каталог")}
      </button>
      <section className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div>
          <span className="mono-label inline-flex items-center gap-2"><UserRound className="size-4" /> {t("Личный кабинет")}</span>
          <h1 className="mt-5 text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.05em]">{t("Ваш профиль")}</h1>
          <p className="mt-5 max-w-[42ch] text-[14px] leading-relaxed text-ink-soft">{t("Проверьте контактные данные — они будут указаны в бронировании для связи и на вахте.")}</p>
          <div className="mt-8 border-t border-line pt-5">
            <span className="label">{t("Аккаунт")}</span>
            <p className="mt-2 text-[14px]">{user?.name}</p>
            <p className="mt-1 font-mono text-[13px] text-ink-mute">{t(user?.role === "master" ? "Кабинет УО" : "Арендатор")}</p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-ink/15 bg-surface p-5 sm:p-8">
          <div className="border-b border-line pb-4">
            <span className="mono-label">{t("Контактные данные")}</span>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{t("Изменения сохраняются в вашем аккаунте на сервере.")}</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ProfileField id="profile-surname" label={t("Фамилия")} value={surname} onChange={setSurname} autoComplete="family-name" required />
            <ProfileField id="profile-first-name" label={t("Имя")} value={firstName} onChange={setFirstName} autoComplete="given-name" required />
            <ProfileField id="profile-patronymic" label={`${t("Отчество")} · ${t("необязательно")} `} value={patronymic} onChange={setPatronymic} autoComplete="additional-name" />
            <ProfileField id="profile-email" label={`${t("Электронная почта")} · ${t("необязательно")} `} value={email} onChange={setEmail} autoComplete="email" type="email" />
            <div className="sm:col-span-2"><ProfileField id="profile-phone" label={t("Телефон")} value={phone} onChange={setPhone} autoComplete="tel" type="tel" required /></div>
          </div>
          {(error || saved) && <p role={error ? "alert" : "status"} className={`mt-5 text-[15px] ${error ? "text-orange" : "text-blue"}`}>{error ? t(error) : <span className="inline-flex items-center gap-1.5"><Check className="size-4" />{t("Профиль сохранён")}</span>}</p>}
          <button type="submit" disabled={saving} className="btn btn-primary mt-6 h-12 w-full sm:w-auto sm:min-w-[220px]">{saving ? t("Сохраняем…") : t("Сохранить профиль")}</button>
        </form>
      </section>
    </main>
  );
}

function profileNameParts(user: ReturnType<typeof useApp>["user"]): {
  surname: string;
  firstName: string;
  patronymic: string;
} {
  if (!user) return { surname: "", firstName: "", patronymic: "" };

  const hasStructuredName = user.surname !== undefined || user.firstName !== undefined || user.patronymic !== undefined;
  if (hasStructuredName || user.name === "Пользователь") {
    return {
      surname: user.surname ?? "",
      firstName: user.firstName ?? "",
      patronymic: user.patronymic ?? "",
    };
  }

  const legacyName = user.name.split(/\s+/);
  return {
    surname: legacyName[0] ?? "",
    firstName: legacyName[1] ?? "",
    patronymic: legacyName.slice(2).join(" "),
  };
}

function ProfileField({
  id, label, value, onChange, autoComplete, type = "text", required = false,
}: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  autoComplete: string; type?: string; required?: boolean;
}) {
  return <div>
    <label htmlFor={id} className="label mb-1 block">{label}</label>
    <input id={id} name={id} type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className="field" required={required} />
  </div>;
}
