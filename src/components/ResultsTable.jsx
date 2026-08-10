import { AlertTriangle, ArrowRight, PlaneTakeoff } from 'lucide-react';

export default function ResultsTable({ title, itineraries }) {
  if (itineraries.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">No itineraries found for this route.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-3">
        {itineraries.map((itinerary, index) => {
          const isNonstop = itinerary.path.split(' → ').length === 2;
          const isCheapest = index === 0;

          return (
            <a
              key={`${itinerary.path}-${itinerary.departureTime}-${index}`}
              href={itinerary.bookingLink}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
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
                    {isNonstop && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                        Nonstop
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    {itinerary.path}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {itinerary.departureTime} → {itinerary.arrivalTime}
                  </p>
                  {itinerary.isHiddenCity && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Get off at {itinerary.layoverCity} — don't take the rest of this ticket.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                <span className="text-2xl font-bold text-slate-900">${itinerary.price}</span>
                <span className="text-xs font-medium text-brand-600">Book on Kayak →</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
