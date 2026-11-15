import { useEffect, useRef, useState } from 'react';

// When the medicine is taken. A list of the usual times, grouped by how many doses a day, plus
// "Type your own…" for anything else. Every listed wording is one the quantity calculation
// understands (here and in backend/src/modules/prescriptions/qtyCalc.ts): "once / twice / three
// times daily", a known code (OD, BD, TDS…) or "every N hours". Weekly, alternate-day and as-needed
// choices have no fixed daily count, so the quantity is entered by hand for those, as before.
export const FREQUENCY_GROUPS: { label: string; options: string[] }[] = [
  {
    label: 'Once a day',
    options: ['OD - Once Daily', 'OM - Morning (once daily)', 'Noon / Afternoon (once daily)', 'Evening (once daily)', 'ON - Night (once daily)', 'HS - At bedtime'],
  },
  {
    label: 'Twice a day',
    options: ['BD - Twice Daily', 'Morning & Night (twice daily)', 'Morning & Afternoon (twice daily)', 'Afternoon & Night (twice daily)', 'Morning & Evening (twice daily)'],
  },
  {
    label: 'Three or more times a day',
    options: ['TDS - Three times daily', 'Morning, Afternoon & Night (three times daily)', 'QID - Four times daily'],
  },
  { label: 'By the hour', options: ['Every 4 hours', 'Every 6 hours', 'Every 8 hours', 'Every 12 hours'] },
  { label: 'Other', options: ['Alternate days', 'Weekly (one dose a week)', 'PRN - As needed', 'SOS - If required', 'STAT'] },
];

const LISTED = new Set(FREQUENCY_GROUPS.flatMap((g) => g.options));
const CUSTOM = '__custom__';

export default function FrequencyPicker({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  // Typing mode: the doctor chose "Type your own…", or the line already has a wording not listed.
  const [typing, setTyping] = useState(() => !!value && !LISTED.has(value));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value && !LISTED.has(value)) setTyping(true);
  }, [value]);

  if (typing) {
    return (
      <span className="freq-custom">
        <input ref={inputRef} className={className} value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. 2 tablets morning, 1 at night" autoFocus={!value} />
        <button
          type="button"
          className="freq-back"
          title="Choose from the list"
          onClick={(e) => {
            e.preventDefault();
            setTyping(false);
            if (!LISTED.has(value)) onChange('');
          }}
        >
          List
        </button>
      </span>
    );
  }
  return (
    <select
      className={className}
      value={LISTED.has(value) ? value : ''}
      onChange={(e) => {
        if (e.target.value === CUSTOM) {
          setTyping(true);
          onChange('');
        } else onChange(e.target.value);
      }}
    >
      <option value="">Choose…</option>
      {FREQUENCY_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </optgroup>
      ))}
      <option value={CUSTOM}>✎ Type your own…</option>
    </select>
  );
}
