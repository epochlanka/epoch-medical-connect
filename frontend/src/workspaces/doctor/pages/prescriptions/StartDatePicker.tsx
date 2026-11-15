import { useState } from 'react';

// When a prescription line starts. Empty = today, the day it is prescribed. A later start lets the
// same medicine go on a second line at a new dose: "2 a day for a week, then 1 a day from next week".
// Dates are YYYY-MM-DD in the clinic's local time.

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fromToday = (days: number, months = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};

/** The day after a course that starts on `start` ('' = today) and lasts `days` days. */
export const dayAfterCourse = (start: string, days: number) => {
  const d = start ? new Date(`${start}T12:00:00`) : new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};

export const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const presets = () => [
  { key: 'tomorrow', label: 'Tomorrow', value: fromToday(1) },
  { key: '2d', label: 'In 2 days', value: fromToday(2) },
  { key: '1w', label: 'In 1 week', value: fromToday(7) },
  { key: '1m', label: 'In 1 month', value: fromToday(0, 1) },
];

export default function StartDatePicker({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  const list = presets();
  const preset = list.find((p) => p.value === value);
  const [picking, setPicking] = useState(false);
  const exact = !!value && !preset;
  const today = fromToday(0);

  return (
    <>
      <select
        className={className}
        value={!value ? 'today' : preset ? preset.key : 'exact'}
        onChange={(e) => {
          const k = e.target.value;
          if (k === 'today') {
            setPicking(false);
            onChange('');
          } else if (k === 'exact') {
            setPicking(true);
            if (!value) onChange(fromToday(1));
          } else {
            setPicking(false);
            onChange(list.find((p) => p.key === k)!.value);
          }
        }}
      >
        <option value="today">Today</option>
        {list.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
        <option value="exact">Pick a date…</option>
      </select>
      {(picking || exact) && (
        <input className={className} type="date" min={today} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Start date" style={{ marginTop: 4 }} />
      )}
      {value && <small className="rxp-start-note">Starts {dayLabel(value)}</small>}
    </>
  );
}
