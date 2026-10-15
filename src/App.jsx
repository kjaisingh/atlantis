import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, SearchX } from 'lucide-react';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import SearchForm from './components/SearchForm.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import SubscribeForm from './components/SubscribeForm.jsx';
import Spinner from './components/Spinner.jsx';
import Footer from './components/Footer.jsx';
import { getAirports, getHealth, searchFlights } from './lib/api.js';

export default function App() {
  const [airports, setAirports] = useState([]);
  const [capabilities, setCapabilities] = useState({ search: false, subscriptions: false });
  const [directoryError, setDirectoryError] = useState(null);
  const [serviceError, setServiceError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [searchParams, setSearchParams] = useState(null);

  useEffect(() => {
    Promise.allSettled([getAirports(), getHealth()]).then(([airportResult, healthResult]) => {
      if (airportResult.status === 'fulfilled') setAirports(airportResult.value);
      else setDirectoryError('Airport directory failed to load. Refresh to try again.');
      if (healthResult.status === 'fulfilled' && healthResult.value.capabilities?.search) {
        setCapabilities(healthResult.value.capabilities);
      } else {
        setServiceError('Flight search is unavailable right now. Please try again later.');
      }
    });
  }, []);

  async function handleSearch(params) {
    setLoading(true);
    setError(null);
    setResults(null);
    setSearchParams(null);
    try {
      const response = await searchFlights(params);
      setResults(response);
      setSearchParams(params);
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setLoading(false);
    }
  }

  const alertCurrencies = useMemo(() => {
    if (!results) return [];
    const outbound = new Set(results.outbound.map((item) => item.currency));
    if (!results.inbound) return [...outbound];
    const inbound = new Set(results.inbound.map((item) => item.currency));
    return [...outbound].filter((currency) => inbound.has(currency));
  }, [results]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <SearchForm
          airports={airports}
          onSearch={handleSearch}
          loading={loading}
          disabled={!capabilities.search || Boolean(directoryError)}
        />

        <div aria-live="polite" className="mx-auto max-w-3xl px-4 sm:px-6">
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
          {loading && (
            <div className="py-8 text-center">
              <Spinner />
              <p className="text-sm text-slate-500">Checking several flight combinations…</p>
            </div>
          )}
          {error && (
            <p className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-red-700">
              <SearchX className="h-4 w-4" /> {error}
            </p>
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
              </div>
              <p className="text-sm text-slate-500">Prices shown per search party</p>
            </div>
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
            {capabilities.subscriptions && alertCurrencies.length > 0 && (
              <SubscribeForm
                key={JSON.stringify(searchParams)}
                searchParams={searchParams}
                currencies={alertCurrencies}
              />
            )}
            {!capabilities.subscriptions && (
              <p className="mt-8 text-center text-sm text-slate-600">
                Price alerts are unavailable right now. You can still compare flights and open
                booking searches.
              </p>
            )}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
