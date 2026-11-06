import type { ChangeEvent, ReactNode } from "react";
import { Search, X } from "lucide-react";

import { ROOM_TYPE_LIST, ROOM_TYPES } from "../lib/data";
import type { Filters } from "../lib/types";
import { useLanguage } from "../lib/i18n";

interface ControlProps {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  idPrefix?: string;
}

interface FiltersProps extends ControlProps {
  onReset: () => void;
  schools: string[];
}

const TIME_RANGES = [
  { value: "any", label: "Любое время", from: 14, to: 21 },
  { value: "14-17", label: "14:00–17:00", from: 14, to: 17 },
  { value: "16-19", label: "16:00–19:00", from: 16, to: 19 },
  { value: "18-21", label: "18:00–21:00", from: 18, to: 21 },
];

export function activeFilterCount(filters: Filters): number {
  return (
    (filters.school ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.from !== 14 || filters.to !== 21 ? 1 : 0)
  );
}

export function FiltersBar({ filters, onChange, onReset, schools }: FiltersProps) {
  const { t } = useLanguage();
  const active = activeFilterCount(filters) > 0;

  return (
    <div className="hidden items-end gap-8 border-y border-ink/15 py-3 lg:flex">
      <SchoolSelect filters={filters} onChange={onChange} schools={schools} className="w-[220px]" />
      <TypeSelect filters={filters} onChange={onChange} className="w-[190px]" />
      <TimeSelect filters={filters} onChange={onChange} className="w-[160px]" />

      <button
        type="button"
        onClick={onReset}
        disabled={!active}
        className="ml-auto pb-1.5 text-[13px] text-ink-mute underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-orange disabled:invisible"
      >
        {t("Сбросить")}
      </button>
    </div>
  );
}

export function FiltersSheet({
  open,
  onClose,
  resultCount,
  schools,
  ...props
}: FiltersProps & { open: boolean; onClose: () => void; resultCount: number }) {
  const { t } = useLanguage();
  if (!open) return null;

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end bg-navy/45 lg:hidden"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Фильтры")}
        className="sheet-in max-h-[92dvh] w-full overflow-y-auto rounded-t-[10px] bg-paper p-5 pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] tracking-[-0.02em]">{t("Фильтры")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Закрыть")}
            className="grid size-8 place-items-center text-ink-mute transition-colors hover:text-ink"
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <SchoolSelect filters={props.filters} onChange={props.onChange} schools={schools} idPrefix="sheet-" />
          <TypeSelect filters={props.filters} onChange={props.onChange} idPrefix="sheet-" />
          <TimeSelect filters={props.filters} onChange={props.onChange} idPrefix="sheet-" />
        </div>

        <div className="mt-7 flex items-center gap-5 border-t border-line pt-4">
          <button
            type="button"
            onClick={props.onReset}
            className="text-[13px] text-ink-mute underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            {t("Сбросить")}
          </button>
          <button type="button" onClick={onClose} className="btn btn-primary ml-auto h-11 px-4">
            {t("Показать ")}{resultCount}
          </button>
        </div>
      </div>
    </div>
  );
}

function SchoolSelect({
  filters,
  onChange,
  schools,
  idPrefix = "",
  className = "",
}: ControlProps & { schools: string[]; className?: string }) {
  const { t } = useLanguage();
  const id = `${idPrefix}school-search`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mono-label block">{t("Школа")}</label>
      <div className="relative mt-1">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-mute" />
        <input
          id={id}
          type="search"
          list={`${id}-options`}
          value={filters.school}
          onChange={(event) => onChange({ school: event.target.value })}
          placeholder={t("Все школы")}
          autoComplete="off"
          className="field-box h-[38px] w-full pl-8 text-[13px]"
        />
        <datalist id={`${id}-options`}>
          {schools.map((school) => <option key={school} value={school} />)}
        </datalist>
      </div>
    </div>
  );
}

function TypeSelect({
  filters,
  onChange,
  idPrefix = "",
  className = "",
}: ControlProps & { className?: string }) {
  const { t } = useLanguage();
  return (
    <QuietSelect
      id={`${idPrefix}room-type`}
      label={t("Тип помещения")}
      value={filters.type}
      onChange={(event) => onChange({ type: event.target.value as Filters["type"] })}
      className={className}
    >
      <option value="">{t("Любой тип")}</option>
      {ROOM_TYPE_LIST.map((type) => (
        <option key={type} value={type}>
          {t(ROOM_TYPES[type].label)}
        </option>
      ))}
    </QuietSelect>
  );
}

function TimeSelect({
  filters,
  onChange,
  idPrefix = "",
  className = "",
}: ControlProps & { className?: string }) {
  const { t } = useLanguage();
  const current =
    TIME_RANGES.find(
      (range) => range.from === filters.from && range.to === filters.to,
    ) ?? TIME_RANGES[0];

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = TIME_RANGES.find((range) => range.value === event.target.value);
    if (next) onChange({ from: next.from, to: next.to });
  };

  return (
    <QuietSelect
      id={`${idPrefix}time-range`}
      label={t("Время")}
      value={current.value}
      onChange={handleChange}
      className={className}
    >
      {TIME_RANGES.map((range) => (
        <option key={range.value} value={range.value}>
          {t(range.label)}
        </option>
      ))}
    </QuietSelect>
  );
}

function QuietSelect({
  id,
  label,
  value,
  onChange,
  children,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mono-label block">
        {label}
      </label>
      <div className="relative mt-1">
        <select
          id={id}
          value={value}
          onChange={onChange}
          className="select-quiet w-full pr-5"
        >
          {children}
        </select>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-0 size-3 -translate-y-1/2 text-ink-mute"
        >
          <path
            d="m3 4.5 3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
