import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { endOfDay, localDateKey, resolveDisplayPatient, round2, startOfDay } from './service';

// ---- End-of-day cash count (FR-076) ----------------------------------------------------------
// At closing, the desk counts the cash drawer (and totals the card terminal and mobile-payment
// slips) and compares that with what was recorded in the system for the day. The expected side is
// always computed here from Payment and Refund rows — never taken from the client — and is frozen
// into the CashDayClose row when the day is signed off.

interface Actor {
  user_id: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A YYYY-MM-DD clinic date as local midnight, rejecting impossible dates such as 2026-02-31. */
export const parseBusinessDate = (value: string): Date => {
  const match = DATE_RE.exec(value);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  if (!date || localDateKey(date) !== value) throw new ValidationError(`"${value}" is not a valid date (expected YYYY-MM-DD)`);
  if (date > startOfDay()) throw new ValidationError('A day cannot be closed before it has started');
  return date;
};

const isCash = (method: string) => method.trim().toLowerCase() === 'cash';

interface MethodTotals {
  method: string;
  received: number;
  refunded: number;
  net: number;
}

const loadDay = async (date: Date) => {
  const range = { gte: startOfDay(date), lte: endOfDay(date) };
  const [payments, refunds, activeMethods] = await Promise.all([
    prisma.payment.findMany({
      where: { received_at: range },
      orderBy: { received_at: 'asc' },
      include: {
        receiver: { select: { username: true } },
        invoice: {
          select: {
            invoice_id: true,
            created_at: true,
            patient: { select: { patient_id: true, full_name: true, phone: true } },
            consultation: { select: { appointment: { select: { temp_patient_name: true, temp_patient_phone: true } } } },
          },
        },
      },
    }),
    prisma.refund.findMany({
      where: { issued_at: range },
      orderBy: { issued_at: 'asc' },
      include: { issuer: { select: { username: true } } },
    }),
    prisma.masterDataItem.findMany({ where: { type: 'PaymentMethod', is_active: true }, orderBy: { sort_order: 'asc' } }),
  ]);

  // Every active method is listed even on a quiet day, so the desk is asked about each one; a
  // method that has since been retired still appears if money actually moved through it.
  const order = ['Cash', ...activeMethods.map((m) => m.value), ...payments.map((p) => p.method), ...refunds.map((r) => r.method)];
  const methods = new Map<string, MethodTotals>();
  for (const method of order) if (!methods.has(method)) methods.set(method, { method, received: 0, refunded: 0, net: 0 });
  for (const p of payments) methods.get(p.method)!.received += p.amount;
  for (const r of refunds) methods.get(r.method)!.refunded += r.amount;
  const totals = Array.from(methods.values()).map((m) => ({ ...m, received: round2(m.received), refunded: round2(m.refunded), net: round2(m.received - m.refunded) }));

  return { payments, refunds, totals };
};

interface StoredLine {
  method: string;
  received: number;
  refunded: number;
  expected: number;
  counted: number;
  variance: number;
}

const closeInclude = { closer: { select: { username: true } } } as const;
type CloseRow = Prisma.CashDayCloseGetPayload<{ include: typeof closeInclude }>;

const presentClose = (row: CloseRow) => ({
  closeId: row.close_id,
  date: row.business_date,
  openingFloat: row.opening_float,
  lines: JSON.parse(row.lines_json) as StoredLine[],
  denominations: row.denominations_json ? (JSON.parse(row.denominations_json) as Record<string, number>) : null,
  expectedTotal: row.expected_total,
  countedTotal: row.counted_total,
  varianceTotal: row.variance_total,
  paymentCount: row.payment_count,
  refundCount: row.refund_count,
  notes: row.notes,
  closedBy: row.closer.username,
  closedAt: row.closed_at,
});

const presentReopen = (row: Prisma.CashDayReopenGetPayload<{ include: { reopener: { select: { username: true } } } }>) => ({
  reopenId: row.reopen_id,
  reason: row.reason,
  reopenedBy: row.reopener.username,
  reopenedAt: row.reopened_at,
  previous: JSON.parse(row.previous_close_json) as ReturnType<typeof presentClose>,
});

export const getDayClose = async (dateKey: string) => {
  const date = parseBusinessDate(dateKey);
  const [{ payments, refunds, totals }, close, reopens] = await Promise.all([
    loadDay(date),
    prisma.cashDayClose.findUnique({ where: { business_date: dateKey }, include: closeInclude }),
    prisma.cashDayReopen.findMany({ where: { business_date: dateKey }, orderBy: { reopened_at: 'desc' }, include: { reopener: { select: { username: true } } } }),
  ]);

  const received = round2(totals.reduce((sum, m) => sum + m.received, 0));
  const refunded = round2(totals.reduce((sum, m) => sum + m.refunded, 0));
  const presented = close ? presentClose(close) : null;

  // Money recorded or refunded for this day after it was signed off: the close no longer describes
  // the whole day, and the desk needs to see by how much.
  let changedSinceClose: { paymentsAdded: number; refundsAdded: number; netDifference: number } | null = null;
  if (presented) {
    const closedNet = round2(presented.lines.reduce((sum, l) => sum + l.received - l.refunded, 0));
    const netDifference = round2(received - refunded - closedNet);
    const paymentsAdded = payments.length - presented.paymentCount;
    const refundsAdded = refunds.length - presented.refundCount;
    if (paymentsAdded !== 0 || refundsAdded !== 0 || Math.abs(netDifference) >= 0.01) changedSinceClose = { paymentsAdded, refundsAdded, netDifference };
  }

  return {
    date: dateKey,
    isToday: dateKey === localDateKey(new Date()),
    methods: totals,
    totals: { received, refunded, net: round2(received - refunded) },
    paymentCount: payments.length,
    refundCount: refunds.length,
    payments: payments.map((p) => {
      const who = resolveDisplayPatient(p.invoice);
      return {
        paymentId: p.payment_id,
        invoiceId: p.invoice_id,
        invoiceCreatedAt: p.invoice.created_at,
        patientName: who.full_name,
        method: p.method,
        amount: p.amount,
        receivedAt: p.received_at,
        receivedBy: p.receiver.username,
      };
    }),
    refunds: refunds.map((r) => ({
      refundId: r.refund_id,
      invoiceId: r.invoice_id,
      method: r.method,
      amount: r.amount,
      reason: r.reason,
      issuedAt: r.issued_at,
      issuedBy: r.issuer.username,
    })),
    close: presented,
    changedSinceClose,
    reopens: reopens.map(presentReopen),
  };
};

// Administrator only (enforced by the router). The close is removed so the day can be counted and
// closed again; its full content moves into CashDayReopen alongside the reason, so nothing that was
// signed off is ever lost.
export const reopenDay = async (dateKey: string, reason: string, actor: Actor) => {
  parseBusinessDate(dateKey);
  const why = reason?.trim();
  if (!why || why.length < 5) throw new ValidationError('Give a reason for reopening this day');

  const reopen = await prisma.$transaction(async (tx) => {
    const close = await tx.cashDayClose.findUnique({ where: { business_date: dateKey }, include: closeInclude });
    if (!close) throw new NotFoundError(`${dateKey} is not closed`);
    // Deleting by id AND date inside the transaction: if two admins reopen at once, the second
    // finds nothing to delete and fails rather than recording a second reopen of the same close.
    const { count } = await tx.cashDayClose.deleteMany({ where: { close_id: close.close_id, business_date: dateKey } });
    if (count === 0) throw new NotFoundError(`${dateKey} is not closed`);

    const row = await tx.cashDayReopen.create({
      data: { business_date: dateKey, previous_close_json: JSON.stringify(presentClose(close)), reason: why, reopened_by: actor.user_id },
      include: { reopener: { select: { username: true } } },
    });
    await tx.auditLog.create({ data: { user_id: actor.user_id, action: 'REOPEN_DAY', entity: 'CashDayClose', entity_id: String(close.close_id) } });
    return row;
  });
  return presentReopen(reopen);
};

export interface CloseDayInput {
  date: string;
  opening_float?: number;
  counted: { method: string; amount: number }[];
  denominations?: Record<string, number>;
  notes?: string;
}

export const closeDay = async (input: CloseDayInput, actor: Actor) => {
  const date = parseBusinessDate(input.date);
  if (await prisma.cashDayClose.findUnique({ where: { business_date: input.date }, select: { close_id: true } })) {
    throw new ConflictError(`${input.date} has already been closed`);
  }
  const openingFloat = round2(input.opening_float ?? 0);
  if (openingFloat < 0) throw new ValidationError('The opening float cannot be negative');

  const counted = new Map<string, number>();
  for (const line of input.counted) {
    if (!(line.amount >= 0)) throw new ValidationError(`The counted amount for ${line.method} cannot be negative`);
    if (counted.has(line.method)) throw new ValidationError(`${line.method} is listed more than once`);
    counted.set(line.method, round2(line.amount));
  }

  const { payments, refunds, totals } = await loadDay(date);
  const known = new Set(totals.map((m) => m.method));
  const unknown = [...counted.keys()].find((method) => !known.has(method));
  if (unknown) throw new ValidationError(`"${unknown}" is not a payment method used at this clinic`);

  const lines: StoredLine[] = totals.map((m) => {
    const expected = round2(m.net + (isCash(m.method) ? openingFloat : 0));
    const value = counted.get(m.method);
    // Nothing to count for a method that moved no money; everything else must be counted.
    if (value === undefined && Math.abs(expected) >= 0.01) throw new ValidationError(`Enter the counted amount for ${m.method}`);
    const countedAmount = value ?? 0;
    return { method: m.method, received: m.received, refunded: m.refunded, expected, counted: countedAmount, variance: round2(countedAmount - expected) };
  });

  let denominations: Record<string, number> | null = null;
  if (input.denominations && Object.keys(input.denominations).length > 0) {
    denominations = {};
    let fromNotes = 0;
    for (const [face, count] of Object.entries(input.denominations)) {
      const value = Number(face);
      if (!(value > 0) || !Number.isInteger(count) || count < 0) throw new ValidationError('The note and coin count is not valid');
      if (count > 0) denominations[face] = count;
      fromNotes += value * count;
    }
    const cashCounted = lines.find((l) => isCash(l.method))?.counted ?? 0;
    if (Math.abs(round2(fromNotes) - cashCounted) >= 0.01) {
      throw new ValidationError(`The notes and coins add up to ${round2(fromNotes).toFixed(2)}, not the ${cashCounted.toFixed(2)} entered as counted cash`);
    }
  }

  const expectedTotal = round2(lines.reduce((sum, l) => sum + l.expected, 0));
  const countedTotal = round2(lines.reduce((sum, l) => sum + l.counted, 0));
  const notes = input.notes?.trim() || null;
  if (lines.some((l) => Math.abs(l.variance) >= 0.01) && !notes) {
    throw new ValidationError('The count does not match what was recorded — add a note explaining the difference before closing the day');
  }

  try {
    const close = await prisma.$transaction(async (tx) => {
      const row = await tx.cashDayClose.create({
        data: {
          business_date: input.date,
          opening_float: openingFloat,
          lines_json: JSON.stringify(lines),
          denominations_json: denominations ? JSON.stringify(denominations) : null,
          expected_total: expectedTotal,
          counted_total: countedTotal,
          variance_total: round2(countedTotal - expectedTotal),
          payment_count: payments.length,
          refund_count: refunds.length,
          notes,
          closed_by: actor.user_id,
        },
        include: closeInclude,
      });
      await tx.auditLog.create({ data: { user_id: actor.user_id, action: 'CLOSE_DAY', entity: 'CashDayClose', entity_id: String(row.close_id) } });
      return row;
    });
    return presentClose(close);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`${input.date} has already been closed`);
    }
    throw error;
  }
};

export const listDayCloses = async ({ page = 1, limit = 10 }: { page?: number; limit?: number }) => {
  const take = limit > 0 && limit <= 100 ? limit : 10;
  const skip = (Math.max(1, page) - 1) * take;
  const [total, rows] = await Promise.all([
    prisma.cashDayClose.count(),
    prisma.cashDayClose.findMany({ orderBy: { business_date: 'desc' }, skip, take, include: closeInclude }),
  ]);
  return { data: rows.map(presentClose), pagination: { page: Math.max(1, page), limit: take, total, totalPages: Math.max(1, Math.ceil(total / take)) } };
};
