import { useEffect, useRef, useState } from 'react';
import { useWorkspaceNavigate } from '../../app/WorkspaceContext';
import { lookupPatients } from './patientApi';
import type { PatientLookupHit } from './patientApi';
import { ageLabel } from './patientNumber';
import './patientSearchBox.css';

// The search box at the top of a workspace: type a patient number, phone, NIC or name, pick the
// person, land on their profile. Works the same in every workspace.

const MATCH_LABEL: Record<PatientLookupHit['matched_on'], string> = { id: 'Number', phone: 'Phone', nic: 'NIC', name: 'Name' };

export default function PatientSearchBox({ placeholder = 'Search patients by name, number, phone or NIC…' }: { placeholder?: string }) {
  const navigate = useWorkspaceNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PatientLookupHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const term = query.trim();

  useEffect(() => {
    const away = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    // "/" or Ctrl/Cmd+K jumps to search from anywhere, as on the front desk.
    const key = (e: KeyboardEvent) => {
      const typing = !!(e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, []);

  useEffect(() => {
    // A single digit is a valid patient number, so search from the first character of a number.
    if (term.length < 2 && !/^\d$/.test(term)) {
      setHits(null);
      return;
    }
    let active = true;
    setBusy(true);
    const t = window.setTimeout(() => {
      lookupPatients(term)
        .then((r) => active && (setHits(r), setCursor(0), setOpen(true)))
        .catch(() => active && setHits([]))
        .finally(() => active && setBusy(false));
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [term]);

  const choose = (hit: PatientLookupHit) => {
    setOpen(false);
    setQuery('');
    setHits(null);
    inputRef.current?.blur();
    navigate(`/patients/${encodeURIComponent(hit.patient_id)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false);
    if (!hits?.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(hits[cursor]);
    }
  };

  return (
    <div className="psb" ref={boxRef}>
      <div className="psb-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={placeholder}
          aria-label="Search patients"
          role="combobox"
          aria-expanded={open}
          aria-controls="psb-results"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => hits && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd aria-hidden="true">/</kbd>
      </div>
      {open && hits && (
        <div className="psb-results" id="psb-results" role="listbox">
          {busy && hits.length === 0 && <p className="psb-note">Searching…</p>}
          {!busy && hits.length === 0 && <p className="psb-note">No patient matches “{term}”.</p>}
          {hits.map((h, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === cursor}
              key={h.patient_id}
              className={`psb-hit${i === cursor ? ' active' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(h)}
            >
              <span className="psb-num">{h.short_number ?? h.patient_id}</span>
              <span className="psb-main">
                <strong>
                  {h.full_name}
                  {!h.is_active && <em> (inactive)</em>}
                </strong>
                <small>{[ageLabel(h.dob, h.dob_estimated), h.gender, h.phone, h.nic].filter(Boolean).join(' · ')}</small>
              </span>
              <span className="psb-why">{MATCH_LABEL[h.matched_on]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
