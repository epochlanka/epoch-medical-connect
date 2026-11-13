import { useEffect, useMemo, useState } from 'react';
import { stopMedication, undoStopMedication } from '../../lib/prescriptions';
import type { OngoingMedication } from '../../lib/prescriptions';

// "Ongoing medicines" at the top of the prescription page: what the patient is on (or recently
// finished), with Continue / Change / Stop for each and "Continue selected" for the lot. Continuing
// copies the medicine into TODAY's prescription as an ordinary editable line — the old prescription
// is never changed, because it has already been dispensed and billed.

export type ContinueMode = 'continue' | 'change';

const DAY_MS = 86_400_000;
const MAX_DAYS = 365; // the longest course the quantity calculator accepts
const PRESETS = [
  { id: '1', label: '1 month', duration: '1 Month' },
  { id: '2', label: '2 months', duration: '2 Months' },
  { id: '3', label: '3 months', duration: '3 Months' },
] as const;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Days from today until a YYYY-MM-DD date (the patient takes it up to and including that day). */
export const daysUntil = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.round((new Date(y, m - 1, d).getTime() - startOfToday().getTime()) / DAY_MS);
};

const howTaken = (m: OngoingMedication) =>
  [m.doseQty ? `${m.doseQty} each time` : null, m.dosage, m.frequency, m.duration, m.route].filter(Boolean).join(' · ');

const statusLine = (m: OngoingMedication) => {
  if (m.status === 'running') {
    if (m.daysLeft === null) return { text: 'Open-ended', cls: 'ok' };
    return { text: m.daysLeft === 0 ? 'Last day today' : `${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'} left`, cls: m.daysLeft <= 7 ? 'soon' : 'ok' };
  }
  if (m.status === 'due') {
    if (m.daysLeft === null) return { text: 'Not re-confirmed for 6 months', cls: 'due' };
    const ago = -m.daysLeft;
    return { text: ago === 0 ? 'Ran out today' : `Ran out ${ago} day${ago === 1 ? '' : 's'} ago`, cls: 'due' };
  }
  const ago = m.daysLeft === null ? null : -m.daysLeft;
  return { text: ago === null ? 'Course finished' : `Course ended ${ago} day${ago === 1 ? '' : 's'} ago`, cls: 'ended' };
};

interface Props {
  medicines: OngoingMedication[];
  patientId: string;
  consultationId: number;
  /** Lower-cased names already on today's prescription (clinic or outside). */
  addedKeys: Set<string>;
  busy: boolean;
  onAdd: (meds: OngoingMedication[], duration: string, mode: ContinueMode) => void;
  /** Told which medicines have been stopped on this page (so warnings about them can clear). */
  onStoppedChange?: (keys: string[]) => void;
}

