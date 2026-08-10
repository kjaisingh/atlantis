import { useState } from 'react';
import { ArrowLeftRight, Calendar, Users } from 'lucide-react';
import AirportCombobox from './AirportCombobox.jsx';

const today = new Date().toISOString().slice(0, 10);

export default function SearchForm({ airports, onSearch, loading }) {
  const [tripType, setTripType] = useState('oneway');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [travelers, setTravelers] = useState(1);

  function handleSwap() {
    setOrigin(destination);
    setDestination(origin);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSearch({
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      departureDate,
      returnDate: tripType === 'roundtrip' ? returnDate : '',
      travelers: Number(travelers),
    });
  }

  return (
    <div id="search" className="scroll-mt-24 px-4 sm:px-6">
      <form
        onSubmit={handleSubmit}
        className="mx-auto -mt-12 max-w-3xl rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-100 sm:-mt-16 sm:p-8"
      >
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setTripType('oneway')}
            className={`rounded-full px-4 py-1.5 transition ${
              tripType === 'oneway' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            One-way
          </button>
          <button
            type="button"
            onClick={() => setTripType('roundtrip')}
            className={`rounded-full px-4 py-1.5 transition ${
              tripType === 'roundtrip' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Round-trip
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <AirportCombobox
            label="Origin"
            placeholder="e.g. JFK"
            airports={airports}
            value={origin}
            onChange={setOrigin}
          />

          <div className="relative">
            <AirportCombobox
              label="Destination"
              placeholder="e.g. LHR"
              airports={airports}
              value={destination}
              onChange={setDestination}
            />
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap origin and destination"
              className="absolute -top-1 right-0 hidden -translate-y-full items-center justify-center rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:text-brand-600 sm:-left-8 sm:top-1/2 sm:right-auto sm:flex sm:-translate-y-1/2 sm:-translate-x-1/2"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className={`mt-4 grid gap-4 ${tripType === 'roundtrip' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <div>
            <label htmlFor="departureDate" className="mb-1.5 block text-sm font-medium text-slate-700">
              Departure
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="departureDate"
                type="date"
                min={today}
                required
                value={departureDate}
                onChange={(event) => setDepartureDate(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          {tripType === 'roundtrip' && (
            <div>
              <label htmlFor="returnDate" className="mb-1.5 block text-sm font-medium text-slate-700">
                Return
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="returnDate"
                  type="date"
                  min={departureDate || today}
                  required
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="travelers" className="mb-1.5 block text-sm font-medium text-slate-700">
              Travelers
            </label>
            <div className="relative">
              <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="travelers"
                type="number"
                min="1"
                max="9"
                required
                value={travelers}
                onChange={(event) => setTravelers(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-gradient-brand py-3 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Searching…' : 'Search flights'}
        </button>
      </form>
    </div>
  );
}
