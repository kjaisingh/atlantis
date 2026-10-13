import { useEffect, useState } from 'react';
import { Menu, Plane, X } from 'lucide-react';

const links = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#search', label: 'Search' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <a href="#page-top" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-white">
            <Plane className="h-4 w-4" />
          </span>
          Atlantis
        </a>

        <div className="hidden items-center gap-6 sm:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-white px-4 pb-4 sm:hidden">
          <div className="flex flex-col gap-3 pt-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
