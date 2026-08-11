import { useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Mail } from 'lucide-react';
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
    <div className="mx-auto mt-10 max-w-2xl px-4 sm:px-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Bell className="h-4 w-4" />
          </span>
          <h3 className="text-lg font-semibold text-slate-900">Get notified on a price drop</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          We'll email you if this route drops below your target price.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="subscribeName" className="mb-1.5 block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="subscribeName"
              type="text"
              placeholder="Jane Doe"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label htmlFor="subscribeEmail" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="subscribeEmail"
                type="email"
                placeholder="jane@example.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="priceThreshold" className="mb-1.5 block text-sm font-medium text-slate-700">
            Notify me below
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
              $
            </span>
            <input
              id="priceThreshold"
              type="number"
              placeholder="300"
              min="1"
              step="0.01"
              required
              value={priceThreshold}
              onChange={(event) => setPriceThreshold(event.target.value)}
              className="w-full max-w-xs rounded-xl border border-slate-200 bg-white py-2.5 pl-7 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        {status && (
          <p
            className={`mt-4 flex items-start gap-1.5 text-sm ${
              status.type === 'success' ? 'text-emerald-600' : 'text-red-600'
            }`}
            role="alert"
          >
            {status.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {status.message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {submitting ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
    </div>
  );
}
