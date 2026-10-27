import { useEffect, useRef, useState } from 'react';
import { AlertCircle, SearchX } from 'lucide-react';
import SubscribeForm from './components/SubscribeForm.jsx';
import AlertAction from './components/AlertAction.jsx';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import SearchForm from './components/SearchForm.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import Spinner from './components/Spinner.jsx';
import Footer from './components/Footer.jsx';
import { getAirports, getReadiness, searchFlights } from './lib/api.js';
import { formatDate } from './lib/format.js';

export default function App() {
  const readLink = () => /^#alert-(verify|unsubscribe)=([a-f0-9]{64})$/.exec(window.location.hash);
  const [link, setLink] = useState(readLink);
  useEffect(() => {
    const changed = () => setLink(readLink());
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  return link ? <AlertAction key={link[0]} action={link[1]} token={link[2]} /> : <SearchApp />;
}

function SearchApp() {
  const [airports, setAirports] = useState([]);
  const [capabilities, setCapabilities] = useState({ search: false });
  const [directoryError, setDirectoryError] = useState(null);
  const [serviceError, setServiceError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [searchParams, setSearchParams] = useState(null);
  const [attemptedParams, setAttemptedParams] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const searchRequest = useRef(null);

  useEffect(() => () => searchRequest.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.allSettled([getAirports(options), getReadiness(options)]).then(
      ([airportResult, healthResult]) => {
        if (controller.signal.aborted) return;
        if (airportResult.status === 'fulfilled') setAirports(airportResult.value);
        else setDirectoryError('Airport directory failed to load. Please retry.');
        if (healthResult.status === 'fulfilled' && healthResult.value.ready) {
          setCapabilities({ search: true, alerts: healthResult.value.alerts });
        } else {
          setCapabilities({ search: false });
          setServiceError('Flight search is unavailable right now. Please try again later.');
        }
        setInitializing(false);
      },
    );
    return () => controller.abort();
  }, [connectionAttempt]);

  function retryConnection() {
    setInitializing(true);
    setDirectoryError(null);
    setServiceError(null);
    setConnectionAttempt((attempt) => attempt + 1);
  }

  async function handleSearch(params) {
    if (searchRequest.current) return;
    const controller = new AbortController();
    searchRequest.current = controller;
    setLoading(true);
    setError(null);
    setResults(null);
    setSearchParams(null);
    setAttemptedParams(params);
    try {
      const response = await searchFlights(params, { signal: controller.signal });
      if (controller.signal.aborted || searchRequest.current !== controller) return;
      setResults(response);
      setSearchParams(params);
    } catch (searchError) {
      if (controller.signal.aborted || searchRequest.current !== controller) return;
      setError(searchError.message);
    } finally {
      if (searchRequest.current === controller) {
        searchRequest.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <a
        href="#search"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to flight search
      </a>
      <main>
        <Hero />
        <SearchForm
          airports={airports}
          onSearch={handleSearch}
          loading={loading}
          disabled={initializing || !capabilities.search || Boolean(directoryError)}
        />

        <div aria-live="polite" className="mx-auto max-w-3xl px-4 sm:px-6">
          {results && (
            <p className="sr-only">
              Search complete. {results.outbound.length} outbound options
              {results.inbound ? ` and ${results.inbound.length} return options` : ''} found.
            </p>
          )}
          {initializing && (
            <p className="mt-5 text-center text-sm text-slate-500">
              Connecting to flight search. First visit may take a minute…
            </p>
          )}
          {serviceError && (
            <p className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-red-700">
              <AlertCircle className="h-4 w-4" /> {serviceError}
            </p>
          )}
          {directoryError && (
            <p className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-red-700">
              <AlertCircle className="h-4 w-4" /> {directoryError}
            </p>
          )}
          {(directoryError || serviceError) && !initializing && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={retryConnection}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                Retry connection
              </button>
            </div>
          )}
          {loading && (
            <div className="py-8 text-center">
              <Spinner />
              <p className="text-sm text-slate-500">
                Checking several flight combinations. This can take up to a minute…
              </p>
            </div>
          )}
          {error && (
            <div className="mt-6 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-red-700">
                <SearchX className="h-4 w-4" /> {error}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSearch(attemptedParams)}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                Retry search
              </button>
            </div>
          )}
        </div>

        {results && searchParams && (
          <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6" aria-labelledby="results-title">
            <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                  Results
                </p>
                <h2 id="results-title" className="mt-1 text-2xl font-bold text-slate-950">
                  {searchParams.origin} → {searchParams.destination}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {formatDate(searchParams.departureDate)}
                  {searchParams.returnDate
                    ? ` – ${formatDate(searchParams.returnDate)}`
                    : ''} · {searchParams.travelers}{' '}
                  {searchParams.travelers === 1 ? 'traveler' : 'travelers'} · Economy
                </p>
              </div>
            </div>
            {results.inbound && (
              <p className="mt-3 text-sm text-slate-600">Book each direction separately.</p>
            )}
            {(results.meta?.outbound?.error || results.meta?.inbound?.error) && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSearch(searchParams)}
                className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                Retry search
              </button>
            )}
            <ResultsTable
              key={`${JSON.stringify(searchParams)}-outbound`}
              title="Outbound"
              itineraries={results.outbound}
              meta={results.meta?.outbound}
            />
            {results.inbound && (
              <ResultsTable
                key={`${JSON.stringify(searchParams)}-inbound`}
                title="Return"
                itineraries={results.inbound}
                meta={results.meta?.inbound}
              />
            )}
            {capabilities.alerts && (
              <SubscribeForm key={JSON.stringify(searchParams)} searchParams={searchParams} />
            )}
          </section>
        )}
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
