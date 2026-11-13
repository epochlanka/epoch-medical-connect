import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import {
  getConsultationContext,
  createConsultation,
  updateConsultation,
  finalizeConsultation,
  listAmendments,
  AMENDABLE_FIELDS,
  displayPatient,
  getPatientConsultationHistory,
} from '../../lib/consultations';
import type { ConsultationInput, AmendmentEntry, AmendableField, PatientConsultationHistoryEntry } from '../../lib/consultations';
import { searchIcd11 } from '../../lib/icd11';
import type { Icd11Match } from '../../lib/icd11';
import { getClinicSettings } from '../../lib/settings';
import { listLabTestOrders, printLabTestOrder, printLabResultReport } from '../../lib/labTestOrders';
import type { LabTestOrder } from '../../lib/labTestOrders';
import { listActiveLetterTemplates, previewLetter, issueLetter, listIssuedLettersForPatient, printIssuedLetterAgain } from '../../lib/letters';
import type { LetterTemplate, IssuedLetterSummary } from '../../lib/letters';
import AmendModal from './AmendModal';
import AiSummaryPanel from '../../components/AiSummaryPanel';
import AddLabTestModal from '../labTestOrders/AddLabTestModal';
import MarkReceivedModal from '../labTestOrders/MarkReceivedModal';
import LabResultModal from '../labTestOrders/LabResultModal';
import { getLiveQueue, calculateAge, tokenNumber, displayPatientName } from '../../lib/queue';
import { updatePatientAllergies } from '../../lib/patients';
import {
  ChevronLeftIcon,
  RefreshIcon,
  SaveIcon,
  CheckCircleIcon,
  ClockIcon,
  PrescriptionIcon,
  ClipboardIcon,
  AlertIcon,
  PlusIcon,
  EditIcon,
  PrintIcon,
  EyeIcon,
  FileIcon,
  ChevronRightIcon,
} from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import './consultation.css';
import VisitSummary from '../../components/VisitSummary';
import type { DiagnosisEntry } from '../../lib/consultations';
import type { RepeatRequest } from '../../components/VisitSummary';
import '../labTestOrders/labTestOrders.css';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
// Follow-up dates are calendar days in clinic time, so build them from local date parts, not UTC.
const isoDateInDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatLongDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const FOLLOW_UP_PICKS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 91 },
];
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const SUPPORT_TABS = [
  { key: 'consultation', label: 'Clinical assessment' },
  { key: 'history', label: 'Patient history' },
  { key: 'laborders', label: 'Tests' },
  { key: 'letters', label: 'Letters' },
] as const;
type TabKey = 'consultation' | 'examination' | 'prescription' | 'laborders' | 'followup' | 'letters' | 'history';

interface FormState {
  complaint: string;
  history_of_present_illness: string;
  examination_findings: string;
  medical_history: string[];
  /** All diagnoses in order; the first is the primary one stored in diagnosis/icd10_code. */
  diagnoses: DiagnosisEntry[];
  notes: string;
  allergies_ack: boolean;
  vitals: {
    bp_systolic: string;
    bp_diastolic: string;
    temp: string;
    pulse: string;
    respiratory_rate: string;
    spo2: string;
    weight: string;
    height: string;
  };
}

const emptyForm: FormState = {
  complaint: '',
  history_of_present_illness: '',
  examination_findings: '',
  medical_history: [],
  diagnoses: [],
  notes: '',
  allergies_ack: false,
  vitals: { bp_systolic: '', bp_diastolic: '', temp: '', pulse: '', respiratory_rate: '', spo2: '', weight: '', height: '' },
};

// The form as stored on the server (or, before the first save, as reception left it) — used to
// load the page and as the baseline autosave compares against, so opening a visit saves nothing.
const formFromContext = (context: Awaited<ReturnType<typeof getConsultationContext>>): FormState => {
  const c = context.consultation;
  return {
    // Until the doctor writes their own, start from what the patient told reception.
    complaint: c?.complaint || context.appointment.reason || '',
    history_of_present_illness: c?.history_of_present_illness ?? '',
    examination_findings: c?.examination_findings ?? '',
    medical_history: c?.medicalHistory ?? [],
    diagnoses: [
      ...(c?.diagnosis ? [{ code: c.icd10_code || null, title: c.diagnosis }] : []),
      ...(c?.additionalDiagnoses ?? []),
    ],
    notes: c?.notes ?? '',
    allergies_ack: c?.allergies_ack ?? false,
    vitals: {
      bp_systolic: c?.vitals?.bp_systolic?.toString() ?? '',
      bp_diastolic: c?.vitals?.bp_diastolic?.toString() ?? '',
      temp: c?.vitals?.temp?.toString() ?? '',
      pulse: c?.vitals?.pulse?.toString() ?? '',
      respiratory_rate: c?.vitals?.respiratory_rate?.toString() ?? '',
      spo2: c?.vitals?.spo2?.toString() ?? '',
      weight: c?.vitals?.weight?.toString() ?? '',
      height: c?.vitals?.height?.toString() ?? '',
    },
  };
};

const numOrUndefined = (s: string) => (s.trim() === '' ? undefined : Number(s));

