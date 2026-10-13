import { useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Mail } from 'lucide-react';
import { subscribe } from '../lib/api.js';

export default function SubscribeForm({ searchParams, currencies }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [priceThreshold, setPriceThreshold] = useState('');
  const [currency, setCurrency] = useState(currencies[0]);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      await subscribe({
        ...searchParams,
        name,
        email,
        priceThreshold: Number(priceThreshold),
        currency,
      });
      setStatus({
        type: 'success',
        message: "Price alert created. We'll email you after a matching fare is confirmed.",
      });
      setName('');
      setEmail('');
      setPriceThreshold('');
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-8 rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-brand-200">
          <Bell className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">Watch this route</h3>
          <p className="text-sm text-slate-400">
            Threshold covers the whole search party
            {searchParams.returnDate ? ' and both directions' : ''}.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-200">
          Name
          <input
            type="text"
            required
            maxLength="120"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="dark-field mt-1.5"
            autoComplete="name"
          />
        </label>
        <label className="text-sm font-medium text-slate-200">
          Email
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="email"
              required
              maxLength="254"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="dark-field pl-9"
              autoComplete="email"
            />
          </div>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-200">
          Notify below
          <input
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            value={priceThreshold}
            onChange={(event) => setPriceThreshold(event.target.value)}
            className="dark-field mt-1.5 w-44"
          />
        </label>
        {currencies.length > 1 ? (
          <label className="text-sm font-medium text-slate-200">
            Currency
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="dark-field mt-1.5 w-28"
            >
              {currencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="mb-3 text-sm font-semibold text-slate-300">{currency}</span>
        )}
      </div>
      {status && (
        <p
          role="status"
          className={`mt-4 flex items-start gap-2 text-sm ${status.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}
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
        className="mt-5 rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-brand-50 disabled:opacity-60"
      >
        {submitting ? 'Creating alert…' : 'Create price alert'}
      </button>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        We store your route and email only to send this alert. Alerts expire at departure.
      </p>
    </form>
  );
}
