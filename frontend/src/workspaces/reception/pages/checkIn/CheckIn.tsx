import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useFeedback } from '../../../../shared/ui/feedback';
import { useApiData } from '../../hooks/useApiData';
import { quickRegisterPatient, updatePatientAllergies, checkPatientIdentifiers } from '../../lib/patients';
import type { IdentifierCheck } from '../../lib/patients';
import { lookupPatients } from '../../../../shared/patients/patientApi';
import { shortPatientNumber } from '../../../../shared/patients/patientNumber';
import { printPatientCard } from '../../../../shared/patients/printPatientCard';
import { getClinicSettings } from '../../../doctor/lib/settings';
import type { Patient, QuickRegisterInput } from '../../lib/patients';
import { createAppointment, getDoctors } from '../../lib/appointments';
import { getReceptionistDashboard } from '../../lib/dashboard';
import type { QueueEntry, QueueStatus } from '../../lib/dashboard';
import FamilySearchSelect from '../patients/FamilySearchSelect';
import DoctorPicker from './DoctorPicker';
import {
  SearchIcon,
  UserPlusIcon,
  PlusIcon,
  ClockIcon,
  StethoscopeIcon,
  PharmacyIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CalendarIcon,
  XIcon,
  AlertIcon,
} from '../../components/layout/Icons';
import '../../styles/shared.css';
import './checkIn.css';
import { PatientLink } from '../../../../shared/patients/PatientPanel';

/**
 * The front desk's home: find a patient and put them in the queue, or register a new one in a
 * few fields and queue them in the same click — with today's queue beside it, so staff never
 * leave this screen for an ordinary walk-in.
 */

type Priority = 'Normal' | 'Urgent' | 'Emergency';
type Gender = QuickRegisterInput['gender'];

const PRIORITIES: Priority[] = ['Normal', 'Urgent', 'Emergency'];
const GENDERS: Gender[] = ['Male', 'Female', 'Other'];
const DOCTOR_KEY = 'epoch.checkIn.doctorId';
const QUEUE_REFRESH_MS = 20_000;
// Statuses in which a patient is already on today's list and should not be queued twice.
const ACTIVE_IN_QUEUE: QueueStatus[] = ['Waiting', 'With Doctor'];
const STATUS_ORDER: Record<QueueStatus, number> = { 'With Doctor': 0, Waiting: 1, 'With Pharmacy': 2, Completed: 3 };

interface QuickForm {
  full_name: string;
  gender: Gender | '';
  ageMode: 'age' | 'dob';
  age: string;
  dob: string;
  phone: string;
  nic: string;
  allergies: string;
  family: { id: string; name: string } | null;
}

const emptyForm: QuickForm = { full_name: '', gender: '', ageMode: 'age', age: '', dob: '', phone: '', nic: '', allergies: '', family: null };

const looksLikeNic = (s: string) => /^(\d{9}[vVxX]|\d{12})$/.test(s);
const looksLikePhone = (s: string) => /^\+?[\d\s-]{7,}$/.test(s) && !looksLikeNic(s);
const looksLikePatientId = (s: string) => /^PT-?\d+$/i.test(s);

// What was typed into the search box goes into the field it most likely belongs to, so a
// patient who was not found never has their details typed twice.
const formFromSearch = (search: string): QuickForm => {
  const term = search.trim();
  if (looksLikeNic(term)) return { ...emptyForm, nic: term };
  if (looksLikePhone(term)) return { ...emptyForm, phone: term };
  if (looksLikePatientId(term)) return emptyForm;
  return { ...emptyForm, full_name: term };
};

const ageOf = (dob: string) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
};

// What the search results and the new-patient banner need — the ranked lookup returns this much.
type FoundPatient = Pick<Patient, 'patient_id' | 'full_name' | 'gender' | 'dob' | 'dob_estimated' | 'phone' | 'nic' | 'allergies'>;

const ageLabel = (p: Pick<Patient, 'dob' | 'dob_estimated'>) => `${p.dob_estimated ? '~' : ''}${ageOf(p.dob)} y`;

const readStoredDoctor = () => {
  try {
    return Number(localStorage.getItem(DOCTOR_KEY)) || null;
  } catch {
    return null;
  }
};

