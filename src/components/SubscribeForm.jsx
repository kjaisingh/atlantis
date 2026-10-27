import { useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { subscribe } from '../lib/api.js';

export default function SubscribeForm({ searchParams }) {
  const [email, setEmail] = useState('');
  const [threshold, setThreshold] = useState('');
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (busy.current || (status && !status.error)) return;
    busy.current = true;
    setPending(true);
    setStatus(null);
    try {
      const result = await subscribe({ ...searchParams, email, priceThreshold: Number(threshold) });
      setStatus({ message: result.message });
    } catch (error) {
      setStatus({ error: true, message: error.message });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      aria-label="Price alert"
      className="mt-8 rounded-2xl border border-brand-200 bg-brand-50 p-6"
    >
      <h3 className="flex items-center gap-2 text-lg font-bold text-slate-950">
        <Bell className="h-5 w-5" /> Watch this route
      </h3>
      {(!status || status.error) && (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Checked weekly. One email when the price meets your target.
          </p>
          <fieldset disabled={pending} className="mt-4 flex flex-wrap items-end gap-4">
            <legend className="sr-only">Price alert details</legend>
            <label className="flex-1 text-sm font-semibold text-slate-700">
              Email
              <input
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 block w-full min-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              {searchParams.returnDate ? 'Round-trip target (USD)' : 'Target total (USD)'}
              <input
                type="number"
                required
                min="0.01"
                max="1000000"
                step="0.01"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                className="mt-1 block w-44 rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              {pending ? 'Sending…' : 'Create price alert'}
            </button>
          </fieldset>
        </>
      )}
      {status && (
        <p
          role={status.error ? 'alert' : 'status'}
          className={`mt-3 text-sm ${status.error ? 'text-red-700' : 'text-emerald-800'}`}
        >
          {status.message}
        </p>
      )}
    </form>
  );
}
