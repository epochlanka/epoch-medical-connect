import { api } from '../../lib/api';

export interface PatientLookupHit {
  patient_id: string;
  short_number: string | null;
  full_name: string;
  gender: string;
  dob: string;
  dob_estimated: boolean;
  phone: string | null;
  nic: string | null;
  is_active: boolean;
  allergies: string | null;
  matched_on: 'id' | 'phone' | 'nic' | 'name';
}

/** Ranked find by patient number ("123"), phone in any format, NIC or name words. */
export const lookupPatients = (q: string, limit = 8) =>
  api.get<PatientLookupHit[]>('/patients/lookup', { params: { q, limit } }).then((r) => r.data);

export interface FamilyMember {
  patient_id: string;
  full_name: string;
  gender: string;
  dob: string;
  relationship_to_head: string | null;
  is_active: boolean;
}

export const listFamilyMembers = (familyId: number) =>
  api
    .get<{ data: FamilyMember[] }>('/patients', { params: { familyId, status: 'all', limit: 50 } })
    .then((r) => r.data.data);