const OngoingMedicationsPanel = ({ medicines, patientId, consultationId, addedKeys, busy, onAdd, onStoppedChange }: Props) => {
  const [preset, setPreset] = useState<string>('1');
  const [untilDate, setUntilDate] = useState('');
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [showEnded, setShowEnded] = useState(false);
  const [stopping, setStopping] = useState<{ key: string; reason: string } | null>(null);
  const [stopped, setStopped] = useState<{ key: string; name: string; stopId: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onStoppedChange?.(stopped.map((s) => s.key)), [stopped, onStoppedChange]);

  const visible = medicines.filter((m) => !stopped.some((s) => s.key === m.key));
  const ongoing = visible.filter((m) => m.status !== 'ended');
  const ended = visible.filter((m) => m.status === 'ended');

  const today = startOfToday();
  const minDate = isoDay(new Date(today.getTime() + DAY_MS));
  const maxDate = isoDay(new Date(today.getTime() + MAX_DAYS * DAY_MS));

  // The duration every Continue uses: a preset, or the number of days until the chosen date.
  const duration = useMemo((): { value: string | null; problem: string | null } => {
    if (preset !== 'until') return { value: PRESETS.find((p) => p.id === preset)!.duration, problem: null };
    if (!untilDate) return { value: null, problem: 'Pick the date the medicines should last until' };
    const days = daysUntil(untilDate);
    if (days === null || days < 1) return { value: null, problem: 'Pick a date after today' };
    if (days > MAX_DAYS) return { value: null, problem: 'Pick a date within a year' };
    return { value: `${days} Days`, problem: null };
  }, [preset, untilDate]);

  if (medicines.length === 0) return null;

  // Only long-term medicines start ticked, so "Continue selected" never stretches a short course
  // (a 2-week antihistamine still running, say) to a month. Anything else is ticked deliberately.
  const tickedByDefault = (m: OngoingMedication) => m.longTerm && m.status !== 'ended';
  const isTicked = (m: OngoingMedication) => (tickedByDefault(m) ? !deselected.has(m.key) : deselected.has(m.key));
  const toggle = (m: OngoingMedication) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(m.key)) next.delete(m.key);
      else next.add(m.key);
      return next;
    });

  const selected = visible.filter((m) => isTicked(m) && !addedKeys.has(m.key));

  const add = (meds: OngoingMedication[], mode: ContinueMode) => {
    if (!duration.value) {
      setError(duration.problem);
      return;
    }
    setError(null);
    onAdd(meds, duration.value, mode);
  };

  const confirmStop = async () => {
    if (!stopping) return;
    const med = medicines.find((m) => m.key === stopping.key);
    if (!med) return;
    setError(null);
    try {
      const res = await stopMedication({ patient_id: patientId, medicine_name: med.name, reason: stopping.reason.trim() || undefined, consultation_id: consultationId });
      setStopped((prev) => [...prev, { key: med.key, name: med.name, stopId: res.stopId }]);
      setStopping(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || `Could not stop ${med.name}. Try again.`);
    }
  };

  const undoStop = async (s: { key: string; name: string; stopId: number }) => {
    setError(null);
    try {
      await undoStopMedication(s.stopId);
      setStopped((prev) => prev.filter((x) => x.stopId !== s.stopId));
    } catch (err: any) {
      setError(err?.response?.data?.message || `Could not undo stopping ${s.name}.`);
    }
  };

  const row = (m: OngoingMedication) => {
    const added = addedKeys.has(m.key);
    const st = statusLine(m);
    return (
      <li key={m.key} className={`ong-row${added ? ' is-added' : ''}`}>
        <input type="checkbox" className="ong-check" checked={added || isTicked(m)} disabled={added} onChange={() => toggle(m)} aria-label={`Select ${m.name}`} />
        <div className="ong-main">
          <div className="ong-name">
            {m.name}
            {m.outside && <span className="ext-tag">Buy outside</span>}
            {m.longTerm && <span className="rxp-longterm-tag">Long-term</span>}
          </div>
          <div className="ong-how">{howTaken(m) || 'No dosing recorded'}</div>
          <div className="ong-meta">
            <span className={`ong-status ${st.cls}`}>{st.text}</span>
            <span>Prescribed {shortDate(m.issuedAt)}</span>
            {m.lastDispensedAt && <span>Dispensed {shortDate(m.lastDispensedAt)}</span>}
          </div>
          {stopping?.key === m.key && (
            <div className="ong-stop-form">
              <input
                autoFocus
                placeholder="Reason (optional), e.g. BP controlled, side effects"
                value={stopping.reason}
                onChange={(e) => setStopping({ key: m.key, reason: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && void confirmStop()}
                maxLength={500}
              />
              <button type="button" className="ong-btn danger" onClick={() => void confirmStop()}>
                Stop {m.name}
              </button>
              <button type="button" className="ong-btn" onClick={() => setStopping(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="ong-actions">
          {added ? (
            <span className="ong-added">✓ On today's prescription</span>
          ) : (
            <>
              <button type="button" className="ong-btn primary" disabled={busy} onClick={() => add([m], 'continue')}>
                Continue
              </button>
              <button type="button" className="ong-btn" disabled={busy} onClick={() => add([m], 'change')}>
                Change
              </button>
              <button type="button" className="ong-btn danger-outline" disabled={busy} onClick={() => setStopping({ key: m.key, reason: '' })}>
                Stop
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="cons-box ong" aria-label="Ongoing medicines">
      <div className="ong-head">
        <div>
          <div className="cons-box-title" style={{ marginBottom: 2 }}>
            <span>Ongoing medicines{ongoing.length ? ` (${ongoing.length})` : ''}</span>
          </div>
          <p className="ong-sub">From earlier prescriptions. Continuing adds a medicine to today's prescription, where you can still change it.</p>
        </div>
        <div className="ong-duration" role="group" aria-label="Continue for">
          <span className="ong-duration-label">Continue for</span>
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className={`ong-seg${preset === p.id ? ' on' : ''}`} onClick={() => setPreset(p.id)}>
              {p.label}
            </button>
          ))}
          <button type="button" className={`ong-seg${preset === 'until' ? ' on' : ''}`} onClick={() => setPreset('until')}>
            Until a date…
          </button>
          {preset === 'until' && (
            <input
              type="date"
              className="ong-date"
              min={minDate}
              max={maxDate}
              value={untilDate}
              onChange={(e) => setUntilDate(e.target.value)}
              aria-label="Continue until"
            />
          )}
          {preset === 'until' && untilDate && duration.value && <span className="ong-days">= {duration.value.toLowerCase()}</span>}
        </div>
      </div>

      {error && <div className="ong-error" role="alert">{error}</div>}

      {ongoing.length > 0 ? <ul className="ong-list">{ongoing.map(row)}</ul> : <p className="ong-empty">Nothing currently ongoing.</p>}

      {ended.length > 0 && (
        <div className="ong-ended">
          <button type="button" className="card-link" onClick={() => setShowEnded((v) => !v)}>
            {showEnded ? 'Hide' : 'Show'} {ended.length} course{ended.length === 1 ? '' : 's'} that ended recently
          </button>
          {showEnded && <ul className="ong-list">{ended.map(row)}</ul>}
        </div>
      )}

      {stopped.length > 0 && (
        <div className="ong-stopped">
          {stopped.map((s) => (
            <span key={s.stopId}>
              Stopped {s.name}.{' '}
              <button type="button" className="card-link" onClick={() => void undoStop(s)}>
                Undo
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="ong-foot">
        <button type="button" className="ong-btn primary" disabled={busy || selected.length === 0} onClick={() => add(selected, 'continue')}>
          {busy ? 'Adding…' : `Continue selected (${selected.length})`}
        </button>
        {duration.problem && preset === 'until' && <span className="ong-hint">{duration.problem}</span>}
      </div>
    </div>
  );
};

export default OngoingMedicationsPanel;
