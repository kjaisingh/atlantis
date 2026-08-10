import { TrendingDown } from 'lucide-react';

export default function Hero() {
  return (
    <header id="page-top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">
          <TrendingDown className="h-3.5 w-3.5" />
          Hidden-city fares, found for you
        </span>

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
          Take the <span className="text-gradient">cheaper</span> route
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
          Atlantis searches hidden-city itineraries - flights where your real destination is just a
          layover on a cheaper ticket to somewhere further out.
        </p>

        <div className="mt-8 flex justify-center">
          <a
            href="#search"
            className="rounded-full bg-gradient-brand px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:opacity-90"
          >
            Find a flight
          </a>
        </div>
      </div>
    </header>
  );
}
