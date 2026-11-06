import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const BILLING_ROLES = ['Admin', 'Receptionist'];
const VOID_ROLES = ['Admin'];

const invoiceIdParamsSchema = z.object({ params: z.object({ invoiceId: z.coerce.number().int().positive() }) });

const createSchema = z.object({
  body: z.object({
    consultation_id: z.number().int().positive(),
    consultation_fee: z.number().min(0).optional(),
    discounts: z.array(z.object({ description: z.string().min(1), amount: z.number().positive() })).optional(),
  }),
});

const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    patientId: z.string().optional(),
    consultationId: z.coerce.number().int().positive().optional(),
    status: z.enum(['Outstanding', 'PartiallyPaid', 'Paid', 'Voided']).optional(),
    type: z.enum(['Consultation', 'Pharmacy', 'Consultation+Pharmacy']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const paymentsSchema = z.object({
  params: z.object({ invoiceId: z.coerce.number().int().positive() }),
  body: z.object({
    payments: z
      .array(z.object({ method: z.string().min(1), amount: z.number().positive(), idempotency_key: z.string().min(1).optional() }))
      .min(1),
  }),
});

const voidSchema = z.object({
  params: z.object({ invoiceId: z.coerce.number().int().positive() }),
  body: z.object({
    reason: z.string().min(1, 'A void reason is required'),
    refunds: z.array(z.object({ method: z.string().min(1), amount: z.number().positive() })).optional(),
  }),
});

const reconciliationSchema = z.object({ query: z.object({ date: z.coerce.date().optional() }) });

const paymentsListSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    method: z.string().optional(),
    invoiceStatus: z.enum(['Outstanding', 'PartiallyPaid', 'Paid', 'Voided']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});
const paymentsStatsSchema = z.object({ query: z.object({ range: z.enum(['month', 'quarter', 'year', 'all']).optional() }) });

const outstandingSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    aging: z.enum(['today', '1-7', '8-30', 'over30']).optional(),
    sort: z.enum(['balance', 'oldest']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

// A clinic day as YYYY-MM-DD — kept as text rather than coerced to a Date, which would read it as
// UTC midnight and land on the wrong day in some timezones. dayClose.ts parses it as a local date.
const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD form');

const dayCloseSchema = z.object({ query: z.object({ date: businessDate }) });

const closeDaySchema = z.object({
  body: z.object({
    date: businessDate,
    opening_float: z.number().min(0).optional(),
    counted: z.array(z.object({ method: z.string().min(1), amount: z.number().min(0) })),
    denominations: z.record(z.string(), z.number().int().min(0)).optional(),
    notes: z.string().max(1000).optional(),
  }),
});

const reopenDaySchema = z.object({
  params: z.object({ date: businessDate }),
  body: z.object({ reason: z.string().trim().min(5, 'Give a reason for reopening this day').max(1000) }),
});

const dayCloseHistorySchema = z.object({
  query: z.object({ page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().optional() }),
});

router.get('/reconciliation', requireRole(['Admin', 'Receptionist']), validate(reconciliationSchema), controller.reconciliation);
// Unpaid balances (FR-074) and the end-of-day cash count (FR-076): front-desk money tools.
router.get('/outstanding', requireRole(BILLING_ROLES), validate(outstandingSchema), controller.outstanding);
router.get('/day-close', requireRole(BILLING_ROLES), validate(dayCloseSchema), controller.dayClose);
router.post('/day-close', requireRole(BILLING_ROLES), validate(closeDaySchema), controller.closeDay);
router.get('/day-close/history', requireRole(BILLING_ROLES), validate(dayCloseHistorySchema), controller.dayCloseHistory);
// Undoing a signed-off count is an administrator's decision, like voiding an invoice.
router.post('/day-close/:date/reopen', requireRole(VOID_ROLES), validate(reopenDaySchema), controller.reopenDay);
// Dispensed medicine that never reached an invoice (a failed post-dispense sync). Read-only list for
// staff, plus an admin-triggered retry; the same retry also runs automatically (server.ts).
router.get('/unbilled-dispenses', requireRole(['Admin', 'Receptionist']), controller.unbilledDispenses);
router.post('/unbilled-dispenses/reconcile', requireRole(['Admin']), controller.reconcile);
router.get('/stats', requireRole(READ_ROLES), controller.stats);
// Registered before the /:invoiceId catch-all — same route-ordering rule as every other module.
router.get('/payments', requireRole(READ_ROLES), validate(paymentsListSchema), controller.payments);
router.get('/payments/stats', requireRole(READ_ROLES), validate(paymentsStatsSchema), controller.paymentsStats);

router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.post('/', requireRole(BILLING_ROLES), validate(createSchema), controller.create);
router.get('/:invoiceId', requireRole(READ_ROLES), validate(invoiceIdParamsSchema), controller.getById);
router.get('/:invoiceId/pdf', requireRole(READ_ROLES), validate(invoiceIdParamsSchema), controller.getPdf);
router.post('/:invoiceId/payments', requireRole(BILLING_ROLES), validate(paymentsSchema), controller.recordPayments);
router.post('/:invoiceId/void', requireRole(VOID_ROLES), validate(voidSchema), controller.voidInvoice);

export default router;
