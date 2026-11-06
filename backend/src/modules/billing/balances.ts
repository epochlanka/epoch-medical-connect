import { prisma } from '../../lib/prisma';
import { invoiceType, resolveDisplayPatient, round2, startOfDay } from './service';

// ---- Unpaid balances (FR-074) ----------------------------------------------------------------
// Every invoice that still has money owing, grouped by patient so the desk can settle a patient's
// whole balance in one conversation. A clinic has at most a few hundred unpaid invoices at any time,
// so they are loaded in full and grouped, searched and paged in memory.

const DAY_MS = 24 * 60 * 60 * 1000;

export const AGING_BUCKETS = [
  { key: 'today', label: 'Today', min: 0, max: 0 },
  { key: '1-7', label: '1–7 days', min: 1, max: 7 },
  { key: '8-30', label: '8–30 days', min: 8, max: 30 },
  { key: 'over30', label: 'Over 30 days', min: 31, max: Infinity },
] as const;

type AgingKey = (typeof AGING_BUCKETS)[number]['key'];

const agingKey = (ageDays: number): AgingKey => AGING_BUCKETS.find((b) => ageDays >= b.min && ageDays <= b.max)!.key;

const invoiceCode = (invoiceId: number, createdAt: Date) => `INV-${createdAt.getFullYear()}-${String(invoiceId).padStart(4, '0')}`;

export interface OutstandingFilters {
  search?: string;
  aging?: AgingKey;
  sort?: 'balance' | 'oldest';
  page?: number;
  limit?: number;
}

export const getOutstandingBalances = async (filters: OutstandingFilters = {}) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const invoices = await prisma.invoice.findMany({
    where: { payment_status: { in: ['Outstanding', 'PartiallyPaid'] } },
    orderBy: { created_at: 'asc' },
    include: {
      patient: { select: { patient_id: true, full_name: true, phone: true } },
      items: { select: { item_type: true } },
      consultation: { select: { appointment: { select: { temp_patient_name: true, temp_patient_phone: true } } } },
    },
  });

  const today = startOfDay();
  const ageDays = (createdAt: Date) => Math.max(0, Math.round((today.getTime() - startOfDay(createdAt).getTime()) / DAY_MS));

  type Group = {
    key: string;
    patientId: string | null;
    patientName: string;
    phone: string | null;
    totalBilled: number;
    totalPaid: number;
    balance: number;
    oldestInvoiceAt: Date;
    oldestAgeDays: number;
    invoices: {
      invoiceId: number;
      code: string;
      createdAt: Date;
      type: string;
      total: number;
      paid: number;
      balance: number;
      status: string;
      ageDays: number;
    }[];
  };

  const groups = new Map<string, Group>();
  const aging = new Map<AgingKey, { amount: number; count: number }>(AGING_BUCKETS.map((b) => [b.key, { amount: 0, count: 0 }]));

  for (const inv of invoices) {
    const balance = round2(inv.total_amount - inv.paid_amount);
    if (balance <= 0.009) continue; // a rounding remainder is not a debt worth chasing

    const who = resolveDisplayPatient(inv);
    const age = ageDays(inv.created_at);
    const bucket = aging.get(agingKey(age))!;
    bucket.amount = round2(bucket.amount + balance);
    bucket.count += 1;

    // An unregistered walk-in has no patient record to group under, so each such invoice stands alone.
    const key = who.patient_id ?? `invoice-${inv.invoice_id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        patientId: who.patient_id,
        patientName: who.full_name,
        phone: who.phone ?? null,
        totalBilled: 0,
        totalPaid: 0,
        balance: 0,
        oldestInvoiceAt: inv.created_at,
        oldestAgeDays: age,
        invoices: [],
      };
      groups.set(key, group);
    }
    group.totalBilled = round2(group.totalBilled + inv.total_amount);
    group.totalPaid = round2(group.totalPaid + inv.paid_amount);
    group.balance = round2(group.balance + balance);
    // Invoices arrive oldest first, so the first one seen is already the oldest.
    group.invoices.push({
      invoiceId: inv.invoice_id,
      code: invoiceCode(inv.invoice_id, inv.created_at),
      createdAt: inv.created_at,
      type: invoiceType(inv.items),
      total: inv.total_amount,
      paid: inv.paid_amount,
      balance,
      status: inv.payment_status,
      ageDays: age,
    });
  }

  const all = Array.from(groups.values());
  const summary = {
    totalOutstanding: round2(all.reduce((sum, g) => sum + g.balance, 0)),
    invoiceCount: all.reduce((sum, g) => sum + g.invoices.length, 0),
    patientCount: all.length,
    aging: AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, ...aging.get(b.key)! })),
  };

  let rows = all;
  if (filters.aging) {
    const { min, max } = AGING_BUCKETS.find((b) => b.key === filters.aging)!;
    rows = rows.filter((g) => g.oldestAgeDays >= min && g.oldestAgeDays <= max);
  }
  const term = filters.search?.trim().toLowerCase();
  if (term) {
    const asId = Number(term.replace(/^inv-(\d{4}-)?/i, ''));
    rows = rows.filter(
      (g) =>
        g.patientName.toLowerCase().includes(term) ||
        (g.phone ?? '').toLowerCase().includes(term) ||
        (g.patientId ?? '').toLowerCase().includes(term) ||
        g.invoices.some((i) => i.code.toLowerCase() === term || (Number.isFinite(asId) && asId > 0 && i.invoiceId === asId)),
    );
  }

  rows.sort((a, b) =>
    filters.sort === 'oldest' ? a.oldestInvoiceAt.getTime() - b.oldestInvoiceAt.getTime() : b.balance - a.balance || a.oldestInvoiceAt.getTime() - b.oldestInvoiceAt.getTime(),
  );

  const total = rows.length;
  return {
    summary,
    data: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};
