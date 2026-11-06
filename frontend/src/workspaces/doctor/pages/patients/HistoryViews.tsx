import { useMemo, useState } from 'react';
import type { PatientConsultationHistoryEntry } from '../../lib/consultations';
import { howToTake } from '../../components/VisitSummary';

// Read-only history views built from one source — the patient's finalized visits — so the
// visit panel, the medicine list and the trends can never disagree with each other.

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

/** Every medicine the patient has been given, clinic and bought outside, newest first. */
export const MedicationHistory = ({ visits, current, lastPrescribedAt }: { visits: PatientConsultationHistoryEntry[]; current: string[]; lastPrescribedAt: string | null }) => {
  const [filter, setFilter] = useState('');
  const rows = useMemo(
    () =>
      visits.flatMap((v) =>
        v.prescriptions.flatMap((rx) => [
          ...rx.items.map((m) => ({ visit: v, med: m, outside: false })),
          ...(rx.externalMedicines ?? []).map((m) => ({ visit: v, med: m, outside: true })),
        ])
      ),
    [visits]
  );
  const q = filter.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.med.medicine.toLowerCase().includes(q) || (r.visit.diagnosis ?? '').toLowerCase().includes(q)) : rows;

  return (
    <div className="card">
      <div className="hv-current">
        <div>
          <span className="hv-label">Taking now (courses still running)</span>
          {current.length > 0 ? (
            <div className="hv-chips">
              {current.map((m) => (
                <span key={m} className={m.endsWith('(bought outside)') ? 'is-outside' : ''}>
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="hv-muted">None running{lastPrescribedAt ? ` — last prescribed ${shortDate(lastPrescribedAt)}` : ''}.</p>
          )}
        </div>
        <input className="pat-select hv-filter" placeholder="Filter by medicine or diagnosis…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {rows.length === 0 && <div className="card-empty">No medicines recorded for this patient yet.</div>}
      {rows.length > 0 && (
        <table className="pat-table hv-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Medicine</th>
              <th>How to take</th>
              <th>Qty</th>
              <th>For</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ visit, med, outside }, i) => (
              <tr key={`${visit.consultationId}-${i}`} className={outside ? 'is-outside' : ''}>
                <td className="hv-nowrap">{shortDate(visit.createdAt)}</td>
                <td>
                  <strong>{med.medicine}</strong>
                  {outside && <span className="vs-outside-tag" style={{ marginLeft: 6 }}>Bought outside</span>}
                </td>
                <td>{howToTake(med) || '—'}</td>
                <td className="hv-nowrap">
                  {med.qty} {outside ? med.unit : ''}
                </td>
                <td>{visit.diagnosis || '—'}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="pat-empty">
                  Nothing matches “{filter}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

const VITAL_COLUMNS: { label: string; get: (v: NonNullable<PatientConsultationHistoryEntry['vitals']>) => string | null }[] = [
  { label: 'BP (mmHg)', get: (v) => (v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : null) },
  { label: 'Pulse', get: (v) => (v.pulse ? String(v.pulse) : null) },
  { label: 'Temp (°C)', get: (v) => (v.temp ? String(v.temp) : null) },
  { label: 'SpO2 (%)', get: (v) => (v.spo2 ? String(v.spo2) : null) },
  { label: 'Weight (kg)', get: (v) => (v.weight ? String(v.weight) : null) },
  { label: 'BMI', get: (v) => (v.bmi ? String(v.bmi) : null) },
];

/** One row per visit, so a change in blood pressure or weight reads straight down a column. */
export const VitalsTrend = ({ visits }: { visits: PatientConsultationHistoryEntry[] }) => {
  const withVitals = visits.filter((v) => v.vitals && VITAL_COLUMNS.some((c) => c.get(v.vitals!)));
  if (withVitals.length === 0) return <div className="card"><div className="card-empty">No vitals recorded for this patient.</div></div>;
  return (
    <div className="card">
      <table className="pat-table hv-table">
        <thead>
          <tr>
            <th>Date</th>
            {VITAL_COLUMNS.map((c) => (
              <th key={c.label}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {withVitals.map((v) => (
            <tr key={v.consultationId}>
              <td className="hv-nowrap">{shortDate(v.createdAt)}</td>
              {VITAL_COLUMNS.map((c) => (
                <td key={c.label} className="hv-num">
                  {c.get(v.vitals!) ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const isAbnormal = (flag: string | null) => !!flag && !/^normal$/i.test(flag.trim());
const MAX_LAB_COLUMNS = 6;

/** Repeat tests side by side (e.g. fasting sugar over the last visits), newest on the left. */
export const LabTrend = ({ visits }: { visits: PatientConsultationHistoryEntry[] }) => {
  const { dates, rows } = useMemo(() => {
    const withResults = visits.filter((v) => v.labTestOrders.some((lt) => lt.results.length > 0)).slice(0, MAX_LAB_COLUMNS);
    const byParam = new Map<string, { unit: string | null; range: string | null; cells: Map<number, { value: string; flag: string | null }> }>();
    for (const v of withResults) {
      for (const lt of v.labTestOrders) {
        for (const r of lt.results) {
          const row = byParam.get(r.parameterName) ?? { unit: r.unit, range: r.referenceRange, cells: new Map() };
          if (!row.cells.has(v.consultationId)) row.cells.set(v.consultationId, { value: r.value, flag: r.flag });
          byParam.set(r.parameterName, row);
        }
      }
    }
    return { dates: withResults, rows: [...byParam.entries()] };
  }, [visits]);

  if (rows.length === 0) return null;
  return (
    <div className="card">
      <div className="pth-side-card-title">Results over time</div>
      <div className="hv-scroll">
        <table className="pat-table hv-table">
          <thead>
            <tr>
              <th>Test</th>
              {dates.map((v) => (
                <th key={v.consultationId} className="hv-nowrap">
                  {shortDate(v.createdAt)}
                </th>
              ))}
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, row]) => (
              <tr key={name}>
                <td>
                  <strong>{name}</strong>
                  {row.unit && <span className="hv-muted"> ({row.unit})</span>}
                </td>
                {dates.map((v) => {
                  const cell = row.cells.get(v.consultationId);
                  return (
                    <td key={v.consultationId} className={`hv-num${cell && isAbnormal(cell.flag) ? ' is-abnormal' : ''}`} title={cell?.flag ?? undefined}>
                      {cell?.value ?? '—'}
                    </td>
                  );
                })}
                <td className="hv-muted hv-nowrap">{row.range ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
