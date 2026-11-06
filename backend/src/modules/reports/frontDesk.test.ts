import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const login = async (username: string, password: string) => (await request(app).post('/api/v1/auth/login').send({ username, password })).body.token as string;

describe('GET /reports/front-desk', () => {
  // A long-past day of its own per run, so other tests' appointments never land in it.
  const day = new Date(new Date(1995, 0, 1).getTime() + (Math.floor(runId / 1000) % 9000) * DAY_MS);
  const key = dateKey(day);
  const at = (hour: number, minute = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);

  let receptionToken: string;

  beforeAll(async () => {
    receptionToken = await login('reception', 'reception123');
    const doctor = await prisma.user.findUniqueOrThrow({ where: { username: 'doctor' } });
    const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
    const family = await prisma.family.create({ data: { family_name: `FD Report Family ${runId}` } });
    const patient = await prisma.patient.create({
      data: { patient_id: `PT-FDR-${runId}`, family_id: family.family_id, nic: `FDR-NIC-${runId}`, full_name: 'Report Patient', dob: new Date('1970-01-01'), gender: 'Male' },
    });

    const visit = async (scheduledAt: Date, extra: Record<string, unknown>, consult?: { openedAfterMin: number; tookMin: number }) => {
      const appt = await prisma.appointment.create({
        data: { patient_id: patient.patient_id, doctor_id: doctor.user_id, scheduled_at: scheduledAt, created_by: receptionist.user_id, ...extra },
      });
      if (consult) {
        const opened = new Date(scheduledAt.getTime() + consult.openedAfterMin * MIN_MS);
        await prisma.consultation.create({
          data: { appointment_id: appt.appointment_id, status: 'Finalized', created_at: opened, finalized_at: new Date(opened.getTime() + consult.tookMin * MIN_MS) },
        });
      }
    };

    await visit(at(9), { status: 'Completed' }, { openedAfterMin: 20, tookMin: 10 });
    await visit(at(9, 30), { status: 'Completed', is_walk_in: true }, { openedAfterMin: 40, tookMin: 14 });
    await visit(at(11), { status: 'No Show', visit_type: 'Follow-up' });
    await visit(at(15), { status: 'Cancelled' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('counts the day’s visits and the queue’s throughput', async () => {
    const res = await request(app).get('/api/v1/reports/front-desk').query({ from: key, to: key }).set('Authorization', `Bearer ${receptionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({
      date: key,
      visits: 3,
      booked: 2,
      walkIns: 1,
      followUps: 1,
      completed: 2,
      noShows: 1,
      cancelled: 1,
      medianWaitMinutes: 30,
      medianConsultMinutes: 12,
    });
    expect(res.body.summary).toMatchObject({ totalVisits: 3, completed: 2, completionRatePct: 67, peakHour: '09:00' });
    expect(res.body.byDoctor[0]).toMatchObject({ doctor: 'doctor', visits: 3, completed: 2 });
    expect(res.body.byHour).toEqual([
      { hour: 9, label: '09:00', visits: 2 },
    ]);
  });

  it('carries no revenue or stock figures', async () => {
    const res = await request(app).get('/api/v1/reports/front-desk').query({ from: key, to: key }).set('Authorization', `Bearer ${receptionToken}`);
    expect(JSON.stringify(res.body)).not.toMatch(/revenue|amount|profit|stock/i);
  });

  it('exports as CSV', async () => {
    const res = await request(app).get('/api/v1/reports/front-desk').query({ from: key, to: key, format: 'csv' }).set('Authorization', `Bearer ${receptionToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toMatch(/^Date,Visits,Booked/);
  });

  it('refuses ranges longer than a year', async () => {
    const res = await request(app).get('/api/v1/reports/front-desk').query({ from: '2020-01-01', to: '2022-01-01' }).set('Authorization', `Bearer ${receptionToken}`);
    expect(res.status).toBe(400);
  });

  it('is limited to the front desk and administrators', async () => {
    for (const [user, password] of [
      ['doctor', 'doctor123'],
      ['pharmacist', 'pharmacist123'],
    ]) {
      const res = await request(app).get('/api/v1/reports/front-desk').set('Authorization', `Bearer ${await login(user, password)}`);
      expect(res.status).toBe(403);
    }
    const admin = await request(app).get('/api/v1/reports/front-desk').set('Authorization', `Bearer ${await login('admin', 'admin123')}`);
    expect(admin.status).toBe(200);
  });
});
