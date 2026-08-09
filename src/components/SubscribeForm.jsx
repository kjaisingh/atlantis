import { useState } from 'react';
import { subscribe } from '../lib/api.js';

export default function SubscribeForm({ searchParams }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [priceThreshold, setPriceThreshold] = useState('');
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      await subscribe({
        name,
        email,
        origin: searchParams.origin,
        destination: searchParams.destination,
        departureDate: searchParams.departureDate,
        returnDate: searchParams.returnDate,
        travelers: searchParams.travelers,
        priceThreshold: Number(priceThreshold),
      });
      setStatus({ type: 'success', message: "You're subscribed. We'll email you if the price drops." });
      setName('');
      setEmail('');
      setPriceThreshold('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrapper">
      <form className="card" onSubmit={handleSubmit}>
        <h3 className="text-center mb-3">Get notified on a price drop</h3>
        <div className="row">
          <div className="col-md-6 form-group">
            <input
              type="text"
              className="form-control"
              placeholder="Jane Doe"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label className="label" id="name" />
          </div>
          <div className="col-md-6 form-group">
            <input
              type="email"
              className="form-control"
              placeholder="jane@example.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label className="label" id="email" />
          </div>
        </div>
        <div className="row">
          <div className="col-md-6 form-group">
            <input
              type="number"
              className="form-control"
              placeholder="e.g. 300"
              min="1"
              step="0.01"
              required
              value={priceThreshold}
              onChange={(event) => setPriceThreshold(event.target.value)}
            />
            <label className="label" id="prc" />
          </div>
        </div>
        {status && (
          <p className={status.type === 'success' ? 'text-success' : 'text-danger'}>{status.message}</p>
        )}
        <div className="button-wrapper">
          <button type="submit" className="btn btn-primary rounded-0 d-flex justify-content-center text-center" disabled={submitting}>
            {submitting ? 'Subscribing…' : 'Subscribe'}
          </button>
        </div>
      </form>
    </div>
  );
}
