import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  PlaneTakeoff,
  SlidersHorizontal,
  TrendingDown,
} from 'lucide-react';

function formatPrice(value, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
  } catch {
    return `${value} ${currency}`;
  }
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function ResultsTable({ title, itineraries, meta }) {
  const currencies = [...new Set(itineraries.map((item) => item.currency))];
  const [currency, setCurrency] = useState(currencies[0] || 'USD');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState('price');
  const visible = useMemo(() => {
    const filtered = itineraries.filter(
      (item) =>
        item.currency === currency &&
        (kind === 'all' || (kind === 'nonstop' ? item.nonstop : item.isHiddenCity)),
    );
    return [...filtered].sort((left, right) =>
      sort === 'departure'
        ? new Date(left.departureTime) - new Date(right.departureTime)
        : Number(left.price) - Number(right.price),
    );
  }, [currency, itineraries, kind, sort]);

  const cheapest = visible.reduce(
    (lowest, item) => (!lowest || Number(item.price) < Number(lowest.price) ? item : lowest),
    null,
  );
  const directPrice = Math.min(
    ...itineraries
      .filter((item) => item.currency === currency && item.nonstop)
      .map((item) => Number(item.price)),
  );
  const savings =
    cheapest && Number.isFinite(directPrice) ? directPrice - Number(cheapest.price) : 0;

  return (
    <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <div className="flex flex-wrap items-center gap-2" aria-label={`${title} filters`}>
          <SlidersHorizontal className="h-4 w-4 text-slate-400" aria-hidden="true" />
          {currencies.length > 1 && (
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              aria-label="Currency"
              className="filter-control"
            >
              {currencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          )}
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-label="Itinerary type"
            className="filter-control"
          >
            <option value="all">All routes</option>
            <option value="nonstop">Nonstop</option>
            <option value="hidden">Hidden-city</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Sort results"
            className="filter-control"
          >
            <option value="price">Lowest price</option>
            <option value="departure">Earliest departure</option>
          </select>
        </div>
      </div>

      {meta?.error && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {meta.error}
        </p>
      )}
      {meta?.partial && !meta.error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Partial search: {meta.succeeded} of {meta.requested} checks completed
          {meta.truncated
            ? `; request budget covered ${meta.requested} of ${meta.totalCandidates} candidates`
            : ''}
          .
        </p>
      )}

      {savings > 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
          <TrendingDown className="h-4 w-4" /> Save {formatPrice(savings, currency)} versus the{' '}
          {formatPrice(directPrice, currency)} nonstop fare
        </p>
      )}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No itineraries match these filters.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((itinerary) => (
            <a
              key={
                itinerary.id ||
                `${itinerary.path}|${itinerary.departureTime}|${itinerary.price}|${itinerary.currency}`
              }
              href={itinerary.bookingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600">
                  <PlaneTakeoff className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-950">{itinerary.airline}</span>
                    {itinerary === cheapest && (
                      <Badge className="bg-brand-50 text-brand-700">Lowest price</Badge>
                    )}
                    {itinerary.nonstop && (
                      <Badge className="bg-emerald-50 text-emerald-700">Nonstop</Badge>
                    )}
                    {itinerary.isHiddenCity && (
                      <Badge className="bg-amber-50 text-amber-800">Hidden-city</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 truncate font-mono text-sm text-slate-600">
                    {itinerary.path}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDateTime(itinerary.departureTime)} →{' '}
                    {formatDateTime(itinerary.arrivalTime)}
                  </p>
                  {itinerary.isHiddenCity && (
                    <p className="mt-2 text-xs font-medium text-amber-800">
                      Exit at {itinerary.layoverCity}; do not board the final segment.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
                <span className="text-2xl font-extrabold text-slate-950">
                  {formatPrice(itinerary.price, itinerary.currency)}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                  Review on Kayak <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ className, children }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}
