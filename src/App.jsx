import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import SearchForm from './components/SearchForm.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import SubscribeForm from './components/SubscribeForm.jsx';
import Spinner from './components/Spinner.jsx';
import Footer from './components/Footer.jsx';
import { getAirports, searchFlights } from './lib/api.js';

export default function App() {
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [searchParams, setSearchParams] = useState(null);

  useEffect(() => {
    getAirports().then(setAirports).catch(() => setAirports([]));
  }, []);

  async function handleSearch(params) {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const response = await searchFlights(params);
      setResults(response);
      setSearchParams(params);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <HowItWorks />
      <SearchForm airports={airports} onSearch={handleSearch} loading={loading} />

      <div aria-live="polite" className="mx-auto max-w-3xl px-4 sm:px-6">
        {loading && (
          <>
            <Spinner />
            <p className="text-center text-sm text-slate-500">
              Hidden-city searches check several flight combinations — this can take up to a minute.
            </p>
          </>
        )}
        {error && <p className="mt-6 text-center text-sm font-medium text-red-600">{error}</p>}
      </div>

      {results && (
        <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
          <ResultsTable title="Outbound" itineraries={results.outbound} />
          {results.inbound && <ResultsTable title="Return" itineraries={results.inbound} />}
          <SubscribeForm key={JSON.stringify(searchParams)} searchParams={searchParams} />
        </div>
      )}

      <Footer />
    </div>
  );
}
