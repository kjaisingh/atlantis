import { Plane, TrendingDown } from 'lucide-react';

export default function Hero() {
  return (
    <header id="page-top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,theme(colors.brand.100)_0%,transparent_45%),radial-gradient(circle_at_85%_10%,theme(colors.accent.500)/12%_0%,transparent_40%)]"
      />

      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-8">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">
            <TrendingDown className="h-3.5 w-3.5" />
            Hidden-city fares, found for you
          </span>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            Take the <span className="text-gradient">cheaper</span> route
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600 lg:mx-0">
            Atlantis searches hidden-city itineraries: flights where your real destination is
            just a layover on a cheaper ticket to somewhere further out.
          </p>

          <div className="mt-8 flex justify-center lg:justify-start">
            <a
              href="#search"
              className="rounded-full bg-brand-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600"
            >
              Find a flight
            </a>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm lg:mx-0">
          <div
            aria-hidden="true"
            className="relative rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/70 ring-1 ring-slate-100 [mask-image:radial-gradient(circle_10px_at_0_50%,transparent_98%,black),radial-gradient(circle_10px_at_100%_50%,transparent_98%,black)] [mask-repeat:no-repeat]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Example
            </p>

            <div className="mt-3 flex items-center gap-2 font-mono text-sm font-medium text-slate-700">
              <span>JFK</span>
              <Plane className="h-3.5 w-3.5 shrink-0 text-brand-500" />
              <span>LHR</span>
            </div>

            <p className="mt-4 text-3xl font-extrabold text-slate-900">$312</p>

            <div className="my-4 border-t border-dashed border-slate-200" />

            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">
              <TrendingDown className="h-3.5 w-3.5" />
              Save $240 vs the direct fare
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
