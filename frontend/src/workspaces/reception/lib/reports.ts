import { api } from './api';

// Front desk operations report — patient volume and queue throughput only (no money or stock).

export interface FrontDeskDay {
  date: string;
  visits: number;
  booked: number;
  walkIns: number;
  followUps: number;
  completed: number;
  noShows: number;
  cancelled: number;
  skipped: number;
  newPatients: number;
  medianWaitMinutes: number | null;
  medianConsultMinutes: number | null;
}

export interface FrontDeskReport {
  title: string;
  range: { from: string; to: string };
  rows: FrontDeskDay[];
  summary: {
    totalVisits: number;
    completed: number;
    completionRatePct: number | null;
    walkIns: number;
    noShows: number;
    cancelled: number;
    newPatients: number;
    medianWaitMinutes: number | null;
    medianConsultMinutes: number | null;
    busiestDay: string | null;
    peakHour: string | null;
    visitsChangePctVsPriorPeriod: number | null;
  };
  byDoctor: { doctor: string; visits: number; completed: number; medianWaitMinutes: number | null }[];
  byHour: { hour: number; label: string; visits: number }[];
}

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}

export const getFrontDeskReport = (range: DateRange) => api.get<FrontDeskReport>('/reports/front-desk', { params: range }).then((r) => r.data);

export const downloadFrontDeskReport = async (range: DateRange, format: 'csv' | 'pdf') => {
  const res = await api.get('/reports/front-desk', { params: { ...range, format }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `front-desk-report-${range.from}-to-${range.to}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
};
