import { useMemo, useState } from "react";
import { MapPin, Search } from "lucide-react";

import { SCHOOL_DIRECTORY } from "../lib/schools";
import { useLanguage } from "../lib/i18n";

export function SchoolDirectory() {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const { t } = useLanguage();
  const areas = useMemo(() => [...new Set(SCHOOL_DIRECTORY.map((school) =>
    school.region.startsWith("Минск ·") ? "Минск" : school.region,
  ))], []);
  const cities = useMemo(() => [...new Set(SCHOOL_DIRECTORY.filter((school) =>
    (school.region.startsWith("Минск ·") ? "Минск" : school.region) === area,
  ).map((school) => {
    if (school.region.startsWith("Минск ·")) return "Минск";
    return school.address.match(/(?:г\.|аг\.)\s*([^,]+)/)?.[1]?.trim() ?? "";
  }).filter(Boolean))], [area]);
  const matches = useMemo(() => SCHOOL_DIRECTORY.filter((school) => {
    const schoolArea = school.region.startsWith("Минск ·") ? "Минск" : school.region;
    const schoolCity = school.region.startsWith("Минск ·")
      ? "Минск"
      : school.address.match(/(?:г\.|аг\.)\s*([^,]+)/)?.[1]?.trim() ?? "";
    return schoolArea === area && schoolCity === city &&
      `${school.name} ${school.address}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }), [area, city, query]);
  const count = city
    ? matches.length
    : area
      ? SCHOOL_DIRECTORY.filter((school) => (school.region.startsWith("Минск ·") ? "Минск" : school.region) === area).length
      : SCHOOL_DIRECTORY.length;

  return (
    <section className="mt-12 border-t border-ink/20 pt-7" aria-labelledby="school-directory-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label">{t("30 учреждений · адреса из предоставленного списка")}</p>
          <h2 id="school-directory-title" className="mt-2 text-[clamp(1.65rem,3.4vw,2.4rem)] leading-tight tracking-[-0.035em]">{t("Учреждения образования")}</h2>
        </div>
        <span className="font-serif text-[28px] tabular-nums">{count}<span className="ml-2 font-sans text-[12px] text-ink-mute">{t("учреждений")}</span></span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)]">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
          <input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Найти учреждение или адрес в городе")} aria-label={t("Найти учреждение или адрес в городе")} disabled={!city} />
        </label>
        <label className="sr-only" htmlFor="school-area">{t("Область")}</label>
        <select id="school-area" className="field" value={area} onChange={(event) => { setArea(event.target.value); setCity(""); setQuery(""); }}>
          <option value="">{t("Выберите область")}</option>
          {areas.map((item) => <option key={item} value={item}>{t(item)}</option>)}
        </select>
        <label className="sr-only" htmlFor="school-city">{t("Город")}</label>
        <select id="school-city" className="field" value={city} disabled={!area} onChange={(event) => { setCity(event.target.value); setQuery(""); }}>
          <option value="">{t("Выберите город")}</option>
          {cities.map((item) => <option key={item} value={item}>{t(item)}</option>)}
        </select>
      </div>

      {city && <ul className="mt-4 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((school) => (
          <li key={`${school.region}-${school.name}-${school.address}`} className="min-w-0 border-t border-line py-3.5">
            <p className="truncate text-[14px] font-medium">{t(school.name)}</p>
            <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-soft">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-orange" aria-hidden="true" />
              <span>{school.address}</span>
            </p>
            <p className="mt-1 ml-5 text-[12px] text-ink-mute">{t(school.region)}</p>
          </li>
        ))}
      </ul>}
      {city && matches.length === 0 && <p className="border-t border-line py-8 text-[13px] text-ink-mute">{t("Под эти фильтры ничего нет")}</p>}
      <p className="mt-3 max-w-[70ch] text-[12px] leading-relaxed text-ink-mute">{t("Адреса из предоставленного списка")}</p>
    </section>
  );
}
