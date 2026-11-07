import { useState } from "react";
import { MapPin, School, Search } from "lucide-react";

import { SCHOOL_DIRECTORY } from "../lib/schools";
import { CITIES_BY_AREA, canonicalDistrict, cityFromAddress, districtLabel } from "../lib/belarus";
import { useLanguage } from "../lib/i18n";

import { LocationFields } from "./LocationFields";

const schools = SCHOOL_DIRECTORY.map((school) => {
  const inMinsk = school.region.startsWith("Минск ·");
  const city = inMinsk ? "Минск" : cityFromAddress(school.address);
  return {
    ...school,
    area: inMinsk ? "Минск" : school.region,
    city,
    district: canonicalDistrict(city, school.district ?? school.region.split(" · ")[1] ?? ""),
  };
});

export function SchoolDirectory() {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const { t, language } = useLanguage();
  const cities = (CITIES_BY_AREA[area] ?? []).map(([name]) => name).sort((a, b) => a.localeCompare(b, "ru"));
  const search = query.trim().toLocaleLowerCase();
  const matches = schools.filter((school) =>
    (!area || school.area.replaceAll("ё", "е") === area.replaceAll("ё", "е")) && (!city || school.city === city) &&
    (!district || school.district === district) &&
    `${school.name} ${school.address}`.toLocaleLowerCase().includes(search),
  );

  return (
    <section className="mt-12 border-t border-ink/20 pt-7" aria-labelledby="school-directory-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label">{t("30 учреждений · адреса из предоставленного списка")}</p>
          <h2 id="school-directory-title" className="mt-2 text-[clamp(1.65rem,3.4vw,2.4rem)] leading-tight tracking-[-0.035em]">{t("Учреждения образования")}</h2>
        </div>
        <span className="font-serif text-[28px] tabular-nums">{matches.length}<span className="ml-2 font-sans text-[14px] text-ink-mute">{t("учреждений")}</span></span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))] lg:items-end">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
          <input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Найти учреждение или адрес в городе")} aria-label={t("Найти учреждение или адрес в городе")} disabled={!city} />
        </label>
        <label className="sr-only" htmlFor="school-area">{t("Область")}</label>
        <select id="school-area" className="field" value={area} onChange={(event) => { setArea(event.target.value); setCity(""); setDistrict(""); setQuery(""); }}>
          <option value="">{t("Выберите область")}</option>
          {Object.keys(CITIES_BY_AREA).map((item) => <option key={item} value={item}>{t(item)}</option>)}
        </select>
        <LocationFields prefix="directory" city={city} district={district} cities={cities} cityDisabled={!area}
          onCityChange={(value) => { setCity(value); setDistrict(""); setQuery(""); }} onDistrictChange={setDistrict} />
      </div>

      {city && matches.length > 0 && <ul role="list" className="mt-4 grid grid-cols-1 gap-3">
        {matches.map((school) => (
          <li
            key={`${school.region}-${school.name}-${school.address}`}
            className="space-card flex min-w-0 items-start gap-3 p-4 sm:items-center sm:gap-4 sm:p-5"
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky-soft/65 text-blue-deep sm:size-12" aria-hidden="true">
              <School className="size-5 sm:size-6" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h3 className="space-card-title wrap-break-word">{t(school.name)}</h3>
              <p className="mt-1.5 flex items-start gap-1.5 text-base leading-snug text-ink-soft">
                <MapPin className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />
                <span className="min-w-0 wrap-break-word">{school.address}</span>
              </p>
              <p className="mt-1 wrap-break-word text-sm leading-snug text-ink-mute">
                {t(school.region)}{school.district && !school.region.startsWith("Минск ·") ? ` · ${districtLabel(school.district, language)}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>}
      {city && matches.length === 0 && <p className="space-card mt-4 p-4 text-base text-ink-soft sm:p-5">{t("Под эти фильтры ничего нет")}</p>}
      <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-ink-mute">{t("Адреса из предоставленного списка")}</p>
    </section>
  );
}
