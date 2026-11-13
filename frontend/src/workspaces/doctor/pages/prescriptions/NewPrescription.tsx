import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { draftKey as scopedDraftKey } from '../../lib/drafts';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { getPrescriptionContext, createPrescription, displayPrescriptionPatient } from '../../lib/prescriptions';
import type { PrescriptionItemInput, OngoingMedication } from '../../lib/prescriptions';
import OngoingMedicationsPanel from './OngoingMedicationsPanel';
import type { ContinueMode } from './OngoingMedicationsPanel';
import { bulkCreateExternalMedicines } from '../../lib/externalMedicines';
import { finalizeConsultation } from '../../lib/consultations';
import { getClinicSettings } from '../../lib/settings';
import { listConsultations } from '../../lib/consultations';
import { calculateAge } from '../../lib/queue';
import InstructionsPicker from '../../components/InstructionsPicker';
import ExternalMedicineSection, { draftToInput } from './ExternalMedicineSection';
import type { RepeatRequest } from '../../components/VisitSummary';
import AddLabTestModal from '../labTestOrders/AddLabTestModal';
import { listLabTestOrders } from '../../lib/labTestOrders';
import type { LabTestOrder } from '../../lib/labTestOrders';
import type { ExternalMedicineDraft, ShortfallPrefill } from './ExternalMedicineSection';
import {
  PrintIcon,
  SaveIcon,
  SearchIcon,
  TrashIcon,
  AlertIcon,
  CheckCircleIcon,
  ClipboardIcon,
  PlusIcon,
} from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import '../consultations/consultation.css';
import './prescriptions.css';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const FREQUENCY_OPTIONS = ['OD - Once Daily', 'BD - Twice Daily', 'TDS - Three times daily', 'QID - Four times daily', 'PRN - As needed', 'STAT', 'HS - At bedtime'];
const DURATION_OPTIONS = ['3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '1 Month', 'Ongoing'];
const ROUTE_OPTIONS = ['Oral', 'Topical', 'IV', 'IM', 'SC', 'Sublingual', 'Rectal', 'Inhalation', 'Ophthalmic', 'Otic'];

// Mirrored server-side in backend/src/modules/prescriptions/qtyCalc.ts — this copy drives instant
// UI calculation, the backend copy is the authoritative check at submit time and REJECTS a qty
// that disagrees, so the two must stay byte-for-byte equivalent. Returns null when the qty can't
// be mechanically derived, in which case Qty stays a manually-entered field.
// Latin/─prescribing shorthand → doses per day. `null` means deliberately not calculable.
const DOSE_CODES: Record<string, number | null> = {
  OD: 1, // once daily
  OM: 1, // omni mane — each morning
  ON: 1, // omni nocte — each night
  HS: 1, // hora somni — at bedtime
  NOCTE: 1,
  MANE: 1,
  DAILY: 1,
  BD: 2, // bis die
  BID: 2,
  TDS: 3, // ter die sumendus
  TID: 3,
  QDS: 4, // quater die sumendus — the common British/Sri Lankan form
  QID: 4,
  PRN: null, // as needed
  SOS: null, // si opus sit — if required
};

const MAX_DAYS = 365;

/** Doses per day, or null when the frequency is as-needed or not recognised. */
const dosesPerDay = (frequency?: string): number | null => {
  const text = (frequency ?? '').trim().toUpperCase();
  if (!text) return null;
  if (/\b(PRN|SOS)\b|AS\s+(NEEDED|REQUIRED)|WHEN\s+(NEEDED|REQUIRED)/.test(text)) return null;

  // "q6h", "every 8 hours" — only when the interval divides a day evenly.
  const hourly = text.match(/\bQ\s*(\d{1,2})\s*H\b/) ?? text.match(/\bEVERY\s+(\d{1,2})\s*(?:H|HRS?|HOURS?)\b/);
  if (hourly) {
    const hours = Number(hourly[1]);
    return hours > 0 && hours <= 24 && 24 % hours === 0 ? 24 / hours : null;
  }

  // "3 times daily", "3 times a day", "3x per day".
  const times = text.match(/\b(\d{1,2})\s*(?:X|TIMES?)\s*(?:A\s+|PER\s+)?DAY(?:LY)?\b/);
  if (times) {
    const n = Number(times[1]);
    return n >= 1 && n <= 24 ? n : null;
  }

  // Worded forms, checked before the codes so "TDS - Three times daily" agrees either way.
  if (/\bONCE\b/.test(text)) return 1;
  if (/\bTWICE\b/.test(text)) return 2;
  if (/\bTHRICE\b|\bTHREE\s+TIMES\b/.test(text)) return 3;
  if (/\bFOUR\s+TIMES\b/.test(text)) return 4;

  // Leading shorthand code, e.g. "BD", "TDS - Three times daily", "BD x 5/7".
  const code = text.match(/^([A-Z]+)\b/)?.[1];
  if (code && Object.prototype.hasOwnProperty.call(DOSE_CODES, code)) return DOSE_CODES[code];
  return null;
};

/** Course length in days, or null when it is open-ended or not recognised. */
const parseDurationDays = (duration?: string): number | null => {
  const text = (duration ?? '').trim().toUpperCase();
  if (!text) return null;
  if (/ONGOING|CONTINUOUS|LONG[\s-]?TERM|INDEFINITE|UNTIL/.test(text)) return null;

  // Prescribing shorthand: 5/7 = 5 days, 2/52 = 2 weeks, 3/12 = 3 months.
  const shorthand = text.match(/^(\d{1,3})\s*\/\s*(7|52|12)$/);
  if (shorthand) {
    const n = Number(shorthand[1]);
    const days = shorthand[2] === '7' ? n : shorthand[2] === '52' ? n * 7 : n * 30;
    return days >= 1 && days <= MAX_DAYS ? days : null;
  }

  // "5 days", "2 weeks", "1 month", or a bare number read as days.
  const m = text.match(/^(\d{1,3})\s*(DAYS?|D|WEEKS?|WKS?|W|MONTHS?|MTHS?|M)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? 'DAYS';
  const perUnit = /^(WEEKS?|WKS?|W)$/.test(unit) ? 7 : /^(MONTHS?|MTHS?|M)$/.test(unit) ? 30 : 1;
  const days = n * perUnit;
  return days >= 1 && days <= MAX_DAYS ? days : null;
};

/** Doses per day and course length, for callers that want to explain the arithmetic. */
const parseSchedule = (frequency?: string, duration?: string) => ({
  perDay: dosesPerDay(frequency),
  days: parseDurationDays(duration),
  /** STAT is a single dose — duration does not apply. */
  isStat: /^STAT\b/.test((frequency ?? '').trim().toUpperCase()),
});

// Total number of doses over the course (e.g. BD x 5 Days = 10), or null when the schedule can't
// be derived mechanically (PRN frequency, non-numeric duration like "Ongoing", or free text).
const scheduledDoseCount = (frequency?: string, duration?: string): number | null => {
  const { perDay, days, isStat } = parseSchedule(frequency, duration);
  if (isStat) return 1;
  if (perDay === null || days === null) return null;
  return perDay * days;
};

// Whole units to dispense, rounded UP so the patient is never short a fraction of a unit
// (1.5 tablets x TDS x 5 days = 22.5 -> 23).
/** "Take 1 Tablet each time · 500 mg · TDS · 5 Days · Oral · After food" for the final check. */
const draftHowToTake = (it: { dose_qty: string; unit: string; dosage: string; frequency: string; duration: string; route: string; instructionChips: string[] }) =>
  [Number(it.dose_qty) > 0 ? `Take ${it.dose_qty} ${it.unit} each time` : null, it.dosage, it.frequency, it.duration, it.route, it.instructionChips.join(', ')]
    .filter(Boolean)
    .join(' · ');

const computeExpectedQty = (frequency?: string, duration?: string, dose?: string | number): number | null => {
  const doses = scheduledDoseCount(frequency, duration);
  const perDose = Number(dose);
  if (doses === null || !Number.isFinite(perDose) || perDose <= 0) return null;
  return Math.ceil(perDose * doses - 1e-9);
};

// Why the quantity is or isn't being calculated, in words the prescriber can act on. Silence was
// the original problem: the field just sat there saying "Manual" with no hint what was missing.
type QtyNote = { ok: true; text: string } | { ok: false; text: string };
const explainQty = (frequency: string, duration: string, dose: string, unit: string, qty: string): QtyNote => {
  const { perDay, days, isStat } = parseSchedule(frequency, duration);
  const perDose = Number(dose);
  const hasDose = Number.isFinite(perDose) && perDose > 0;

  if (!hasDose) return { ok: false, text: `Enter how many ${unit.toLowerCase()} per dose` };
  if (isStat) return { ok: true, text: `${perDose} ${unit.toLowerCase()} once (STAT) = ${qty}` };
  if (!frequency.trim()) return { ok: false, text: 'Add a frequency (e.g. TDS) to calculate' };
  if (perDay === null) return { ok: false, text: `Can't total \u201c${frequency.trim()}\u201d \u2014 enter the quantity` };
  if (!duration.trim()) return { ok: false, text: 'Add a duration (e.g. 5 days) to calculate' };
  if (days === null) return { ok: false, text: `Can't total \u201c${duration.trim()}\u201d \u2014 enter the quantity` };
  const u = unit.toLowerCase();
  const unitLabel = Number(qty) === 1 || u === 'ml' || u === 'gram' ? u : `${u}s`;
  return { ok: true, text: `${perDose} \u00d7 ${perDay}/day \u00d7 ${days} day${days === 1 ? '' : 's'} = ${qty} ${unitLabel}` };
};

interface DraftItem {
  key: string;
  medicine_id: number;
  name: string;
  generic_name: string | null;
  strength: string | null;
  form: string | null;
  category: string | null;
  unit: string;
  totalQty: number;
  stockStatus: Medicine['stockStatus'];
  dosage: string;
  // Units taken per dose in the medicine's dispensing unit ("2" tablets, "5" ml). Kept as text so
  // the field can be empty until the doctor deliberately fills it in — see computeExpectedQty.
  dose_qty: string;
  qtyManual: boolean;
  frequency: string;
  duration: string;
  route: string;
  instructionChips: string[];
  qty: string;
  /** Taken long-term: stays on the ongoing-medicines list after the course runs out. */
  isLongTerm?: boolean;
}

// Fills in defaults for drafts saved before external purchase/instructions-chips support existed,
// and reconstructs instruction chips from a legacy plain-text `instructions` string if present.
const normalizeItem = (it: any): DraftItem => ({
  ...it,
  dose_qty: Number(it.dose_qty) > 0 ? String(it.dose_qty) : '1',
  qtyManual: it.qtyManual ?? false,
  instructionChips: it.instructionChips ?? (it.instructions ? String(it.instructions).split(';').map((s: string) => s.trim()).filter(Boolean) : []),
});

type StockBadge = { emoji: string; label: string; cls: string } | null;
const stockBadge = (item: DraftItem): StockBadge => {
  const qtyNum = Number(item.qty) || 0;
  if (item.totalQty === 0) return { emoji: '🔴', label: 'Not Available in Clinic', cls: 'red' };
  if (item.totalQty < qtyNum) return { emoji: '🟠', label: 'Insufficient Stock', cls: 'amber' };
  return null;
};

const draftKey = (consultationId: number) => scopedDraftKey(`doctor_rx_${consultationId}`);

interface SavedDraft {
  items: DraftItem[];
  notes: string;
  externalItems: ExternalMedicineDraft[];
  consultationFee?: string;
}

// The prescription in progress for this consultation, as last saved on this computer.
const readDraft = (consultationId: number): SavedDraft => {
  try {
    const raw = localStorage.getItem(draftKey(consultationId));
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        items: (saved.items ?? []).map(normalizeItem),
        notes: saved.notes ?? '',
        externalItems: saved.externalItems ?? [],
        consultationFee: saved.consultationFee,
      };
    }
  } catch {
    /* unreadable or corrupt draft: start empty */
  }
  return { items: [], notes: '', externalItems: [] };
};

