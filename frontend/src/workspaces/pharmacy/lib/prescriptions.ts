import { api } from './api';

export type PrescriptionStatus = 'Pending' | 'Preparing' | 'Dispensed' | 'Collected' | 'External';

export interface PrescriptionListItem {
  prescriptionId: number;
  code: string;
  status: PrescriptionStatus;
  isRefill: boolean;
  notes: string | null;
  issuedAt: string;
  appointmentId: number;
  consultationType: string | null;
  patientId: string;
  patientName: string;
  patientGender: string;
  patientDob: string;
  patientPhone: string | null;
  patientPhotoUrl: string | null;
  doctorId: number;
  doctorName: string;
  items: { medicine: string; dosage: string; qty: number; dispensedAt: string | null }[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListPrescriptionsParams {
  patientId?: string;
  doctorId?: number;
  status?: PrescriptionStatus;
  search?: string;
  consultationType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const listPrescriptions = (params: ListPrescriptionsParams) =>
  api.get<{ data: PrescriptionListItem[]; pagination: Pagination }>('/prescriptions', { params }).then((r) => r.data);

export interface PrescriptionStats {
  total: number;
  thisMonth: number;
  thisMonthDeltaPct: number | null;
  pending: number;
  preparing: number;
  dispensed: number;
  collected: number;
}

export const getPrescriptionStats = (doctorId?: number) => api.get<PrescriptionStats>('/prescriptions/stats', { params: { doctorId } }).then((r) => r.data);

export interface PrescriptionItemDetail {
  rx_item_id: number;
  medicine_id: number;
  dosage: string;
  /** How much is taken each time, in the medicine's dispensing unit (2 tablets, 5 ml). */
  dose_qty: number | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  /** The day this line starts when not the day it was prescribed (a later dose step). */
  start_date?: string | null;
  qty: number;
  external_qty: number;
  dispensed_qty: number; // cumulative qty drawn from clinic stock across partial dispenses (excludes external_qty)
  batch_id: number | null;
  dispensed_at: string | null;
  medicine: { name: string; base_unit: string };
  substituted_medicine: { name: string } | null;
  batch: { batch_no: string; expiry_date: string } | null;
  dispenses: { dispense_id: number; qty: number; dispensed_at: string; batch: { batch_no: string; expiry_date: string; medicine: { name: string; base_unit: string } } }[];
}

/** "2 tablets", "1 capsule", "5 ml": the amount taken each time, in the dispensing unit. */
export const doseAmount = (doseQty: number | null | undefined, unit: string | null | undefined): string | null => {
  if (doseQty == null || !Number.isFinite(doseQty) || doseQty <= 0) return null;
  const amount = Number.isInteger(doseQty) ? String(doseQty) : String(Number(doseQty.toFixed(2)));
  const u = (unit ?? '').trim().toLowerCase();
  if (u === 'ml') return `${amount} ml`;
  if (u === 'gram' || u === 'g') return `${amount} g`;
  if (!u || u === 'piece') return amount;
  return `${amount} ${doseQty <= 1 ? u : `${u}s`}`;
};

/** The doctor's directions after the dose: strength, frequency, duration, route and notes. */
export const scheduleParts = (item: Pick<PrescriptionItemDetail, 'dosage' | 'frequency' | 'duration' | 'route' | 'instructions'>) =>
  [item.dosage, item.frequency, item.duration, item.route, item.instructions].filter((p): p is string => !!p && !!p.trim());

/** Everything about taking it, dose first — matches the printed label (backend doseText.ts). */
export const howToTake = (item: PrescriptionItemDetail) => {
  const dose = doseAmount(item.dose_qty, item.medicine.base_unit);
  const from = item.start_date ? `From ${new Date(item.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : null;
  return [from, dose ? `Take ${dose} each time` : null, ...scheduleParts(item)].filter(Boolean).join(' · ');
};

export interface PrescriptionDetail {
  prescription_id: number;
  status: PrescriptionStatus;
  is_refill: boolean;
  notes: string | null;
  issued_at: string;
  items: PrescriptionItemDetail[];
  /** Medicines the doctor told the patient to buy elsewhere — nothing to dispense, but say so. */
  external_medicines?: { ext_item_id: number; medicine_name: string; strength: string | null; dosage: string; quantity: number; quantity_unit: string }[];
  consultation: {
    consultation_id: number;
    diagnosis: string | null;
    appointment_id: number;
    appointment: {
      appointment_id: number;
      consultation_type: string | null;
      scheduled_at: string;
      // Null for a temporary/unregistered walk-in — use displayDetailPatient() below.
      patient: { patient_id: string; full_name: string; gender: string; dob: string; dob_estimated?: boolean; phone: string | null; allergies: string | null } | null;
      is_temporary: boolean;
      temp_patient_name: string | null;
      temp_patient_gender: string | null;
      temp_patient_phone: string | null;
      temp_patient_age: number | null;
      doctor: { user_id: number; username: string; registration_number: string | null };
    };
  };
}

export const getPrescription = (prescriptionId: number) => api.get<PrescriptionDetail>(`/prescriptions/${prescriptionId}`).then((r) => r.data);

// Normalizes a registered Patient and a temporary walk-in's minimal captured details into one
// always-non-null shape, so pharmacy views can render displayDetailPatient(detail).fullName etc.
// without a null check at every call site.
const yearsSince = (iso: string) => {
  const born = new Date(iso);
  const now = new Date();
  return now.getFullYear() - born.getFullYear() - (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate()) ? 1 : 0);
};

export const displayDetailPatient = (detail: Pick<PrescriptionDetail, 'consultation'>) => {
  const a = detail.consultation.appointment;
  // A birth date worked out from an age given at check-in is not a real date: show the age instead.
  const estimated = !!a.patient?.dob_estimated;
  return {
    patientId: a.patient?.patient_id ?? null,
    fullName: a.patient?.full_name ?? a.temp_patient_name ?? 'Unregistered Patient',
    gender: a.patient?.gender ?? a.temp_patient_gender ?? null,
    dob: estimated ? null : (a.patient?.dob ?? null),
    approxAge: estimated && a.patient ? yearsSince(a.patient.dob) : (a.temp_patient_age ?? null),
    phone: a.patient?.phone ?? a.temp_patient_phone ?? null,
    allergies: a.patient?.allergies ?? null,
    isTemporary: a.is_temporary,
  };
};

// A plain <a href>/window.open() cannot reliably surface API errors, so fetch through the
// credentialed API client and trigger the download client-side.
export const downloadPrescriptionPdf = async (prescriptionId: number, code: string) => {
  const res = await api.get(`/prescriptions/${prescriptionId}/pdf`, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
