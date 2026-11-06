import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

// Unpaid balances (FR-074) and the end-of-day cash count (FR-076).

const prisma = new PrismaClient();
const runId = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// A distinct, long-past clinic day per test run, so a close made by one run never collides with the next.
const pastDay = (offset: number) => dateKey(new Date(new Date(1990, 0, 1).getTime() + ((Math.floor(runId / 1000) % 9000) * 3 + offset) * DAY_MS));

// Real invoices always carry line items that add up to the subtotal (the reports reconcile against
// them), so every test invoice gets one consultation-fee line for its full amount.
const feeLine = (amount: number) => ({ items: { create: [{ item_type: 'ConsultationFee', description: 'Consultation fee', unit_price: amount, line_total: amount }] } });

const login = async (username: string, password: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  return res.body.token as string;
};

const makePatient = async (name: string) => {
  const family = await prisma.family.create({ data: { family_name: `FD Family ${runId}-${Math.random()}` } });
  return prisma.patient.create({
    data: {
      patient_id: `PT-FD-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      family_id: family.family_id,
      nic: `FD-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: name,
      dob: new Date('1985-05-05'),
      gender: 'Female',
    },
  });
};

describe('Front desk money tools', () => {
  let receptionToken: string;
  let doctorToken: string;
  let adminToken: string;
  let receptionistId: number;

  beforeAll(async () => {
    receptionToken = await login('reception', 'reception123');
    doctorToken = await login('doctor', 'doctor123');
    adminToken = await login('admin', 'admin123');
    receptionistId = (await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } })).user_id;
  });

  afterAll(async () => {
    await prisma.cashDayClose.deleteMany({ where: { business_date: dateKey(new Date()) } });
    await prisma.$disconnect();
  });

  describe('GET /invoices/outstanding', () => {
    let patientName: string;
    let paidInvoiceId: number;

    beforeAll(async () => {
      patientName = `Balance Patient ${runId}`;
      const patient = await makePatient(patientName);
      const base = { patient_id: patient.patient_id, created_by: receptionistId };
      await prisma.invoice.create({
        data: { ...base, subtotal: 1000, total_amount: 1000, paid_amount: 400, payment_status: 'PartiallyPaid', created_at: new Date(Date.now() - 10 * DAY_MS), ...feeLine(1000) },
      });
      await prisma.invoice.create({ data: { ...base, subtotal: 250, total_amount: 250, paid_amount: 0, payment_status: 'Outstanding', ...feeLine(250) } });
      paidInvoiceId = (await prisma.invoice.create({ data: { ...base, subtotal: 300, total_amount: 300, paid_amount: 300, payment_status: 'Paid', ...feeLine(300) } })).invoice_id;
    });

    it('groups every unpaid invoice under its patient with the balance owed', async () => {
      const res = await request(app).get('/api/v1/invoices/outstanding').query({ search: patientName }).set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      const group = res.body.data[0];
      expect(group.patientName).toBe(patientName);
      expect(group.balance).toBe(850);
      expect(group.totalPaid).toBe(400);
      expect(group.oldestAgeDays).toBe(10);
      expect(group.invoices.map((i: any) => i.balance)).toEqual([600, 250]);
      expect(group.invoices.some((i: any) => i.invoiceId === paidInvoiceId)).toBe(false);
    });

    it('summarises the whole ledger by age of debt', async () => {
      const res = await request(app).get('/api/v1/invoices/outstanding').set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary.totalOutstanding).toBeGreaterThanOrEqual(850);
      const buckets = Object.fromEntries(res.body.summary.aging.map((b: any) => [b.key, b]));
      expect(buckets['8-30'].amount).toBeGreaterThanOrEqual(600);
      expect(buckets.today.amount).toBeGreaterThanOrEqual(250);
    });

    it('filters by the age of the oldest unpaid invoice', async () => {
      const recent = await request(app).get('/api/v1/invoices/outstanding').query({ search: patientName, aging: '1-7' }).set('Authorization', `Bearer ${receptionToken}`);
      expect(recent.body.data).toHaveLength(0);
      const older = await request(app).get('/api/v1/invoices/outstanding').query({ search: patientName, aging: '8-30' }).set('Authorization', `Bearer ${receptionToken}`);
      expect(older.body.data).toHaveLength(1);
    });

    it('is not available to clinical staff', async () => {
      const res = await request(app).get('/api/v1/invoices/outstanding').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('end-of-day cash count', () => {
    it('shows every payment method for a day, with nothing expected on a quiet day', async () => {
      const res = await request(app).get('/api/v1/invoices/day-close').query({ date: pastDay(0) }).set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(200);
      expect(res.body.close).toBeNull();
      expect(res.body.methods[0]).toMatchObject({ method: 'Cash', net: 0 });
      expect(res.body.totals.net).toBe(0);
    });

    it('closes a day whose count matches, and refuses to close it twice', async () => {
      const body = { date: pastDay(0), opening_float: 5000, counted: [{ method: 'Cash', amount: 5000 }], denominations: { '5000': 1 } };
      const res = await request(app).post('/api/v1/invoices/day-close').set('Authorization', `Bearer ${receptionToken}`).send(body);
      expect(res.status).toBe(201);
      expect(res.body.varianceTotal).toBe(0);
      expect(res.body.closedBy).toBe('reception');
      expect(res.body.denominations).toEqual({ '5000': 1 });

      const again = await request(app).post('/api/v1/invoices/day-close').set('Authorization', `Bearer ${receptionToken}`).send(body);
      expect(again.status).toBe(409);

      const shown = await request(app).get('/api/v1/invoices/day-close').query({ date: pastDay(0) }).set('Authorization', `Bearer ${receptionToken}`);
      expect(shown.body.close.closeId).toBe(res.body.closeId);
      expect(shown.body.changedSinceClose).toBeNull();

      const audit = await prisma.auditLog.findFirst({ where: { entity: 'CashDayClose', entity_id: String(res.body.closeId), action: 'CLOSE_DAY' } });
      expect(audit).not.toBeNull();
    });

    it('requires a note when the count does not match', async () => {
      const body = { date: pastDay(1), opening_float: 1000, counted: [{ method: 'Cash', amount: 900 }] };
      const missing = await request(app).post('/api/v1/invoices/day-close').set('Authorization', `Bearer ${receptionToken}`).send(body);
      expect(missing.status).toBe(400);
      expect(missing.body.message).toMatch(/note/i);

      const res = await request(app)
        .post('/api/v1/invoices/day-close')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ ...body, notes: 'Gave 100 change from the drawer for the canteen' });
      expect(res.status).toBe(201);
      expect(res.body.varianceTotal).toBe(-100);
      expect(res.body.lines[0]).toMatchObject({ method: 'Cash', expected: 1000, counted: 900, variance: -100 });
    });

    it('rejects a note-and-coin breakdown that does not add up to the counted cash', async () => {
      const res = await request(app)
        .post('/api/v1/invoices/day-close')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ date: pastDay(2), opening_float: 2000, counted: [{ method: 'Cash', amount: 2000 }], denominations: { '1000': 1, '500': 1 } });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/add up to 1500\.00/);
    });

    it('rejects impossible, future and unknown inputs', async () => {
      const auth = { Authorization: `Bearer ${receptionToken}` };
      const tomorrow = dateKey(new Date(Date.now() + DAY_MS));
      expect((await request(app).get('/api/v1/invoices/day-close').query({ date: '2026-02-31' }).set(auth)).status).toBe(400);
      expect((await request(app).get('/api/v1/invoices/day-close').query({ date: tomorrow }).set(auth)).status).toBe(400);
      const unknown = await request(app)
        .post('/api/v1/invoices/day-close')
        .set(auth)
        .send({ date: pastDay(2), counted: [{ method: 'Seashells', amount: 0 }] });
      expect(unknown.status).toBe(400);
    });

    it('expects what was actually taken today, and flags payments recorded after the close', async () => {
      const today = dateKey(new Date());
      await prisma.cashDayClose.deleteMany({ where: { business_date: today } });

      const patient = await makePatient(`Cash Count Patient ${runId}`);
      const invoice = await prisma.invoice.create({
        data: { patient_id: patient.patient_id, created_by: receptionistId, subtotal: 500, total_amount: 500, payment_status: 'Outstanding', ...feeLine(500) },
      });
      const auth = { Authorization: `Bearer ${receptionToken}` };
      await request(app).post(`/api/v1/invoices/${invoice.invoice_id}/payments`).set(auth).send({ payments: [{ method: 'Cash', amount: 200 }] }).expect(200);

      const before = await request(app).get('/api/v1/invoices/day-close').query({ date: today }).set(auth);
      expect(before.body.isToday).toBe(true);
      const cash = before.body.methods.find((m: any) => m.method === 'Cash');
      expect(cash.received).toBeGreaterThanOrEqual(200);

      // Every method with money in it must be counted — leaving one out is refused.
      const nonZero = before.body.methods.filter((m: any) => m.net !== 0);
      const incomplete = await request(app).post('/api/v1/invoices/day-close').set(auth).send({ date: today, counted: [] });
      expect(incomplete.status).toBe(400);

      const closed = await request(app)
        .post('/api/v1/invoices/day-close')
        .set(auth)
        .send({ date: today, counted: nonZero.map((m: any) => ({ method: m.method, amount: m.net })) });
      expect(closed.status).toBe(201);
      expect(closed.body.varianceTotal).toBe(0);

      await request(app).post(`/api/v1/invoices/${invoice.invoice_id}/payments`).set(auth).send({ payments: [{ method: 'Cash', amount: 50 }] }).expect(200);
      const after = await request(app).get('/api/v1/invoices/day-close').query({ date: today }).set(auth);
      expect(after.body.changedSinceClose).toEqual({ paymentsAdded: 1, refundsAdded: 0, netDifference: 50 });

      const history = await request(app).get('/api/v1/invoices/day-close/history').set(auth);
      expect(history.status).toBe(200);
      expect(history.body.data[0].date).toBe(today);
    });

    it('is not available to clinical staff', async () => {
      const res = await request(app).get('/api/v1/invoices/day-close').query({ date: pastDay(0) }).set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('reopening a closed day', () => {
    const day = pastDay(10);
    const close = (token: string, amount: number, notes?: string) =>
      request(app).post('/api/v1/invoices/day-close').set('Authorization', `Bearer ${token}`).send({ date: day, opening_float: 1000, counted: [{ method: 'Cash', amount }], notes });
    const reopen = (token: string, reason: string, date = day) =>
      request(app).post(`/api/v1/invoices/day-close/${date}/reopen`).set('Authorization', `Bearer ${token}`).send({ reason });

    it('is for administrators only, and needs a reason', async () => {
      const first = await close(receptionToken, 900, 'Short 100, not found');
      expect(first.status).toBe(201);

      expect((await reopen(receptionToken, 'The drawer was miscounted')).status).toBe(403);
      expect((await reopen(adminToken, '')).status).toBe(400);
      expect((await reopen(adminToken, 'no')).status).toBe(400);
    });

    it('removes the close but keeps what was counted, so the day can be counted again', async () => {
      const res = await reopen(adminToken, 'The missing 100 was found in the card machine tray');
      expect(res.status).toBe(200);
      expect(res.body.reopenedBy).toBe('admin');
      expect(res.body.previous).toMatchObject({ date: day, countedTotal: 900, varianceTotal: -100, closedBy: 'reception', notes: 'Short 100, not found' });

      const view = await request(app).get('/api/v1/invoices/day-close').query({ date: day }).set('Authorization', `Bearer ${receptionToken}`);
      expect(view.body.close).toBeNull();
      expect(view.body.reopens).toHaveLength(1);
      expect(view.body.reopens[0].reason).toBe('The missing 100 was found in the card machine tray');

      const again = await close(receptionToken, 1000);
      expect(again.status).toBe(201);
      const after = await request(app).get('/api/v1/invoices/day-close').query({ date: day }).set('Authorization', `Bearer ${receptionToken}`);
      expect(after.body.close.varianceTotal).toBe(0);
      expect(after.body.reopens).toHaveLength(1);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'REOPEN_DAY', entity: 'CashDayClose', entity_id: String(res.body.previous.closeId) } });
      expect(audit).not.toBeNull();
    });

    it('cannot reopen a day that is not closed', async () => {
      expect((await reopen(adminToken, 'Nothing to reopen here', pastDay(11))).status).toBe(404);
    });
  });
});
