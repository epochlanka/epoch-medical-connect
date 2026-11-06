import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Doctor } from '../../lib/appointments';
import { ChevronDownIcon, SearchIcon } from '../../components/layout/Icons';

interface DoctorPickerProps {
  doctors: Doctor[] | null;
  value: number | null;
  onChange: (doctorId: number) => void;
}

const label = (d: Doctor) => `Dr. ${d.username}`;

/**
 * Which doctor the next patient is queued for: a dropdown with a search box, driven fully from the
 * keyboard (type to filter, arrows to move, Enter to choose, Escape to close) so the desk never has
 * to reach for the mouse mid check-in.
 */
const DoctorPicker = ({ doctors, value, onChange }: DoctorPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = doctors?.find((d) => d.user_id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!doctors) return [];
    if (!q) return doctors;
    return doctors.filter((d) => d.username.toLowerCase().includes(q) || (d.registration_number ?? '').toLowerCase().includes(q));
  }, [doctors, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Opening starts on the current doctor, so Enter straight away keeps the choice.
  const openList = () => {
    setQuery('');
    setActive(Math.max(0, doctors?.findIndex((d) => d.user_id === value) ?? 0));
    setOpen(true);
  };

  const choose = (d: Doctor) => {
    onChange(d.user_id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const d = matches[active];
      if (d) choose(d);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div className="chk-doctor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="chk-doctor-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!doctors || doctors.length === 0}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span>{selected ? label(selected) : doctors ? (doctors.length === 0 ? 'No doctor account' : 'Choose a doctor') : 'Loading…'}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="chk-doctor-pop">
          <div className="chk-doctor-search">
            <SearchIcon />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search doctors…"
              aria-label="Search doctors"
              aria-controls="chk-doctor-list"
              aria-activedescendant={matches[active] ? `chk-doctor-${matches[active].user_id}` : undefined}
            />
          </div>
          <ul id="chk-doctor-list" role="listbox" className="chk-doctor-list">
            {matches.length === 0 && <li className="chk-doctor-none">No doctor matches “{query.trim()}”.</li>}
            {matches.map((d, i) => (
              <li
                key={d.user_id}
                id={`chk-doctor-${d.user_id}`}
                role="option"
                aria-selected={d.user_id === value}
                className={`chk-doctor-option${i === active ? ' active' : ''}${d.user_id === value ? ' selected' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(d);
                }}
              >
                <strong>{label(d)}</strong>
                {d.registration_number && <small>{d.registration_number}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DoctorPicker;
