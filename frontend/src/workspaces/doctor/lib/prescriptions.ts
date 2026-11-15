import { api } from './api';
import type { ConsultationPatient, TempPatientInfo } from './consultations';

export interface PrescriptionItemInput {
  medicine_id: number;
  dosage: string;
  frequency?: string;
  duration?: string;
  route?: string;
  instructions?: string;
  qty: number;
  // Units per administration in the medicine's dispensing unit; required to accept a calculated qty.
  dose_qty?: number;
  qty_manual?: boolean;
  external_qty?: number;
  /** Taken long-term: stays on the ongoing-medicines list after the course runs out. */
  is_long_term?: boolean;
  /** YYYY-MM-DD; omitted = starts the day it is prescribed. */
  start_date?: string;
}

/** 'External' = every medicine is bought outside; it never enters the pharmacy queue. */
export type PrescriptionStatus = 'Pending' | 'Preparing' | 'Dispensed' | 'Collected' | 'External';

export interface CreatePrescriptionInput {
  consultation_id: number;
  items?: PrescriptionItemInput[];
  /** No clinic medicines — only ones to buy outside. */
  external_only?: boolean;
  refill_of_prescription_id?: number;
  allergyAck?: boolean;
  notes?: string;
}

export interface PrescriptionItem {
  rx_item_id: number;
  medicine_id: number;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  qty: number;
  dose_qty?: number | null;
  qty_manual?: boolean;
  external_qty: number;
  medicine: { name: string; generic_name: string | null; strength: string | null; unit: string };
  stockStatus?: string;
}

export interface Prescription {
  prescription_id: number;
  consultation_id: number;
  status: PrescriptionStatus;
  is_refill: boolean;
  refill_of_id: number | null;
  notes: string | null;
  issued_at: string;
  items: PrescriptionItem[];
}

export const createPrescription = (input: CreatePrescriptionInput) => api.post<Prescription>('/prescriptions', input);

