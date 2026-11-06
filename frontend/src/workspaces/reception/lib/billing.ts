import { api } from './api';
import { listMasterData } from './settings';

export type InvoiceType = 'Consultation' | 'Pharmacy' | 'Consultation+Pharmacy';
export type PaymentStatus = 'Outstanding' | 'PartiallyPaid' | 'Paid' | 'Voided';

// Sourced from the same PaymentMethod master-data list Settings edits, so a method an admin adds
// or retires there actually takes effect here rather than being purely decorative.
export const listPaymentMethodOptions = () => listMasterData('PaymentMethod').then((items) => items.map((i) => i.value));

export interface InvoiceItem {
  invoice_item_id: number;
  invoice_id: number;
  item_type: 'ConsultationFee' | 'Medicine' | 'Discount';
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
  // Medicine lines only — the exact batch this line billed, for cost/profit reporting. Never
  // shown to the patient.
  medicine_id?: number | null;
  batch_id?: number | null;
  base_qty?: number | null;
  unit?: string | null;
  purchase_cost?: number | null;
  profit?: number | null;
}

export interface InvoicePayment {
  payment_id: number;
  invoice_id: number;
  method: string;
  amount: number;
  received_at: string;
  receiver: { username: string };
}

export interface InvoiceRefund {
  refund_id: number;
  invoice_id: number;
  method: string;
  amount: number;
  reason: string | null;
  issued_at: string;
  issuer: { username: string };
}

// A visit's doctor/consultation-type context, reached through Invoice -> Consultation ->
// Appointment (an Invoice has no doctor column of its own) — null when the invoice has no
// linked consultation at all.
export interface InvoiceVisitContext {
  appointment: {
    doctor: { user_id: number; username: string; registration_number: string | null };
    consultation_type: string | null;
    scheduled_at: string;
    is_walk_in: boolean;
    visit_type: string;
  };
}

