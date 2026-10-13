export default function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-white py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
        <div>
          <p className="text-sm font-semibold text-slate-900">Atlantis</p>
          <p className="mt-1 text-xs text-slate-500">
            Search aid only. Verify fare rules before booking.
          </p>
        </div>
        <a
          href="https://github.com/kjaisingh/atlantis"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-slate-500 hover:text-brand-700"
        >
          Source on GitHub ↗
        </a>
      </div>
    </footer>
  );
}
