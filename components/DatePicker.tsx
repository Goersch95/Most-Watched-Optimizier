'use client';

import { useEffect, useRef, useState } from 'react';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTH_LABELS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Montag-basierter Wochentags-Offset (0=Mo..6=So) für den 1. des Monats. */
function firstWeekdayOffset(year: number, month: number): number {
  const jsWeekday = new Date(year, month, 1).getDay();
  return (jsWeekday + 6) % 7;
}

/**
 * Eigene Kalender-Auswahl statt des nativen `<input type="date">` - dessen
 * Bedienung (Spinner-Felder für Tag/Monat/Jahr) wurde als umständlich
 * empfunden. Bewusst ohne neue Abhängigkeit gebaut (kein Datepicker-Paket im
 * Projekt), passend zum bestehenden Dark-Theme.
 */
export function DatePicker({
  label,
  value,
  onChange,
  minYear,
  maxYear,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const today = new Date();
  const parsed = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function openPicker() {
    const p = parseIsoDate(value);
    setViewYear(p?.year ?? today.getFullYear());
    setViewMonth(p?.month ?? today.getMonth());
    setOpen(true);
  }

  const startYear = minYear ?? today.getFullYear() - 10;
  const endYear = maxYear ?? today.getFullYear() + 5;
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

  const numDays = daysInMonth(viewYear, viewMonth);
  const offset = firstWeekdayOffset(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ];

  const displayValue = parsed
    ? `${String(parsed.day).padStart(2, '0')}.${String(parsed.month + 1).padStart(2, '0')}.${parsed.year}`
    : '';

  return (
    <div className="relative" ref={containerRef}>
      <label className="flex flex-col gap-1 text-sm text-slate-300">
        {label}
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPicker())}
          className="min-w-[140px] rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-left text-sm text-slate-200 hover:border-slate-600"
        >
          {displayValue || <span className="text-slate-500">TT.MM.JJJJ</span>}
        </button>
      </label>

      {open && (
        <div className="absolute z-10 mt-1 w-72 rounded border border-slate-700 bg-slate-900 p-3 shadow-xl">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 0) {
                  setViewMonth(11);
                  setViewYear((y) => y - 1);
                } else {
                  setViewMonth((m) => m - 1);
                }
              }}
              className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Vorheriger Monat"
            >
              ‹
            </button>
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200"
            >
              {MONTH_LABELS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 11) {
                  setViewMonth(0);
                  setViewYear((y) => y + 1);
                } else {
                  setViewMonth((m) => m + 1);
                }
              }}
              className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Nächster Monat"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />;

              const iso = toIsoDate(viewYear, viewMonth, day);
              const isSelected = iso === value;
              const isToday =
                viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`rounded py-1 text-sm ${
                    isSelected
                      ? 'bg-red-600 text-white'
                      : isToday
                        ? 'border border-slate-600 text-slate-200 hover:bg-slate-800'
                        : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="mt-3 w-full rounded border border-slate-700 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Auswahl löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
