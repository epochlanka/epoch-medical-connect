import { useState } from 'react';
import type { PatientConsultationHistoryEntry, PatientHistoryMedicine } from '../lib/consultations';
import { ChevronRightIcon, RefreshIcon } from './layout/Icons';
import './visitSummary.css';

// A past visit, read-only, in the order a doctor scans it: what was wrong, what was found, what
// was given (clinic and bought outside), what was tested, what happens next. Shared by the
// consultation History tab and Patient Search so both read the same way.

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const daysAgo = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 24 ? `${months} months ago` : `${Math.round(days / 365)} years ago`;
};

/** "Take 1 Tablet each time · 500 mg · TDS · 5 Days" */
export const howToTake = (m: PatientHistoryMedicine) =>
  [
    m.startDate ? `From ${new Date(m.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : null,
    m.doseQty ? `Take ${m.doseQty} ${m.unit ?? ''} each time`.replace(/\s+each/, ' each') : null, m.dosage, m.frequency, m.duration, m.route]
    .filter(Boolean)
    .join(' · ');

const vitalsLine = (v: PatientConsultationHistoryEntry['vitals']) => {
  if (!v) return null;
  const parts = [
    v.bp_systolic && v.bp_diastolic ? `BP ${v.bp_systolic}/${v.bp_diastolic}` : null,
    v.pulse ? `Pulse ${v.pulse}` : null,
    v.temp ? `Temp ${v.temp} °C` : null,
    v.respiratory_rate ? `RR ${v.respiratory_rate}` : null,
    v.spo2 ? `SpO2 ${v.spo2}%` : null,
    v.weight ? `Weight ${v.weight} kg` : null,
    v.bmi ? `BMI ${v.bmi}` : null,
  ].filter(Boolean);
  return parts.length ? parts : null;
};

const isAbnormal = (flag: string | null) => !!flag && !/^normal$/i.test(flag.trim());

export interface RepeatRequest {
  fromDate: string;
  items: PatientHistoryMedicine[];
  external: PatientHistoryMedicine[];
}

interface Props {
  visit: PatientConsultationHistoryEntry;
  /** Show as a one-line row that opens on click. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Offered when the caller can start a prescription from these medicines. */
  onRepeat?: (request: RepeatRequest) => void;
}

const VisitSummary = ({ visit, collapsible = false, defaultOpen = false, onRepeat }: Props) => {
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const clinicMeds = visit.prescriptions.flatMap((rx) => rx.items);
  const outsideMeds = visit.prescriptions.flatMap((rx) => rx.externalMedicines ?? []);
  const vitals = vitalsLine(visit.vitals);
  const medCount = clinicMeds.length + outsideMeds.length;
  const abnormalCount = visit.labTestOrders.reduce((n, lt) => n + lt.results.filter((r) => isAbnormal(r.flag)).length, 0);

  const header = (
    <>
      <div className="vs-when">
        <strong>{formatDate(visit.createdAt)}</strong>
        <span>{daysAgo(visit.createdAt)}</span>
      </div>
      <div className="vs-what">
        <div className="vs-diagnosis">
          {visit.diagnosis || 'No diagnosis recorded'}
          {visit.icd10Code && <span className="vs-code">{visit.icd10Code}</span>}
          {(visit.additionalDiagnoses?.length ?? 0) > 0 && <span className="vs-more">+{visit.additionalDiagnoses!.length} more</span>}
        </div>
        <div className="vs-sub">
          {[
            visit.complaint,
            medCount ? `${medCount} medicine${medCount === 1 ? '' : 's'}` : 'No medicines',
            visit.labTestOrders.length ? `${visit.labTestOrders.length} test${visit.labTestOrders.length === 1 ? '' : 's'}` : null,
            `Dr. ${visit.doctorName}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          {abnormalCount > 0 && <span className="vs-flag">{abnormalCount} abnormal result{abnormalCount === 1 ? '' : 's'}</span>}
        </div>
      </div>
    </>
  );

  return (
    <article className={`vs${open ? ' is-open' : ''}`}>
      {collapsible ? (
        <button type="button" className="vs-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {header}
          <span className="vs-chevron" aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </button>
      ) : (
        <div className="vs-head">{header}</div>
      )}

      {open && (
        <div className="vs-body">
          {(visit.additionalDiagnoses?.length ?? 0) > 0 && (
            <dl className="vs-notes">
              <div>
                <dt>Diagnoses</dt>
                <dd>
                  <ol className="vs-dx">
                    {[{ code: visit.icd10Code, title: visit.diagnosis ?? 'No primary diagnosis' }, ...visit.additionalDiagnoses!].map((d, i) => (
                      <li key={i}>
                        {d.code && <span className="vs-code">{d.code}</span>} {d.title}
                        {i === 0 && <span className="vs-primary">Primary</span>}
                      </li>
                    ))}
                  </ol>
                </dd>
              </div>
            </dl>
          )}
          {(visit.complaint || visit.historyOfPresentIllness || visit.examinationFindings) && (
            <dl className="vs-notes">
              {visit.complaint && (
                <div>
                  <dt>Complaint</dt>
                  <dd>{visit.complaint}</dd>
                </div>
              )}
              {visit.historyOfPresentIllness && (
                <div>
                  <dt>History</dt>
                  <dd>{visit.historyOfPresentIllness}</dd>
                </div>
              )}
              {visit.examinationFindings && (
                <div>
                  <dt>Examination</dt>
                  <dd>{visit.examinationFindings}</dd>
                </div>
              )}
            </dl>
          )}

          {vitals && (
            <div className="vs-vitals">
              {vitals.map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
          )}

          <section className="vs-section">
            <div className="vs-section-head">
              <h4>Medicines</h4>
              {onRepeat && medCount > 0 && (
                <button
                  type="button"
                  className="vs-repeat"
                  onClick={() => onRepeat({ fromDate: visit.createdAt, items: clinicMeds, external: outsideMeds })}
                  title="Start today's prescription with these medicines — you can still change them"
                >
                  <RefreshIcon /> Prescribe these again
                </button>
              )}
            </div>
            {medCount === 0 && <p className="vs-empty">No medicines prescribed.</p>}
            {medCount > 0 && (
              <ul className="vs-meds">
                {clinicMeds.map((m, i) => (
                  <li key={`c-${i}`}>
                    <span className="vs-med-name">{m.medicine}</span>
                    <span className="vs-med-how">{howToTake(m)}</span>
                    <span className="vs-med-qty">Qty {m.qty}</span>
                    {m.instructions && <span className="vs-med-note">{m.instructions}</span>}
                  </li>
                ))}
                {outsideMeds.map((m, i) => (
                  <li key={`o-${i}`} className="is-outside">
                    <span className="vs-med-name">
                      {m.medicine} <span className="vs-outside-tag">Bought outside</span>
                    </span>
                    <span className="vs-med-how">{howToTake(m)}</span>
                    <span className="vs-med-qty">
                      Qty {m.qty} {m.unit}
                    </span>
                    {m.instructions && <span className="vs-med-note">{m.instructions}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {visit.labTestOrders.length > 0 && (
            <section className="vs-section">
              <div className="vs-section-head">
                <h4>Tests</h4>
              </div>
              {visit.labTestOrders.map((lt) => (
                <div className="vs-lab" key={lt.labTestOrderId}>
                  <div className="vs-lab-name">
                    {lt.testName}
                    <span className={`badge ${lt.status === 'Completed' ? 'badge-green' : lt.status === 'Cancelled' ? 'badge-red' : 'badge-gray'}`}>{lt.status}</span>
                  </div>
                  {lt.results.length > 0 && (
                    <table className="vs-results">
                      <tbody>
                        {lt.results.map((r) => (
                          <tr key={r.parameterName} className={isAbnormal(r.flag) ? 'is-abnormal' : ''}>
                            <th scope="row">{r.parameterName}</th>
                            <td>
                              <strong>{r.value}</strong> {r.unit}
                              {isAbnormal(r.flag) && <span className="vs-flag">{r.flag}</span>}
                            </td>
                            <td className="vs-range">{r.referenceRange ? `Ref ${r.referenceRange}` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </section>
          )}

          {(visit.medicalHistory.length > 0 || visit.followUpDate || visit.notes) && (
            <dl className="vs-notes">
              {visit.medicalHistory.length > 0 && (
                <div>
                  <dt>Conditions</dt>
                  <dd>{visit.medicalHistory.join(', ')}</dd>
                </div>
              )}
              {visit.notes && (
                <div>
                  <dt>Notes</dt>
                  <dd>{visit.notes}</dd>
                </div>
              )}
              {visit.followUpDate && (
                <div>
                  <dt>Follow-up</dt>
                  <dd>{formatDate(visit.followUpDate)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </article>
  );
};

export default VisitSummary;
