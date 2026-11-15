import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace, useWorkspaceNavigate } from '../../app/WorkspaceContext';
import { fileUrl } from '../../lib/api';
import { getPatientById } from '../../workspaces/doctor/lib/patients';
import type { PatientDetail } from '../../workspaces/doctor/lib/patients';
import { getPatientConsultationHistory } from '../../workspaces/doctor/lib/consultations';
import type { PatientConsultationHistoryEntry } from '../../workspaces/doctor/lib/consultations';
import { listPrescriptions, downloadPrescriptionPdf } from '../../workspaces/doctor/lib/prescriptions';
import type { PrescriptionSummary } from '../../workspaces/doctor/lib/prescriptions';
import { listLabTestOrders } from '../../workspaces/doctor/lib/labTestOrders';
import type { LabTestOrder } from '../../workspaces/doctor/lib/labTestOrders';
import { getClinicSettings } from '../../workspaces/doctor/lib/settings';
import { listInvoices } from '../../workspaces/reception/lib/billing';
import type { Invoice } from '../../workspaces/reception/lib/billing';
import { downloadPatientHistoryPdf, getPatientHistory } from '../../workspaces/doctor/lib/patients';
import type { TimelineEvent } from '../../workspaces/doctor/lib/patients';
import VisitSummary from '../../workspaces/doctor/components/VisitSummary';
import { MedicationHistory, VitalsTrend, LabTrend } from '../../workspaces/doctor/pages/patients/HistoryViews';
import { listFamilyMembers } from './patientApi';
import type { FamilyMember } from './patientApi';
import { shortPatientNumber, ageLabel, dateLabel } from './patientNumber';
import { printPatientCard } from './printPatientCard';
import '../styles/tokens.css';
import '../../workspaces/doctor/components/visitSummary.css';
import '../../workspaces/doctor/pages/patients/historyViews.css';
import './patientProfile.css';

/*
 * One page per patient, the same in every workspace: who they are, what they are allergic to,
 * what they take, and their history. What is shown follows the job: doctors (and administrators)
 * see the clinical record; reception sees details, visits, tests and bills; pharmacy sees details,
 * allergies, medicines and prescriptions.
 */

type Tab = 'visits' | 'medicines' | 'tests' | 'vitals' | 'prescriptions' | 'documents' | 'bills' | 'details';
type DocumentEvent = Extract<TimelineEvent, { type: 'document' }>;