export interface ListPrescriptionsParams {
  patientId?: string;
  status?: PrescriptionStatus;
  search?: string;
  isRefill?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PrescriptionSummary {
  prescriptionId: number;
  code: string;
  status: PrescriptionStatus;
  isRefill: boolean;
  notes: string | null;
  issuedAt: string;
  appointmentId: number;
  patientId: string;
  patientName: string;
  patientGender: string;
  patientDob: string;
  patientPhone: string | null;
  patientPhotoUrl: string | null;
  doctorId: number;
  doctorName: string;
  items: { medicine: string; dosage: string; qty: number; dispensedAt: string | null }[];
  /** Bought outside the clinic. */
  externalMedicines: { medicine: string; dosage: string; qty: number; unit: string }[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const listPrescriptions = (params: ListPrescriptionsParams) =>
  api.get<{ data: PrescriptionSummary[]; pagination: Pagination }>('/prescriptions', { params }).then((r) => r.data);

export interface PrescriptionStats {
  total: number;
  thisMonth: number;
  thisMonthDeltaPct: number | null;
  pending: number;
  preparing: number;
  dispensed: number;
  collected: number;
}

export const getPrescriptionStats = (params?: { isRefill?: boolean }) => api.get<PrescriptionStats>('/prescriptions/stats', { params }).then((r) => r.data);

export interface PrescriptionDetailItem {
  rx_item_id: number;
  medicine_id: number;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  qty: number;
  external_qty: number;
  dispensed_at: string | null;
  medicine: { name: string; generic_name: string | null; strength: string | null; unit: string };
}

export interface PrescriptionDetail {
  prescription_id: number;
  consultation_id: number;
  status: PrescriptionStatus;
  is_refill: boolean;
  refill_of_id: number | null;
  notes: string | null;
  issued_at: string;
  priorVisitCount: number;
  items: PrescriptionDetailItem[];
  consultation: {
    consultation_id: number;
    diagnosis: string | null;
    icd10_code: string | null;
    appointment: {
      appointment_id: number;
      scheduled_at: string;
      patient: ConsultationPatient;
      doctor: { user_id: number; username: string; registration_number: string | null };
    };
  };
}

export const getPrescriptionDetail = (id: number) => api.get<PrescriptionDetail>(`/prescriptions/${id}`).then((r) => r.data);

export interface PastPrescriptionItem {
  medicineId: number;
  medicine: string;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  qty: number;
}

export interface PastPrescription {
  prescriptionId: number;
  code: string;
  issuedAt: string;
  items: PastPrescriptionItem[];
}

/** running = supply left; due = long-term and run out; ended = an ordinary course that ended recently. */
export type OngoingStatus = 'running' | 'due' | 'ended';

export interface OngoingMedication {
  key: string;
  name: string;
  medicineId: number | null;
  outside: boolean;
  status: OngoingStatus;
  longTerm: boolean;
  markedLongTerm: boolean;
  issuedAt: string;
  endsAt: string | null;
  daysLeft: number | null;
  prescriptionId: number;
  consultationId: number;
  lastDispensedAt: string | null;
  dosage: string;
  doseQty: number | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  qty: number;
  genericName: string | null;
  brandName: string | null;
  dosageForm: string | null;
  strength: string | null;
  quantityUnit: string | null;
}

export const stopMedication = (input: { patient_id: string; medicine_name: string; reason?: string; consultation_id?: number }) =>
  api.post<{ stopId: number; medicineName: string; stoppedAt: string }>('/prescriptions/medication-stops', input).then((r) => r.data);

export const undoStopMedication = (stopId: number) => api.delete(`/prescriptions/medication-stops/${stopId}`);

export interface PrescriptionContext {
  consultation: {
    consultationId: number;
    status: string;
    complaint: string | null;
    diagnosis: string | null;
    icd10Code: string | null;
    additionalDiagnoses: { code: string | null; title: string }[];
  };
  appointment: {
    appointmentId: number;
    scheduledAt: string;
    // Null for a temporary/unregistered walk-in — use displayPrescriptionPatient() below.
    patient: ConsultationPatient | null;
    isTemporary: boolean;
    tempPatient: TempPatientInfo | null;
    doctor: { user_id: number; username: string; registration_number: string | null };
  };
  existingPrescriptions: { prescription_id: number; status: string; issued_at: string }[];
  patientSummary: { allergies: string | null; chronicConditions: string[]; currentMedications: string[]; lastPrescribedAt: string | null; priorVisitCount: number };
  pastPrescriptions: PastPrescription[];
  ongoingMedications: OngoingMedication[];
}

export const getPrescriptionContext = (consultationId: number) =>
  api.get<PrescriptionContext>(`/prescriptions/context/${consultationId}`).then((r) => r.data);

// Same normalization as consultations.ts's displayPatient() — always-non-null shape covering
// both a registered Patient and a temporary walk-in's minimal captured details.
export const displayPrescriptionPatient = (ctx: Pick<PrescriptionContext, 'appointment'>) => {
  const p = ctx.appointment.patient;
  const t = ctx.appointment.tempPatient;
  return {
    patientId: p?.patient_id ?? null,
    fullName: p?.full_name ?? t?.name ?? 'Unregistered Patient',
    gender: p?.gender ?? t?.gender ?? null,
    dob: p?.dob ?? null,
    approxAge: t?.age ?? null,
    phone: p?.phone ?? t?.phone ?? null,
    photoUrl: p?.photo_url ?? null,
    bloodGroup: p?.blood_group ?? null,
    isTemporary: ctx.appointment.isTemporary,
  };
};

export const downloadPrescriptionPdf = async (prescriptionId: number, code: string) => {
  const res = await api.get(`/prescriptions/${prescriptionId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

// Opens in a new tab (rather than forcing a download, like downloadPrescriptionPdf above) so the
// browser's own PDF viewer serves as the "preview" step before the doctor prints the slip.
export const downloadExternalPurchaseSlip = async (prescriptionId: number) => {
  const res = await api.get(`/prescriptions/${prescriptionId}/external-slip`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
};
