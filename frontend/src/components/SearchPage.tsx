import { useCallback, useMemo, useState } from "react";
import { ScanLine, SlidersHorizontal } from "lucide-react";

import { nextDays, toISODate } from "../lib/data";
import { freeHoursWord, intervalHours, intervalPrice, plural, roundMoney } from "../lib/format";
import type { BookingRequest, Filters } from "../lib/types";
import { isRangeAvailable } from "../lib/intervals";
import { freeHourCount, freeSlotHours, freeSlots, useApp } from "../state/AppState";
import { BookingModal } from "./BookingModal";
import { DateStrip } from "./DateStrip";
import { FiltersBar, FiltersSheet, activeFilterCount } from "./FiltersPanel";
import { ListingRow } from "./ListingRow";
import { ListingDetailsDialog } from "./ListingDetailsDialog";
import { SelectionBar } from "./SelectionBar";
import { useLanguage } from "../lib/i18n";

function defaultFilters(): Filters {
  return {
    school: "",
    type: "",
    date: toISODate(new Date()),
    from: 14,
    to: 21,
  };
}

export function SearchPage({ onGoToBookings }: { onGoToBookings: () => void }) {
  const { slots, listings } = useApp();
  const { t } = useLanguage();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selected, setSelected] = useState<BookingRequest[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const closeDetails = useCallback(() => setDetailsId(null), []);

  const days = useMemo(() => nextDays(7).map(toISODate), []);
  const today = days[0];
  const from = filters.from;
  const to = filters.to;

  const results = useMemo(() => {
    return listings
      .filter(
        (listing) =>
          (!filters.school || listing.school.toLocaleLowerCase().includes(filters.school.trim().toLocaleLowerCase())) &&
          (!filters.type || listing.type === filters.type),
      )
      .map((listing) => ({
        listing,
        free: freeSlots(slots, listing.id, filters.date, from, to),
      }))
        .filter((row) => row.free.length > 0);
  }, [listings, slots, filters.school, filters.type, filters.date, from, to]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const date of days) {
      result[date] = listings
        .filter(
          (listing) =>
            (!filters.school || listing.school.toLocaleLowerCase().includes(filters.school.trim().toLocaleLowerCase())) &&
            (!filters.type || listing.type === filters.type),
        )
        .reduce(
          (sum, listing) =>
            sum + freeSlotHours(freeSlots(slots, listing.id, date, from, to)),
          0,
        );
    }
    return result;
  }, [days, listings, slots, filters.school, filters.type, from, to]);

  const catalogSchools = useMemo(
    () => [...new Set(listings.map((listing) => listing.school))].sort((a, b) => a.localeCompare(b, "ru")),
    [listings],
  );

  const total = selected.reduce((sum, request) => {
    const listing = listings.find((item) => item.id === request.listingId);
    return sum + (listing ? intervalPrice(listing.price, request.startTime, request.endTime) : 0);
  }, 0);
  const roundedTotal = roundMoney(total);
  const selectedHours = selected.reduce(
    (sum, request) => sum + intervalHours(request.startTime, request.endTime),
    0,
  );

  const freeToday = freeHourCount(slots, today);
  const filterCount = activeFilterCount(filters);
  const nextAvailableDay = days.find(
    (date) => date !== filters.date && (counts[date] ?? 0) > 0,
  );

  const patchFilters = (patch: Partial<Filters>) => {
    setSelected([]);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const resetFilters = () => {
    setFilters({ ...defaultFilters(), date: filters.date });
    setSelected([]);
  };

  const changeRange = (listingId: number, startTime: string, endTime: string) => {
    setSelected((prev) => [
      ...prev.filter((item) => item.listingId !== listingId),
      { listingId, date: filters.date, startTime, endTime },
    ]);
  };
  const selectionValid = selected.every((request) =>
    isRangeAvailable(slots, request.listingId, request.date, request.startTime, request.endTime),
  );

  return (
    <div className="pb-24">
      <div className="mx-auto max-w-[1180px] px-5 pt-9 sm:px-8 sm:pt-12">
        <div className="border-b border-ink/20 pb-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] text-ink-soft">{t("Минск · 14:00–21:00")}</p>
          </div>
          <h1 className="mt-4 max-w-[16ch] text-[clamp(2rem,4.6vw,3.5rem)] leading-[0.98] tracking-[-0.045em]">
            {t("Свободно ")}<span className="text-blue italic">{t("после звонка")}</span>
            <span className="text-orange">.</span>
          </h1>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {t("Сегодня ")}{freeToday} {freeHoursWord(freeToday)}{t(" доступно в каталоге.")}
            </p>
            <p className="text-[13px] text-ink-soft">
              {listings.length}{" "}
              {plural(listings.length, [t("пространство"), t("пространства"), t("пространств")])} · {t("7 дней вперёд")}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <FiltersBar filters={filters} onChange={patchFilters} onReset={resetFilters} schools={catalogSchools} />

          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="btn btn-quiet h-10 w-full justify-between px-3"
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="size-3.5" strokeWidth={1.8} />
                {t("Фильтры")}
                {filterCount > 0 && (
                  <span className="text-[12px] font-semibold text-orange">{filterCount}</span>
                )}
              </span>
              <span className="text-[12px] font-normal text-ink-mute">
                {results.length}{t(" вариантов")}
              </span>
            </button>
          </div>

          <DateStrip
            days={days}
            active={filters.date}
            counts={counts}
            onSelect={(date) => patchFilters({ date })}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <p className="mono-label" aria-live="polite">
            {results.length}{" "}
             {plural(results.length, [t("пространство"), t("пространства"), t("пространств")])}{" "}
             {filterCount === 0 ? t("в каталоге") : t("по выбранным фильтрам")}
          </p>
            {selected.length > 0 && (
            <p className="text-[12.5px] text-ink-mute">
              {t("Выбрано пространств: ")}{selected.length}
            </p>
          )}
        </div>

        {results.length > 0 ? (
          <div className="mt-3 border-t border-ink/20">
            {results.map(({ listing }, index) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                selected={selected.find((request) => request.listingId === listing.id)}
                onOpenDetails={() => setDetailsId(listing.id)}
                index={index + 1}
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
      />

      {detailsId !== null && (() => {
        const detail = results.find(({ listing }) => listing.id === detailsId);
        return detail ? (
          <ListingDetailsDialog
            listing={detail.listing}
            date={filters.date}
            availability={slots}
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

      <footer className="mx-auto mt-4 flex max-w-[1180px] flex-wrap items-center justify-between gap-3 border-t border-ink/15 px-5 pt-4 sm:px-8">
        <span className="font-mono text-[10px] tracking-[0.1em] text-ink-mute uppercase">{t("Беларусь · 2026")}</span>
        <a href="/guard" className="inline-flex min-h-9 items-center gap-2 border border-ink/20 px-3 text-[12px] font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper">
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
  return (
    <div className="border-b border-line py-16">
      <h2 className="text-[24px] tracking-[-0.02em]">Под эти фильтры ничего нет</h2>
      <p className="mt-2 max-w-[48ch] text-[13px] leading-relaxed text-ink-mute">
        Попробуйте другой день, уберите один из фильтров или расширьте окно по времени.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onReset} className="btn btn-quiet h-10">
          Сбросить фильтры
        </button>
        {nextDay && (
          <button type="button" onClick={onPickNextDay} className="btn btn-primary h-10">
            Ближайший свободный день
          </button>
        )}
      </div>
    </div>
  );
}
