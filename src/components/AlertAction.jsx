import { useRef, useState } from 'react';
import { alertAction } from '../lib/api.js';

export default function AlertAction({ action, token }) {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await alertAction(action, token);
      setDone(true);
      window.history.replaceState(null, '', window.location.pathname);
    } catch (error) {
      setError(error.message);
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
      <h1 className="mt-6 text-2xl font-bold" aria-live="polite">
        {done
          ? action === 'verify'
            ? 'Alert confirmed'
            : 'Alert cancelled'
          : action === 'verify'
            ? 'Confirm price alert'
            : 'Cancel price alert'}
      </h1>
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
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="mt-6">
        <a className="text-brand-700 underline" href="/">
          Search flights
        </a>
      </p>
    </main>
  );
}
