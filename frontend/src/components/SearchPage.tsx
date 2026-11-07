import { useCallback, useMemo, useState } from "react";
import { ScanLine, SlidersHorizontal } from "lucide-react";

import { nextDays } from "../lib/data";
import { freeHoursWord, intervalHours, intervalPrice, minskDate, plural, roundMoney } from "../lib/format";
import type { BookingRequest, Filters } from "../lib/types";
import { isDayRangeAvailable } from "../lib/intervals";
import { freeSlotHours, freeSlotsForDay, useApp } from "../state/AppState";
import { BookingModal } from "./BookingModal";
import { DateStrip } from "./DateStrip";
import { FiltersBar, FiltersSheet, activeFilterCount } from "./FiltersPanel";
import { ListingRow } from "./ListingRow";
import { ListingDetailsDialog } from "./ListingDetailsDialog";
import { SelectionBar } from "./SelectionBar";
import { useLanguage } from "../lib/i18n";
import { BELARUS_CITIES, cityDistricts } from "../lib/belarus";

function defaultFilters(): Filters {
  return {
    school: "",
    city: "",
    district: "",
    type: "",
    date: minskDate(),
    from: 14,
    to: 21,
  };
}

export function SearchPage({ onGoToBookings }: { onGoToBookings: () => void }) {
  const { slotsByDate, listings } = useApp();
  const { language, t } = useLanguage();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selected, setSelected] = useState<BookingRequest[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const closeDetails = useCallback(() => setDetailsId(null), []);

  const today = minskDate();
  const days = useMemo(() => nextDays(7, today), [today]);
  const date = days.includes(filters.date) ? filters.date : today;
  const from = filters.from;
  const to = filters.to;

  const byLocation = useMemo(() => listings.filter((listing) =>
    (!filters.city || listing.city === filters.city) && (!filters.district || listing.cityDistrict === filters.district),
  ), [listings, filters.city, filters.district]);
  const matching = useMemo(() => {
    const school = filters.school.trim().toLocaleLowerCase();
    return byLocation.filter((listing) =>
      listing.school.toLocaleLowerCase().includes(school) && (!filters.type || listing.type === filters.type),
    );
  }, [byLocation, filters.school, filters.type]);

  const results = useMemo(() => {
    const day = slotsByDate.get(date);
    return matching
      .map((listing) => ({
        listing,
        free: freeSlotsForDay(day?.get(listing.id) ?? [], from, to),
      }))
        .filter((row) => row.free.length > 0);
  }, [matching, slotsByDate, date, from, to]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const date of days) {
      const day = slotsByDate.get(date);
      result[date] = matching.reduce(
        (sum, listing) => sum + freeSlotHours(day?.get(listing.id) ?? [], from, to),
        0,
      );
    }
    return result;
  }, [days, matching, slotsByDate, from, to]);

  const catalogSchools = useMemo(
    () => [...new Set(byLocation.map((listing) => listing.school))].sort((a, b) => a.localeCompare(b, "ru")),
    [byLocation],
  );
  const cities = useMemo(() => [...new Set([
    ...BELARUS_CITIES, ...listings.flatMap(({ city }) => city ? [city] : []),
  ])].sort((a, b) => a.localeCompare(b, "ru")), [listings]);
  const districts = [...new Set([
    ...cityDistricts(filters.city),
    ...listings.flatMap(({ city, cityDistrict }) => city === filters.city && cityDistrict ? [cityDistrict] : []),
  ])];

  const total = selected.reduce((sum, request) => {
    const listing = listings.find((item) => item.id === request.listingId);
    return sum + (listing ? intervalPrice(listing.price, request.startTime, request.endTime) : 0);
  }, 0);
  const roundedTotal = roundMoney(total);
  const selectedHours = selected.reduce(
    (sum, request) => sum + intervalHours(request.startTime, request.endTime),
    0,
  );

  const freeToday = useMemo(() => [...(slotsByDate.get(today)?.values() ?? [])].reduce(
    (sum, daySlots) => sum + freeSlotHours(daySlots, 14, 21),
    0,
  ), [slotsByDate, today]);
  const filterCount = activeFilterCount(filters);
  const nextAvailableDay = days.find(
    (candidate) => candidate !== date && (counts[candidate] ?? 0) > 0,
  );

  const patchFilters = (patch: Partial<Filters>) => {
    setSelected([]);
    if (patch.city !== undefined) patch = { ...patch, school: "" };
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const resetFilters = () => {
    setFilters({ ...defaultFilters(), date });
    setSelected([]);
  };

  const changeRange = (listingId: number, startTime: string, endTime: string) => {
    setSelected((prev) => [
      ...prev.filter((item) => item.listingId !== listingId),
      { listingId, date, startTime, endTime },
    ]);
  };
  const selectionValid = selected.every((request) =>
    request.date === date &&
    isDayRangeAvailable(slotsByDate.get(request.date)?.get(request.listingId) ?? [], request.startTime, request.endTime),
  );

  return (
    <div className={selected.length > 0 ? "pb-44 sm:pb-28" : "pb-8"}>
      <div className="page-shell pt-8 sm:pt-12">
        <div className="border-b border-line pb-5">
          <h1 className="text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.02] tracking-[-0.04em]">
            {t("Каталог")}
          </h1>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-[16px] leading-relaxed text-ink-soft">
              {t("Сегодня ")}{freeToday} {freeHoursWord(freeToday, language)}{t(" доступно в каталоге.")}
            </p>
            <p className="text-[14px] text-ink-mute sm:text-[15px]">
              {listings.length}{" "}
              {plural(listings.length, [t("пространство"), t("пространства"), t("пространств")])} · {t("7 дней вперёд")}
            </p>
          </div>
          <p className="mt-1.5 text-[14px] text-ink-mute">{t("Тестовый каталог. Фотографии и расписание приведены для демонстрации.")}</p>
        </div>

        <div className="mt-5 grid min-w-0 gap-3">
          <FiltersBar filters={filters} onChange={patchFilters} onReset={resetFilters} schools={catalogSchools}
            cities={cities} districts={districts} />

          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="btn btn-quiet h-12 w-full justify-between rounded-lg bg-surface px-3.5 text-[15px]"
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="size-4" strokeWidth={1.8} aria-hidden="true" />
                {t("Фильтры")}
                {filterCount > 0 && (
                  <span className="rounded-md bg-sky-soft px-1.5 text-[13px] font-semibold text-blue-deep">{filterCount}</span>
                )}
              </span>
              <span className="text-[14px] font-normal text-ink-mute">
                {results.length}{t(" вариантов")}
              </span>
            </button>
          </div>

          <DateStrip
            days={days}
            active={date}
            counts={counts}
            onSelect={(date) => patchFilters({ date })}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold text-ink-soft" aria-live="polite">
            {results.length}{" "}
            {plural(results.length, [t("пространство"), t("пространства"), t("пространств")])}{" "}
            {filterCount === 0 ? t("в каталоге") : t("по выбранным фильтрам")}
          </p>
          {selected.length > 0 && (
            <p className="text-[14px] text-ink-mute">
              {t("Выбрано пространств: ")}{selected.length}
            </p>
          )}
        </div>

        {results.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-4">
            {results.map(({ listing }) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                selected={selected.find((request) => request.listingId === listing.id)}
                onOpenDetails={() => setDetailsId(listing.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyResults
            onReset={resetFilters}
            nextDay={nextAvailableDay}
            onPickNextDay={() => nextAvailableDay && patchFilters({ date: nextAvailableDay })}
          />
        )}
      </div>

      <SelectionBar
        count={selected.length}
        hours={selectedHours}
        total={roundedTotal}
        disabled={!selectionValid}
        onClear={() => setSelected([])}
        onBook={() => setModalOpen(true)}
      />

      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={patchFilters}
        onReset={resetFilters}
        resultCount={results.length}
        schools={catalogSchools}
        cities={cities}
        districts={districts}
      />

      {detailsId !== null && (() => {
        const detail = results.find(({ listing }) => listing.id === detailsId);
        return detail ? (
          <ListingDetailsDialog
            listing={detail.listing}
            date={date}
            availability={detail.free}
            selected={selected.find((request) => request.listingId === detail.listing.id)}
            onRangeChange={(start, end) => changeRange(detail.listing.id, start, end)}
            onClose={closeDetails}
          />
        ) : null;
      })()}

      {modalOpen && selected.length > 0 && (
        <BookingModal
          requests={selected}
          onClose={() => {
            setModalOpen(false);
            setSelected([]);
          }}
          onGoToBookings={() => {
            setModalOpen(false);
            setSelected([]);
            onGoToBookings();
          }}
        />
      )}

      <footer className="page-shell mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-[14px] text-ink-mute">{t("Беларусь · 2026")}</span>
        <a href="/guard" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-[14px] font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper">
          <ScanLine className="size-4" aria-hidden="true" />
          {t("Перейти к сканеру")}
        </a>
      </footer>
    </div>
  );
}

function EmptyResults({
  onReset,
  nextDay,
  onPickNextDay,
}: {
  onReset: () => void;
  nextDay?: string;
  onPickNextDay: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="space-card mt-3 p-5 sm:p-8">
      <h2 className="text-[24px] tracking-[-0.02em]">{t("Под эти фильтры ничего нет")}</h2>
      <p className="mt-2 max-w-[48ch] text-[16px] leading-relaxed text-ink-mute">
        {t("Попробуйте другой день, уберите один из фильтров или расширьте окно по времени.")}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onReset} className="btn btn-quiet min-h-11 rounded-lg">
          {t("Сбросить фильтры")}
        </button>
        {nextDay && (
          <button type="button" onClick={onPickNextDay} className="btn btn-primary min-h-11 rounded-lg">
            {t("Ближайший свободный день")}
          </button>
        )}
      </div>
    </div>
  );
}