const money = (n: number) => `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

// Each section loads on its own and fails on its own (a role without access to, say, lab orders
// just doesn't get that section) — one slow or refused request never blanks the whole profile.
function useLoad<T>(load: (() => Promise<T>) | null, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: boolean; loading: boolean }>({ data: null, error: false, loading: !!load });
  useEffect(() => {
    if (!load) return;
    let active = true;
    setState({ data: null, error: false, loading: true });
    load()
      .then((data) => active && setState({ data, error: false, loading: false }))
      .catch(() => active && setState({ data: null, error: true, loading: false }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const Field = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="pp-field">
    <dt>{label}</dt>
    <dd>{value || <span className="pp-muted">—</span>}</dd>
  </div>
);

// Also shown in the side panel (PatientPanel.tsx): then the patient comes as a prop, and opening a
// household member switches the panel to them instead of leaving the screen underneath.
export default function PatientProfile({ patientId: shownId, onOpenPatient }: { patientId?: string; onOpenPatient?: (patientId: string) => void } = {}) {
  const { patientId: routeId = '' } = useParams();
  const patientId = shownId ?? routeId;
  const { user } = useAuth();
  const workspace = useWorkspace();
  const navigate = useWorkspaceNavigate();
  const role = user?.role;
  const clinical = role === 'Doctor' || role === 'Admin';
  const canBills = role === 'Receptionist' || role === 'FrontDesk' || role === 'Admin';
  const canTests = role !== 'Pharmacist' && workspace.id !== 'pharmacy';

  const patient = useLoad<PatientDetail>(() => getPatientById(patientId), [patientId]);
  const visits = useLoad<PatientConsultationHistoryEntry[]>(() => getPatientConsultationHistory(patientId), [patientId]);
  const prescriptions = useLoad<PrescriptionSummary[]>(() => listPrescriptions({ patientId, limit: 100 }).then((r) => r.data), [patientId]);
  const tests = useLoad<LabTestOrder[]>(canTests ? () => listLabTestOrders({ patientId, limit: 100 }).then((r) => r.data) : null, [patientId, canTests]);
  const bills = useLoad<Invoice[]>(canBills ? () => listInvoices({ patientId, limit: 50 }).then((r) => r.data) : null, [patientId, canBills]);
  const settings = useLoad(() => getClinicSettings(), []);
  const documents = useLoad<DocumentEvent[]>(
    clinical ? () => getPatientHistory(patientId, { types: ['document'] }).then((ev) => ev.filter((e): e is DocumentEvent => e.type === 'document')) : null,
    [patientId, clinical]
  );
  const familyId = patient.data?.family?.family_id;
  const family = useLoad<FamilyMember[]>(familyId ? () => listFamilyMembers(familyId) : null, [familyId]);

  const tabs = useMemo(() => {
    const all: { key: Tab; label: string; show: boolean }[] = [
      { key: 'visits', label: 'Visits', show: true },
      { key: 'medicines', label: 'Medicines', show: true },
      { key: 'tests', label: 'Lab tests', show: canTests },
      { key: 'vitals', label: 'Vitals', show: clinical },
      { key: 'prescriptions', label: 'Prescriptions', show: true },
      { key: 'documents', label: 'Documents', show: clinical },
      { key: 'bills', label: 'Bills', show: canBills },
      { key: 'details', label: 'Details', show: true },
    ];
    return all.filter((t) => t.show);
  }, [canTests, clinical, canBills]);
  const [tab, setTab] = useState<Tab>('visits');
  const loadedName = patient.data?.full_name;
  // The workspace frame names the tab after the screen; on a profile, the patient's name is clearer.
  useEffect(() => {
    if (loadedName && !shownId) document.title = `${loadedName} · Patient`;
  }, [loadedName, shownId]);

  if (patient.loading) return <div className="pp"><p className="pp-muted">Loading patient…</p></div>;
  if (!patient.data) return <div className="pp"><div className="pp-error">This patient could not be found ({patientId}).</div></div>;

  const p = patient.data;
  const short = shortPatientNumber(p.patient_id);
  const allergies = p.allergies?.trim();
  const visitList = visits.data ?? [];
  const chronic = Array.from(new Set([...(p.clinicalSummary?.chronicConditions ?? []), ...(p.chronic_conditions ? [p.chronic_conditions] : [])]));

  const printCard = () =>
    printPatientCard({
      patientId: p.patient_id,
      fullName: p.full_name,
      dob: p.dob,
      dobEstimated: p.dob_estimated,
      gender: p.gender,
      clinicName: settings.data?.clinic_name,
    });

  return (
    <div className="pp">
      <header className="pp-head">
        {p.photo_url ? <img className="pp-avatar" src={fileUrl(p.photo_url)} alt="" /> : <div className="pp-avatar">{initials(p.full_name)}</div>}
        <div className="pp-who">
          <h1>
            {p.full_name}
            {!p.is_active && <span className="pp-tag">Inactive</span>}
          </h1>
          <p>
            {[
              `${ageLabel(p.dob, p.dob_estimated)}${p.dob_estimated ? '' : ` (born ${dateLabel(p.dob)})`}`,
              p.gender,
              p.phone,
              p.nic && `NIC ${p.nic}`,
              p.blood_group && `Blood ${p.blood_group}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="pp-number" title="Give this number to the patient — they can be found by it">
          <span>Patient number</span>
          <strong>{short ?? p.patient_id}</strong>
          {short && <small>{p.patient_id}</small>}
        </div>
        <div className="pp-actions">
          <button type="button" className="pp-btn primary" onClick={printCard}>
            Print patient card
          </button>
          {clinical && (
            <button type="button" className="pp-btn" onClick={() => downloadPatientHistoryPdf(p.patient_id, `${p.patient_id}-history.pdf`)}>
              History PDF
            </button>
          )}
          {workspace.id === 'reception' && (
            <button type="button" className="pp-btn" onClick={() => navigate(`/patients/all?search=${encodeURIComponent(p.patient_id)}`)}>
              Edit details
            </button>
          )}
        </div>
      </header>

      <div className={`pp-allergy ${allergies ? 'is-allergic' : 'is-clear'}`} role={allergies ? 'alert' : undefined}>
        <strong>{allergies ? 'Allergies' : 'No known allergies'}</strong>
        {allergies ? <span>{allergies}</span> : <span>Nothing recorded — ask the patient to confirm.</span>}
      </div>

      <div className="pp-layout">
        <main className="pp-main">
          <nav className="pp-tabs" aria-label="Patient record sections">
            {tabs.map((t) => (
              <button key={t.key} type="button" className={tab === t.key ? 'active' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'visits' && (
            <section>
              {visits.loading && <p className="pp-muted">Loading visits…</p>}
              {!visits.loading && visitList.length === 0 && <p className="pp-empty">No completed visits yet.</p>}
              {clinical
                ? visitList.map((v, i) => <VisitSummary key={v.consultationId} visit={v} collapsible defaultOpen={i === 0} />)
                : visitList.length > 0 && (
                    // Front desk and pharmacy see when and with whom, not the clinical notes.
                    <table className="pp-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Doctor</th>
                          <th>Medicines</th>
                          <th>Follow-up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitList.map((v) => (
                          <tr key={v.consultationId}>
                            <td>{dateLabel(v.createdAt)}</td>
                            <td>Dr. {v.doctorName}</td>
                            <td>{v.prescriptions.flatMap((rx) => [...rx.items, ...(rx.externalMedicines ?? [])]).length || '—'}</td>
                            <td>{v.followUpDate ? dateLabel(v.followUpDate) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
            </section>
          )}

          {tab === 'medicines' && (
            <MedicationHistory visits={visitList} current={p.clinicalSummary?.currentMedications ?? []} lastPrescribedAt={p.clinicalSummary?.lastPrescribedAt ?? null} />
          )}

          {tab === 'tests' && (
            <section className="pp-stack">
              {clinical && <LabTrend visits={visitList} />}
              {tests.loading && <p className="pp-muted">Loading tests…</p>}
              {!tests.loading && (tests.data ?? []).length === 0 && <p className="pp-empty">No lab tests ordered.</p>}
              {(tests.data ?? []).length > 0 && (
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Ordered</th>
                      <th>Test</th>
                      <th>Priority</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tests.data!.map((t) => (
                      <tr key={t.lab_test_order_id}>
                        <td>{dateLabel(t.order_date)}</td>
                        <td>{t.test_name}</td>
                        <td>{t.priority}</td>
                        <td>
                          <span className={`pp-status s-${t.status.replace(/\s+/g, '-').toLowerCase()}`}>{t.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {tab === 'vitals' && <VitalsTrend visits={visitList} />}

          {tab === 'prescriptions' && (
            <section>
              {prescriptions.loading && <p className="pp-muted">Loading prescriptions…</p>}
              {!prescriptions.loading && (prescriptions.data ?? []).length === 0 && <p className="pp-empty">No prescriptions yet.</p>}
              {(prescriptions.data ?? []).length > 0 && (
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Prescription</th>
                      <th>Medicines</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {prescriptions.data!.map((rx) => (
                      <tr key={rx.prescriptionId}>
                        <td>{dateLabel(rx.issuedAt)}</td>
                        <td>{rx.code}</td>
                        <td>
                          {[...rx.items.map((i) => i.medicine), ...(rx.externalMedicines ?? []).map((e) => `${e.medicine} (bought outside)`)].join(', ') || '—'}
                        </td>
                        <td>
                          <span className={`pp-status s-${rx.status.toLowerCase()}`}>{rx.status === 'External' ? 'Bought outside' : rx.status}</span>
                        </td>
                        <td className="pp-row-actions">
                          {workspace.id === 'pharmacy' && ['Pending', 'Preparing', 'Dispensed'].includes(rx.status) && (
                            <button type="button" className="pp-link" onClick={() => navigate(`/dispensing/${rx.prescriptionId}`)}>
                              Open
                            </button>
                          )}
                          <button type="button" className="pp-link" onClick={() => downloadPrescriptionPdf(rx.prescriptionId, rx.code)}>
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {tab === 'documents' && (
            <section>
              {documents.loading && <p className="pp-muted">Loading documents…</p>}
              {!documents.loading && (documents.data ?? []).length === 0 && <p className="pp-empty">No documents uploaded.</p>}
              {(documents.data ?? []).length > 0 && (
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Document</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.data!.map((d) => (
                      <tr key={d.documentId}>
                        <td>{dateLabel(d.date)}</td>
                        <td>{d.originalName}</td>
                        <td className="pp-row-actions">
                          <button type="button" className="pp-link" onClick={() => window.open(fileUrl(`/uploads/consultations/${d.filename}`), '_blank')}>
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {tab === 'bills' && (
            <section>
              {bills.loading && <p className="pp-muted">Loading bills…</p>}
              {!bills.loading && (bills.data ?? []).length === 0 && <p className="pp-empty">No bills yet.</p>}
              {(bills.data ?? []).length > 0 && (
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th className="pp-num">Total</th>
                      <th className="pp-num">Paid</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.data!.map((inv) => (
                      <tr key={inv.invoice_id}>
                        <td>{dateLabel(inv.created_at)}</td>
                        <td>#{inv.invoice_id}</td>
                        <td className="pp-num">{money(inv.total_amount)}</td>
                        <td className="pp-num">{money(inv.paid_amount)}</td>
                        <td>
                          <span className={`pp-status s-${inv.payment_status.toLowerCase()}`}>{inv.payment_status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {workspace.id === 'reception' && (
                <button type="button" className="pp-link" onClick={() => navigate(`/billing/invoices?patientId=${encodeURIComponent(p.patient_id)}`)}>
                  Open in billing →
                </button>
              )}
            </section>
          )}

          {tab === 'details' && (
            <section className="pp-card">
              <dl className="pp-fields">
                <Field label="Full name" value={p.full_name} />
                <Field label="Patient number" value={short ? `${short} (${p.patient_id})` : p.patient_id} />
                <Field label="Date of birth" value={p.dob_estimated ? `Not known — age ${ageLabel(p.dob, true)}` : dateLabel(p.dob)} />
                <Field label="Gender" value={p.gender} />
                <Field label="Phone" value={p.phone} />
                <Field label="NIC" value={p.nic} />
                <Field label="Guardian NIC" value={p.guardian_nic} />
                <Field label="Blood group" value={p.blood_group} />
                <Field label="Nationality" value={p.nationality} />
                <Field label="Marital status" value={p.marital_status} />
                <Field label="Occupation" value={p.occupation} />
                <Field label="Employer / school" value={p.employer_school} />
                <Field label="Emergency contact" value={[p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(' · ')} />
                <Field label="Address" value={p.family?.address} />
                <Field label="Household" value={p.family?.family_name} />
                <Field label="Registered" value={dateLabel(p.created_at)} />
              </dl>
            </section>
          )}
        </main>

        <aside className="pp-rail">
          <div className="pp-card">
            <h2>Taking now</h2>
            {(p.clinicalSummary?.currentMedications ?? []).length > 0 ? (
              <ul className="pp-chips">
                {p.clinicalSummary.currentMedications.map((m) => (
                  <li key={m} className={m.endsWith('(bought outside)') ? 'is-outside' : ''}>
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pp-muted">
                None running{p.clinicalSummary?.lastPrescribedAt ? ` — last prescribed ${dateLabel(p.clinicalSummary.lastPrescribedAt)}` : ''}.
              </p>
            )}
            {p.current_medications && <p className="pp-note">Patient says they take: {p.current_medications}</p>}
          </div>

          <div className="pp-card">
            <h2>Conditions</h2>
            {chronic.length ? (
              <ul className="pp-chips">
                {chronic.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="pp-muted">None recorded.</p>
            )}
          </div>

          {p.clinicalSummary?.nextFollowUp && (
            <div className="pp-card">
              <h2>Next follow-up</h2>
              <p className="pp-strong">{dateLabel(p.clinicalSummary.nextFollowUp.date)}</p>
              <p className="pp-muted">with Dr. {p.clinicalSummary.nextFollowUp.doctorName}</p>
            </div>
          )}

          <div className="pp-card">
            <h2>Household{p.family?.family_name ? ` — ${p.family.family_name}` : ''}</h2>
            {p.family?.address && <p className="pp-muted">{p.family.address}</p>}
            <ul className="pp-family">
              {(family.data ?? [])
                .filter((m) => m.patient_id !== p.patient_id)
                .map((m) => (
                  <li key={m.patient_id}>
                    <button type="button" className="pp-link" onClick={() => (onOpenPatient ? onOpenPatient(m.patient_id) : navigate(`/patients/${encodeURIComponent(m.patient_id)}`))}>
                      {m.full_name}
                    </button>
                    <span>{[m.relationship_to_head, ageLabel(m.dob), shortPatientNumber(m.patient_id) && `No. ${shortPatientNumber(m.patient_id)}`].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
            </ul>
            {family.data && family.data.filter((m) => m.patient_id !== p.patient_id).length === 0 && <p className="pp-muted">No other members.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