const CheckIn = () => {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<FoundPatient[]>([]);
  // The patient just registered, kept on screen with their number until dismissed, so the card
  // can be printed and handed over even after they were added to the queue.
  const [justRegistered, setJustRegistered] = useState<FoundPatient | null>(null);
  const [searching, setSearching] = useState(false);

  const [doctorId, setDoctorId] = useState<number | null>(readStoredDoctor);
  const [priority, setPriority] = useState<Priority>('Normal');
  const [reason, setReason] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<QuickForm>(emptyForm);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [existingMatch, setExistingMatch] = useState<{ patient_id: string; full_name: string } | null>(null);
  // Live check of the phone and NIC being typed: one phone and one NIC per patient (a phone may be
  // shared within a family), so a clash is shown under the box before Register is pressed.
  const [idCheck, setIdCheck] = useState<IdentifierCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Allergies being recorded for an existing patient, straight from the search results.
  const [allergyEdit, setAllergyEdit] = useState<{ patientId: string; value: string } | null>(null);
  const [allergySaving, setAllergySaving] = useState(false);

  const { data: doctors } = useApiData(() => getDoctors(), []);
  const { data: dash, reload: reloadQueue } = useApiData(() => getReceptionistDashboard(), []);
  const [liveDash, setLiveDash] = useState(dash);
  useEffect(() => setLiveDash(dash), [dash]);

  // Keep today's queue current without a full reload, and without error toasts on a blip.
  useEffect(() => {
    const t = setInterval(() => {
      getReceptionistDashboard(true).then(setLiveDash).catch(() => {});
    }, QUEUE_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // A remembered doctor who no longer exists, or none yet: fall back to the first doctor, which
  // with a single doctor means staff never have to choose.
  useEffect(() => {
    if (!doctors || doctors.length === 0) return;
    if (!doctors.some((d) => d.user_id === doctorId)) setDoctorId(doctors[0].user_id);
  }, [doctors, doctorId]);

  useEffect(() => {
    if (doctorId === null) return;
    try {
      localStorage.setItem(DOCTOR_KEY, String(doctorId));
    } catch {
      /* the choice is only a convenience */
    }
  }, [doctorId]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      // Same ranked lookup as the search box at the top: patient number, phone, NIC or name.
      lookupPatients(term, 8)
        .then((r) => setResults(r.filter((p) => p.is_active)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const phone = form.phone.trim();
    const nic = form.nic.trim();
    if (!formOpen || (phone.replace(/\D/g, '').length < 7 && nic.length < 9)) {
      setIdCheck(null);
      return;
    }
    let active = true;
    const t = setTimeout(() => {
      checkPatientIdentifiers({
        phone: phone.replace(/\D/g, '').length >= 7 ? phone : undefined,
        nic: nic.length >= 9 ? nic : undefined,
        familyId: form.family ? Number(form.family.id) : undefined,
      })
        .then((r) => active && setIdCheck(r))
        .catch(() => active && setIdCheck(null));
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [formOpen, form.phone, form.nic, form.family]);
  const identifierBlocked = !!idCheck && (idCheck.phone.blocked || !!idCheck.nic.holder);

  const queue = useMemo(() => liveDash?.todaysQueue ?? [], [liveDash]);
  const inQueue = useMemo(() => {
    const map = new Map<string, QueueEntry>();
    for (const entry of queue) if (entry.patientId && ACTIVE_IN_QUEUE.includes(entry.status)) map.set(entry.patientId, entry);
    return map;
  }, [queue]);

  const openQueue = useMemo(
    () =>
      queue
        .filter((e) => e.status !== 'Completed')
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.waitTimeMinutes ?? 0) - (a.waitTimeMinutes ?? 0)),
    [queue],
  );

  const counts = liveDash?.queueCounts;
  const doctorName = doctors?.find((d) => d.user_id === doctorId)?.username;
  const term = search.trim();

  const resetForNextPatient = () => {
    setSearch('');
    setResults([]);
    setPriority('Normal');
    setReason('');
    setForm(emptyForm);
    setFormOpen(false);
    setFamilyOpen(false);
    setFormError(null);
    setExistingMatch(null);
    setAllergyEdit(null);
    searchRef.current?.focus();
  };

  const saveAllergies = async () => {
    if (!allergyEdit) return;
    const value = allergyEdit.value.trim();
    const patient = results.find((r) => r.patient_id === allergyEdit.patientId);
    setAllergySaving(true);
    try {
      await updatePatientAllergies(allergyEdit.patientId, value);
      setResults((rs) => rs.map((r) => (r.patient_id === allergyEdit.patientId ? { ...r, allergies: value || null } : r)));
      setAllergyEdit(null);
      toast(value ? `Allergies saved for ${patient?.full_name ?? 'the patient'}. The doctor will see them.` : `Recorded no known allergies for ${patient?.full_name ?? 'the patient'}.`, 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Could not save the allergies.', 'error');
    } finally {
      setAllergySaving(false);
    }
  };

  const addToQueue = async (patient: { patient_id: string; full_name: string }) => {
    if (!doctorId) {
      toast('Choose a doctor first.', 'error');
      return false;
    }
    setBusy(patient.patient_id);
    try {
      await createAppointment({
        patient_id: patient.patient_id,
        doctor_id: doctorId,
        scheduled_at: new Date().toISOString(),
        is_walk_in: true,
        consultation_type: 'General Consultation',
        visit_type: 'Appointment',
        priority,
        reason: reason.trim() || undefined,
      });
      toast(`${patient.full_name} added to the queue${doctorName ? ` for Dr. ${doctorName}` : ''}.`, 'success');
      resetForNextPatient();
      reloadQueue();
      return true;
    } catch (err: any) {
      toast(err?.response?.data?.message || `Could not add ${patient.full_name} to the queue.`, 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const openForm = () => {
    setForm(formFromSearch(search));
    setFormError(null);
    setExistingMatch(null);
    setFormOpen(true);
  };

  // The first thing still missing or wrong, in the order the fields appear; null when complete.
  const formProblem = (): string | null => {
    if (!form.full_name.trim()) return 'Enter the patient’s name.';
    if (!form.gender) return 'Choose the patient’s gender.';
    if (form.ageMode === 'age') {
      if (form.age.trim() === '') return 'Enter the patient’s age, or switch to date of birth.';
      if (Number(form.age) > 130) return 'Age must be between 0 and 130 years.';
    } else if (!form.dob) {
      return 'Enter the date of birth, or switch to age.';
    } else if (form.dob > new Date().toISOString().slice(0, 10)) {
      return 'The date of birth cannot be in the future.';
    }
    return null;
  };

  const register = async (thenQueue: boolean) => {
    const problem = formProblem();
    if (problem) {
      setFormError(problem);
      return;
    }
    if (thenQueue && !doctorId) {
      setFormError('Choose a doctor first.');
      return;
    }
    setBusy('register');
    setFormError(null);
    setExistingMatch(null);
    try {
      const { patient, duplicateFlags } = await quickRegisterPatient({
        full_name: form.full_name.trim(),
        gender: form.gender as Gender,
        ...(form.ageMode === 'age' ? { age: Number(form.age) } : { dob: form.dob }),
        phone: form.phone.trim() || undefined,
        nic: form.nic.trim() || undefined,
        allergies: form.allergies.trim() || undefined,
        family_id: form.family ? Number(form.family.id) : undefined,
      });
      setJustRegistered(patient);
      if (duplicateFlags.length > 0) toast(`${patient.full_name} may already be registered — flagged under Possible duplicates for review.`, 'info');
      if (thenQueue) {
        setBusy(null);
        if (!(await addToQueue(patient))) {
          // Registered, but not queued. Show the new record in the results so it can be queued
          // from there — leaving the form filled in would invite registering them a second time.
          setForm(emptyForm);
          setFormOpen(false);
          setSearch(patient.patient_id);
        }
      } else {
        toast(`${patient.full_name} registered (${patient.patient_id}).`, 'success');
        resetForNextPatient();
      }
    } catch (err: any) {
      const conflict = err?.response?.status === 409 ? err.response.data?.conflictingPatient : null;
      if (conflict) {
        setExistingMatch(conflict);
        // The server says which identifier clashed (NIC or phone) and with whom.
        setFormError(`${err.response.data?.message || 'This patient is already registered'} (${conflict.patient_id}).`);
      } else {
        setFormError(err?.response?.data?.message || 'Could not register this patient.');
      }
    } finally {
      setBusy((b) => (b === 'register' ? null : b));
    }
  };

  // Under the phone/NIC box: who already has it, and one click to use that patient instead.
  const IdentifierClash = ({ message, blocked, patients }: { message: string; blocked: boolean; patients: { patient_id: string; full_name: string }[] }) => (
    <span className={`chk-id-clash${blocked ? ' is-blocked' : ''}`} role={blocked ? 'alert' : 'status'}>
      {message}
      {blocked &&
        patients.slice(0, 3).map((p) => (
          <span className="chk-id-clash-actions" key={p.patient_id}>
            <button type="button" className="chk-link" disabled={busy !== null || !!inQueue.get(p.patient_id)} onClick={() => void addToQueue(p)}>
              {inQueue.get(p.patient_id) ? `${p.full_name} is already in the queue` : `Add ${p.full_name} to the queue`}
            </button>
            <button type="button" className="chk-link" onClick={() => navigate(`/patients/${encodeURIComponent(p.patient_id)}`)}>
              Open profile
            </button>
          </span>
        ))}
    </span>
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void register(true);
  };

  const set = <K extends keyof QuickForm>(key: K, value: QuickForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="chk-page">
      <header className="chk-header">
        <div>
          <span className="chk-eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1>Check in</h1>
          <p>Find the patient, or register them here, and add them to today's queue.</p>
        </div>
        <nav className="chk-links" aria-label="Other front desk tasks">
          <button className="pat-btn" onClick={() => navigate('/appointments/book')}>
            <CalendarIcon /> Book an appointment
          </button>
          <button className="pat-btn" onClick={() => navigate('/patients/register')}>
            <UserPlusIcon /> Full registration
          </button>
        </nav>
      </header>

      {justRegistered && (
        <div className="chk-new-patient" role="status">
          <div>
            <span>New patient registered</span>
            <strong>{justRegistered.full_name}</strong>
          </div>
          <div className="chk-new-number">
            <span>Patient number</span>
            <strong>{shortPatientNumber(justRegistered.patient_id) ?? justRegistered.patient_id}</strong>
          </div>
          <p>Give this number to the patient — they can be found by it next time, without an NIC or phone.</p>
          <div className="chk-new-actions">
            <button
              type="button"
              className="pat-btn primary"
              onClick={async () => {
                const settings = await getClinicSettings().catch(() => null);
                printPatientCard({
                  patientId: justRegistered.patient_id,
                  fullName: justRegistered.full_name,
                  dob: justRegistered.dob,
                  dobEstimated: justRegistered.dob_estimated,
                  gender: justRegistered.gender,
                  clinicName: settings?.clinic_name,
                });
              }}
            >
              Print patient card
            </button>
            <button type="button" className="pat-btn" onClick={() => navigate(`/patients/${encodeURIComponent(justRegistered.patient_id)}`)}>
              Open profile
            </button>
            <button type="button" className="chk-link" onClick={() => setJustRegistered(null)} aria-label="Dismiss">
              Done
            </button>
          </div>
        </div>
      )}

      <div className="chk-layout">
        <section className="chk-main" aria-label="Check in a patient">
          {/* Visit settings apply to whoever is queued next; they reset after each patient. */}
          <div className="chk-visit">
            <div className="chk-visit-field">
              <span>Doctor</span>
              <DoctorPicker doctors={doctors} value={doctorId} onChange={setDoctorId} />
            </div>
            <div className="chk-visit-field">
              <span>Priority</span>
              <div className="chk-segment" role="group" aria-label="Priority">
                {PRIORITIES.map((p) => (
                  <button key={p} type="button" className={`chk-seg ${p.toLowerCase()} ${priority === p ? 'on' : ''}`} aria-pressed={priority === p} onClick={() => setPriority(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <label className="chk-visit-field grow">
              <span>Reason for visit (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever for 3 days" maxLength={200} />
            </label>
          </div>

          <div className="chk-search">
            <SearchIcon />
            <input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (formOpen && !form.full_name && !form.phone && !form.nic) setFormOpen(false);
              }}
              placeholder="Search by name, phone, NIC or patient ID"
              aria-label="Search patients"
            />
            {search && (
              <button type="button" className="chk-search-clear" onClick={resetForNextPatient} aria-label="Clear search">
                <XIcon />
              </button>
            )}
          </div>

          {term.length >= 2 && (
            <div className="chk-results" aria-live="polite">
              {searching && results.length === 0 && <div className="chk-empty">Searching…</div>}
              {!searching && results.length === 0 && <div className="chk-empty">No registered patient matches “{term}”.</div>}
              {results.map((p) => {
                const queued = inQueue.get(p.patient_id);
                return (
                  <div className="chk-result" key={p.patient_id}>
                    <div className="chk-result-main">
                      <button type="button" className="chk-name-link" onClick={() => navigate(`/patients/${encodeURIComponent(p.patient_id)}`)} title="Open patient profile">
                        {p.full_name}
                      </button>
                      <span className="chk-result-meta">
                        {shortPatientNumber(p.patient_id) ? `No. ${shortPatientNumber(p.patient_id)}` : p.patient_id} · {ageLabel(p)} · {p.gender}
                        {p.phone && ` · ${p.phone}`}
                        {p.nic && ` · NIC ${p.nic}`}
                      </span>
                      {allergyEdit?.patientId === p.patient_id ? (
                        <div className="chk-allergy-edit">
                          <input
                            autoFocus
                            value={allergyEdit.value}
                            onChange={(e) => setAllergyEdit({ patientId: p.patient_id, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveAllergies();
                              if (e.key === 'Escape') setAllergyEdit(null);
                            }}
                            placeholder="e.g. Penicillin, peanuts. Leave blank if none."
                            aria-label={`Allergies for ${p.full_name}`}
                            maxLength={500}
                          />
                          <button type="button" className="pat-btn" disabled={allergySaving} onClick={() => void saveAllergies()}>
                            {allergySaving ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" className="chk-link" onClick={() => setAllergyEdit(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className={`chk-allergy ${p.allergies ? 'has' : 'none'}`}>
                          {p.allergies ? (
                            <>
                              <AlertIcon /> Allergies: {p.allergies}
                            </>
                          ) : (
                            'No allergies recorded'
                          )}
                          <button type="button" className="chk-link" onClick={() => setAllergyEdit({ patientId: p.patient_id, value: p.allergies ?? '' })}>
                            {p.allergies ? 'Update' : 'Add'}
                          </button>
                        </span>
                      )}
                    </div>
                    {queued ? (
                      <span className="chk-queued">
                        In queue · {queued.status === 'With Doctor' ? 'with doctor' : 'waiting'}
                      </span>
                    ) : (
                      <button className="pat-btn primary" disabled={busy !== null || !doctorId} onClick={() => void addToQueue(p)}>
                        <PlusIcon /> {busy === p.patient_id ? 'Adding…' : 'Add to queue'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!formOpen ? (
            <button type="button" className="chk-new" onClick={openForm}>
              <span className="chk-new-icon">
                <UserPlusIcon />
              </span>
              <span>
                <strong>{term.length >= 2 && !searching ? 'Not in the list? Register a new patient' : 'Register a new patient'}</strong>
                <small>Name, gender and age are enough. NIC and phone are optional.</small>
              </span>
              <ChevronRightIcon />
            </button>
          ) : (
            <form className="chk-form" onSubmit={onSubmit} noValidate>
              <div className="chk-form-head">
                <h2>New patient</h2>
                <button type="button" className="chk-link" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
              </div>

              <div className="chk-grid">
                <label className="chk-field span-2">
                  <span>Full name *</span>
                  <input autoFocus={!form.full_name} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="e.g. Nimal Perera" />
                </label>

                <div className="chk-field">
                  <span>Gender *</span>
                  <div className="chk-segment" role="group" aria-label="Gender">
                    {GENDERS.map((g) => (
                      <button key={g} type="button" className={`chk-seg ${form.gender === g ? 'on' : ''}`} aria-pressed={form.gender === g} onClick={() => set('gender', g)}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="chk-field">
                  <span className="chk-field-label-row">
                    {form.ageMode === 'age' ? 'Age (years) *' : 'Date of birth *'}
                    <button type="button" className="chk-link" onClick={() => set('ageMode', form.ageMode === 'age' ? 'dob' : 'age')}>
                      {form.ageMode === 'age' ? 'Use date of birth' : 'Use age'}
                    </button>
                  </span>
                  {form.ageMode === 'age' ? (
                    <input inputMode="numeric" value={form.age} onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 34" />
                  ) : (
                    <input type="date" value={form.dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dob', e.target.value)} />
                  )}
                </div>

                <label className="chk-field">
                  <span>Phone</span>
                  <input
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="Optional"
                    aria-invalid={idCheck?.phone.blocked || undefined}
                  />
                  {idCheck?.phone.message && (
                    <IdentifierClash
                      message={idCheck.phone.blocked ? idCheck.phone.message : `${idCheck.phone.message} (same family — allowed)`}
                      blocked={idCheck.phone.blocked}
                      patients={idCheck.phone.holders}
                    />
                  )}
                </label>

                <label className="chk-field">
                  <span>NIC</span>
                  <input value={form.nic} onChange={(e) => set('nic', e.target.value)} placeholder="Optional" aria-invalid={!!idCheck?.nic.holder || undefined} />
                  {idCheck?.nic.holder && idCheck.nic.message && <IdentifierClash message={idCheck.nic.message} blocked patients={[idCheck.nic.holder]} />}
                </label>

                <label className="chk-field span-2">
                  <span>Allergies</span>
                  <input value={form.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="Ask the patient, e.g. Penicillin, peanuts. Leave blank if none." maxLength={500} />
                  <small className="chk-field-help">Shown to the doctor during the consultation and checked against prescriptions.</small>
                </label>
              </div>

              <div className="chk-family">
                {familyOpen ? (
                  <div className="chk-field">
                    <span className="chk-field-label-row">
                      Add to an existing family
                      <button
                        type="button"
                        className="chk-link"
                        onClick={() => {
                          setFamilyOpen(false);
                          set('family', null);
                        }}
                      >
                        Use own household
                      </button>
                    </span>
                    <FamilySearchSelect
                      selectedId={form.family?.id ?? ''}
                      selectedName={form.family?.name ?? ''}
                      onSelect={(id, name) => set('family', { id, name })}
                      onClear={() => set('family', null)}
                    />
                  </div>
                ) : (
                  <p className="chk-hint">
                    They'll get a household of their own.{' '}
                    <button type="button" className="chk-link" onClick={() => setFamilyOpen(true)}>
                      Add to an existing family instead
                    </button>
                  </p>
                )}
              </div>

              {formError && (
                <div className="chk-error" role="alert">
                  <span>{formError}</span>
                  {existingMatch && (
                    <button type="button" className="pat-btn" disabled={busy !== null || !!inQueue.get(existingMatch.patient_id)} onClick={() => void addToQueue(existingMatch)}>
                      {inQueue.get(existingMatch.patient_id) ? 'Already in the queue' : `Add ${existingMatch.full_name} to the queue`}
                    </button>
                  )}
                </div>
              )}

              <div className="chk-actions">
                <button type="button" className="pat-btn" disabled={busy !== null || identifierBlocked} onClick={() => void register(false)}>
                  Register only
                </button>
                <button type="submit" className="pat-btn primary" disabled={busy !== null || !doctorId || identifierBlocked}>
                  <PlusIcon /> {busy ? 'Saving…' : 'Register & add to queue'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="chk-queue" aria-label="Today's queue">
          <div className="chk-queue-head">
            <h2>Today's queue</h2>
            <button className="chk-link" onClick={() => navigate('/queue/live')}>
              Patient flow <ChevronRightIcon />
            </button>
          </div>
          <div className="chk-counts">
            <div className="chk-count waiting">
              <ClockIcon />
              <strong>{counts?.waiting ?? 0}</strong>
              <span>Waiting</span>
            </div>
            <div className="chk-count doctor">
              <StethoscopeIcon />
              <strong>{counts?.withDoctor ?? 0}</strong>
              <span>With doctor</span>
            </div>
            <div className="chk-count pharmacy">
              <PharmacyIcon />
              <strong>{counts?.withPharmacy ?? 0}</strong>
              <span>Pharmacy</span>
            </div>
            <div className="chk-count done">
              <CheckCircleIcon />
              <strong>{counts?.completed ?? 0}</strong>
              <span>Finished</span>
            </div>
          </div>
          <ol className="chk-queue-list">
            {openQueue.length === 0 && <li className="chk-empty">Nobody is waiting right now.</li>}
            {openQueue.map((e) => (
              <li key={e.appointmentId} className="chk-queue-row">
                <span className="chk-token">{e.token}</span>
                <span className="chk-queue-who">
                  <strong><PatientLink patientId={e.patientId}>{e.patientName}</PatientLink></strong>
                  <small>
                    Dr. {e.doctorName}
                    {e.status === 'Waiting' && e.waitTimeMinutes !== null && ` · ${e.waitTimeMinutes} min`}
                  </small>
                </span>
                <span className={`chk-status s-${e.status.replace(/\s+/g, '-').toLowerCase()}`}>{e.status === 'With Pharmacy' ? 'Pharmacy' : e.status}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
};

export default CheckIn;
