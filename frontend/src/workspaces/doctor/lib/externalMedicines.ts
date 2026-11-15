import { api } from './api';

export interface ExternalMedicineInput {
  medicine_id?: number;
  medicine_name?: string;
  generic_name?: string;
  brand_name?: string;
  dosage_form: string;
  strength?: string;
  dosage: string;
  /** Units taken per administration; drives the quantity and prints on the slip. */
  dose_qty?: number;
  frequency?: string;
  duration?: string;
  quantity: number;
  quantity_unit: string;
  instructions?: string;
  is_long_term?: boolean;
  /** YYYY-MM-DD; omitted = starts the day it is prescribed. */
  start_date?: string | null;
}

export interface ExternalMedicine {
  extItemId: number;
  prescriptionId: number;
  patientId: string;
  doctorId: number;
  medicineId: number | null;
  medicineName: string;
  genericName: string | null;
  brandName: string | null;
  dosageForm: string;
  strength: string | null;
  dosage: string;
  doseQty: number | null;
  frequency: string | null;
  duration: string | null;
  quantity: number;
  quantityUnit: string;
  instructions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreviousExternalMedicine extends ExternalMedicine {
  lastPrescribedAt: string;
}

export const createExternalMedicine = (prescriptionId: number, input: ExternalMedicineInput) =>
  api.post<ExternalMedicine>(`/external-medicines/prescription/${prescriptionId}`, input).then((r) => r.data);

export const bulkCreateExternalMedicines = (prescriptionId: number, items: ExternalMedicineInput[]) =>
  api.post<ExternalMedicine[]>(`/external-medicines/prescription/${prescriptionId}/bulk`, { items }).then((r) => r.data);

export const listExternalMedicinesByPrescription = (prescriptionId: number) =>
  api.get<ExternalMedicine[]>(`/external-medicines/prescription/${prescriptionId}`).then((r) => r.data);

// "Super search" over a patient's previous external medicines, for the "Use Again" flow.
export const searchPreviousExternalMedicines = (patientId: string, search: string) =>
  api.get<PreviousExternalMedicine[]>(`/external-medicines/patient/${patientId}`, { params: { search } }).then((r) => r.data);

export const updateExternalMedicine = (extItemId: number, updates: Partial<ExternalMedicineInput>) =>
  api.put<ExternalMedicine>(`/external-medicines/${extItemId}`, updates).then((r) => r.data);

export const deleteExternalMedicine = (extItemId: number) => api.delete(`/external-medicines/${extItemId}`);

// Same "open the PDF in a new tab" pattern as downloadExternalPurchaseSlip in prescriptions.ts —
// the browser's own PDF viewer serves as the preview before the doctor prints it.
export const previewExternalMedicineSlip = async (prescriptionId: number) => {
  const res = await api.get(`/external-medicines/prescription/${prescriptionId}/slip`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
};

// The clinic's shared list of outside medicines typed in before, most used first. The details and
// dosing are those of the latest use, offered as editable defaults.
export interface SavedExternalMedicine {
  libraryId: number;
  medicineName: string;
  genericName: string | null;
  brandName: string | null;
  dosageForm: string;
  strength: string | null;
  quantityUnit: string;
  dosage: string | null;
  doseQty: number | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  isLongTerm: boolean;
  startDate?: string | null;
  useCount: number;
  lastUsedAt: string;
}

export const searchSavedExternalMedicines = (search: string) =>
  api.get<SavedExternalMedicine[]>('/external-medicines/library', { params: search.trim() ? { search: search.trim() } : {} }).then((r) => r.data);

/** Takes a saved medicine off the suggestions; past prescriptions are not changed. */
export const removeSavedExternalMedicine = (libraryId: number) => api.delete(`/external-medicines/library/${libraryId}`);

/** Saves a typed-in outside medicine to the shared list as soon as it is added to a prescription. */
export const saveExternalMedicineToList = (input: ExternalMedicineInput & { medicine_name: string }) =>
  api.post<SavedExternalMedicine | null>('/external-medicines/library', input).then((r) => r.data);
