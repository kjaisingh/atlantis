import { useRef, useState } from 'react';
import { alertAction } from '../lib/api.js';

export default function AlertAction({ action, token }) {
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await alertAction(action, token);
      setMessage(result.message);
      setDone(true);
      window.history.replaceState(null, '', window.location.pathname);
    } catch (error) {
      setMessage(error.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <a href="/" className="font-bold text-brand-600">
        Atlantis
      </a>
      <h1 className="mt-6 text-2xl font-bold">
        {action === 'verify' ? 'Confirm your price alert' : 'Cancel your price alert'}
      </h1>
      <p className="mt-3 text-slate-600">
        {action === 'verify'
          ? 'Activate weekly checks for your requested trip. We’ll email the first fare at or below your target.'
          : 'Stop future price updates for this alert.'}
      </p>
      {!done && (
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-6 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : action === 'verify' ? 'Confirm alert' : 'Unsubscribe'}
        </button>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-slate-700">
          {message}
        </p>
      )}
      <p className="mt-6">
        <a className="text-brand-700 underline" href="/">
          Back to flight search
        </a>
      </p>
    </main>
  );
}
