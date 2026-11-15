import { useEffect, useRef, useState } from 'react';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { searchSavedExternalMedicines, removeSavedExternalMedicine, saveExternalMedicineToList } from '../../lib/externalMedicines';
import type { ExternalMedicineInput, SavedExternalMedicine } from '../../lib/externalMedicines';
import { listMasterData, getClinicSettings } from '../../lib/settings';
import type { ClinicSettings } from '../../lib/settings';
import { fileUrl } from '../../lib/api';
import { calculateAge } from '../../lib/queue';
import InstructionsPicker from '../../components/InstructionsPicker';
import { doseProfile, composeDosage, amountFromDosage } from '../../lib/doseForms';
import { PlusIcon, SearchIcon, EditIcon, TrashIcon, XIcon, PillIcon, PrintIcon } from '../../components/layout/Icons';
import './externalMedicines.css';
import FrequencyPicker from './FrequencyPicker';
import StartDatePicker, { dayAfterCourse, dayLabel } from './StartDatePicker';

const DURATION_OPTIONS = ['3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '1 Month', 'Ongoing'];

// Mirrors backend/src/modules/prescriptions/qtyCalc.ts, same copy as NewPrescription.tsx uses.
// External items are never validated server-side (they are bought outside the clinic), so this
// copy only has to agree with the prescriber's expectation — but it is kept byte-identical to the
// backend block anyway so all three read the same shorthand.
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

// Whole units to dispense, rounded UP (1.5 tablets x TDS x 5 days = 22.5 -> 23).
const computeExpectedQty = (frequency?: string, duration?: string, dose?: string | number): number | null => {
  const doses = scheduledDoseCount(frequency, duration);
  const perDose = Number(dose);
  if (doses === null || !Number.isFinite(perDose) || perDose <= 0) return null;
  return Math.ceil(perDose * doses - 1e-9);
};

// Why the quantity is or isn't being calculated — mirrors the clinic prescription table so the
// two halves of the same prescription behave the same way.
const explainQty = (frequency: string, duration: string, dose: string, unit: string, qty: string): { ok: boolean; text: string } => {
  const { perDay, days, isStat } = parseSchedule(frequency, duration);
  const perDose = Number(dose);
  const label = (unit || 'units').toLowerCase();
  if (!(Number.isFinite(perDose) && perDose > 0)) return { ok: false, text: `Enter how many ${label} per dose` };
  if (isStat) return { ok: true, text: `${perDose} ${label} once (STAT) = ${qty}` };
  if (!frequency.trim()) return { ok: false, text: 'Add a frequency (e.g. TDS) to calculate' };
  if (perDay === null) return { ok: false, text: `Can't total \u201c${frequency.trim()}\u201d \u2014 enter the quantity` };
  if (!duration.trim()) return { ok: false, text: 'Add a duration (e.g. 5 days) to calculate' };
  if (days === null) return { ok: false, text: `Can't total \u201c${duration.trim()}\u201d \u2014 enter the quantity` };
  return { ok: true, text: `${perDose} \u00d7 ${perDay}/day \u00d7 ${days} day${days === 1 ? '' : 's'} = ${qty} ${label}` };
};

export interface ExternalMedicineDraft {
  key: string;
  medicine_id?: number;
  medicine_name: string;
  generic_name: string;
  brand_name: string;
  dosage_form: string;
  strength: string;
  dosage: string;
  // Units taken per administration ("1", "1.5"). Text so the field can be empty until filled in.
  dose_qty: string;
  frequency: string;
  duration: string;
  quantity: string;
  // True when the quantity is deliberately not the full course — a shortfall prefill only covers
  // what the clinic cannot supply, so the schedule must not overwrite it.
  qtyManual: boolean;
  quantity_unit: string;
  instructionChips: string[];
  /** Taken long-term: stays on the ongoing-medicines list after the course runs out. */
  isLongTerm?: boolean;
  /** YYYY-MM-DD when it starts later than today (a later dose step); '' or unset = today. */
  startDate?: string;
  /** The dose when it is not a count of what the patient buys: drops, puffs, where a cream goes,
   *  an injection dose (see doseForms.ts). */
  doseAmount?: string;
  /** Which eye/ear for drops; added to the dosage text. */
  site?: string;
  /** The doctor typed the dosage text under "More options"; it is no longer written for them. */
  dosageManual?: boolean;
}

const extProfile = (d: Pick<ExternalMedicineDraft, 'dosage_form' | 'quantity_unit'>) => doseProfile(d.dosage_form, d.quantity_unit);

/** The dosage text saved and printed on the slip: written from the dose unless typed by hand. */
export const extDosage = (d: ExternalMedicineDraft) => {
  if (d.dosageManual) return d.dosage.trim() || 'As directed';
  const p = extProfile(d);
  const amount = d.doseAmount ?? amountFromDosage(p, d.dosage);
  const base = composeDosage(p, d.dose_qty, amount, p.counted ? null : d.dosage);
  return p.kind === 'drops' && d.site?.trim() ? `${base} · ${d.site.trim()}` : base;
};

// Passed down when the doctor clicks "Add to External Medicines" on a clinic item that's
// out-of-stock/short — pre-fills the Add flow so the doctor never re-types what's already known.
export interface ShortfallPrefill {
  medicine_id?: number;
  medicine_name: string;
  generic_name?: string | null;
  brand_name?: string | null;
  dosage_form?: string | null;
  strength?: string | null;
  dosage?: string;
  /** Units per dose already entered on the clinic line, so Take does not have to be retyped. */
  dose_qty?: string;
  frequency?: string;
  duration?: string;
  quantity: number;
  quantity_unit: string;
}

// The unit the patient buys in, guessed from the form so the doctor rarely has to type it. The
// free-text unit box used to sit beside the quantity and caught stray numbers ("6 6").
const DEFAULT_UNIT_BY_FORM: Record<string, string> = {
  tablet: 'tablets',
  capsule: 'capsules',
  syrup: 'ml',
  suspension: 'ml',
  solution: 'ml',
  drops: 'bottle',
  cream: 'tube',
  ointment: 'tube',
  gel: 'tube',
  inhaler: 'inhaler',
  spray: 'bottle',
  injection: 'vials',
  sachet: 'sachets',
  lotion: 'bottle',
};
// "Eye Drops", "Ear Drops", "Nasal Spray"...: match the last word too, not only the exact form.
const defaultUnitFor = (form: string) => {
  const f = form.trim().toLowerCase();
  return DEFAULT_UNIT_BY_FORM[f] ?? DEFAULT_UNIT_BY_FORM[f.split(/\s+/).pop() ?? ''] ?? '';
};
const withFormDefaults = (draft: ExternalMedicineDraft, form: string): ExternalMedicineDraft => ({
  ...draft,
  dosage_form: form,
  quantity_unit: draft.quantity_unit.trim() ? draft.quantity_unit : defaultUnitFor(form),
});
/** A unit must be a word; a bare number is almost always a quantity typed into the wrong box. */
export const isValidUnit = (unit: string) => /[a-z]/i.test(unit);

export const draftToInput = (d: ExternalMedicineDraft): ExternalMedicineInput => ({
  medicine_id: d.medicine_id,
  medicine_name: d.medicine_name,
  generic_name: d.generic_name || undefined,
  brand_name: d.brand_name || undefined,
  dosage_form: d.dosage_form,
  strength: d.strength || undefined,
  dosage: extDosage(d),
  dose_qty: extProfile(d).counted && Number(d.dose_qty) > 0 ? Number(d.dose_qty) : undefined,
  frequency: d.frequency || undefined,
  duration: d.duration || undefined,
  quantity: Number(d.quantity) || 1,
  quantity_unit: d.quantity_unit,
  instructions: d.instructionChips.length ? d.instructionChips.join('; ') : undefined,
  is_long_term: !!d.isLongTerm,
  start_date: d.startDate || undefined,
});

const emptyDraft = (key: string): ExternalMedicineDraft => ({
  key,
  medicine_name: '',
  generic_name: '',
  brand_name: '',
  dosage_form: '',
  strength: '',
  dosage: '',
  dose_qty: '1',
  frequency: '',
  duration: '',
  quantity: '1',
  qtyManual: false,
  quantity_unit: '',
  instructionChips: [],
});

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

// Built client-side (rather than fetched from the backend PDF endpoint used post-submit) because
// these are still unsaved drafts — there's no prescription_id to ask the server for yet. Opened in
// a fresh window and printed via the browser's own print dialog, same "let the browser render the
// PDF/print surface" convention as downloadExternalPurchaseSlip/previewExternalMedicineSlip.
const buildExternalSlipHtml = (opts: {
  clinic: ClinicSettings | null;
  patient: { fullName: string; patientId: string | null; dob: string | null };
  doctor: { username: string; registration_number: string | null };
  items: ExternalMedicineDraft[];
}) => {
  const { clinic, patient, doctor, items } = opts;
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const age = patient.dob ? calculateAge(patient.dob) : null;

  // When the clinic has uploaded its own header/letterhead image (Settings > General), that IS
  // the header — it already carries the clinic name, doctor and registration details the way a
  // physical prescription pad prints them. Only fall back to typed clinic details otherwise.
  const headerHtml = clinic?.logo_url
    ? `<img src="${escapeHtml(fileUrl(clinic.logo_url))}" class="ext-slip-logo" />`
    : `<div class="ext-slip-clinic-name">${escapeHtml(clinic?.clinic_name || 'MediCare Clinic & Dispensary')}</div>
       ${clinic?.clinic_address ? `<div class="ext-slip-clinic-line">${escapeHtml(clinic.clinic_address)}</div>` : ''}
       ${clinic?.registration_number ? `<div class="ext-slip-clinic-line">Reg No: ${escapeHtml(clinic.registration_number)}</div>` : ''}`;

  const rows = items
    .map((it, i) => {
      const generic = [it.generic_name, it.brand_name].filter(Boolean).join(' · ');
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(it.medicine_name)}</strong>${generic ? `<br/><span class="muted">${escapeHtml(generic)}</span>` : ''}</td>
        <td>${escapeHtml(it.dosage_form || '—')}</td>
        <td>${escapeHtml(it.strength || '—')}</td>
        <td>${escapeHtml(extDosage(it))}</td>
        <td>${escapeHtml(Number(it.dose_qty) > 0 ? `${it.dose_qty} ${it.quantity_unit}` : '—')}</td>
        <td>${escapeHtml(it.frequency || '—')}</td>
        <td>${escapeHtml(it.duration || '—')}${it.startDate ? `<br/><span class="muted">from ${escapeHtml(dayLabel(it.startDate))}</span>` : ''}</td>
        <td>${escapeHtml(`${it.quantity} ${it.quantity_unit}`)}</td>
        <td>${escapeHtml(it.instructionChips.join(', ') || '—')}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>External Medicine Slip</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 24px; }
  .ext-slip-header { text-align: center; margin-bottom: 12px; }
  .ext-slip-logo { max-width: 100%; max-height: 130px; object-fit: contain; }
  .ext-slip-clinic-name { font-size: 19px; font-weight: bold; }
  .ext-slip-clinic-line { font-size: 12px; color: #444; }
  .ext-slip-rule { border-top: 1px solid #999; margin: 10px 0 14px; }
  .ext-slip-meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; font-family: Arial, sans-serif; }
  .ext-slip-title { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 8px; font-family: Arial, sans-serif; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: Arial, sans-serif; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; }
  .muted { color: #666; font-size: 11px; }
  .ext-slip-note { font-size: 11px; color: #555; font-style: italic; margin-top: 10px; font-family: Arial, sans-serif; }
  .ext-slip-signoff { margin-top: 40px; font-size: 13px; font-family: Arial, sans-serif; }
  .ext-slip-sign-line { margin-top: 34px; border-top: 1px solid #333; width: 260px; padding-top: 4px; }
  @media print { body { margin: 8mm; } }
</style>
</head>
<body>
  <div class="ext-slip-header">${headerHtml}</div>
  <div class="ext-slip-rule"></div>
  <div class="ext-slip-meta">
    <span>Patient: <strong>${escapeHtml(patient.fullName)}</strong></span>
    <span>Age: <strong>${age !== null ? age : '_______'}</strong></span>
    <span>Date: <strong>${today}</strong></span>
  </div>
  <div class="ext-slip-title">External Medicines</div>
  <table>
    <thead>
      <tr><th>#</th><th>Medicine</th><th>Form</th><th>Strength</th><th>Dosage</th><th>Take</th><th>Frequency</th><th>Duration</th><th>Qty</th><th>Instructions</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="ext-slip-note">
    The above medicines are to be purchased from an external pharmacy or other authorized source and are not being dispensed by the clinic pharmacy.
  </div>
  <div class="ext-slip-signoff">
    <div>Doctor: Dr. ${escapeHtml(doctor.username)}</div>
    ${doctor.registration_number ? `<div>Registration No: ${escapeHtml(doctor.registration_number)}</div>` : ''}
    <div class="ext-slip-sign-line">Signature</div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
};

type Step = 'search' | 'manual' | 'details';

const AddExternalMedicineModal = ({
  dosageForms,
  editing,
  prefill,
  others,
  onClose,
  onSave,
}: {
  dosageForms: string[];
  editing: ExternalMedicineDraft | null;
  /** The other outside medicines on this prescription: the same one may go on again as a later dose step. */
  others: ExternalMedicineDraft[];
  prefill: ShortfallPrefill | null;
  onClose: () => void;
  onSave: (draft: ExternalMedicineDraft) => void;
}) => {
  const [step, setStep] = useState<Step>(editing || prefill ? 'details' : 'search');
  const [draft, setDraft] = useState<ExternalMedicineDraft>(() => {
    if (editing) return editing;
    if (prefill) {
      return {
        key: `ext-${Date.now()}`,
        medicine_id: prefill.medicine_id,
        medicine_name: prefill.medicine_name,
        generic_name: prefill.generic_name || '',
        brand_name: prefill.brand_name || '',
        dosage_form: prefill.dosage_form || '',
        strength: prefill.strength || '',
        dosage: prefill.dosage || prefill.strength || '',
        dose_qty: prefill.dose_qty || '1',
        frequency: prefill.frequency || '',
        duration: prefill.duration || '',
        quantity: String(prefill.quantity),
        qtyManual: true,
        quantity_unit: prefill.quantity_unit,
        instructionChips: [],
      };
    }
    return emptyDraft(`ext-${Date.now()}`);
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [catalogResults, setCatalogResults] = useState<Medicine[]>([]);
  const [searching, setSearching] = useState(false);
  // The clinic's saved outside medicines: the most used ones before anything is typed, then the
  // matches. A failed lookup just shows none — the catalogue and manual entry still work.
  const [savedResults, setSavedResults] = useState<SavedExternalMedicine[]>([]);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'search') return;
    const term = searchTerm.trim();
    let cancelled = false;
    const t = setTimeout(
      () => {
        searchSavedExternalMedicines(term)
          .then((rows) => !cancelled && setSavedResults(rows))
          .catch(() => !cancelled && setSavedResults([]));
      },
      term ? 300 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchTerm, step]);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setCatalogResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchMedicines(searchTerm)
        .then(setCatalogResults)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Fills everything in from the last time it was prescribed; the doctor can change any of it.
  const pickSaved = (m: SavedExternalMedicine) => {
    const next: ExternalMedicineDraft = {
      key: `ext-${Date.now()}`,
      medicine_name: m.medicineName,
      generic_name: m.genericName || '',
      brand_name: m.brandName || '',
      dosage_form: m.dosageForm || '',
      strength: m.strength || '',
      dosage: m.dosage || m.strength || '',
      dose_qty: m.doseQty ? String(m.doseQty) : '1',
      frequency: m.frequency || '',
      duration: m.duration || '',
      quantity: '1',
      qtyManual: false,
      quantity_unit: m.quantityUnit || defaultUnitFor(m.dosageForm || ''),
      instructionChips: (m.instructions || '').split(';').map((c) => c.trim()).filter(Boolean),
      isLongTerm: m.isLongTerm,
    };
    const expected = computeExpectedQty(next.frequency, next.duration, next.dose_qty);
    setDraft(expected !== null ? { ...next, quantity: String(expected) } : next);
    setStep('details');
  };

  const removeSaved = async (m: SavedExternalMedicine) => {
    setRemoveError(null);
    try {
      await removeSavedExternalMedicine(m.libraryId);
      setSavedResults((prev) => prev.filter((x) => x.libraryId !== m.libraryId));
    } catch {
      setRemoveError(`Could not remove ${m.medicineName} from the list. Try again.`);
    }
  };

  const savedLine = (m: SavedExternalMedicine) =>
    [m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ');

  const pickCatalog = (m: Medicine) => {
    setDraft({
      key: `ext-${Date.now()}`,
      medicine_id: m.medicine_id,
      medicine_name: m.name,
      generic_name: m.generic_name || '',
      brand_name: m.brand_name || '',
      dosage_form: m.form || '',
      strength: m.strength || '',
      dosage: m.strength || `1 ${m.base_unit}`,
      dose_qty: '1',
      frequency: '',
      duration: '',
      quantity: '1',
      qtyManual: false,
      quantity_unit: m.base_unit,
      instructionChips: [],
    });
    setStep('details');
  };

  const startManual = () => {
    setDraft(emptyDraft(`ext-${Date.now()}`));
    setStep('manual');
  };

  // Dose, frequency and duration all feed the quantity, so any of them recomputes it.
  const updateSchedule = (field: 'frequency' | 'duration' | 'dose_qty', value: string) => {
    setDraft((prev) => {
      const updated = { ...prev, [field]: value };
      if (updated.qtyManual) return updated;
      const expected = computeExpectedQty(updated.frequency, updated.duration, updated.dose_qty);
      return expected !== null ? { ...updated, quantity: String(expected) } : updated;
    });
  };

  const prof = extProfile(draft);
  const [showMore, setShowMore] = useState(false);
  const calculatedQty = prof.counted ? computeExpectedQty(draft.frequency, draft.duration, draft.dose_qty) : null;
  const expectedQty = draft.qtyManual ? null : calculatedQty;
  const setQtyManual = (manual: boolean) =>
    setDraft((prev) => {
      if (manual) return { ...prev, qtyManual: true };
      const expected = computeExpectedQty(prev.frequency, prev.duration, prev.dose_qty);
      return { ...prev, qtyManual: false, quantity: expected !== null ? String(expected) : prev.quantity };
    });
  const qtyNote = explainQty(draft.frequency, draft.duration, draft.dose_qty, draft.quantity_unit, draft.quantity);
  const canSave = draft.medicine_name.trim() && draft.dosage_form.trim() && isValidUnit(draft.quantity_unit) && (Number(draft.quantity) || 0) > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card ext-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{editing ? 'Edit External Medicine' : 'Add External Medicine'}</span>
          <button className="pat-icon-btn" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        {step === 'search' && (
          <>
            <div className="ext-search-box">
              <SearchIcon />
              <input autoFocus placeholder="Search medicine or item…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <button type="button" className="ext-manual-link" onClick={startManual}>
              <PlusIcon /> Add New External Item
            </button>

            {removeError && <div className="ext-qty-note blocked" role="alert">{removeError}</div>}

            {savedResults.length > 0 && (
              <div className="ext-results ext-saved-results">
                <div className="ext-results-heading">{searchTerm.trim() ? 'Saved outside medicines' : 'Frequently prescribed outside'}</div>
                {savedResults.map((m) => (
                  <div className="ext-result-card ext-saved-card" key={m.libraryId} role="button" tabIndex={0} onClick={() => pickSaved(m)} onKeyDown={(e) => e.key === 'Enter' && pickSaved(m)}>
                    <div className="ext-saved-main">
                      <div className="ext-result-title">
                        {m.medicineName} {m.strength ? `(${m.strength})` : ''}
                      </div>
                      <div className="ext-result-meta">
                        {[m.genericName, m.brandName].filter(Boolean).join(' · ') || 'No generic name'} · {m.dosageForm}
                      </div>
                      {savedLine(m) && <div className="ext-result-meta">Last time: {savedLine(m)}</div>}
                    </div>
                    <span className="ext-saved-uses">{m.useCount > 0 ? `Used ${m.useCount}×` : 'New'}</span>
                    <button
                      type="button"
                      className="pat-icon-btn ext-saved-remove"
                      title="Remove from the saved list (past prescriptions are not changed)"
                      aria-label={`Remove ${m.medicineName} from the saved list`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeSaved(m);
                      }}
                    >
                      <XIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {searchTerm.trim().length >= 2 && (
              <div className="ext-results">
                {searching && <div className="ext-results-empty">Searching…</div>}
                {!searching && catalogResults.length > 0 && (
                  <>
                    <div className="ext-results-heading">From Medicine Catalog</div>
                    {catalogResults.map((m) => (
                      <div className="ext-result-card" key={m.medicine_id} onClick={() => pickCatalog(m)}>
                        <div className="ext-result-title">
                          {m.name} {m.strength ? `(${m.strength})` : ''}
                        </div>
                        <div className="ext-result-meta">
                          Generic: {m.generic_name || '—'} · Form: {m.form || '—'}
                        </div>
                        <div className="ext-result-meta">
                          Clinic Stock: <strong className={m.totalQty === 0 ? 'zero' : ''}>{m.totalQty}</strong>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {!searching && catalogResults.length === 0 && savedResults.length === 0 && searchTerm.trim().length >= 2 && (
                  <div className="ext-results-empty">No matches — try "+ Add New External Item" to enter it manually.</div>
                )}
              </div>
            )}
          </>
        )}

        {step === 'manual' && (
          <div className="ext-form">
            <div className="modal-field">
              <label>Medicine / Item Name *</label>
              <input value={draft.medicine_name} onChange={(e) => setDraft({ ...draft, medicine_name: e.target.value })} placeholder="e.g. Special Skin Cream" autoFocus />
            </div>
            <div className="ext-form-row">
              <div className="modal-field">
                <label>Generic Name</label>
                <input value={draft.generic_name} onChange={(e) => setDraft({ ...draft, generic_name: e.target.value })} />
              </div>
              <div className="modal-field">
                <label>Brand Name</label>
                <input value={draft.brand_name} onChange={(e) => setDraft({ ...draft, brand_name: e.target.value })} />
              </div>
            </div>
            <div className="ext-form-row">
              <div className="modal-field">
                <label>Dosage Form</label>
                <select value={draft.dosage_form} onChange={(e) => setDraft(withFormDefaults(draft, e.target.value))}>
                  <option value="">Select…</option>
                  {dosageForms.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>Strength</label>
                <input value={draft.strength} onChange={(e) => setDraft({ ...draft, strength: e.target.value })} placeholder="e.g. 1%" />
              </div>
            </div>
            <div className="modal-field">
              <label>Unit</label>
              <input value={draft.quantity_unit} onChange={(e) => setDraft({ ...draft, quantity_unit: e.target.value })} placeholder="e.g. Tube" />
            </div>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setStep('search')}>
                Back
              </button>
              <button className="modal-btn primary" disabled={!draft.medicine_name.trim()} onClick={() => setStep('details')}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="ext-form">
            <div className="ext-selected-item">
              <PillIcon />
              <div>
                <div className="ext-selected-name">{draft.medicine_name}</div>
                <div className="ext-selected-meta">{[draft.generic_name, draft.brand_name].filter(Boolean).join(' · ') || 'Manual entry'}</div>
              </div>
              {!draft.medicine_id && (
                <button type="button" className="pat-btn" style={{ fontSize: 13, padding: '5px 9px', marginLeft: 'auto' }} onClick={() => setStep('manual')}>
                  Edit name
                </button>
              )}
              {!editing && (
                <button type="button" className="pat-btn" style={{ fontSize: 13, padding: '5px 9px', marginLeft: draft.medicine_id ? 'auto' : undefined }} onClick={() => setStep('search')}>
                  Change
                </button>
              )}
            </div>

            <div className="ext-form-row">
              <div className="modal-field">
                <label>Dosage Form</label>
                <select value={draft.dosage_form} onChange={(e) => setDraft(withFormDefaults(draft, e.target.value))}>
                  <option value="">Select…</option>
                  {dosageForms.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>Strength</label>
                <input value={draft.strength} onChange={(e) => setDraft({ ...draft, strength: e.target.value })} placeholder={prof.strengthExample} />
              </div>
            </div>

            <div className="ext-form-row">
              {prof.counted ? (
                <div className="modal-field">
                  <label>{prof.doseLabel}</label>
                  <div className="ext-take-row">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.dose_qty}
                      onChange={(e) => updateSchedule('dose_qty', e.target.value)}
                      placeholder="1"
                      aria-label={`${prof.doseUnit(2)} per dose`}
                    />
                    <span>{prof.doseUnit(Number(draft.dose_qty) || 1)}</span>
                  </div>
                </div>
              ) : (
                <div className="modal-field">
                  <label>{prof.doseLabel}</label>
                  <div className="ext-take-row">
                    <input
                      type="text"
                      inputMode={prof.amountKind === 'number' ? 'decimal' : 'text'}
                      className={prof.amountKind === 'text' ? 'ext-amount-text' : undefined}
                      value={draft.doseAmount ?? amountFromDosage(prof, draft.dosage)}
                      onChange={(e) => setDraft({ ...draft, doseAmount: e.target.value })}
                      placeholder={prof.amountPlaceholder}
                      aria-label={prof.doseLabel}
                    />
                    {prof.amountKind === 'number' && <span>{prof.doseUnit(Number(draft.doseAmount) || 2)}</span>}
                  </div>
                </div>
              )}
              {prof.kind === 'drops' && (
                <div className="modal-field">
                  <label>Where</label>
                  <select value={draft.site ?? ''} onChange={(e) => setDraft({ ...draft, site: e.target.value })}>
                    <option value="">—</option>
                    {prof.routeOptions.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="modal-field">
                <label>Frequency</label>
                <FrequencyPicker value={draft.frequency} onChange={(v) => updateSchedule('frequency', v)} />
              </div>
            </div>

            {(() => {
              // Already on this prescription: offer to start this one when that course ends.
              const name = draft.medicine_name.trim().toLowerCase();
              const earlier = name ? [...others].reverse().find((o) => o.medicine_name.trim().toLowerCase() === name) : undefined;
              if (!earlier) return null;
              const days = parseDurationDays(earlier.duration);
              const after = days ? dayAfterCourse(earlier.startDate ?? '', days) : null;
              return (
                <div className="rxp-step-hint">
                  <span>
                    {earlier.medicine_name} is already on this prescription{earlier.duration ? ` (${earlier.duration})` : ''}. Give this one its own dose and when it <strong>starts</strong>.
                  </span>
                  {after && after !== draft.startDate && (
                    <button type="button" className="ext-qty-link" onClick={() => setDraft({ ...draft, startDate: after })}>
                      Start when that one ends ({dayLabel(after)})
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="ext-form-row">
              <div className="modal-field">
                <label>Starts</label>
                <StartDatePicker value={draft.startDate ?? ''} onChange={(v) => setDraft({ ...draft, startDate: v })} />
              </div>
              <div className="modal-field">
                <label>Duration</label>
                <input list="ext-duration-options" value={draft.duration} onChange={(e) => updateSchedule('duration', e.target.value)} placeholder="6 Days" />
              </div>
              <div className="modal-field">
                <label>
                  Quantity {expectedQty !== null ? <span className="ext-qty-tag auto">Auto calculated</span> : <span className="ext-qty-tag manual">Manual</span>}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    min={1}
                    value={draft.quantity}
                    disabled={expectedQty !== null}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                  />
                  <input
                    style={{ maxWidth: 110 }}
                    value={draft.quantity_unit}
                    onChange={(e) => setDraft({ ...draft, quantity_unit: e.target.value })}
                    placeholder="unit, e.g. tablets"
                    aria-label="Unit"
                    title="Unit the patient buys in, e.g. tablets, ml, tube"
                  />
                </div>
                {draft.quantity_unit.trim() !== '' && !isValidUnit(draft.quantity_unit) && (
                  <div className="ext-qty-note blocked">The unit should be a word such as tablets, ml or tube — not a number.</div>
                )}
                {!prof.counted ? (
                  <div className="ext-qty-note">Total to buy{draft.quantity_unit.trim() ? `, in ${draft.quantity_unit.trim().toLowerCase()}` : ''}</div>
                ) : draft.qtyManual ? (
                  <div className="ext-qty-note">
                    Entered by hand{calculatedQty !== null && ` \u2014 a full course would be ${calculatedQty}`}.{' '}
                    <button type="button" className="ext-qty-link" onClick={() => setQtyManual(false)}>
                      Calculate from dose
                    </button>
                  </div>
                ) : (
                  <>
                    <div className={`ext-qty-note ${qtyNote.ok ? 'calculated' : 'blocked'}`}>{qtyNote.text}</div>
                    {qtyNote.ok && (
                      <button type="button" className="ext-qty-link" onClick={() => setQtyManual(true)}>
                        Enter quantity manually
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="ext-more-row">
              <button type="button" className="ext-qty-link" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
                {showMore ? 'Fewer options' : 'More options'}
              </button>
              {!showMore && <span className="ext-label-preview">On the slip: {extDosage(draft)}</span>}
            </div>
            {showMore && (
              <div className="modal-field">
                <label>Dosage on the slip</label>
                <input value={extDosage(draft)} onChange={(e) => setDraft({ ...draft, dosage: e.target.value, dosageManual: true })} />
                {draft.dosageManual && (
                  <button type="button" className="ext-qty-link" onClick={() => setDraft({ ...draft, dosageManual: false, dosage: '' })}>
                    Write it from the dose again
                  </button>
                )}
              </div>
            )}

            <div className="modal-field">
              <label>Instructions</label>
              <InstructionsPicker chips={draft.instructionChips} onChange={(chips) => setDraft({ ...draft, instructionChips: chips })} />
            </div>

            <label className="rxp-longterm">
              <input type="checkbox" checked={!!draft.isLongTerm} onChange={(e) => setDraft({ ...draft, isLongTerm: e.target.checked })} />
              Long-term medicine <small>— keep it on the patient's ongoing list until a doctor stops it</small>
            </label>

            <datalist id="ext-duration-options">
              {DURATION_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="modal-btn primary" disabled={!canSave} onClick={() => onSave(draft)}>
                {editing ? 'Save Changes' : 'Add External Medicine'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ExternalMedicineSection = ({
  items,
  onChange,
  prefillRequest,
  onPrefillConsumed,
  patient,
  doctor,
}: {
  items: ExternalMedicineDraft[];
  onChange: (items: ExternalMedicineDraft[]) => void;
  prefillRequest: ShortfallPrefill | null;
  onPrefillConsumed: () => void;
  patient: { fullName: string; patientId: string | null; dob: string | null };
  doctor: { username: string; registration_number: string | null };
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [dosageForms, setDosageForms] = useState<string[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const consumedRef = useRef(false);

  useEffect(() => {
    listMasterData('DosageForm').then((rows) => setDosageForms(rows.map((r) => r.value)));
    getClinicSettings().then(setClinicSettings).catch(() => {});
  }, []);

  const printSlip = () => {
    const html = buildExternalSlipHtml({ clinic: clinicSettings, patient, doctor, items });
    const win = window.open('', '_blank', 'width=850,height=920');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  useEffect(() => {
    if (prefillRequest && !consumedRef.current) {
      consumedRef.current = true;
      setEditingKey(null);
      setModalOpen(true);
    }
    if (!prefillRequest) consumedRef.current = false;
  }, [prefillRequest]);

  const closeModal = () => {
    setModalOpen(false);
    setEditingKey(null);
    if (prefillRequest) onPrefillConsumed();
  };

  const handleSave = (draft: ExternalMedicineDraft) => {
    // A typed-in medicine goes on the clinic's saved list now, not only when the prescription is
    // saved, so the very next search finds it. Best effort: the prescription never waits on it.
    if (!draft.medicine_id && draft.medicine_name.trim()) {
      void saveExternalMedicineToList({ ...draftToInput(draft), medicine_name: draft.medicine_name.trim() }).catch(() => undefined);
    }
    if (editingKey) {
      onChange(items.map((i) => (i.key === editingKey ? draft : i)));
    } else {
      onChange([...items, draft]);
    }
    closeModal();
  };

  const editing = editingKey ? items.find((i) => i.key === editingKey) ?? null : null;

  // External lines hang off the patient's record, which an unregistered walk-in doesn't have yet.
  const canRecord = !!patient.patientId;

  return (
    <section className="cons-box ext-section" style={{ marginBottom: 16 }} aria-labelledby="ext-section-title">
      <div className="ext-section-head">
        <div>
          <h2 className="ext-section-title" id="ext-section-title">
            To buy outside <span className="ext-tag">Not from clinic pharmacy</span>
          </h2>
          <p className="ext-section-sub">
            Medicines the patient buys from another pharmacy. They are saved in the patient&rsquo;s history and printed on the prescription, but are not sent to the clinic pharmacy.
          </p>
        </div>
        <div className="ext-section-actions">
          {items.length > 0 && (
            <button type="button" className="pat-btn" onClick={printSlip} title="Print a separate slip for the doctor to sign">
              <PrintIcon /> Print slip
            </button>
          )}
          <button type="button" className="pat-btn ext-add-btn" disabled={!canRecord} onClick={() => setModalOpen(true)}>
            <PlusIcon /> Add medicine to buy outside
          </button>
        </div>
      </div>

      {!canRecord && (
        <div className="ext-empty">Register this patient first to record medicines to buy outside — they are kept in the patient&rsquo;s history.</div>
      )}
      {canRecord && items.length === 0 && <div className="ext-empty">None. Add one if the clinic doesn&rsquo;t stock a medicine the patient needs.</div>}

      {items.length > 0 && (
        <ol className="ext-list">
          {items.map((it) => {
            const how = [
              it.startDate ? `From ${dayLabel(it.startDate)}` : '',
              extDosage(it),
              it.frequency,
              it.duration,
            ].filter(Boolean);
            return (
              <li className="ext-item" key={it.key}>
                <div className="ext-item-main">
                  <div className="ext-item-name">
                    {it.medicine_name}
                    {it.strength && <span className="ext-item-strength">{it.strength}</span>}
                    <span className="ext-tag">Buy outside</span>
                    {it.isLongTerm && <span className="rxp-longterm-tag">Long-term</span>}
                  </div>
                  <div className="ext-item-meta">
                    {[it.dosage_form, it.generic_name, it.brand_name].filter(Boolean).join(' · ')}
                  </div>
                  <div className="ext-item-how">{how.join(' · ') || 'No dosing entered'}</div>
                  {it.instructionChips.length > 0 && <div className="ext-item-meta">{it.instructionChips.join(', ')}</div>}
                </div>
                <div className="ext-item-qty">
                  <span>Buy</span>
                  <strong>
                    {it.quantity} {it.quantity_unit}
                  </strong>
                </div>
                <div className="ext-item-actions">
                  <button className="pat-icon-btn" aria-label={`Edit ${it.medicine_name}`} title="Edit" onClick={() => (setEditingKey(it.key), setModalOpen(true))}>
                    <EditIcon />
                  </button>
                  <button className="pat-icon-btn" aria-label={`Remove ${it.medicine_name}`} title="Remove" onClick={() => onChange(items.filter((x) => x.key !== it.key))}>
                    <TrashIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {modalOpen && (
        <AddExternalMedicineModal
          dosageForms={dosageForms}
          editing={editing}
          prefill={editing ? null : prefillRequest}
          others={items.filter((x) => x.key !== editing?.key)}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </section>
  );
};

export default ExternalMedicineSection;
