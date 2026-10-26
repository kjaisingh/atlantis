import { useMemo, useState } from 'react';
import { ArrowLeftRight, Calendar, Search, Users } from 'lucide-react';
import AirportCombobox from './AirportCombobox.jsx';

export default function SearchForm({ airports, onSearch, loading, disabled }) {
  const [tripType, setTripType] = useState('oneway');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [travelers, setTravelers] = useState(1);
  const airportCodes = useMemo(() => new Set(airports.map((airport) => airport.code)), [airports]);
  const today = new Date().toISOString().slice(0, 10);
  const members = (code) => airports.find((airport) => airport.code === code)?.airports || [code];
  const validRoute =
    airportCodes.has(origin) &&
    airportCodes.has(destination) &&
    !members(origin).some((code) => members(destination).includes(code));

  function handleSwap() {
    setOrigin(destination);
    setDestination(origin);
  }

  function handleDepartureChange(value) {
    setDepartureDate(value);
    if (returnDate && returnDate < value) setReturnDate('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (disabled || loading || !validRoute) return;
    onSearch({
      origin,
      destination,
      departureDate,
      returnDate: tripType === 'roundtrip' ? returnDate : '',
      travelers: Number(travelers),
    });
  }

  return (
    <div id="search" className="relative scroll-mt-24 px-4 pb-10 sm:px-6">
      <form
        aria-label="Flight search"
        onSubmit={handleSubmit}
        className="mx-auto -mt-12 max-w-4xl rounded-3xl bg-white p-5 shadow-2xl shadow-slate-300/40 ring-1 ring-slate-200/70 sm:-mt-16 sm:p-8"
      >
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-950">Find your next flight</h2>
          <p className="mt-1 text-sm text-slate-500">
            Compare ordinary fares with hidden-city options.
          </p>
        </div>
        <fieldset disabled={disabled || loading} aria-busy={loading}>
          <legend className="sr-only">Flight details</legend>
          <fieldset>
            <legend className="sr-only">Trip type</legend>
            <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm font-semibold">
              {[
                ['oneway', 'One-way'],
                ['roundtrip', 'Round-trip'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tripType === value}
                  onClick={() => setTripType(value)}
                  className={`rounded-full px-4 py-2 transition ${
                    tripType === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <AirportCombobox
              label="Origin"
              placeholder="Airport or city"
              airports={airports}
              value={origin}
              onChange={setOrigin}
            />
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap origin and destination"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-brand-200 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ArrowLeftRight className="h-4 w-4 sm:rotate-0 rotate-90" />
            </button>
            <AirportCombobox
              label="Destination"
              placeholder="Airport or city"
              airports={airports}
              value={destination}
              onChange={setDestination}
            />
          </div>

          <div
            className={`mt-4 grid gap-4 ${tripType === 'roundtrip' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
          >
            <DateField
              label="Departure"
              id="departureDate"
              min={today}
              value={departureDate}
              onChange={handleDepartureChange}
            />
            {tripType === 'roundtrip' && (
              <DateField
                label="Return"
                id="returnDate"
                min={departureDate || today}
                value={returnDate}
                onChange={setReturnDate}
              />
            )}
            <div>
              <label
                htmlFor="travelers"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
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
                  className="field pl-9"
                />
              </div>
            </div>
          </div>

          {!validRoute && origin && destination && (
            <p className="mt-3 text-sm text-amber-700">
              Choose airports or metro areas that do not overlap.
            </p>
          )}
          <button
            type="submit"
            disabled={disabled || loading || !validRoute}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="h-4 w-4" /> {loading ? 'Searching…' : 'Search flights'}
          </button>
        </fieldset>
      </form>
    </div>
  );
}

function DateField({ label, id, min, value, onChange }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          type="date"
          min={min}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="field pl-9"
        />
      </div>
    </div>
  );
}
