import { BELARUS_CITIES, cityDistricts, cityLabel, districtLabel } from "../lib/belarus";
import { useLanguage } from "../lib/i18n";

export function LocationFields({
  prefix, city, district, onCityChange, onDistrictChange,
  cities = BELARUS_CITIES, districts = cityDistricts(city), cityDisabled = false, required = false,
}: {
  prefix: string;
  city: string;
  district: string;
  onCityChange: (value: string) => void;
  onDistrictChange: (value: string) => void;
  cities?: readonly string[];
  districts?: readonly string[];
  cityDisabled?: boolean;
  required?: boolean;
}) {
  const { t, language } = useLanguage();
  return (
    <>
      <div className="min-w-0">
        <label htmlFor={`${prefix}-city`} className="mono-label block">{t("Город")}</label>
        <select id={`${prefix}-city`} className="field-box mt-1 w-full text-[13px]"
          value={city} disabled={cityDisabled} required={required}
          onChange={(event) => onCityChange(event.target.value)}>
          <option value="">{t(required ? "Выберите город" : "Все города")}</option>
          {cities.map((name) => <option key={name} value={name}>{cityLabel(name, language)}</option>)}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${prefix}-district`} className="mono-label block">{t("Район города")}</label>
        <select id={`${prefix}-district`} className="field-box mt-1 w-full text-[13px]"
          value={district} disabled={!city || districts.length === 0}
          onChange={(event) => onDistrictChange(event.target.value)}>
          <option value="">{t(!city ? "Сначала выберите город" : districts.length === 0 ? "Без деления на районы" : required ? "Не указан" : "Все районы")}</option>
          {districts.map((name) => <option key={name} value={name}>{districtLabel(name, language)}</option>)}
        </select>
      </div>
    </>
  );
}