export interface Invoice {
  invoice_id: number;
  patient_id: string | null;
  consultation_id: number | null;
  subtotal: number;
  discount_total: number;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  created_via: 'Manual' | 'Auto';
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  type: InvoiceType;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  refunds: InvoiceRefund[];
  // patient_id is null for an unregistered walk-in — full_name/phone still resolve to the
  // visit's captured temp_patient_* fields (see backend billing/service.ts resolveDisplayPatient).
  patient: { patient_id: string | null; full_name: string; phone?: string | null };
  creator: { username: string };
  consultation: InvoiceVisitContext | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListInvoicesParams {
  search?: string;
  patientId?: string;
  consultationId?: number;
  status?: PaymentStatus;
  type?: InvoiceType;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const listInvoices = (params: ListInvoicesParams) =>
  api.get<{ data: Invoice[]; pagination: Pagination }>('/invoices', { params }).then((r) => r.data);

export const getInvoice = (invoiceId: number) => api.get<Invoice>(`/invoices/${invoiceId}`).then((r) => r.data);

export const createInvoiceForConsultation = (consultationId: number, discounts?: { description: string; amount: number }[]) =>
  api.post<Invoice>('/invoices', { consultation_id: consultationId, discounts }).then((r) => r.data);

export const recordPayments = (invoiceId: number, payments: { method: string; amount: number; idempotency_key?: string }[]) =>
  api.post<Invoice>(`/invoices/${invoiceId}/payments`, { payments }).then((r) => r.data);

export const downloadInvoicePdf = async (invoiceId: number, code: string) => {
  const res = await api.get(`/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export interface PaymentRow {
  paymentId: number;
  invoiceId: number;
  invoiceStatus: PaymentStatus;
  invoiceCreatedAt: string;
  invoiceSubtotal: number;
  invoiceDiscount: number;
  patientId: string | null;
  patientName: string;
  patientPhone: string | null;
  amount: number;
  method: string;
  receivedAt: string;
  receivedBy: string;
}

export interface ListPaymentsParams {
  search?: string;
  method?: string;
  invoiceStatus?: PaymentStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const listPayments = (params: ListPaymentsParams) =>
  api.get<{ data: PaymentRow[]; pagination: Pagination }>('/invoices/payments', { params }).then((r) => r.data);

export interface PaymentsStats {
  range: 'month' | 'quarter' | 'year' | 'all';
  totalPayments: number;
  totalReceived: number;
  totalReceivedThisMonth: number;
  outstandingInvoices: number;
  voidedInvoices: number;
  outstandingAmount: number;
  byMethod: { method: string; amount: number; count: number }[];
  byInvoiceStatus: { status: PaymentStatus; count: number }[];
  today: { total: number; count: number };
  yesterdayTotal: number;
  thisWeek: { total: number; count: number };
  lastWeekTotal: number;
  thisMonth: { total: number; count: number };
  lastMonthTotal: number;
}

export const getPaymentsStats = (range: PaymentsStats['range'] = 'month') => api.get<PaymentsStats>('/invoices/payments/stats', { params: { range } }).then((r) => r.data);

// ---- Unpaid balances (FR-074) ----------------------------------------------------------------

export type AgingKey = 'today' | '1-7' | '8-30' | 'over30';

export interface OutstandingInvoice {
  invoiceId: number;
  code: string;
  createdAt: string;
  type: InvoiceType;
  total: number;
  paid: number;
  balance: number;
  status: PaymentStatus;
  ageDays: number;
}

export interface OutstandingGroup {
  key: string;
  patientId: string | null;
  patientName: string;
  phone: string | null;
  totalBilled: number;
  totalPaid: number;
  balance: number;
  oldestInvoiceAt: string;
  oldestAgeDays: number;
  invoices: OutstandingInvoice[];
}

export interface OutstandingResult {
  summary: {
    totalOutstanding: number;
    invoiceCount: number;
    patientCount: number;
    aging: { key: AgingKey; label: string; amount: number; count: number }[];
  };
  data: OutstandingGroup[];
  pagination: Pagination;
}

export interface OutstandingParams {
  search?: string;
  aging?: AgingKey;
  sort?: 'balance' | 'oldest';
  page?: number;
  limit?: number;
}

export const getOutstandingBalances = (params: OutstandingParams) =>
  api.get<OutstandingResult>('/invoices/outstanding', { params }).then((r) => r.data);

// ---- End-of-day cash count (FR-076) ----------------------------------------------------------

export interface DayCloseLine {
  method: string;
  received: number;
  refunded: number;
  expected: number;
  counted: number;
  variance: number;
}

export interface DayCloseRecord {
  closeId: number;
  date: string;
  openingFloat: number;
  lines: DayCloseLine[];
  denominations: Record<string, number> | null;
  expectedTotal: number;
  countedTotal: number;
  varianceTotal: number;
  paymentCount: number;
  refundCount: number;
  notes: string | null;
  closedBy: string;
  closedAt: string;
}

export interface DayCloseView {
  date: string;
  isToday: boolean;
  methods: { method: string; received: number; refunded: number; net: number }[];
  totals: { received: number; refunded: number; net: number };
  paymentCount: number;
  refundCount: number;
  payments: {
    paymentId: number;
    invoiceId: number;
    invoiceCreatedAt: string;
    patientName: string;
    method: string;
    amount: number;
    receivedAt: string;
    receivedBy: string;
  }[];
  refunds: { refundId: number; invoiceId: number; method: string; amount: number; reason: string | null; issuedAt: string; issuedBy: string }[];
  close: DayCloseRecord | null;
  changedSinceClose: { paymentsAdded: number; refundsAdded: number; netDifference: number } | null;
  reopens: DayReopen[];
}

export interface CloseDayInput {
  date: string;
  opening_float: number;
  counted: { method: string; amount: number }[];
  denominations?: Record<string, number>;
  notes?: string;
}

export const getDayClose = (date: string) => api.get<DayCloseView>('/invoices/day-close', { params: { date } }).then((r) => r.data);

export const closeDay = (input: CloseDayInput) => api.post<DayCloseRecord>('/invoices/day-close', input).then((r) => r.data);

export const listDayCloses = (page = 1, limit = 10) =>
  api.get<{ data: DayCloseRecord[]; pagination: Pagination }>('/invoices/day-close/history', { params: { page, limit } }).then((r) => r.data);

export interface DayReopen {
  reopenId: number;
  reason: string;
  reopenedBy: string;
  reopenedAt: string;
  previous: DayCloseRecord;
}

/** Administrator only: undo a day's close so it can be counted again. */
export const reopenDay = (date: string, reason: string) => api.post<DayReopen>(`/invoices/day-close/${date}/reopen`, { reason }).then((r) => r.data);
