import { api } from './api';

export interface PatientSummary {
  overview: string;
  activeProblems: { problem: string; since: string | null; basis: string }[];
  currentMedications: { name: string; details: string }[];
  allergies: string[];
  recentVisits: { date: string; summary: string }[];
  labHighlights: { date: string; test: string; finding: string }[];
  pointsToCheck: { point: string; reason: string }[];
}

export interface PatientSummaryResult {
  summary: PatientSummary;
  generatedAt: string;
  model: string;
  cached: boolean;
  basedOn: { visits: number; labTests: number };
}

export const getAiStatus = () => api.get<{ enabled: boolean; model: string }>('/ai/status').then((r) => r.data);

export const getPatientSummary = (patientId: string, refresh = false) =>
  api.post<PatientSummaryResult>(`/ai/patients/${encodeURIComponent(patientId)}/summary`, { refresh }).then((r) => r.data);
