import { useEffect, useId, useState } from "react";

import { useLanguage } from "../lib/i18n";
import type { CustomerSuggestion } from "../lib/types";
import { useApp } from "../state/AppState";

export function CustomerPhoneField({ value, onChange, required = false }: {
  value: string;
  onChange: (phone: string, customerId?: string) => void;
  required?: boolean;
}) {
  const { searchCustomers } = useApp();
  const { t } = useLanguage();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState<CustomerSuggestion>();
  const [matches, setMatches] = useState<{ query: string; items: CustomerSuggestion[] }>();

  useEffect(() => {
    if (!focused || value === picked?.phone || value.replace(/\D/g, "").length < 6) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      void searchCustomers(value).then((items) => {
        if (active) setMatches({ query: value, items });
      }).catch(() => {
        if (active) setMatches({ query: value, items: [] });
      });
    }, 220);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [focused, picked, searchCustomers, value]);

  const items = focused && value !== picked?.phone && matches?.query === value ? matches.items : [];
  return (
    <div className="min-w-[180px] flex-1" onFocus={() => setFocused(true)} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }}>
      <label htmlFor={id} className="label">{t("Телефон зарегистрированного клиента")}{required ? "" : ` · ${t("необязательно")}`}</label>
      <input id={id} className="field-box mt-1" type="tel" autoComplete="off" minLength={7} maxLength={32}
        value={value} onChange={(event) => { setPicked(undefined); onChange(event.target.value); }} required={required}
        placeholder="+375291234567" />
      {picked && picked.phone === value && <p className="mt-1 text-[14px] text-ink-soft">{picked.name}</p>}
      {items.length > 0 && (
        <ul aria-label={t("Найденные арендаторы")} className="mt-1 divide-y divide-line rounded-lg border border-line bg-paper">
          {items.map((item) => (
            <li key={item.user_id} className="first:rounded-t-lg last:rounded-b-lg">
              <button type="button" className="flex min-h-10 w-full flex-wrap justify-between gap-x-2 gap-y-1 rounded-[inherit] px-3 py-2 text-left text-[14px] hover:bg-paper-2"
                onClick={() => { setPicked(item); onChange(item.phone, item.user_id); }}>
                <span>{item.name}</span><span className="font-mono">{item.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
