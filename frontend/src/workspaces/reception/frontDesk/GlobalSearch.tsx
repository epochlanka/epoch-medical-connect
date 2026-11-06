import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deskPath } from './WorkspaceContext';
import { lookupPatients } from '../../../shared/patients/patientApi';
import { listInvoices } from '../lib/billing';
import { listPrescriptions } from '../../pharmacy/lib/prescriptions';
import { useWorkspace } from './WorkspaceContext';
import { SearchIcon } from '../components/layout/Icons';
import './globalSearch.css';

/*
 * "Find the person standing in front of me" is the front desk's most frequent action, and it used
 * to mean first picking a desk, then a screen, then that screen's own search box. This searches
 * patients, prescriptions and invoices at once, from anywhere, and each result knows which desk
 * it belongs to — so choosing one switches desks when it has to.
 */

type Kind = 'patient' | 'prescription' | 'invoice';

interface Hit {
  kind: Kind;
  id: string;
  title: string;
  detail: string;
  to: string;
  desk: 'Reception' | 'Pharmacy';
}

const KIND_LABEL: Record<Kind, string> = { patient: 'Patient', prescription: 'Prescription', invoice: 'Invoice' };
const PER_KIND = 4;
const DEBOUNCE_MS = 250;

const money = (n: number) => `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { canReception, canPharmacy } = useWorkspace();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" is the muscle-memory shortcut for search; Ctrl/Cmd+K is the other one people try.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable="true"]');
      const shortcut = (event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
      if (!shortcut) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const term = query.trim();
  // Patient numbers can be a single digit ("7"), so a lone digit is a complete search.
  const searchable = term.length >= 2 || /^\d$/.test(term);

  useEffect(() => {
    if (!searchable) {
      setHits(null);
      setBusy(false);
      return;
    }
    let active = true;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      // A desk the user cannot open must not be searched — the request would only 403.
      const settled = await Promise.allSettled([
        // Ranked: a patient number, phone or NIC that matches exactly comes first.
        lookupPatients(term, PER_KIND),
        canPharmacy ? listPrescriptions({ search: term, limit: PER_KIND }) : Promise.resolve(null),
        canReception ? listInvoices({ search: term, limit: PER_KIND }) : Promise.resolve(null),
      ]);
      if (!active) return;

      const found: Hit[] = [];
      const [patients, prescriptions, invoices] = settled;

      if (patients.status === 'fulfilled' && patients.value) {
        // The profile page exists on both desks; stay on one this user can open.
        const desk = canReception ? 'Reception' : 'Pharmacy';
        for (const p of patients.value) {
          found.push({
            kind: 'patient',
            id: `patient-${p.patient_id}`,
            title: `${p.short_number ? `No. ${p.short_number} · ` : ''}${p.full_name}`,
            detail: [p.patient_id, p.phone, p.nic].filter(Boolean).join(' · '),
            to: deskPath(desk, `/patients/${encodeURIComponent(p.patient_id)}`),
            desk,
          });
        }
      }
      if (prescriptions.status === 'fulfilled' && prescriptions.value) {
        for (const rx of prescriptions.value.data) {
          const count = rx.items?.length ?? 0;
          found.push({
            kind: 'prescription',
            id: `rx-${rx.prescriptionId}`,
            title: `${rx.code} · ${rx.patientName}`,
            detail: `${rx.status} · ${count} medicine${count === 1 ? '' : 's'} · Dr. ${rx.doctorName}`,
            to: deskPath('Pharmacy', `/dispensing/${rx.prescriptionId}`),
            desk: 'Pharmacy',
          });
        }
      }
      if (invoices.status === 'fulfilled' && invoices.value) {
        for (const inv of invoices.value.data) {
          found.push({
            kind: 'invoice',
            id: `inv-${inv.invoice_id}`,
            title: `Invoice #${inv.invoice_id} · ${inv.patient.full_name}`,
            detail: `${money(inv.total_amount)} · ${inv.payment_status}`,
            to: deskPath('Reception', `/billing/invoices?patientId=${encodeURIComponent(inv.patient_id ?? '')}`),
            desk: 'Reception',
          });
        }
      }

      setHits(found);
      setCursor(0);
      setBusy(false);
      setOpen(true);
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [term, searchable, canReception, canPharmacy]);

  const grouped = useMemo(() => {
    const order: Kind[] = ['patient', 'prescription', 'invoice'];
    return order.map((kind) => ({ kind, rows: (hits ?? []).filter((h) => h.kind === kind) })).filter((g) => g.rows.length > 0);
  }, [hits]);

  const flat = useMemo(() => grouped.flatMap((g) => g.rows), [grouped]);

  const choose = useCallback(
    (hit: Hit) => {
      setOpen(false);
      setQuery('');
      setHits(null);
      inputRef.current?.blur();
      navigate(hit.to);
    },
    [navigate],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || flat.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = flat[cursor];
      if (hit) choose(hit);
    }
  };

  return (
    <div className="gs" ref={boxRef}>
      <div className="gs-field">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search patient no., name, phone, NIC, prescriptions…"
          aria-label="Search patients, prescriptions and invoices"
          aria-expanded={open}
          role="combobox"
          aria-controls="gs-results"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => searchable && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd aria-hidden="true">/</kbd>
      </div>

      {open && searchable && (
        <div className="gs-results" id="gs-results" role="listbox">
          {busy && <p className="gs-note">Searching…</p>}
          {!busy && flat.length === 0 && <p className="gs-note">Nothing matches “{term}”.</p>}
          {!busy &&
            grouped.map((group) => (
              <div className="gs-group" key={group.kind}>
                <div className="gs-group-label">{KIND_LABEL[group.kind]}</div>
                {group.rows.map((hit) => {
                  const index = flat.indexOf(hit);
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === cursor}
                      key={hit.id}
                      className={`gs-hit${index === cursor ? ' active' : ''}`}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => choose(hit)}
                    >
                      <span className="gs-hit-title">{hit.title}</span>
                      <span className="gs-hit-detail">{hit.detail}</span>
                      <span className="gs-hit-desk">{hit.desk}</span>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
