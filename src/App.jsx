import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
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
    <>
      <Navbar />
      <Hero />
      <div className="container">
        <SearchForm airports={airports} onSearch={handleSearch} loading={loading} />

        {loading && <Spinner />}
        {error && <p className="text-danger text-center">{error}</p>}

        {results && (
          <>
            <ResultsTable title="Outbound" itineraries={results.outbound} />
            {results.inbound && <ResultsTable title="Return" itineraries={results.inbound} />}
            <SubscribeForm searchParams={searchParams} />
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