// Landing view when no consultation is specified — lets the doctor pick from their own
// in-progress (Draft) consultations, since a prescription is normally written during one.
const PrescriptionPicker = () => {
  const navigate = useNavigate();
  const { data: result, loading } = useApiData(() => listConsultations({ status: 'Draft', limit: 50 }));
  const drafts = result?.data ?? [];

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;

  if (drafts.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <ClipboardIcon />
        <h3 style={{ margin: '12px 0 4px', color: '#334155' }}>No in-progress consultation to prescribe for</h3>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 16px' }}>Start or resume a consultation first, then prescribe from there.</p>
        <button className="pat-btn primary" onClick={() => navigate('/queue/live')}>
          Go to the queue
        </button>
      </div>
    );
  }

  return (
    <div className="pat-table-card">
      <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Choose a consultation to prescribe for</h3>
      </div>
      <div className="pat-table-scroll">
        <table className="pat-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Date</th>
              <th>Diagnosis</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((c) => (
              <tr key={c.consultationId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.patientName}</div>
                  <span className="pat-muted" style={{ fontSize: 13 }}>
                    {c.patientId}
                  </span>
                </td>
                <td>{formatDate(c.createdAt)}</td>
                <td>{c.diagnosis || '—'}</td>
                <td>
                  <button className="pat-btn primary" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => navigate(`/prescriptions/new/${c.consultationId}`)}>
                    Prescribe
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

const NewPrescription = () => {
  const { consultationId } = useParams();
  if (!consultationId) return <PrescriptionPicker />;
  // Keyed so moving to another consultation starts from that consultation's own draft.
  return <Builder key={consultationId} consultationId={Number(consultationId)} />;
};

const Builder = ({ consultationId }: { consultationId: number }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: context, loading, error } = useApiData(() => getPrescriptionContext(consultationId), [consultationId]);
  const { data: clinicSettings } = useApiData(() => getClinicSettings(), []);

  // Restored before the first render, so the autosave below can never write an empty page over a
  // saved draft while it is still being read back.
  const [initialDraft] = useState(() => readDraft(consultationId));
  const [items, setItems] = useState<DraftItem[]>(initialDraft.items);
  const [notes, setNotes] = useState(initialDraft.notes);
  const [externalItems, setExternalItems] = useState<ExternalMedicineDraft[]>(initialDraft.externalItems);
  const [shortfallPrefill, setShortfallPrefill] = useState<ShortfallPrefill | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [allergyAck, setAllergyAck] = useState(false);
  const [finalReviewOpen, setFinalReviewOpen] = useState(false);
  const [skipPrescription, setSkipPrescription] = useState(false);
  const [createdPrescriptionId, setCreatedPrescriptionId] = useState<number | null>(null);
  // Tests can be ordered from here too, so a doctor deciding on investigations while prescribing
  // does not have to go back to the examination step.
  const [labTestOrders, setLabTestOrders] = useState<LabTestOrder[]>([]);
  const [labTestsOpen, setLabTestsOpen] = useState(false);
  const reloadLabTestOrders = () => {
    listLabTestOrders({ consultationId }).then((r) => setLabTestOrders(r.data)).catch(() => {});
  };
  useEffect(reloadLabTestOrders, [consultationId]);
  const [consultationFeeInput, setConsultationFeeInput] = useState(() => {
    const passedFee = (location.state as { consultationFee?: string } | null)?.consultationFee;
    return passedFee ?? initialDraft.consultationFee ?? '';
  });

  // There's no server-side Draft status for prescriptions — they're created atomically once the
  // visit is finalized — so the page is kept in this browser's storage as the doctor works. Going
  // back to the examination, a reload or a closed tab no longer loses the medicines; "Save as
  // Draft" is just an explicit checkpoint. Cleared once the visit is finalized.
  const finalizedRef = useRef(false);
  useEffect(() => {
    if (finalizedRef.current) return;
    try {
      if (items.length === 0 && externalItems.length === 0 && !notes.trim()) {
        localStorage.removeItem(draftKey(consultationId));
      } else {
        localStorage.setItem(draftKey(consultationId), JSON.stringify({ items, notes, externalItems, consultationFee: consultationFeeInput }));
      }
    } catch {
      /* storage full or blocked: the page itself still holds everything */
    }
  }, [consultationId, items, notes, externalItems, consultationFeeInput]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchMedicines(searchTerm).then((results) => {
        setSearchResults(results);
        setSearchOpen(true);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // "Prescribe these again" from a past visit arrives in router state. Each clinic medicine is
  // looked up again so today's stock and active status apply; anything no longer in the catalogue
  // is reported rather than silently dropped. Applied once, then cleared from history state so a
  // reload does not add the same medicines twice.
  const [repeatNotice, setRepeatNotice] = useState<string | null>(null);
  const repeatAppliedRef = useRef(false);
  useEffect(() => {
    const repeat = (location.state as { repeat?: RepeatRequest } | null)?.repeat;
    if (!repeat || repeatAppliedRef.current) return;
    repeatAppliedRef.current = true;
    try {
      window.history.replaceState({ ...window.history.state, usr: { ...(window.history.state?.usr ?? {}), repeat: undefined } }, '');
    } catch {
      /* history state is a convenience only */
    }
    void (async () => {
      const added: DraftItem[] = [];
      const missing: string[] = [];
      for (const med of repeat.items) {
        const results = await searchMedicines(med.medicine).catch(() => [] as Medicine[]);
        const m = results.find((r) => r.medicine_id === med.medicineId) ?? results.find((r) => r.name.toLowerCase() === med.medicine.toLowerCase());
        if (!m || !m.is_active) {
          missing.push(med.medicine);
          continue;
        }
        const dose = med.doseQty ? String(med.doseQty) : '';
        const frequency = med.frequency ?? '';
        const duration = med.duration ?? '';
        const expected = computeExpectedQty(frequency, duration, dose);
        added.push({
          key: `${m.medicine_id}-${Date.now()}-${added.length}`,
          medicine_id: m.medicine_id,
          name: m.name,
          generic_name: m.generic_name,
          strength: m.strength,
          form: m.form,
          category: m.category,
          unit: m.base_unit,
          totalQty: m.totalQty,
          stockStatus: m.stockStatus,
          dosage: med.dosage,
          dose_qty: dose,
          // Without a recorded dose the old total can't be recomputed, so carry it as entered.
          qtyManual: expected === null,
          frequency,
          duration,
          route: med.route ?? '',
          instructionChips: med.instructions ? med.instructions.split(';').map((c) => c.trim()).filter(Boolean) : [],
          qty: String(expected ?? med.qty),
        });
      }
      setItems((prev) => [...prev, ...added.filter((a) => !prev.some((p) => p.medicine_id === a.medicine_id))]);
      setExternalItems((prev) => [
        ...prev,
        ...repeat.external
          .filter((e) => !prev.some((p) => p.medicine_name.toLowerCase() === e.medicine.toLowerCase()))
          .map((e, i) => ({
            key: `ext-repeat-${Date.now()}-${i}`,
            medicine_name: e.medicine,
            generic_name: '',
            brand_name: '',
            dosage_form: e.dosageForm ?? '',
            strength: e.strength ?? '',
            dosage: e.dosage,
            dose_qty: e.doseQty ? String(e.doseQty) : '',
            frequency: e.frequency ?? '',
            duration: e.duration ?? '',
            quantity: String(e.qty),
            qtyManual: true,
            quantity_unit: e.unit ?? '',
            instructionChips: e.instructions ? e.instructions.split(';').map((c) => c.trim()).filter(Boolean) : [],
          })),
      ]);
      const when = new Date(repeat.fromDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      setRepeatNotice(
        `Added the medicines from ${when}. Check the doses before finalizing.` +
          (missing.length ? ` Not added (no longer in the clinic list): ${missing.join(', ')}.` : '')
      );
    })();
  }, [location.state]);

  // "Ongoing medicines" panel: Continue / Change copy a medicine the patient is already on into
  // today's prescription for the chosen length (1–3 months or until a date), with the quantity
  // recalculated. Clinic medicines are looked up again so today's stock and active status apply.
  const [ongoingBusy, setOngoingBusy] = useState(false);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [stoppedOngoing, setStoppedOngoing] = useState<string[]>([]);
  useEffect(() => {
    if (!highlightKey) return;
    document.getElementById(`rx-item-${highlightKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlightKey(null), 4000);
    return () => clearTimeout(t);
  }, [highlightKey]);

  const continueOngoing = async (meds: OngoingMedication[], duration: string, mode: ContinueMode) => {
    setOngoingBusy(true);
    try {
      const stamp = Date.now();
      const added: DraftItem[] = [];
      const addedExternal: ExternalMedicineDraft[] = [];
      const missing: string[] = [];
      const chips = (text: string | null) => (text ? text.split(';').map((c) => c.trim()).filter(Boolean) : []);
      for (const med of meds) {
        const dose = med.doseQty ? String(med.doseQty) : '';
        const frequency = med.frequency ?? '';
        const expected = computeExpectedQty(frequency, duration, dose);
        // A schedule that can't be totalled (PRN, free text) keeps the last quantity, entered by
        // hand; otherwise the quantity is recalculated, and a missing dose is left for the doctor.
        const qtyManual = scheduledDoseCount(frequency, duration) === null;
        if (med.outside) {
          addedExternal.push({
            key: `ext-ongoing-${stamp}-${addedExternal.length}`,
            medicine_id: med.medicineId ?? undefined,
            medicine_name: med.name,
            generic_name: med.genericName ?? '',
            brand_name: med.brandName ?? '',
            dosage_form: med.dosageForm ?? '',
            strength: med.strength ?? '',
            dosage: med.dosage,
            dose_qty: dose,
            frequency,
            duration,
            quantity: String(expected ?? med.qty),
            qtyManual: expected === null,
            quantity_unit: med.quantityUnit ?? '',
            instructionChips: chips(med.instructions),
            isLongTerm: med.longTerm,
          });
          continue;
        }
        const results = await searchMedicines(med.name).catch(() => [] as Medicine[]);
        const m = results.find((r) => r.medicine_id === med.medicineId) ?? results.find((r) => r.name.toLowerCase() === med.key);
        if (!m || !m.is_active) {
          missing.push(med.name);
          continue;
        }
        added.push({
          key: `${m.medicine_id}-${stamp}-${added.length}`,
          medicine_id: m.medicine_id,
          name: m.name,
          generic_name: m.generic_name,
          strength: m.strength,
          form: m.form,
          category: m.category,
          unit: m.base_unit,
          totalQty: m.totalQty,
          stockStatus: m.stockStatus,
          dosage: med.dosage,
          dose_qty: dose,
          qtyManual,
          frequency,
          duration,
          route: med.route ?? '',
          instructionChips: chips(med.instructions),
          qty: String(expected ?? med.qty),
          isLongTerm: med.longTerm,
        });
      }
      const newItems = added.filter((a) => !items.some((p) => p.medicine_id === a.medicine_id));
      const newExternal = addedExternal.filter((e) => !externalItems.some((p) => p.medicine_name.trim().toLowerCase() === e.medicine_name.trim().toLowerCase()));
      setItems((prev) => [...prev, ...newItems]);
      setExternalItems((prev) => [...prev, ...newExternal]);
      const count = newItems.length + newExternal.length;
      setRepeatNotice(
        (count
          ? mode === 'change'
            ? `Added ${meds[0].name} for ${duration.toLowerCase()} — make your changes below.`
            : `Continued ${count} medicine${count === 1 ? '' : 's'} for ${duration.toLowerCase()}. Check the doses before finalizing.`
          : '') + (missing.length ? ` Not added (no longer in the clinic list): ${missing.join(', ')}.` : '')
      );
      if (newItems.length) setHighlightKey(newItems[0].key);
    } finally {
      setOngoingBusy(false);
    }
  };

  const addMedicine = (m: Medicine) => {
    if (items.some((i) => i.medicine_id === m.medicine_id)) {
      setSearchOpen(false);
      setSearchTerm('');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        key: `${m.medicine_id}-${Date.now()}`,
        medicine_id: m.medicine_id,
        name: m.name,
        generic_name: m.generic_name,
        strength: m.strength,
        form: m.form,
        category: m.category,
        unit: m.base_unit,
        totalQty: m.totalQty,
        stockStatus: m.stockStatus,
        dosage: m.strength || '',
        dose_qty: '1',
        qtyManual: false,
        frequency: '',
        duration: '',
        route: '',
        instructionChips: [],
        qty: '1',
      },
    ]);
    setSearchTerm('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  const updateItem = (key: string, field: keyof DraftItem) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  };

  // Frequency/Duration changes ripple into Qty when it is calculable.
  const updateFreqOrDuration = (key: string, field: 'frequency' | 'duration') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it, [field]: value };
        const expected = updated.qtyManual ? null : computeExpectedQty(updated.frequency, updated.duration, updated.dose_qty);
        return { ...updated, qty: expected !== null ? String(expected) : updated.qty };
      })
    );
  };

  const updateDose = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it, dose_qty: value };
        const expected = updated.qtyManual ? null : computeExpectedQty(updated.frequency, updated.duration, value);
        return { ...updated, qty: expected !== null ? String(expected) : updated.qty };
      })
    );
  };

  const setQtyManual = (key: string, manual: boolean) =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it, qtyManual: manual };
        const expected = manual ? null : computeExpectedQty(updated.frequency, updated.duration, updated.dose_qty);
        return { ...updated, qty: expected !== null ? String(expected) : updated.qty };
      })
    );

  const updateQtyManual = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, qty: value } : it)));
  };



  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const handleSaveDraft = () => {
    localStorage.setItem(draftKey(consultationId), JSON.stringify({ items, notes, externalItems }));
    setDraftSavedAt(new Date());
  };

  const handleClearAll = () => {
    setItems([]);
    setExternalItems([]);
    setNotes('');
    localStorage.removeItem(draftKey(consultationId));
  };

  const buildItemsInput = (): PrescriptionItemInput[] =>
    items.map((i) => ({
      medicine_id: i.medicine_id,
      dosage: i.dosage,
      frequency: i.frequency || undefined,
      duration: i.duration || undefined,
      route: i.route || undefined,
      instructions: i.instructionChips.length ? i.instructionChips.join('; ') : undefined,
      qty: Number(i.qty) || 1,
      dose_qty: Number(i.dose_qty) > 0 ? Number(i.dose_qty) : undefined,
      qty_manual: i.qtyManual || scheduledDoseCount(i.frequency, i.duration) === null,
      external_qty: 0,
      is_long_term: !!i.isLongTerm,
    }));

  // Live allergy check — same substring match the backend runs authoritatively at submit time;
  // this is purely a heads-up before sending, not a second source of truth.
  const allergyText = (context?.appointment.patient?.allergies || '').toLowerCase().trim();
  const allergyConflictItems = allergyText
    ? items.filter((i) => allergyText.includes(i.name.toLowerCase()) || (i.generic_name && allergyText.includes(i.generic_name.toLowerCase())))
    : [];

  // React state updates aren't applied synchronously, so `disabled={submitting}` alone can't
  // stop a second click (or an impatient double-click) that lands before the re-render — this
  // ref-based lock closes that window immediately, independent of React's render cycle.
  const submittingRef = useRef(false);

  const validatePrescriptionDraft = () => {
    // Medicines bought outside count as a prescription too — only an empty page needs the
    // "No medicines needed" route.
    if (items.length === 0 && externalItems.length === 0) {
      setSubmitError('Add at least one medicine, or choose “No medicines needed”.');
      return false;
    }
    if (allergyConflictItems.length > 0 && !allergyAck) {
      setSubmitError('Acknowledge the allergy alert below before finalizing.');
      return false;
    }
    const missingDose = items.find((i) => scheduledDoseCount(i.frequency, i.duration) !== null && !i.qtyManual && !(Number(i.dose_qty) > 0));
    if (missingDose) {
      setSubmitError(`Enter how many ${missingDose.unit} of ${missingDose.name} are taken per dose (or choose \u201cEnter quantity manually\u201d).`);
      return false;
    }
    setSubmitError(null);
    return true;
  };

  const openFinalReview = (withoutPrescription = false) => {
    // Checked here, before anything is sent: the prescription goes to the pharmacy first and the
    // visit is finalized second, so a visit the server would refuse must not get that far.
    if (!context?.consultation.complaint?.trim()) {
      setSubmitError('Record the reason for the visit on the examination page (“← Back to examination”) before finalizing.');
      return;
    }
    if (!withoutPrescription && !validatePrescriptionDraft()) return;
    // "No medicines needed" skips the prescription entirely, which would quietly lose anything
    // listed to buy outside — those used to vanish from the record without a word.
    if (
      withoutPrescription &&
      (items.length > 0 || externalItems.length > 0) &&
      !window.confirm(
        `${[items.length && `${items.length} clinic medicine${items.length === 1 ? '' : 's'}`, externalItems.length && `${externalItems.length} to buy outside`]
          .filter(Boolean)
          .join(' and ')} will not be saved if you finish with “No medicines needed”. Continue?`
      )
    )
      return;
    setSkipPrescription(withoutPrescription);
    setSubmitError(null);
    setFinalReviewOpen(true);
  };

  const finalizeVisit = async () => {
    if (submittingRef.current) return;
    const fee = consultationFeeInput.trim() === '' ? undefined : Number(consultationFeeInput);
    if (fee !== undefined && (Number.isNaN(fee) || fee < 0)) {
      setSubmitError('Consultation fee must be a positive number.');
      return;
    }
    submittingRef.current = true;
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (!skipPrescription) {
        let prescriptionId = createdPrescriptionId;
        if (!prescriptionId) {
          const res = await createPrescription({
            consultation_id: consultationId,
            // Everything bought outside: recorded, but nothing goes to the pharmacy queue.
            ...(items.length > 0 ? { items: buildItemsInput() } : { external_only: true }),
            allergyAck,
            notes: notes || undefined,
          });
          prescriptionId = res.data.prescription_id;
          setCreatedPrescriptionId(prescriptionId);
        }

        if (externalItems.length > 0) {
          await bulkCreateExternalMedicines(prescriptionId, externalItems.map(draftToInput));
          setExternalItems([]);
        }
      }

      await finalizeConsultation(consultationId, fee);
      finalizedRef.current = true;
      localStorage.removeItem(draftKey(consultationId));
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response?.status === 409 && err.response.data?.conflicts) {
        setSubmitError(`Allergy conflict: ${err.response.data.conflicts.join(', ')} — acknowledge it and finalize again.`);
      } else {
        setSubmitError(err.response?.data?.message || 'Could not finalize the visit. Nothing will be submitted twice; please try again.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this consultation: {error}</div>;

  const finalDiagnoses = [
    ...(context.consultation.diagnosis ? [{ code: context.consultation.icd10Code, title: context.consultation.diagnosis }] : []),
    ...(context.consultation.additionalDiagnoses ?? []),
  ];

  const patient = displayPrescriptionPatient(context);
  const visitType = context.patientSummary.priorVisitCount > 0 ? 'Return Visit' : 'New Visit';

  const stockIssues = items.filter((i) => i.totalQty > 0 && i.totalQty < Number(i.qty));
  const outOfStock = items.filter((i) => i.totalQty === 0);

  return (
    <div>
      <div className="cons-flow-strip" aria-label="Consultation workflow">
        <button className="done" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
          <span><CheckCircleIcon /></span><strong>Examine &amp; document</strong><small>Clinical assessment saved</small>
        </button>
        <button className="active">
          <span>2</span><strong>Prescribe &amp; finalize</strong><small>Add medicines, then complete the visit</small>
        </button>
      </div>
      <div className="dash-header">
        <div>
          <span className="cons-step-kicker">STEP 2 OF 2</span>
          <h1>Prescribe medicines</h1>
          <p>Prepare the treatment as a draft. It is sent to pharmacy only when you finalize the visit. Everything here is saved automatically, so you can go back to the examination and return.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
            ← Back to examination
          </button>
          <button className="pat-btn" onClick={() => setLabTestsOpen(true)}>
            <ClipboardIcon /> Order lab tests{labTestOrders.length > 0 ? ` (${labTestOrders.length})` : ''}
          </button>
        </div>
      </div>

      {labTestsOpen && (
        <AddLabTestModal
          consultationId={consultationId}
          alreadyOrdered={labTestOrders.filter((o) => o.status !== 'Cancelled').map((o) => o.test_name)}
          onClose={() => setLabTestsOpen(false)}
          onAdded={() => {
            setLabTestsOpen(false);
            reloadLabTestOrders();
          }}
        />
      )}
      {labTestOrders.length > 0 && (
        <div className="rxb-banner success">
          <span className="rxb-banner-icon">
            <ClipboardIcon />
          </span>
          <span className="rxb-banner-text">
            Lab tests ordered for this visit: {labTestOrders.map((o) => o.test_name).join(', ')}.
          </span>
        </div>
      )}
      {draftSavedAt && (
        <div className="rxb-banner success">
          <span className="rxb-banner-icon">
            <CheckCircleIcon />
          </span>
          <span className="rxb-banner-text">Draft saved at {formatTime(draftSavedAt)}. Changes on this page are also saved automatically as you work.</span>
        </div>
      )}
      {submitError && <div className="dash-error-banner">{submitError}</div>}
      {repeatNotice && (
        <div className="rxb-banner success">
          <span className="rxb-banner-icon">
            <CheckCircleIcon />
          </span>
          <span className="rxb-banner-text">{repeatNotice}</span>
        </div>
      )}

      <div className="cons-box" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {patient.photoUrl ? (
            <img className="cons-banner-avatar" src={fileUrl(patient.photoUrl)} alt={patient.fullName} />
          ) : (
            <div className="cons-banner-avatar">{initials(patient.fullName)}</div>
          )}
          <div>
            <div className="cons-banner-name">
              {patient.fullName} {patient.isTemporary && <span className="badge badge-amber">Temporary / Unregistered</span>}
            </div>
            <div className="cons-banner-meta">
              MRN: {patient.patientId ?? 'Temporary — Today Only'} ·{' '}
              {patient.dob ? `${calculateAge(patient.dob)} Y` : patient.approxAge ? `~${patient.approxAge} Y` : '—'} / {patient.gender ?? '—'}
            </div>
            {patient.phone && <div className="cons-banner-sub">{patient.phone}</div>}
          </div>
        </div>

        <div className="rxp-field-grid">
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Visit Date &amp; Time</div>
            <div className="rxp-field-box-value">{formatDateTime(context.appointment.scheduledAt)}</div>
          </div>
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Visit Type</div>
            <div className="rxp-field-box-value">{visitType}</div>
          </div>
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Attending Doctor</div>
            <div className="rxp-field-box-value">Dr. {context.appointment.doctor.username}</div>
          </div>
        </div>

        <div className={`rxp-allergy-strip${context.patientSummary.allergies ? ' has-allergies' : ''}`}>
          {context.patientSummary.allergies ? <AlertIcon /> : <CheckCircleIcon />}
          <span>
            <strong>{context.patientSummary.allergies ? 'Allergies' : 'No known allergies'}</strong>
            {context.patientSummary.allergies ? `: ${context.patientSummary.allergies}` : ' recorded for this patient.'}
            {context.patientSummary.allergies && (
              <small className="rxp-allergy-caveat">Medicines are checked by name only — check brands and combination products yourself.</small>
            )}
          </span>
          <button className="card-link" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
            View full record →
          </button>
        </div>
      </div>

      <div className="cons-layout rxp-no-rail">
        <div>
          {patient.patientId && (
            <OngoingMedicationsPanel
              medicines={context.ongoingMedications ?? []}
              patientId={patient.patientId}
              consultationId={consultationId}
              addedKeys={new Set([...items.map((i) => i.name.trim().toLowerCase()), ...externalItems.map((e) => e.medicine_name.trim().toLowerCase())])}
              busy={ongoingBusy}
              onAdd={(meds, duration, mode) => void continueOngoing(meds, duration, mode)}
              onStoppedChange={setStoppedOngoing}
            />
          )}
          <div className="cons-box" style={{ marginBottom: 16 }}>
            <div className="cons-box-title">
              <span>Medicines{items.length > 0 ? ` (${items.length})` : ''}</span>
              {items.length > 0 && (
                <button type="button" className="card-link" onClick={handleClearAll}>
                  Clear all
                </button>
              )}
            </div>

            <div className="rxb-search-row" ref={searchRef}>
              <div className="rxb-search-box">
                <SearchIcon />
                <input
                  ref={searchInputRef}
                  placeholder="Search medicine by name, generic name or category…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                />
              </div>
              {searchOpen && (
                <div className="rxb-search-dropdown">
                  {searchTerm.trim().length < 2 && <div className="rxb-search-empty">Type at least 2 characters to search…</div>}
                  {searchTerm.trim().length >= 2 && searchResults.length === 0 && <div className="rxb-search-empty">No medicines found.</div>}
                  {searchResults.map((m) => (
                    <div className="rxb-search-result" key={m.medicine_id} onClick={() => addMedicine(m)}>
                      <div>
                        <div className="rxb-search-result-name">
                          {m.name} {m.strength && `(${m.strength})`}
                        </div>
                        <div className="rxb-search-result-meta">
                          {m.generic_name} · {[m.form, m.category].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span className={`badge ${m.stockStatus === 'in-stock' ? 'badge-green' : m.stockStatus === 'low' ? 'badge-amber' : 'badge-red'}`}>
                        {m.stockStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* One card per medicine with labelled fields: the old 9-column table squeezed every
                input to a few characters wide. */}
            {items.length === 0 ? (
              <div className="rxb-empty-table">No medicines added yet. Search above to add one.</div>
            ) : (
              <ol className="rxp-items">
                {items.map((it, i) => {
                  const qtyNum = Number(it.qty) || 0;
                  const scheduleCalculable = scheduledDoseCount(it.frequency, it.duration) !== null;
                  const expectedQty = it.qtyManual ? null : computeExpectedQty(it.frequency, it.duration, it.dose_qty);
                  const needsDose = scheduleCalculable && !it.qtyManual && !(Number(it.dose_qty) > 0);
                  const qtyNote = explainQty(it.frequency, it.duration, it.dose_qty, it.unit, it.qty);
                  const badge = stockBadge(it);
                  return (
                    <li className={`rxp-item${highlightKey === it.key ? ' rxp-item-highlight' : ''}`} key={it.key} id={`rx-item-${it.key}`}>
                      <div className="rxp-item-head">
                        <span className="rxp-item-num">{i + 1}</span>
                        <div className="rxp-item-title">
                          <div className="rxb-med-name">{it.name}</div>
                          <div className="rxb-med-generic">{[it.form, it.category].filter(Boolean).join(' · ') || it.generic_name}</div>
                          {(() => {
                            // Same generic as something the patient is already on, under another name.
                            const generic = it.generic_name?.trim().toLowerCase();
                            const twin = generic
                              ? (context.ongoingMedications ?? []).find(
                                  (o) => o.status !== 'ended' && o.key !== it.name.trim().toLowerCase() && o.genericName?.trim().toLowerCase() === generic && !stoppedOngoing.includes(o.key)
                                )
                              : undefined;
                            return twin ? (
                              <div className="rxp-dup-warn">
                                <AlertIcon /> Same medicine ({it.generic_name}) as {twin.name}, which the patient is already on. Stop {twin.name} above if this replaces it.
                              </div>
                            ) : null;
                          })()}
                        </div>
                        <div className="rxp-source-block">
                          <div className="rxp-source-meta">
                            Clinic stock: <strong>{it.totalQty}</strong> · Needed: <strong>{qtyNum}</strong>
                          </div>
                          {badge && (
                            <span className={`rxp-source-badge ${badge.cls}`}>
                              {badge.emoji} {badge.label}
                            </span>
                          )}
                          {badge && (
                            <button
                              type="button"
                              className="rxp-add-external-btn"
                              onClick={() =>
                                setShortfallPrefill({
                                  medicine_id: it.medicine_id,
                                  medicine_name: it.name,
                                  generic_name: it.generic_name,
                                  dosage_form: it.form,
                                  strength: it.strength,
                                  dosage: it.dosage,
                                  dose_qty: it.dose_qty,
                                  frequency: it.frequency,
                                  duration: it.duration,
                                  quantity: Math.max(qtyNum - it.totalQty, 1),
                                  quantity_unit: it.unit,
                                })
                              }
                            >
                              <PlusIcon /> Add to External Medicines
                            </button>
                          )}
                        </div>
                        <button className="pat-icon-btn" onClick={() => removeItem(it.key)} aria-label={`Remove ${it.name}`} title="Remove">
                          <TrashIcon />
                        </button>
                      </div>

                      <div className="rxp-item-fields">
                        <label className="rxp-item-field">
                          <span>Strength</span>
                          <input className="rxb-table-input" value={it.dosage} onChange={updateItem(it.key, 'dosage')} placeholder="500 mg" />
                        </label>
                        <label className="rxp-item-field" title="How many units the patient takes each time — the quantity is calculated from this">
                          <span>Take each time</span>
                          <span className="rxp-dose-row">
                            <input
                              className="rxb-table-input"
                              style={needsDose ? { borderColor: '#dc2626' } : undefined}
                              type="text"
                              inputMode="decimal"
                              value={it.dose_qty}
                              onChange={updateDose(it.key)}
                              aria-label={`${it.unit} per dose`}
                            />
                            {it.unit}
                          </span>
                        </label>
                        <label className="rxp-item-field">
                          <span>Frequency</span>
                          <input
                            className="rxb-table-input"
                            list="rxp-frequency-options"
                            value={it.frequency}
                            onChange={updateFreqOrDuration(it.key, 'frequency')}
                            placeholder="TDS"
                          />
                        </label>
                        <label className="rxp-item-field">
                          <span>Duration</span>
                          <input
                            className="rxb-table-input"
                            list="rxp-duration-options"
                            value={it.duration}
                            onChange={updateFreqOrDuration(it.key, 'duration')}
                            placeholder="5 Days"
                          />
                        </label>
                        <label className="rxp-item-field">
                          <span>Route</span>
                          <input className="rxb-table-input" list="rxp-route-options" value={it.route} onChange={updateItem(it.key, 'route')} placeholder="Oral" />
                        </label>
                        <div className="rxp-item-field">
                          <span>Quantity</span>
                          {expectedQty !== null ? (
                            <>
                              <input className="rxb-table-input qty" type="number" value={it.qty} disabled aria-label="Quantity" />
                              {/* Show the arithmetic, so a wrong frequency or duration is caught here
                                  rather than at the counter. */}
                              <div className="rxp-qty-note calculated">{qtyNote.text}</div>
                              <button type="button" className="rxp-qty-link" onClick={() => setQtyManual(it.key, true)}>
                                Enter quantity manually
                              </button>
                            </>
                          ) : needsDose ? (
                            <>
                              <input className="rxb-table-input qty" type="number" value="" disabled placeholder="—" aria-label="Quantity" />
                              <div className="rxp-qty-note blocked">{qtyNote.text}</div>
                              <button type="button" className="rxp-qty-link" onClick={() => setQtyManual(it.key, true)}>
                                Enter quantity manually
                              </button>
                            </>
                          ) : (
                            <>
                              <input className="rxb-table-input qty" type="number" min={1} value={it.qty} onChange={updateQtyManual(it.key)} aria-label="Quantity" />
                              <div className={`rxp-qty-note ${it.qtyManual ? 'manual' : 'blocked'}`}>
                                {it.qtyManual ? `Manual (${it.unit.toLowerCase()})` : qtyNote.text}
                              </div>
                              {it.qtyManual && scheduleCalculable && (
                                <button type="button" className="rxp-qty-link" onClick={() => setQtyManual(it.key, false)}>
                                  Calculate from dose
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="rxp-item-field rxp-item-instructions">
                        <span>Instructions</span>
                        <InstructionsPicker
                          chips={it.instructionChips}
                          onChange={(chips) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, instructionChips: chips } : x)))}
                        />
                      </div>
                      <label className="rxp-longterm">
                        <input
                          type="checkbox"
                          checked={!!it.isLongTerm}
                          onChange={(e) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, isLongTerm: e.target.checked } : x)))}
                        />
                        Long-term medicine <small>— keep it on the patient's ongoing list until a doctor stops it</small>
                      </label>
                    </li>
                  );
                })}
              </ol>
            )}
            <datalist id="rxp-frequency-options">
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            <datalist id="rxp-duration-options">
              {DURATION_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            <datalist id="rxp-route-options">
              {ROUTE_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>

            {allergyConflictItems.length > 0 && (
              <div className="rxp-alert-box warn rxp-allergy-conflict" role="alert">
                <span className="rxp-alert-title">
                  <AlertIcon /> Allergy conflict
                </span>
                <span className="rxp-alert-body">
                  {allergyConflictItems.map((i) => i.name).join(', ')} may conflict with a documented allergy ({context.patientSummary.allergies}).
                </span>
                <label className="rxp-allergy-ack">
                  <input type="checkbox" checked={allergyAck} onChange={(e) => setAllergyAck(e.target.checked)} />
                  Acknowledge and proceed
                </label>
              </div>
            )}

            {items.length > 0 && outOfStock.length === 0 && stockIssues.length === 0 && (
              <div className="rxb-banner success">
                <span className="rxb-banner-icon">
                  <CheckCircleIcon />
                </span>
                <span className="rxb-banner-text">
                  <span className="rxb-banner-title">Stock Availability: </span>All medicines are available in stock and not expired.
                </span>
              </div>
            )}
            {(outOfStock.length > 0 || stockIssues.length > 0) && (
              <div className="rxb-banner warning">
                <span className="rxb-banner-icon">
                  <AlertIcon />
                </span>
                <span className="rxb-banner-text">
                  <span className="rxb-banner-title">Stock Availability: </span>
                  {outOfStock.map((i) => i.name).join(', ')}
                  {outOfStock.length > 0 && stockIssues.length > 0 && '; '}
                  {stockIssues.map((i) => `${i.name} (only ${i.totalQty} in stock)`).join(', ')} — the pharmacist will re-check at dispense time.
                </span>
              </div>
            )}

            <div className="rxp-notes-row">
              <div>
                <div className="cons-box-title" style={{ marginBottom: 6 }}>
                  Notes to Pharmacist
                </div>
                <textarea
                  className="cons-textarea"
                  rows={4}
                  maxLength={200}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Please dispense generic medicines where possible."
                />
                <div className="rxp-char-count">{notes.length} / 200 characters</div>
              </div>

              <div>
                <div className="cons-box-title" style={{ marginBottom: 6 }}>
                  {finalDiagnoses.length > 1 ? 'Diagnoses (ICD-11)' : 'Diagnosis (ICD-11)'}
                </div>
                {finalDiagnoses.length === 0 && <p className="rxp-diagnosis">No diagnosis recorded on this consultation</p>}
                {finalDiagnoses.map((d) => (
                  <p className="rxp-diagnosis" key={`${d.code ?? ''}-${d.title}`}>
                    {d.code && <span className="rxp-diagnosis-code">{d.code}</span>}
                    {d.title}
                  </p>
                ))}
                <button type="button" className="card-link" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
                  Change on the examination page
                </button>
              </div>
            </div>
          </div>

          <ExternalMedicineSection
            items={externalItems}
            onChange={setExternalItems}
            prefillRequest={shortfallPrefill}
            onPrefillConsumed={() => setShortfallPrefill(null)}
            patient={{ fullName: patient.fullName, patientId: patient.patientId, dob: patient.dob }}
            doctor={context.appointment.doctor}
          />

          <div className="cons-rapid-footer rxp-sticky-footer">
            <div>
              <span className="cons-save-state saved" />
              <strong>
                Step 2 · {items.length} medicine{items.length === 1 ? '' : 's'}
                {externalItems.length > 0 ? ` · ${externalItems.length} to buy outside` : ''}
              </strong>
              <small>{draftSavedAt ? `Draft saved at ${formatTime(draftSavedAt)}` : 'Saved automatically as you work'}</small>
            </div>
            <button className="cons-btn" onClick={() => window.print()}>
              <PrintIcon /> Print
            </button>
            <button className="cons-btn" onClick={handleSaveDraft}>
              <SaveIcon /> Save draft
            </button>
            <button className="cons-btn" onClick={() => openFinalReview(true)}>
              No medicines needed
            </button>
            <button className="cons-btn primary" onClick={() => openFinalReview(false)} disabled={submitting}>
              <CheckCircleIcon /> Review &amp; finalize
            </button>
          </div>
        </div>
      </div>

      {finalReviewOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => !submitting && event.target === event.currentTarget && setFinalReviewOpen(false)}>
          <div className="modal-card cons-complete-modal" role="dialog" aria-modal="true" aria-labelledby="rx-finalize-title">
            <div className="cons-complete-heading">
              <div>
                <span className="cons-safety-kicker">FINAL CHECK</span>
                <h2 id="rx-finalize-title">Finalize visit</h2>
                <p>The prescription remains a draft until you confirm this action.</p>
              </div>
            </div>

            {/* Everything the doctor is about to sign off, in one place: what was diagnosed, what the
                clinic pharmacy will give, what the patient buys outside and which tests are pending. */}
            <div className="rx-final-summary">
              <div className="rx-final-patient">
                <strong>{patient.fullName}</strong>
                <span>
                  {patient.patientId ?? 'Temporary patient'}
                  {context.patientSummary.allergies ? ` · Allergies: ${context.patientSummary.allergies}` : ' · No known allergies'}
                </span>
              </div>

              <section>
                <h3>Diagnosis</h3>
                {finalDiagnoses.length === 0 ? (
                  <p className="rx-final-empty">No diagnosis recorded — add one on the examination page if appropriate.</p>
                ) : (
                  <ol className="rx-final-dx">
                    {finalDiagnoses.map((d, i) => (
                      <li key={`${d.code ?? ''}-${d.title}`}>
                        {d.code && <span className="rx-final-code">{d.code}</span>}
                        {d.title}
                        {i === 0 && finalDiagnoses.length > 1 && <span className="rx-final-tag">Primary</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {!skipPrescription && (
                <section>
                  <h3>From the clinic pharmacy {items.length > 0 && `(${items.length})`}</h3>
                  {items.length === 0 ? (
                    <p className="rx-final-empty">Nothing — no clinic medicines on this prescription.</p>
                  ) : (
                    <ul className="rx-final-meds">
                      {items.map((it) => (
                        <li key={it.key}>
                          <strong>{it.name}</strong>
                          <span>{draftHowToTake(it)}</span>
                          <b>
                            {it.qty} {it.unit}
                          </b>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {!skipPrescription && externalItems.length > 0 && (
                <section className="is-outside">
                  <h3>To buy outside ({externalItems.length})</h3>
                  <ul className="rx-final-meds">
                    {externalItems.map((e) => (
                      <li key={e.key}>
                        <strong>
                          {e.medicine_name}
                          {e.strength ? ` ${e.strength}` : ''}
                        </strong>
                        <span>
                          {[Number(e.dose_qty) > 0 ? `Take ${e.dose_qty} ${e.quantity_unit} each time` : null, e.dosage, e.frequency, e.duration]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <b>
                          {e.quantity} {e.quantity_unit}
                        </b>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {skipPrescription && <p className="rx-final-empty">No medicines for this visit.</p>}

              {labTestOrders.filter((o) => o.status !== 'Cancelled').length > 0 && (
                <section>
                  <h3>Tests ordered</h3>
                  <p className="rx-final-line">
                    {labTestOrders
                      .filter((o) => o.status !== 'Cancelled')
                      .map((o) => o.test_name)
                      .join(', ')}
                  </p>
                </section>
              )}

              {!skipPrescription && notes.trim() && (
                <section>
                  <h3>Note to pharmacist</h3>
                  <p className="rx-final-line">{notes.trim()}</p>
                </section>
              )}
            </div>

            <div className="cons-complete-checks">
              <div className="done">
                <CheckCircleIcon />
                <span><strong>Clinical documentation</strong><small>Saved in the consultation draft</small></span>
              </div>
              <div className={allergyConflictItems.length > 0 && !allergyAck && !skipPrescription ? 'required' : 'done'}>
                <AlertIcon />
                <span>
                  <strong>Allergy safety</strong>
                  <small>{allergyConflictItems.length > 0 ? 'Potential conflict acknowledged' : context.patientSummary.allergies || 'No known allergies recorded'}</small>
                </span>
              </div>
            </div>

            {!skipPrescription && (
              <div className="rxb-banner warning" style={{ marginTop: 12 }}>
                <AlertIcon />{' '}
                {items.length > 0
                  ? 'Clicking “Finalize visit” will submit this prescription to the pharmacy. It is not submitted before then.'
                  : 'Clicking “Finalize visit” saves the medicines to buy outside. Nothing is sent to the clinic pharmacy.'}
              </div>
            )}

            {submitError && <div className="cons-complete-warning"><AlertIcon /> {submitError}</div>}

            <div className="cons-complete-fee">
              <label htmlFor="rx-finalize-fee">Consultation fee (LKR)</label>
              <input
                id="rx-finalize-fee"
                className="cons-input"
                type="number"
                min={0}
                step="0.01"
                value={consultationFeeInput}
                onChange={(event) => setConsultationFeeInput(event.target.value)}
                placeholder={clinicSettings ? String(clinicSettings.default_consultation_fee) : 'Clinic default'}
              />
              <small>Leave empty to use the clinic default.</small>
            </div>

            <div className="modal-actions">
              <button className="cons-btn" disabled={submitting} onClick={() => setFinalReviewOpen(false)}>Continue editing</button>
              <button className="cons-btn primary" disabled={submitting} onClick={finalizeVisit}>
                <CheckCircleIcon /> {submitting ? 'Finalizing…' : 'Finalize visit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewPrescription;
