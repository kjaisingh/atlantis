import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

export default function AirportCombobox({ label, value, onChange, airports, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef(null);
  const inputId = useId();
  const listboxId = useId();

  useEffect(() => {
    // Parent-driven swaps must update the visible text as well as the selected code.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(value || '');
  }, [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return airports
      .filter(
        (a) =>
          a.code.toLowerCase().startsWith(q) ||
          a.city?.toLowerCase().includes(q) ||
          a.name?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, airports]);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectAirport(airport) {
    onChange(airport.code);
    setQuery(airport.code);
    setOpen(false);
  }

  function handleInputChange(event) {
    const next = event.target.value.toUpperCase();
    setQuery(next);
    onChange(next);
    setOpen(true);
    setHighlighted(0);
  }

  function handleKeyDown(event) {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!open || matches.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (matches[highlighted]) selectAirport(matches[highlighted]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlighted(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlighted(matches.length - 1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && matches.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            open && matches.length > 0 ? `${listboxId}-opt-${highlighted}` : undefined
          }
          autoComplete="off"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      {open && matches.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1.5 w-full max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((airport, index) => (
            <li
              key={airport.code}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === highlighted}
              onMouseDown={(event) => {
                event.preventDefault();
                selectAirport(airport);
              }}
              onMouseEnter={() => setHighlighted(index)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                index === highlighted ? 'bg-brand-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="font-semibold text-slate-900">{airport.code}</span>
              <span className="truncate text-slate-500">
                {airport.city
                  ? `${airport.city}${airport.name ? ` · ${airport.name}` : ''}`
                  : 'Airport'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && hasQuery && matches.length === 0 && (
        <p className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          No matching airport found.
        </p>
      )}
    </div>
  );
}
