import { useState } from 'react';

const today = new Date().toISOString().slice(0, 10);

export default function SearchForm({ airports, onSearch, loading }) {
  const [tripType, setTripType] = useState('oneway');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [travelers, setTravelers] = useState(1);

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
    <div className="wrapper" id="scroll">
      <form className="card" onSubmit={handleSubmit}>
        <div className="d-flex justify-content-center margin">
          <label className="option me-4">
            <input
              type="radio"
              name="tripType"
              checked={tripType === 'oneway'}
              onChange={() => setTripType('oneway')}
            />
            <span className="checkmark" />
            One-way
          </label>
          <label className="option">
            <input
              type="radio"
              name="tripType"
              checked={tripType === 'roundtrip'}
              onChange={() => setTripType('roundtrip')}
            />
            <span className="checkmark" />
            Round-trip
          </label>
        </div>

        <div className="row">
          <div className="col-md-6 form-group">
            <input
              type="text"
              className="form-control"
              list="airport-options"
              placeholder="e.g. JFK"
              required
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
            />
            <label className="label" id="from" />
          </div>
          <div className="col-md-6 form-group">
            <input
              type="text"
              className="form-control"
              list="airport-options"
              placeholder="e.g. LHR"
              required
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
            <label className="label" id="to" />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 form-group">
            <input
              type="date"
              className="form-control"
              placeholder=" "
              min={today}
              required
              value={departureDate}
              onChange={(event) => setDepartureDate(event.target.value)}
            />
            <label className="label" id="depart" />
          </div>
          {tripType === 'roundtrip' && (
            <div className="col-md-6 form-group">
              <input
                type="date"
                className="form-control"
                placeholder=" "
                min={departureDate || today}
                required
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
              />
              <label className="label" id="return" />
            </div>
          )}
        </div>

        <div className="row">
          <div className="col-md-6 form-group">
            <input
              type="number"
              className="form-control"
              placeholder=" "
              min="1"
              max="9"
              required
              value={travelers}
              onChange={(event) => setTravelers(event.target.value)}
            />
            <label className="label" id="psngr" />
          </div>
        </div>

        <datalist id="airport-options">
          {airports.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>

        <div className="button-wrapper">
          <button type="submit" className="btn btn-primary rounded-0 d-flex justify-content-center text-center" disabled={loading}>
            {loading ? 'Searching…' : 'Search Flights'}
          </button>
        </div>
      </form>
    </div>
  );
}
