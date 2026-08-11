import { AlertTriangle, ArrowRight, PlaneTakeoff, TrendingDown } from 'lucide-react';

function formatPrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : `$${value}`;
}

export default function ResultsTable({ title, itineraries }) {
  if (itineraries.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">No itineraries found for this route.</p>
      </div>
    );
  }

  const prices = itineraries.map((itinerary) => Number(itinerary.price));
  const cheapestPrice = Math.min(...prices);
  const cheapestIndex = prices.indexOf(cheapestPrice);
  const directPrices = itineraries
    .filter((itinerary) => itinerary.nonstop)
    .map((itinerary) => Number(itinerary.price));
  const directPrice = directPrices.length > 0 ? Math.min(...directPrices) : null;
  const savings = directPrice !== null ? directPrice - cheapestPrice : 0;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>

      {directPrice !== null && savings > 0 && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-600">
          <TrendingDown className="h-4 w-4" />
          Save {formatPrice(savings)} vs the {formatPrice(directPrice)} direct fare
        </div>
      )}

      <div className="mt-3 space-y-3">
        {itineraries.map((itinerary, index) => {
          const isCheapest = index === cheapestIndex;
          const isDirectAnchor = itinerary.nonstop && !isCheapest;

          return (
            <a
              key={`${itinerary.airline}|${itinerary.path}|${itinerary.price}|${itinerary.departureTime}|${itinerary.arrivalTime}`}
              href={itinerary.bookingLink}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <PlaneTakeoff className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{itinerary.airline}</span>
                    {isCheapest && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                        Cheapest
                      </span>
                    )}
                    {itinerary.nonstop && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                        Nonstop
                      </span>
                    )}
                    {isDirectAnchor && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                        Direct
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 font-mono text-sm text-slate-500">
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    {itinerary.path}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {itinerary.departureTime} → {itinerary.arrivalTime}
                  </p>
                  {itinerary.isHiddenCity && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Get off at {itinerary.layoverCity}: don't take the rest of this ticket.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                <span className="text-2xl font-bold text-slate-900">{formatPrice(itinerary.price)}</span>
                <span className="text-xs font-medium text-brand-600">Book on Kayak →</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