// Landing view when no appointment is specified — routes the doctor straight to whichever
// appointment of theirs is currently Consulting, or offers a pick list / a way back to the queue.
const WorkspacePicker = () => {
  const navigate = useNavigate();
  const { data: queue, loading } = useApiData(getLiveQueue);
  const consulting = (queue ?? []).filter((a) => a.status === 'Consulting');

  useEffect(() => {
    if (consulting.length === 1) navigate(`/consultations/workspace/${consulting[0].appointment_id}`, { replace: true });
  }, [consulting.length]);

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;

  if (consulting.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <ClipboardIcon />
        <h3 style={{ margin: '12px 0 4px', color: '#334155' }}>No patient is currently in consultation</h3>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 16px' }}>Start a consultation from the queue to open the workspace.</p>
        <button className="pat-btn primary" onClick={() => navigate('/queue/live')}>
          Go to the queue
        </button>
      </div>
    );
  }

  return (
    <div className="pat-table-card">
      <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Choose a patient</h3>
      </div>
      <div className="pat-table-scroll">
        <table className="pat-table">
          <thead>
            <tr>
              <th>Token No.</th>
              <th>Patient Name</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {consulting.map((a) => (
              <tr key={a.appointment_id}>
                <td>
                  <span className="q-token next">{tokenNumber(a.appointment_id)}</span>
                </td>
                <td style={{ fontWeight: 600 }}>{displayPatientName(a)}</td>
                <td>
                  <button className="pat-btn primary" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => navigate(`/consultations/workspace/${a.appointment_id}`)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ConsultationWorkspace = () => {
  const { appointmentId } = useParams();
  if (!appointmentId) return <WorkspacePicker />;
  return <Workspace appointmentId={Number(appointmentId)} />;
};

const Workspace = ({ appointmentId }: { appointmentId: number }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: context, loading, error, reload } = useApiData(() => getConsultationContext(appointmentId), [appointmentId]);
  const { data: clinicSettings } = useApiData(() => getClinicSettings(), []);

  const [tab, setTab] = useState<TabKey>('consultation');
  const [form, setForm] = useState<FormState>(emptyForm);
  // This visit's fee only — never persisted anywhere until Complete Consultation resolves and
  // freezes it onto the consultation. Left empty, the backend falls back to the admin default.
  const [consultationFeeInput, setConsultationFeeInput] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [consultationId, setConsultationId] = useState<number | null>(null);
  const [conditionDraft, setConditionDraft] = useState('');
  const [editingVitals, setEditingVitals] = useState(false);
  const [editingAllergies, setEditingAllergies] = useState(false);
  const [allergiesDraft, setAllergiesDraft] = useState('');
  const [savingAllergies, setSavingAllergies] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [completeReviewOpen, setCompleteReviewOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [amendments, setAmendments] = useState<AmendmentEntry[] | null>(null);
  const [amendReloadToken, setAmendReloadToken] = useState(0);

  const [patientHistory, setPatientHistory] = useState<PatientConsultationHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [issuedLetters, setIssuedLetters] = useState<IssuedLetterSummary[] | null>(null);

  const [letterTemplates, setLetterTemplates] = useState<LetterTemplate[] | null>(null);
  const [selectedLetterTemplateId, setSelectedLetterTemplateId] = useState<number | null>(null);
  const [letterBody, setLetterBody] = useState('');
  const [letterBusy, setLetterBusy] = useState<'preview' | 'issue' | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterIssuedNotice, setLetterIssuedNotice] = useState(false);

  const [diagnosisResults, setDiagnosisResults] = useState<Icd11Match[]>([]);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState(false);
  const diagnosisBoxRef = useRef<HTMLDivElement>(null);
  // The diagnosis text this component itself just set (loaded or picked), whose change must not
  // trigger a search. A value rather than a flag: when that text equals what the box already held,
  // no change follows, and a flag would instead swallow the doctor's next input — e.g. a code
  // pasted into an empty diagnosis box would never be searched.
  // What the doctor is typing to find the next diagnosis (the chosen ones live in form.diagnoses).
  const [diagnosisQuery, setDiagnosisQuery] = useState('');

  useEffect(() => {
    if (!context) return;
    // A different appointment (different patient) may have just loaded — don't leave the
    // previous patient's history cached under the new one.
    setPatientHistory(null);
    setIssuedLetters(null);
    setSelectedLetterTemplateId(null);
    setLetterBody('');
    setLetterIssuedNotice(false);
    const c = context.consultation;
    setConsultationId(c?.consultation_id ?? null);
    setFollowUpDate(c?.follow_up_date ? c.follow_up_date.slice(0, 10) : '');
    setDiagnosisQuery('');
    setForm(formFromContext(context));
    createdIdRef.current = null;
  }, [context]);

  // Autosave. The assessment used to be saved only by Save draft / Prescribe / Order tests /
  // Finish, so a reload, a sidebar click or a closed tab silently lost everything typed. It is now
  // saved to the server ~2 s after the doctor stops typing. Opening a visit saves nothing: the form
  // is compared with what was loaded, and only a real change is sent. While a change is unsaved,
  // leaving the page asks for confirmation.
  const persistRef = useRef<(() => Promise<number>) | null>(null);
  const createdIdRef = useRef<number | null>(null);
  const creatingRef = useRef<Promise<number> | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const autoSavingRef = useRef(false);
  const [autoSave, setAutoSave] = useState<{ state: 'idle' | 'pending' | 'saving' | 'saved' | 'error'; at?: Date }>({ state: 'idle' });
  const [autoSaveTick, setAutoSaveTick] = useState(0);
  const snapshot = JSON.stringify({ form, followUpDate });
  const baseline = useMemo(
    () => (context ? JSON.stringify({ form: formFromContext(context), followUpDate: context.consultation?.follow_up_date ? context.consultation.follow_up_date.slice(0, 10) : '' }) : null),
    [context]
  );
  const autoSaveAllowed = !!context && context.consultation?.status !== 'Finalized' && (context.appointment.status === 'Consulting' || !!context.consultation);
  useEffect(() => {
    lastSavedRef.current = baseline;
  }, [baseline]);
  useEffect(() => {
    if (!autoSaveAllowed || snapshot === lastSavedRef.current) {
      setAutoSave((a) => (a.state === 'pending' ? { state: 'idle' } : a));
      return;
    }
    setAutoSave((a) => (a.state === 'pending' ? a : { ...a, state: 'pending' }));
    const t = setTimeout(async () => {
      if (!persistRef.current || autoSavingRef.current) return;
      autoSavingRef.current = true;
      setAutoSave({ state: 'saving' });
      try {
        await persistRef.current();
        lastSavedRef.current = snapshot;
        setAutoSave({ state: 'saved', at: new Date() });
      } catch {
        setAutoSave({ state: 'error' });
      } finally {
        autoSavingRef.current = false;
        // Anything typed while this save was in flight gets its own save.
        setAutoSaveTick((n) => n + 1);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [snapshot, autoSaveAllowed, autoSaveTick]);
  // Leaving for another page inside the app (sidebar, Back to Queue) unmounts this page before the
  // 2-second timer fires, and no browser prompt covers in-app navigation — so save on the way out.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const autoSaveAllowedRef = useRef(autoSaveAllowed);
  autoSaveAllowedRef.current = autoSaveAllowed;
  useEffect(
    () => () => {
      if (autoSaveAllowedRef.current && snapshotRef.current !== lastSavedRef.current && !autoSavingRef.current) {
        void persistRef.current?.().catch(() => {});
      }
    },
    []
  );
  const hasUnsavedChanges = autoSave.state === 'pending' || autoSave.state === 'saving' || autoSave.state === 'error';
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  // The prescription page returns here with review=1. Move the doctor straight into the final
  // safety review instead of making them rediscover the completion action in the workspace.
  useEffect(() => {
    if (!context || new URLSearchParams(location.search).get('review') !== '1') return;
    setTab('prescription');
    setCompleteReviewOpen(true);
    navigate(location.pathname, { replace: true });
  }, [context, location.pathname, location.search, navigate]);

  const isConsultationFinalized = context?.consultation?.status === 'Finalized';
  useEffect(() => {
    if (!consultationId || !isConsultationFinalized) {
      setAmendments(null);
      return;
    }
    let cancelled = false;
    listAmendments(consultationId).then((entries) => {
      if (!cancelled) setAmendments(entries);
    });
    return () => {
      cancelled = true;
    };
    // Re-fetches after a successful amend too (amendReloadToken bump), not just on mount/status
    // change — consultationId and status both stay the same across an amend, so without this the
    // freshly-saved entry silently wouldn't show up until the next full page load.
  }, [consultationId, isConsultationFinalized, amendReloadToken]);

  // Load history as the visit opens so the safety summary is available before documentation.
  // A temporary walk-in has no permanent patient record to query.
  const historyPatientId = context?.appointment.patient?.patient_id ?? null;
  useEffect(() => {
    if (!historyPatientId || patientHistory !== null) return;
    let cancelled = false;
    setHistoryLoading(true);
    getPatientConsultationHistory(historyPatientId, appointmentId)
      .then((entries) => {
        if (!cancelled) setPatientHistory(entries);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyPatientId, appointmentId, patientHistory]);

  // Issued-letters section inside History — same registered-only lazy fetch as above.
  useEffect(() => {
    if (tab !== 'history' || !historyPatientId || issuedLetters !== null) return;
    let cancelled = false;
    listIssuedLettersForPatient(historyPatientId).then((entries) => {
      if (!cancelled) setIssuedLetters(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, historyPatientId, issuedLetters]);

  // Letters tab — active templates only, fetched once the doctor opens the tab. Available for
  // both registered and temporary patients (only the "save a permanent record" step differs).
  useEffect(() => {
    if (tab !== 'letters' || letterTemplates !== null) return;
    listActiveLetterTemplates()
      .then(setLetterTemplates)
      .catch(() => setLetterTemplates([]));
  }, [tab, letterTemplates]);

  const selectedLetterTemplate = letterTemplates?.find((t) => t.letter_template_id === selectedLetterTemplateId) ?? null;

  const handleSelectLetterTemplate = (t: LetterTemplate) => {
    setSelectedLetterTemplateId(t.letter_template_id);
    setLetterBody('');
    setLetterError(null);
    setLetterIssuedNotice(false);
  };

  const handlePreviewLetter = async () => {
    if (!selectedLetterTemplate) return;
    setLetterBusy('preview');
    setLetterError(null);
    try {
      const url = await previewLetter({ templateId: selectedLetterTemplate.letter_template_id, appointmentId, bodyContent: letterBody });
      window.open(url, '_blank');
    } catch (err: any) {
      setLetterError(err?.response?.data?.message || 'Failed to preview the letter.');
    } finally {
      setLetterBusy(null);
    }
  };

  const handleIssueLetter = async () => {
    if (!selectedLetterTemplate) return;
    setLetterBusy('issue');
    setLetterError(null);
    try {
      const url = await issueLetter({ templateId: selectedLetterTemplate.letter_template_id, appointmentId, bodyContent: letterBody });
      window.open(url, '_blank');
      setLetterIssuedNotice(true);
      setIssuedLetters(null); // so the History tab's Letters section refetches and shows this one
    } catch (err: any) {
      setLetterError(err?.response?.data?.message || 'Failed to print/issue the letter.');
    } finally {
      setLetterBusy(null);
    }
  };

  const [labTestOrders, setLabTestOrders] = useState<LabTestOrder[]>([]);
  const reloadLabTestOrders = () => {
    if (!consultationId) {
      setLabTestOrders([]);
      return;
    }
    listLabTestOrders({ consultationId }).then((result) => setLabTestOrders(result.data));
  };
  useEffect(reloadLabTestOrders, [consultationId]);

  const [addLabTestOpen, setAddLabTestOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<LabTestOrder | null>(null);
  const [resultOrder, setResultOrder] = useState<LabTestOrder | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (diagnosisBoxRef.current && !diagnosisBoxRef.current.contains(e.target as Node)) setDiagnosisOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Debounced ICD-11 search as the doctor types the next diagnosis.
  useEffect(() => {
    if (diagnosisQuery.trim().length < 2) {
      setDiagnosisResults([]);
      setDiagnosisError(false);
      return;
    }
    const t = setTimeout(() => {
      searchIcd11(diagnosisQuery)
        .then((results) => {
          setDiagnosisResults(results);
          setDiagnosisError(false);
          setDiagnosisOpen(true);
        })
        .catch(() => {
          setDiagnosisResults([]);
          setDiagnosisError(true);
          setDiagnosisOpen(true);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [diagnosisQuery]);

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading consultation…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this appointment: {error}</div>;

  const { appointment } = context;
  const patient = displayPatient(context);
  const consultation = context.consultation;
  const isFinalized = consultation?.status === 'Finalized';
  const canStart = appointment.status === 'Consulting';
  const canEdit = !isFinalized && (canStart || !!consultation);
  const hasVitals = Object.values(form.vitals).some((value) => value !== '');
  const allergyReviewRequired = !!context.patientSummary.allergies && !form.allergies_ack;
  const completionBlocked = !form.complaint.trim() || allergyReviewRequired;

  // Text typed but never added still counts when nothing else is recorded, as it always did.
  const effectiveDiagnoses = form.diagnoses.length ? form.diagnoses : diagnosisQuery.trim() ? [{ code: null, title: diagnosisQuery.trim() }] : [];
  const primaryDiagnosis = effectiveDiagnoses[0];
  const amendCurrentValues: Record<AmendableField, string> = {
    complaint: form.complaint,
    history_of_present_illness: form.history_of_present_illness,
    examination_findings: form.examination_findings,
    diagnosis: primaryDiagnosis?.title ?? '',
    icd10_code: primaryDiagnosis?.code ?? '',
    notes: form.notes,
    follow_up_date: followUpDate,
  };
  const handleAmended = () => {
    setShowAmendModal(false);
    reload();
    setAmendReloadToken((t) => t + 1);
  };

  const setField = (field: keyof Omit<FormState, 'vitals' | 'medical_history' | 'allergies_ack'>) => (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const setVital = (field: keyof FormState['vitals']) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, vitals: { ...f.vitals, [field]: e.target.value } }));

  const addDiagnosis = (entry: DiagnosisEntry) => {
    const title = entry.title.trim();
    if (!title) return;
    setForm((f) =>
      f.diagnoses.some((d) => (entry.code && d.code === entry.code) || d.title.toLowerCase() === title.toLowerCase())
        ? f
        : { ...f, diagnoses: [...f.diagnoses, { code: entry.code, title }] }
    );
    setDiagnosisQuery('');
    setDiagnosisOpen(false);
    setDiagnosisResults([]);
  };
  const selectDiagnosis = (m: Icd11Match) => addDiagnosis({ code: m.code, title: m.title });
  const removeDiagnosis = (index: number) => setForm((f) => ({ ...f, diagnoses: f.diagnoses.filter((_, i) => i !== index) }));
  const makePrimaryDiagnosis = (index: number) =>
    setForm((f) => ({ ...f, diagnoses: [f.diagnoses[index], ...f.diagnoses.filter((_, i) => i !== index)] }));

  const weightNum = parseFloat(form.vitals.weight);
  const heightNum = parseFloat(form.vitals.height);
  const bmi = weightNum > 0 && heightNum > 0 ? Math.round((weightNum / (heightNum / 100) ** 2) * 10) / 10 : null;

  const addCondition = () => {
    const value = conditionDraft.trim();
    if (!value || form.medical_history.includes(value)) return;
    setForm((f) => ({ ...f, medical_history: [...f.medical_history, value] }));
    setConditionDraft('');
  };
  const removeCondition = (c: string) => setForm((f) => ({ ...f, medical_history: f.medical_history.filter((x) => x !== c) }));

  const buildInput = (): ConsultationInput => ({
    complaint: form.complaint,
    history_of_present_illness: form.history_of_present_illness,
    examination_findings: form.examination_findings,
    medical_history: form.medical_history,
    diagnosis: primaryDiagnosis?.title ?? '',
    icd10_code: primaryDiagnosis?.code ?? '',
    additional_diagnoses: effectiveDiagnoses.slice(1),
    notes: form.notes,
    allergies_ack: form.allergies_ack,
    follow_up_date: followUpDate || null,
    vitals: {
      bp_systolic: numOrUndefined(form.vitals.bp_systolic),
      bp_diastolic: numOrUndefined(form.vitals.bp_diastolic),
      temp: numOrUndefined(form.vitals.temp),
      pulse: numOrUndefined(form.vitals.pulse),
      respiratory_rate: numOrUndefined(form.vitals.respiratory_rate),
      spo2: numOrUndefined(form.vitals.spo2),
      weight: numOrUndefined(form.vitals.weight),
      height: numOrUndefined(form.vitals.height),
    },
  });

  // Autosave and the buttons can both save at once; only one of them may create the record.
  const persist = async (): Promise<number> => {
    const input = buildInput();
    const existingId = consultationId ?? createdIdRef.current;
    if (existingId) {
      await updateConsultation(existingId, input);
      return existingId;
    }
    if (creatingRef.current) {
      const id = await creatingRef.current;
      await updateConsultation(id, input);
      return id;
    }
    creatingRef.current = createConsultation(appointmentId, input).then((c) => c.consultation_id);
    try {
      const id = await creatingRef.current;
      createdIdRef.current = id;
      setConsultationId(id);
      return id;
    } finally {
      creatingRef.current = null;
    }
  };
  persistRef.current = persist;

  const handleSaveDraft = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await persist();
      setEditingVitals(false);
      reload();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || err.response?.data?.details?.map((d: any) => d.message).join(', ') || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // `extraState.repeat` carries medicines picked from a past visit ("Prescribe these again").
  const continueToPrescription = async (extraState?: { repeat?: RepeatRequest }) => {
    setSaveError(null);
    setSaving(true);
    try {
      const cid = await persist();
      navigate(`/prescriptions/new/${cid}`, { state: { consultationFee: consultationFeeInput, ...extraState } });
    } catch (err: any) {
      setSaveError(err.response?.data?.message || err.response?.data?.details?.map((d: any) => d.message).join(', ') || 'Failed to save the clinical assessment.');
    } finally {
      setSaving(false);
    }
  };
  const handleContinueToPrescription = () => continueToPrescription();

  // Lab tests hang off the consultation record, so the draft is saved first when it does not exist
  // yet — the doctor never has to remember to press "Save draft" before ordering a test.
  const openLabTests = async () => {
    setSaveError(null);
    try {
      if (!consultationId) {
        setSaving(true);
        await persist();
      }
      setTab('laborders');
      setAddLabTestOpen(true);
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Could not save the consultation before ordering tests.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaveError(null);
    setFinalizing(true);
    try {
      const cid = await persist();
      const fee = consultationFeeInput.trim() === '' ? undefined : Number(consultationFeeInput);
      if (fee !== undefined && (Number.isNaN(fee) || fee < 0)) {
        setSaveError('Consultation fee must be a positive number.');
        return;
      }
      await finalizeConsultation(cid, fee);
      setCompleteReviewOpen(false);
      navigate('/dashboard');
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Failed to complete consultation.');
    } finally {
      setFinalizing(false);
    }
  };

  const startEditAllergies = () => {
    setAllergiesDraft(context.patientSummary.allergies ?? '');
    setEditingAllergies(true);
  };

  const handleSaveAllergies = async () => {
    if (!patient.patientId) return;
    setSaveError(null);
    setSavingAllergies(true);
    try {
      await updatePatientAllergies(patient.patientId, allergiesDraft.trim());
      setEditingAllergies(false);
      reload();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Failed to update allergies.');
    } finally {
      setSavingAllergies(false);
    }
  };

  const vitalStat = (label: string, value: string, unit: string, warn = false) => (
    <div className="cons-vital-stat-box">
      <div className="cons-vital-stat-label">{label}</div>
      <div className={`cons-vital-stat-value${warn ? ' warn' : ''}`}>
        {value || '—'}
        {value && <span className="cons-vital-stat-unit">{unit}</span>}
      </div>
    </div>
  );

  const tempWarn = form.vitals.temp !== '' && parseFloat(form.vitals.temp) >= 38;

  return (
    <div>
      <div className="dash-header">
        <div>
          <span className="cons-step-kicker">STEP 1 OF 2</span>
          <h1>Examine &amp; document</h1>
          <p>Record the clinical assessment, then continue to the prescription page.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn" onClick={() => navigate('/queue/live')}>
            <ChevronLeftIcon /> Back to Queue
          </button>
          <button
            className="pat-btn"
            onClick={() => {
              reload();
              reloadLabTestOrders();
            }}
          >
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      {saveError && <div className="dash-error-banner">{saveError}</div>}

      <div className="cons-banner">
        {patient.photoUrl ? (
          <img className="cons-banner-avatar" src={fileUrl(patient.photoUrl)} alt={patient.fullName} />
        ) : (
          <div className="cons-banner-avatar">{initials(patient.fullName)}</div>
        )}
        <div>
          <div className="cons-banner-name">
            {patient.fullName}
            <span className="q-token">{tokenNumber(appointmentId)}</span>
            {patient.isTemporary && <span className="badge badge-amber">Temporary / Unregistered</span>}
          </div>
          <div className="cons-banner-meta">
            MRN: {patient.patientId ?? 'Temporary — Today Only'} &nbsp;·&nbsp;{' '}
            {patient.dob ? `${calculateAge(patient.dob)} Y` : patient.approxAge ? `~${patient.approxAge} Y` : '—'} / {patient.gender ?? '—'}
          </div>
          {patient.phone && <div className="cons-banner-sub">{patient.phone}</div>}
          {/* Allergy status lives next to the name so it is seen before anything is prescribed. */}
          <div
            className={`cons-banner-allergy ${context.patientSummary.allergies ? 'is-allergic' : patient.isTemporary ? 'is-unknown' : 'is-clear'}`}
          >
            {context.patientSummary.allergies ? <AlertIcon /> : <CheckCircleIcon />}
            {context.patientSummary.allergies
              ? <span>Allergies: <strong>{context.patientSummary.allergies}</strong></span>
              : patient.isTemporary ? 'Allergies unknown' : 'No known allergies'}
          </div>
        </div>

        <div className="cons-banner-divider" />

        <div className="cons-banner-fields">
          <div className="cons-banner-field">
            <span className="cons-banner-label">Arrival Time</span>
            <span className="cons-banner-value">{formatTime(appointment.scheduledAt)}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Last Visit</span>
            <span className="cons-banner-value">{context.patientSummary.lastVisit ? formatDate(context.patientSummary.lastVisit) : 'First visit'}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Status</span>
            <span className={`badge ${isFinalized ? 'badge-green' : consultation ? 'badge-amber' : 'badge-gray'}`}>
              {isFinalized ? 'Finalized' : consultation ? 'Draft' : appointment.status}
            </span>
          </div>
        </div>

        {canStart && consultation && (
          <div className="cons-banner-live">
            <span className="cons-banner-live-label">
              <CheckCircleIcon /> Now in Consultation
            </span>
            <span className="cons-banner-live-value">Start Time: {formatTime(consultation.created_at)}</span>
          </div>
        )}
      </div>

      {!canStart && !consultation && (
        <div className="dash-error-banner" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
          This appointment isn't currently in consultation, so a new consultation record can't be started here.
        </div>
      )}

      {patient.patientId && <AiSummaryPanel patientId={patient.patientId} />}

      <div className="card cons-vitals-strip">
        <div className="card-header">
          <h3 className="card-title">Vital Signs</h3>
          {canEdit && (
            <button className="card-link" onClick={() => setEditingVitals((v) => !v)}>
              <EditIcon /> {editingVitals ? 'Done' : 'Edit'}
            </button>
          )}
        </div>

        {!editingVitals && (
          <>
            <div className="cons-vital-stat-grid">
              {vitalStat('Temperature', form.vitals.temp, '°C', tempWarn)}
              {vitalStat('Blood Pressure', form.vitals.bp_systolic && form.vitals.bp_diastolic ? `${form.vitals.bp_systolic}/${form.vitals.bp_diastolic}` : '', 'mmHg')}
              {vitalStat('Heart Rate', form.vitals.pulse, 'bpm')}
              {vitalStat('Respiratory Rate', form.vitals.respiratory_rate, '/min')}
              {vitalStat('SpO2', form.vitals.spo2, '%')}
              {vitalStat('Weight', form.vitals.weight, 'kg')}
              {vitalStat('BMI', bmi ? String(bmi) : '', '')}
            </div>
          </>
        )}

        {editingVitals && (
          <>
            <div className="cons-vital-edit-grid">
              {/* Both numbers in one full-width box, read the way it is written: 120 / 80 mmHg. */}
              <div className="cons-vital-field cons-vital-bp">
                <label>Blood Pressure</label>
                <div className="cons-vital-input-wrap">
                  <input type="number" inputMode="numeric" value={form.vitals.bp_systolic} onChange={setVital('bp_systolic')} placeholder="120" aria-label="Systolic blood pressure" />
                  <span className="cons-vital-bp-sep" aria-hidden="true">/</span>
                  <input type="number" inputMode="numeric" value={form.vitals.bp_diastolic} onChange={setVital('bp_diastolic')} placeholder="80" aria-label="Diastolic blood pressure" />
                  <span className="cons-vital-unit">mmHg</span>
                </div>
              </div>
              <div className="cons-vital-field">
                <label>Heart Rate</label>
                <div className="cons-vital-input-wrap">
                  <input type="number" value={form.vitals.pulse} onChange={setVital('pulse')} aria-label="Heart rate" />
                  <span className="cons-vital-unit">bpm</span>
                </div>
              </div>
              <div className="cons-vital-field">
                <label>Temperature</label>
                <div className="cons-vital-input-wrap">
                  <input type="number" step="0.1" value={form.vitals.temp} onChange={setVital('temp')} aria-label="Temperature" />
                  <span className="cons-vital-unit">°C</span>
                </div>
              </div>
              <div className="cons-vital-field">
                <label>Respiratory Rate</label>
                <div className="cons-vital-input-wrap">
                  <input type="number" value={form.vitals.respiratory_rate} onChange={setVital('respiratory_rate')} aria-label="Respiratory rate" />
                  <span className="cons-vital-unit">/min</span>
                </div>
              </div>
              <div className="cons-vital-field">
                <label>SpO2</label>
                <div className="cons-vital-input-wrap">
                  <input type="number" value={form.vitals.spo2} onChange={setVital('spo2')} aria-label="SpO2" />
                  <span className="cons-vital-unit">%</span>
                </div>
              </div>
              <div className="cons-vital-field">
                <label>Weight</label>
                <div className="cons-vital-input-wrap">
                  <input type="number" step="0.1" value={form.vitals.weight} onChange={setVital('weight')} aria-label="Weight" />
                  <span className="cons-vital-unit">kg</span>
                </div>
              </div>
              <div className="cons-vital-field">
                <label>Height</label>
                <div className="cons-vital-input-wrap">
                  <input type="number" value={form.vitals.height} onChange={setVital('height')} aria-label="Height" />
                  <span className="cons-vital-unit">cm</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="cons-btn primary" disabled={saving} onClick={handleSaveDraft}>
                <SaveIcon /> {saving ? 'Saving…' : 'Save Vitals'}
              </button>
            </div>
          </>
        )}
      </div>

      {!isFinalized && (
        <div className="cons-flow-strip" aria-label="Consultation workflow">
          <button className={tab !== 'prescription' ? 'active' : 'done'} onClick={() => setTab('consultation')}>
            <span>1</span><strong>Examine &amp; document</strong><small>Complaint, findings and diagnosis</small>
          </button>
          <button className={tab === 'prescription' ? 'active' : ''} disabled={!canEdit || saving} onClick={handleContinueToPrescription}>
            <span>2</span><strong>Prescribe &amp; finalize</strong><small>Medicines, safety check and completion</small>
          </button>
        </div>
      )}

      <div className="cons-tabs">
        {SUPPORT_TABS.map((t) => (
          <button key={t.key} className={`cons-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="cons-layout">
        <div>
          {tab === 'consultation' && (
            <div className="cons-main">
              {context.patientSummary.allergies && (
                <div className="cons-box span-2" style={{ background: '#fffbeb', borderColor: '#fde68a', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#b45309' }}>
                    <AlertIcon />
                  </span>
                  <span style={{ fontSize: 14, color: '#92400e', flex: 1 }}>
                    Known allergies: <strong>{context.patientSummary.allergies}</strong>
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#92400e', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={form.allergies_ack}
                      disabled={!canEdit}
                      onChange={(e) => setForm((f) => ({ ...f, allergies_ack: e.target.checked }))}
                    />
                    Reviewed
                  </label>
                </div>
              )}

              {/* Grouped into three cards (assessment → diagnosis → plan) instead of one card per field,
                  so the whole visit fits in far less scrolling. */}
              <section className="cons-box span-2">
                <h2 className="cons-card-title">Assessment</h2>
                <div className="cons-fields-2">
                  <label className="cons-field">
                    <span className="cons-field-label">Chief complaint / reason for visit *</span>
                    <textarea
                      className="cons-textarea"
                      rows={3}
                      disabled={!canEdit}
                      value={form.complaint}
                      onChange={setField('complaint')}
                      placeholder="Enter patient's chief complaint..."
                    />
                  </label>
                  <label className="cons-field">
                    <span className="cons-field-label">History of present illness</span>
                    <textarea
                      className="cons-textarea"
                      rows={3}
                      disabled={!canEdit}
                      value={form.history_of_present_illness}
                      onChange={setField('history_of_present_illness')}
                      placeholder="Enter history of present illness..."
                    />
                  </label>
                </div>
                <label className="cons-field">
                  <span className="cons-field-label">Examination findings</span>
                  <textarea
                    className="cons-textarea"
                    rows={4}
                    disabled={!canEdit}
                    value={form.examination_findings}
                    onChange={setField('examination_findings')}
                    placeholder="Record relevant examination findings, including normal and abnormal findings..."
                  />
                </label>
              </section>

              <section className="cons-box span-2">
                <h2 className="cons-card-title">Diagnosis</h2>
                <div className="cons-field" ref={diagnosisBoxRef}>
                  <label className="cons-field-label" htmlFor="cons-diagnosis">Diagnoses (ICD-11)</label>
                  {/* A visit can have several diagnoses; the first is the primary one used in reports. */}
                  {form.diagnoses.length > 0 && (
                    <ol className="cons-dx-list">
                      {form.diagnoses.map((d, i) => (
                        <li key={`${d.code ?? ''}-${d.title}`} className={i === 0 ? 'is-primary' : ''}>
                          <span className="cons-dx-rank">{i === 0 ? 'Primary' : i + 1}</span>
                          {d.code ? <span className="cons-diag-result-code">{d.code}</span> : <span className="cons-dx-uncoded">No code</span>}
                          <span className="cons-dx-title">{d.title}</span>
                          {canEdit && (
                            <span className="cons-dx-actions">
                              {i > 0 && (
                                <button type="button" className="card-link" onClick={() => makePrimaryDiagnosis(i)}>
                                  Make primary
                                </button>
                              )}
                              <button type="button" className="cons-dx-remove" onClick={() => removeDiagnosis(i)} aria-label={`Remove ${d.title}`}>
                                ×
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  {canEdit && (
                    <div className="cons-diag-row">
                      <input
                        id="cons-diagnosis"
                        className="cons-input"
                        value={diagnosisQuery}
                        onChange={(e) => setDiagnosisQuery(e.target.value)}
                        onFocus={() => diagnosisResults.length > 0 && setDiagnosisOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          // Enter takes the top WHO match; with no match the typed text is added uncoded.
                          if (diagnosisResults[0] && !diagnosisError) selectDiagnosis(diagnosisResults[0]);
                          else addDiagnosis({ code: null, title: diagnosisQuery });
                        }}
                        placeholder={form.diagnoses.length ? 'Add another diagnosis — search ICD-11 by name or code' : 'Search WHO ICD-11 by diagnosis or code, e.g. diabetes or 5A11'}
                      />
                      {diagnosisOpen && (
                        <div className="cons-diag-dropdown">
                          {diagnosisError && (
                            <div className="cons-diag-empty">Suggestions unavailable — press Enter to add “{diagnosisQuery.trim()}” without a code.</div>
                          )}
                          {!diagnosisError && diagnosisResults.length === 0 && (
                            <div className="cons-diag-empty">No matching ICD-11 diagnoses — press Enter to add it without a code.</div>
                          )}
                          {!diagnosisError &&
                            diagnosisResults.map((m) => (
                              <div className="cons-diag-result" key={m.code} onClick={() => selectDiagnosis(m)}>
                                <span className="cons-diag-result-code">{m.code}</span>
                                <span className="cons-diag-result-title">{m.title}</span>
                              </div>
                            ))}
                          {diagnosisQuery.trim() && (
                            <div className="cons-diag-result cons-diag-free" onClick={() => addDiagnosis({ code: null, title: diagnosisQuery })}>
                              <span className="cons-diag-result-code">+</span>
                              <span className="cons-diag-result-title">Add “{diagnosisQuery.trim()}” without an ICD-11 code</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {canEdit && diagnosisQuery.trim() && !diagnosisOpen && (
                    <p className="pat-muted cons-field-help">Press Enter to add this diagnosis.</p>
                  )}
                </div>

                <div className="cons-field">
                  <label className="cons-field-label" htmlFor="cons-condition">Medical history</label>
                  <div className="cons-chip-row">
                    <input
                      id="cons-condition"
                      className="cons-input"
                      disabled={!canEdit}
                      placeholder="Type a condition and press Enter (e.g. Hypertension)"
                      value={conditionDraft}
                      onChange={(e) => setConditionDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCondition())}
                    />
                    <button type="button" className="cons-btn" disabled={!canEdit || !conditionDraft.trim()} onClick={addCondition}>
                      <PlusIcon /> Add
                    </button>
                  </div>
                  {form.medical_history.length > 0 && (
                    <div className="cons-chips">
                      {form.medical_history.map((c) => (
                        <span className="cons-chip" key={c}>
                          {c}
                          {canEdit && (
                            <button type="button" onClick={() => removeCondition(c)} aria-label={`Remove ${c}`}>
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="cons-box span-2">
                <h2 className="cons-card-title">Plan</h2>
                <label className="cons-field">
                  <span className="cons-field-label">Consultation notes</span>
                  <textarea
                    className="cons-textarea"
                    rows={3}
                    disabled={!canEdit}
                    value={form.notes}
                    onChange={setField('notes')}
                    placeholder="Advice, treatment plan, or notes..."
                  />
                </label>
                <div className="cons-fields-2">
                  <div className="cons-field">
                    <label className="cons-field-label" htmlFor="cons-followup">Follow-up date</label>
                    <input
                      id="cons-followup"
                      type="date"
                      className="cons-input"
                      disabled={!canEdit}
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                    {canEdit && (
                      <div className="cons-followup-picks">
                        {FOLLOW_UP_PICKS.map((pick) => (
                          <button type="button" key={pick.label} onClick={() => setFollowUpDate(isoDateInDays(pick.days))}>
                            {pick.label}
                          </button>
                        ))}
                        {followUpDate && (
                          <button type="button" onClick={() => setFollowUpDate('')}>
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                    {/* The date box follows the browser's locale (often mm/dd/yyyy), so spell the date out. */}
                    <p className="pat-muted cons-field-help">
                      {followUpDate ? `Review on ${formatLongDate(followUpDate)}` : 'Optional. Leave blank when no review is needed.'}
                    </p>
                  </div>

                  {!isFinalized ? (
                    <div className="cons-field">
                      <label className="cons-field-label" htmlFor="cons-fee">Consultation fee (LKR)</label>
                      <input
                        id="cons-fee"
                        className="cons-input"
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={!canEdit}
                        value={consultationFeeInput}
                        onChange={(e) => setConsultationFeeInput(e.target.value)}
                        placeholder={clinicSettings ? String(clinicSettings.default_consultation_fee) : 'Clinic default'}
                      />
                      <p className="pat-muted cons-field-help">
                        {clinicSettings ? `Default: Rs. ${clinicSettings.default_consultation_fee.toLocaleString()}` : 'Leave blank to use the clinic default.'}
                      </p>
                    </div>
                  ) : (
                    consultation?.consultation_fee != null && (
                      <div className="cons-field">
                        <span className="cons-field-label">Consultation fee (LKR)</span>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Rs. {consultation.consultation_fee.toLocaleString()}</div>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === 'examination' && (
            <div className="cons-box">
              <div className="cons-box-title">Examination Findings</div>
              <textarea
                className="cons-textarea"
                rows={12}
                disabled={!canEdit}
                value={form.examination_findings}
                onChange={setField('examination_findings')}
                placeholder="Enter examination findings..."
              />
              {!isFinalized && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="cons-btn" disabled={!canEdit || saving} onClick={handleSaveDraft}>
                    <SaveIcon /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'prescription' && (
            <div className="cons-box cons-prescription-review">
              <span className="cons-step-kicker">STEP 2 OF 2</span>
              <div className="cons-box-title">Prescription &amp; final review</div>
              <p className="cons-step-description">Add any required medicines. If no medicine is needed, continue directly to the final safety check.</p>
              {(consultation?.prescriptions.length ?? 0) === 0 && <div className="pat-empty">No prescriptions issued for this consultation yet.</div>}
              {consultation?.prescriptions.map((p) => (
                <div className="cons-rx-row" key={p.prescription_id}>
                  <span>
                    Prescription #{p.prescription_id} {p.is_refill && <span className="badge badge-gray">Refill</span>}
                  </span>
                  <span className={`badge ${p.status === 'Dispensed' || p.status === 'Collected' ? 'badge-green' : 'badge-amber'}`}>{p.status}</span>
                </div>
              ))}
              <div className="cons-step-actions" style={{ marginTop: 18 }}>
                <button
                  className="cons-btn primary"
                  disabled={!consultationId}
                  onClick={() => consultationId && navigate(`/prescriptions/new/${consultationId}`)}
                >
                  <PrescriptionIcon /> {(consultation?.prescriptions.length ?? 0) > 0 ? 'Add another prescription' : 'Add prescription'}
                </button>
                {!isFinalized && (
                  <button className="cons-btn primary" disabled={!canEdit} onClick={() => setCompleteReviewOpen(true)}>
                    {(consultation?.prescriptions.length ?? 0) > 0 ? 'Review & finalize' : 'No medicines needed — review & finalize'} <ChevronRightIcon />
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'laborders' && (
            <div className="cons-box">
              <div className="cons-box-title">Lab Tests for this Visit</div>
              {labTestOrders.length === 0 && <div className="pat-empty">No lab tests ordered for this consultation yet.</div>}
              {labTestOrders.map((o) => (
                <div key={o.lab_test_order_id} className="cons-rx-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span>
                    {o.request_number || `LAB${String(o.lab_test_order_id).padStart(6, '0')}`} — {o.test_name}
                    {o.priority !== 'Routine' && <span className="badge badge-red" style={{ marginLeft: 6 }}>{o.priority}</span>}
                    <span
                      className={`badge ${
                        o.status === 'Completed' ? 'badge-green' : o.status === 'Report Received' ? 'badge-amber' : o.status === 'Cancelled' ? 'badge-red' : 'badge-blue'
                      }`}
                      style={{ marginLeft: 8 }}
                    >
                      {o.status}
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="pat-btn" style={{ fontSize: 13, padding: '5px 9px' }} onClick={() => printLabTestOrder(o.lab_test_order_id)}>
                      <PrintIcon /> Print Request
                    </button>
                    {o.status === 'Pending' && (
                      <button className="pat-btn" style={{ fontSize: 13, padding: '5px 9px' }} onClick={() => setReceiveOrder(o)}>
                        Report Received
                      </button>
                    )}
                    {o.status === 'Report Received' && (
                      <button className="pat-btn primary" style={{ fontSize: 13, padding: '5px 9px' }} onClick={() => setResultOrder(o)}>
                        Open / Enter Results
                      </button>
                    )}
                    {o.status === 'Completed' && (
                      <>
                        <button className="pat-btn" style={{ fontSize: 13, padding: '5px 9px' }} onClick={() => setResultOrder(o)}>
                          View Results
                        </button>
                        <button className="pat-btn" style={{ fontSize: 13, padding: '5px 9px' }} onClick={() => printLabResultReport(o.lab_test_order_id)}>
                          <PrintIcon /> Print Result
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <button className="cons-btn primary" disabled={(!consultationId && !canEdit) || saving} onClick={() => void openLabTests()}>
                  <ClipboardIcon /> Order lab tests
                </button>
              </div>
              <p className="pat-muted" style={{ fontSize: 13, marginTop: 10 }}>
                View pending/completed results and doctor review for all of this patient's visits under Patient Search → Lab Results.
              </p>
            </div>
          )}

          {tab === 'followup' && (
            <div className="cons-box">
              <div className="cons-box-title">Follow-up Date</div>
              <input
                type="date"
                className="cons-input"
                style={{ maxWidth: 220 }}
                disabled={!canEdit}
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
              {consultation?.follow_up_date && (
                <p className="pat-muted" style={{ fontSize: 14, marginTop: 8 }}>
                  Currently saved: {formatDate(consultation.follow_up_date)}
                </p>
              )}
              {!isFinalized && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="cons-btn" disabled={!canEdit || saving} onClick={handleSaveDraft}>
                    <SaveIcon /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'letters' && (
            <div className="cons-box">
              <div className="cons-box-title">Issue a Letter</div>
              {patient.isTemporary && (
                <div className="wi-banner" style={{ marginBottom: 12 }}>
                  <AlertIcon /> This is a temporary/unregistered patient — the letter can still be printed, but it won't be saved to a permanent record.
                </div>
              )}

              {!selectedLetterTemplate ? (
                letterTemplates === null ? (
                  <div className="pat-empty">Loading templates…</div>
                ) : letterTemplates.length === 0 ? (
                  <div className="pat-empty">No letter templates are available yet — ask an Admin to create one.</div>
                ) : (
                  <div className="cons-history-list">
                    {letterTemplates.map((t) => (
                      <button
                        key={t.letter_template_id}
                        type="button"
                        className="cons-history-entry"
                        style={{ textAlign: 'left', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        onClick={() => handleSelectLetterTemplate(t)}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileIcon />{' '}
                          <span className="cons-history-entry-date">
                            {t.name}
                            {t.letter_type && t.letter_type !== 'General' && t.letter_type !== t.name && (
                              <span className="pat-muted" style={{ fontWeight: 400 }}> · {t.letter_type}</span>
                            )}
                          </span>
                        </span>
                        <ChevronRightIcon />
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <>
                  <button
                    type="button"
                    className="card-link"
                    style={{ marginBottom: 12 }}
                    onClick={() => {
                      setSelectedLetterTemplateId(null);
                      setLetterIssuedNotice(false);
                    }}
                  >
                    ← Change template
                  </button>

                  <div className="cd-summary-box gray">
                    <div className="cd-summary-box-label">
                      {selectedLetterTemplate.name}
                      {selectedLetterTemplate.letter_type &&
                      selectedLetterTemplate.letter_type !== 'General' &&
                      selectedLetterTemplate.letter_type !== selectedLetterTemplate.name
                        ? ` · ${selectedLetterTemplate.letter_type}`
                        : ''}
                    </div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      The clinic header, footer, logo, stamp, signature block and page layout all come from the Admin's
                      Word template and are locked here. You only fill in the letter body below.
                    </div>
                  </div>

                  {!selectedLetterTemplate.has_body_placeholder && (
                    <div className="wi-banner" style={{ marginTop: 12 }}>
                      <AlertIcon /> This template has no {'{{LETTER_BODY}}'} placeholder — anything you type below won't appear in the letter. Ask an Admin to fix the template.
                    </div>
                  )}

                  <div className="modal-field" style={{ marginTop: 14 }}>
                    <label>Letter Body (Doctor Editable)</label>
                    <textarea
                      className="cons-textarea"
                      rows={12}
                      value={letterBody}
                      onChange={(e) => {
                        setLetterBody(e.target.value);
                        setLetterIssuedNotice(false);
                      }}
                      placeholder="Write the letter content here…"
                    />
                  </div>

                  {letterError && (
                    <div className="modal-error" style={{ marginTop: 12 }}>
                      {letterError}
                    </div>
                  )}
                  {letterIssuedNotice && (
                    <div style={{ marginTop: 12, color: '#16a34a', fontWeight: 600, fontSize: 14 }}>
                      ✓ Letter {patient.isTemporary ? 'printed.' : 'issued and saved to the patient\'s history.'}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                    <button className="cons-btn" disabled={letterBusy !== null} onClick={handlePreviewLetter}>
                      <EyeIcon /> {letterBusy === 'preview' ? 'Opening…' : 'Preview Letter'}
                    </button>
                    <button className="cons-btn primary" disabled={letterBusy !== null || !letterBody.trim()} onClick={handleIssueLetter}>
                      <PrintIcon /> {letterBusy === 'issue' ? 'Printing…' : 'Print / Issue Letter'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'history' && (
            <>
              <div className="cons-box">
                <div className="cons-box-title">
                  <span>Past visits{patientHistory && patientHistory.length > 0 ? ` (${patientHistory.length})` : ''}</span>
                </div>
                {patient.isTemporary ? (
                  <div className="pat-empty">History isn't available for temporary/unregistered patients — register them to start building a visit history.</div>
                ) : historyLoading ? (
                  <div className="pat-empty">Loading…</div>
                ) : !patientHistory || patientHistory.length === 0 ? (
                  <div className="pat-empty">No past consultations for this patient.</div>
                ) : (
                  // Newest visit open, older ones one line each — click to read the whole visit here
                  // without leaving the patient in front of you.
                  patientHistory.map((h, i) => (
                    <VisitSummary
                      key={h.consultationId}
                      visit={h}
                      collapsible
                      defaultOpen={i === 0}
                      onRepeat={canEdit && !isFinalized ? (request) => void continueToPrescription({ repeat: request }) : undefined}
                    />
                  ))
                )}
              </div>

              {!patient.isTemporary && (
                <div className="cons-box" style={{ marginTop: 16 }}>
                  <div className="cons-box-title">Letters</div>
                  {issuedLetters === null && <div className="pat-empty">Loading…</div>}
                  {issuedLetters !== null && issuedLetters.length === 0 && <div className="pat-empty">No letters have been issued for this patient.</div>}
                  {issuedLetters !== null &&
                    issuedLetters.map((l) => (
                      <div className="cons-recent-row" key={l.issued_letter_id}>
                        <div>
                          <div className="cons-recent-diagnosis">{l.letter_type_name}</div>
                          <span className="pat-muted" style={{ fontSize: 13 }}>
                            Doctor: {l.doctor_name_snapshot}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span className="cons-recent-date">{formatDate(l.issued_at)}</span>
                          <button
                            type="button"
                            className="card-link"
                            onClick={async () => window.open(await printIssuedLetterAgain(l.issued_letter_id), '_blank')}
                          >
                            <EyeIcon /> View
                          </button>
                          <button
                            type="button"
                            className="card-link"
                            onClick={async () => window.open(await printIssuedLetterAgain(l.issued_letter_id), '_blank')}
                          >
                            <PrintIcon /> Print Again
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {isFinalized && (
                <div className="cons-box" style={{ marginTop: 16 }}>
                  <div className="cons-box-title">Amendment History</div>
                  {amendments === null && <div className="pat-empty">Loading…</div>}
                  {amendments !== null && amendments.length === 0 && <div className="pat-empty">No amendments have been made to this record.</div>}
                  {amendments !== null &&
                    amendments.map((a) => (
                      <div className="cons-recent-row" key={a.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span className="cons-recent-diagnosis">
                            {AMENDABLE_FIELDS.find((f) => f.field === a.field)?.label ?? a.field}
                          </span>
                          <span className="cons-recent-date">
                            {formatDate(a.amendedAt)}, {formatTime(a.amendedAt)}
                          </span>
                        </div>
                        <span className="pat-muted" style={{ fontSize: 13 }}>
                          "{a.oldValue || '—'}" → "{a.newValue || '—'}"
                        </span>
                        <span className="pat-muted" style={{ fontSize: 13 }}>
                          Reason: {a.reason} — by {a.amendedBy}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          {/* One safety card: this used to be split across a "safety snapshot" and a "Patient Info"
              card that repeated the same allergies, conditions and medicines. */}
          <div className="card cons-safety-card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Patient safety</h3>
              {!patient.isTemporary && <button className="card-link" onClick={() => setTab('history')}>Full history</button>}
            </div>
            <div className={`cons-safety-allergy${context.patientSummary.allergies ? ' warning' : ''}`}>
              <AlertIcon />
              <span>
                <small>
                  Allergies
                  {canEdit && !editingAllergies && !patient.isTemporary && (
                    <button type="button" className="card-link" onClick={startEditAllergies}>
                      <EditIcon /> {context.patientSummary.allergies ? 'Edit' : 'Add'}
                    </button>
                  )}
                </small>
                {editingAllergies ? (
                  <span className="cons-safety-allergy-edit">
                    <textarea
                      className="cons-textarea"
                      rows={2}
                      value={allergiesDraft}
                      onChange={(e) => setAllergiesDraft(e.target.value)}
                      placeholder="e.g. Penicillin, Sulfa drugs"
                    />
                    <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button type="button" className="pat-btn" style={{ padding: '6px 12px' }} disabled={savingAllergies} onClick={() => setEditingAllergies(false)}>
                        Cancel
                      </button>
                      <button type="button" className="pat-btn primary" style={{ padding: '6px 12px' }} disabled={savingAllergies} onClick={handleSaveAllergies}>
                        <SaveIcon /> {savingAllergies ? 'Saving…' : 'Save'}
                      </button>
                    </span>
                  </span>
                ) : (
                  <strong>{context.patientSummary.allergies || (patient.isTemporary ? 'Unknown — temporary patient' : 'No known allergies recorded')}</strong>
                )}
              </span>
            </div>
            <div className="cons-safety-row"><span>Chronic conditions</span><strong>{context.patientSummary.chronicConditions.join(', ') || 'None recorded'}</strong></div>
            <div className="cons-safety-row">
              <span>Current medicines (still running)</span>
              <strong>
                {context.patientSummary.currentMedications.join(', ') ||
                  (context.patientSummary.lastPrescribedAt ? `None running — last prescribed ${formatDate(context.patientSummary.lastPrescribedAt)}` : 'None recorded')}
              </strong>
            </div>
            {context.patientSummary.reportedMedications && (
              <div className="cons-safety-row"><span>Patient says they take</span><strong>{context.patientSummary.reportedMedications}</strong></div>
            )}
            <div className="cons-safety-row"><span>Blood group</span><strong>{context.patientSummary.bloodGroup || '—'}</strong></div>
            <div className="cons-safety-recent">
              <small>MOST RECENT VISIT</small>
              {historyLoading ? <span>Loading history…</span> : patientHistory?.[0] ? <>
                <strong>{patientHistory[0].diagnosis || 'No diagnosis recorded'}</strong>
                <span>{formatDate(patientHistory[0].createdAt)} · {patientHistory[0].complaint || 'No complaint recorded'}</span>
              </> : <span>{patient.isTemporary ? 'No permanent history' : 'First recorded visit'}</span>}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Consultation Summary</h3>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Consultation ID</span>
              <span className="q-summary-value">{consultation ? `CONS-${String(consultation.consultation_id).padStart(6, '0')}` : '—'}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Token No.</span>
              <span className="q-summary-value">{tokenNumber(appointmentId)}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Doctor</span>
              <span className="q-summary-value">Dr. {appointment.doctor.username}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Start Time</span>
              <span className="q-summary-value">{consultation ? formatTime(consultation.created_at) : '—'}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Status</span>
              <span className={`badge ${isFinalized ? 'badge-green' : consultation ? 'badge-amber' : 'badge-gray'}`}>
                {isFinalized ? 'Finalized' : consultation ? 'Draft' : 'Not Started'}
              </span>
            </div>

            <button
              className="pat-btn"
              style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
              onClick={() => window.print()}
            >
              <PrintIcon /> Print consultation
            </button>
            {isFinalized && consultationId && (
              <button
                className="pat-btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                onClick={() => setShowAmendModal(true)}
              >
                <EditIcon /> Amend Record
              </button>
            )}
          </div>
        </div>
      </div>

      {!isFinalized && canEdit && tab !== 'prescription' && (
        <div className="cons-rapid-footer">
          <div>
            <span className={`cons-save-state${autoSave.state === 'error' ? ' error' : consultationId && !hasUnsavedChanges ? ' saved' : ''}`} />
            <strong>Step 1 · Clinical assessment</strong>
            <small>
              {autoSave.state === 'saving'
                ? 'Saving…'
                : autoSave.state === 'pending'
                  ? 'Unsaved changes — saving shortly'
                  : autoSave.state === 'error'
                    ? 'Could not save — check the connection, then press Save draft'
                    : autoSave.state === 'saved' && autoSave.at
                      ? `All changes saved · ${autoSave.at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
                      : 'Changes are saved automatically as you type'}
            </small>
          </div>
          <button className="cons-btn" disabled={saving || finalizing} onClick={handleSaveDraft}><SaveIcon /> {saving ? 'Saving…' : 'Save draft'}</button>
          <button className="cons-btn" disabled={saving || finalizing} onClick={() => void openLabTests()}><ClipboardIcon /> Order lab tests</button>
          <button className="cons-btn" disabled={saving || finalizing} onClick={() => setCompleteReviewOpen(true)} title="Finish without prescribing medicines">
            <CheckCircleIcon /> Finish visit
          </button>
          <button className="cons-btn primary" disabled={saving || finalizing} onClick={handleContinueToPrescription}>
            {saving ? 'Saving…' : 'Prescribe medicines'} <ChevronRightIcon />
          </button>
        </div>
      )}

      {completeReviewOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCompleteReviewOpen(false)}>
          <div className="modal-card cons-complete-modal" role="dialog" aria-modal="true" aria-labelledby="complete-title">
            <div className="cons-complete-heading">
              <div><span className="cons-safety-kicker">FINAL CHECK</span><h2 id="complete-title">Review and complete visit</h2><p>Finalizing locks this clinical record and sends the patient to billing.</p></div>
              <span className="rapid-token">{tokenNumber(appointmentId)}</span>
            </div>
            <div className="cons-complete-patient"><strong>{patient.fullName}</strong><span>{patient.patientId ?? 'Temporary patient'} · {patient.gender ?? 'Gender not recorded'}</span></div>
            <div className="cons-complete-checks">
              <div className={form.complaint.trim() ? 'done' : 'required'}><CheckCircleIcon /><span><strong>Reason for visit</strong><small>{form.complaint.trim() || 'Required before completion'}</small></span></div>
              <div className={effectiveDiagnoses.length ? 'done' : 'optional'}><CheckCircleIcon /><span><strong>Diagnosis</strong><small>{effectiveDiagnoses.map((d) => d.title).join('; ') || 'Not recorded — review if appropriate'}</small></span></div>
              <div className={!allergyReviewRequired ? 'done' : 'required'}><CheckCircleIcon /><span><strong>Allergy safety</strong><small>{context.patientSummary.allergies ? (form.allergies_ack ? `Reviewed: ${context.patientSummary.allergies}` : `Known allergies: ${context.patientSummary.allergies}`) : 'No known allergies recorded'}</small>
                {/* Acknowledged right here, so the doctor does not have to leave the final check to find the tick box. */}
                {context.patientSummary.allergies && !form.allergies_ack && (
                  <label className="cons-complete-ack"><input type="checkbox" checked={form.allergies_ack} onChange={(e) => setForm((f) => ({ ...f, allergies_ack: e.target.checked }))} /> I have reviewed these allergies</label>
                )}
              </span></div>
              <div className={hasVitals ? 'done' : 'optional'}><CheckCircleIcon /><span><strong>Vital signs</strong><small>{hasVitals ? 'Recorded for this visit' : 'Not recorded — optional'}</small></span></div>
              <div className={(consultation?.prescriptions.length ?? 0) > 0 ? 'done' : 'optional'}><PrescriptionIcon /><span><strong>Medicines</strong><small>{(consultation?.prescriptions.length ?? 0) > 0 ? `${consultation?.prescriptions.length} prescription(s) issued` : 'No prescription issued'}</small></span></div>
              <div className={labTestOrders.length > 0 ? 'done' : 'optional'}><ClipboardIcon /><span><strong>Lab tests</strong><small>{labTestOrders.length > 0 ? labTestOrders.map((o) => o.test_name).join(', ') : 'None ordered'}</small></span></div>
              <div className={followUpDate ? 'done' : 'optional'}><ClockIcon /><span><strong>Follow-up</strong><small>{followUpDate ? formatDate(followUpDate) : 'No follow-up date set'}</small></span></div>
            </div>
            {saveError && <div className="cons-complete-warning"><AlertIcon /> {saveError}</div>}
            {completionBlocked && <div className="cons-complete-warning"><AlertIcon /> Complete the required checks highlighted above.</div>}
            <div className="cons-complete-fee"><label htmlFor="complete-fee">Consultation fee (LKR)</label><input id="complete-fee" className="cons-input" type="number" min={0} step="0.01" value={consultationFeeInput} onChange={(event) => setConsultationFeeInput(event.target.value)} placeholder={clinicSettings ? String(clinicSettings.default_consultation_fee) : 'Clinic default'} /><small>Leave empty to use the clinic default.</small></div>
            <div className="modal-actions">
              <button className="cons-btn" disabled={finalizing} onClick={() => setCompleteReviewOpen(false)}>Continue editing</button>
              <button className="cons-btn primary" disabled={completionBlocked || finalizing} onClick={handleComplete}><CheckCircleIcon /> {finalizing ? 'Completing…' : 'Finalize visit'}</button>
            </div>
          </div>
        </div>
      )}

      {showAmendModal && consultationId && (
        <AmendModal consultationId={consultationId} currentValues={amendCurrentValues} onClose={() => setShowAmendModal(false)} onAmended={handleAmended} />
      )}

      {addLabTestOpen && consultationId && (
        <AddLabTestModal
          consultationId={consultationId}
          alreadyOrdered={labTestOrders.filter((o) => o.status !== 'Cancelled').map((o) => o.test_name)}
          onClose={() => setAddLabTestOpen(false)}
          onAdded={() => {
            setAddLabTestOpen(false);
            reloadLabTestOrders();
          }}
        />
      )}
      {receiveOrder && (
        <MarkReceivedModal
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onSaved={() => {
            setReceiveOrder(null);
            reloadLabTestOrders();
          }}
        />
      )}
      {resultOrder && (
        <LabResultModal
          orderId={resultOrder.lab_test_order_id}
          onClose={() => setResultOrder(null)}
          onSaved={() => {
            setResultOrder(null);
            reloadLabTestOrders();
          }}
        />
      )}
    </div>
  );
};

export default ConsultationWorkspace;
