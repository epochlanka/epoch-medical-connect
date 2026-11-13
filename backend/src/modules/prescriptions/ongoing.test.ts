import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';
import { getCurrentMedications, getOngoingMedications } from './currentMedications';

// The prescription page's "Ongoing medicines" panel: which medicines count as running, due a
// refill or recently ended; the long-term flag; and the doctor's Stop / undo.

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const DAY_MS = 86_400_000;
const NOW = new Date('2026-11-13T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

describe('Ongoing medicines', () => {
  let doctorToken: string;
  let doctorId: number;
  let receptionId: number;
  let pharmacistToken: string;
  let patientId: string;
  let otherPatientId: string;
  const meds: Record<string, number> = {};

  const makePatient = async (tag: string) => {
    const family = await prisma.family.create({ data: { family_name: `Ongoing ${tag} ${runId}` } });
    const p = await prisma.patient.create({
      data: { patient_id: `PT-ONG-${tag}-${runId}`, family_id: family.family_id, nic: `ONG-${tag}-${runId}`, full_name: 'Ongoing Test', dob: new Date('1960-01-01'), gender: 'Male' },
    });
    return p.patient_id;
  };

  // A past visit with one prescription issued on the given date.
  const visit = async (pid: string, issuedAt: Date, lines: { med: string; duration: string | null; longTerm?: boolean; frequency?: string }[], external: { name: string; duration: string; longTerm?: boolean }[] = []) => {
    const appointment = await prisma.appointment.create({ data: { patient_id: pid, doctor_id: doctorId, created_by: receptionId, scheduled_at: issuedAt, status: 'Completed' } });
    const consultation = await prisma.consultation.create({ data: { appointment_id: appointment.appointment_id, status: 'Finalized', created_at: issuedAt, finalized_at: issuedAt } });
    const rx = await prisma.prescription.create({
      data: {
        consultation_id: consultation.consultation_id,
        issued_at: issuedAt,
        status: 'Collected',
        items: {
          create: lines.map((l) => ({
            medicine_id: meds[l.med],
            dosage: '1 tab',
            dose_qty: 1,
            frequency: l.frequency ?? 'OD - Once Daily',
            duration: l.duration,
            qty: 30,
            is_long_term: !!l.longTerm,
          })),
        },
      },
    });
    for (const e of external) {
      await prisma.externalPrescriptionMedicine.create({
        data: { prescription_id: rx.prescription_id, patient_id: pid, doctor_id: doctorId, medicine_name: e.name, dosage_form: 'Tablet', dosage: '10 mg', dose_qty: 1, frequency: 'OD', duration: e.duration, quantity: 30, quantity_unit: 'Tablet', is_long_term: !!e.longTerm },
      });
    }
    return consultation.consultation_id;
  };

  beforeAll(async () => {
    const login = async (u: string, p: string) => (await request(app).post('/api/v1/auth/login').send({ username: u, password: p })).body;
    const doc = await login('doctor', 'doctor123');
    doctorToken = doc.token;
    doctorId = doc.user.id;
    pharmacistToken = (await login('pharmacist', 'pharmacist123')).token;
    receptionId = (await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } })).user_id;

    for (const name of ['Metformin', 'Amlodipine', 'Amoxicillin', 'Losartan', 'Omeprazole', 'Atenolol', 'Paracetamol']) {
      const m = await prisma.medicine.create({ data: { name: `${name} ONG ${runId}`, generic_name: name.toLowerCase(), base_unit: 'Tablet' } });
      meds[name] = m.medicine_id;
    }

    patientId = await makePatient('A');
    otherPatientId = await makePatient('B');

    // Older courses first, so the newest course for Metformin is the one that counts.
    await visit(patientId, daysAgo(120), [{ med: 'Metformin', duration: '7 Days' }]);
    // Monthly, marked long-term, ran out 2 days ago -> due.
    await visit(patientId, daysAgo(32), [
      { med: 'Metformin', duration: '30 Days', longTerm: true },
      // Ordinary 30-day course, ran out 2 days ago -> recently ended.
      { med: 'Losartan', duration: '30 Days' },
    ]);
    // Still running (10 days left).
    await visit(patientId, daysAgo(20), [{ med: 'Amlodipine', duration: '1 Month' }], [{ name: `Atorvastatin ONG ${runId}`, duration: '30 Days', longTerm: true }]);
    // An acute course that ended 3 months ago -> not shown.
    await visit(patientId, daysAgo(100), [{ med: 'Amoxicillin', duration: '5 Days' }]);
    // "Ongoing" text, 200 days ago -> long-term, due for re-confirming.
    await visit(patientId, daysAgo(200), [{ med: 'Omeprazole', duration: 'Ongoing' }]);
    // Long-term but over a year ago -> outside the look-back.
    await visit(patientId, daysAgo(400), [{ med: 'Atenolol', duration: '30 Days', longTerm: true }]);
  });

  afterAll(async () => {
    await prisma.medicationStop.deleteMany({ where: { patient_id: { in: [patientId, otherPatientId] } } });
    await prisma.$disconnect();
  });

  const byName = (list: { name: string }[], med: string) => list.find((m) => m.name.startsWith(med));

  it('sorts each medicine into running, due or recently ended', async () => {
    const { medicines } = await getOngoingMedications(patientId, { now: NOW });
    expect(byName(medicines, 'Metformin')).toMatchObject({ status: 'due', longTerm: true, markedLongTerm: true, daysLeft: -2, duration: '30 Days', doseQty: 1, genericName: 'metformin' });
    expect(byName(medicines, 'Losartan')).toMatchObject({ status: 'ended', longTerm: false, daysLeft: -2 });
    expect(byName(medicines, 'Amlodipine')).toMatchObject({ status: 'running', daysLeft: 10 });
    expect(byName(medicines, 'Atorvastatin')).toMatchObject({ status: 'running', outside: true, longTerm: true, quantityUnit: 'Tablet' });
    expect(byName(medicines, 'Omeprazole')).toMatchObject({ status: 'due', longTerm: true, markedLongTerm: false, endsAt: null });
    expect(byName(medicines, 'Amoxicillin')).toBeUndefined();
    expect(byName(medicines, 'Atenolol')).toBeUndefined();
  });

  it('counts due long-term medicines as current in the summaries, but not ended courses', async () => {
    const { current } = await getCurrentMedications(patientId, { now: NOW });
    const names = current.map((c) => c.name);
    expect(names.some((n) => n.startsWith('Metformin'))).toBe(true);
    expect(names.some((n) => n.startsWith('Omeprazole'))).toBe(true);
    expect(names.some((n) => n.startsWith('Losartan'))).toBe(false);
  });

  it('saves the long-term flag on clinic and outside lines', async () => {
    const appointment = await prisma.appointment.create({ data: { patient_id: otherPatientId, doctor_id: doctorId, created_by: receptionId, scheduled_at: new Date(), status: 'Consulting' } });
    const consult = await request(app).post('/api/v1/consultations').set('Authorization', `Bearer ${doctorToken}`).send({ appointment_id: appointment.appointment_id, complaint: 'Test visit' });
    const consultationId = consult.body.consultation_id;
    const rx = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: consultationId, items: [{ medicine_id: meds.Metformin, dosage: '500 mg', dose_qty: 1, frequency: 'BD', duration: '2 Months', qty: 120, is_long_term: true }] });
    expect(rx.status).toBe(201);
    expect(rx.body.items[0].is_long_term).toBe(true);

    const ext = await request(app)
      .post(`/api/v1/external-medicines/prescription/${rx.body.prescription_id}/bulk`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ items: [{ medicine_name: 'Insulin glargine', dosage_form: 'Injection', dosage: '10 units', frequency: 'ON', duration: '1 Month', quantity: 1, quantity_unit: 'Pen', is_long_term: true }] });
    expect(ext.status).toBe(201);
    expect(ext.body[0].isLongTerm).toBe(true);
  });

  it('lists ongoing medicines on the prescription page, leaving out today’s visit', async () => {
    const appointment = await prisma.appointment.create({ data: { patient_id: patientId, doctor_id: doctorId, created_by: receptionId, scheduled_at: new Date(), status: 'Consulting' } });
    const consult = await request(app).post('/api/v1/consultations').set('Authorization', `Bearer ${doctorToken}`).send({ appointment_id: appointment.appointment_id, complaint: 'Test visit' });
    const res = await request(app).get(`/api/v1/prescriptions/context/${consult.body.consultation_id}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.ongoingMedications)).toBe(true);
    // The fixtures are dated relative to 13 Nov 2026; whatever today is, Metformin (long-term) is listed.
    expect(byName(res.body.ongoingMedications, 'Metformin')).toBeTruthy();
    expect(res.body.ongoingMedications.every((m: any) => m.consultationId !== consult.body.consultation_id)).toBe(true);
  });

  it('stops a medicine, hides it, and brings it back on undo', async () => {
    const name = `Amlodipine ONG ${runId}`;
    const denied = await request(app).post('/api/v1/prescriptions/medication-stops').set('Authorization', `Bearer ${pharmacistToken}`).send({ patient_id: patientId, medicine_name: name });
    expect(denied.status).toBe(403);

    const stop = await request(app)
      .post('/api/v1/prescriptions/medication-stops')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ patient_id: patientId, medicine_name: name, reason: 'BP controlled on diet' });
    expect(stop.status).toBe(201);
    expect(await prisma.auditLog.count({ where: { action: 'STOP_MEDICATION', entity_id: patientId } })).toBeGreaterThan(0);

    // Stops are recorded "now", after every fixture course, so the medicine is hidden.
    let { medicines } = await getOngoingMedications(patientId, { now: NOW });
    expect(byName(medicines, 'Amlodipine')).toBeUndefined();
    // Stopping one patient's medicine leaves other medicines alone.
    expect(byName(medicines, 'Metformin')).toBeTruthy();

    const undo = await request(app).delete(`/api/v1/prescriptions/medication-stops/${stop.body.stopId}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(undo.status).toBe(204);
    ({ medicines } = await getOngoingMedications(patientId, { now: NOW }));
    expect(byName(medicines, 'Amlodipine')).toBeTruthy();
  });

  it('shows a stopped medicine again once it is prescribed after the stop', async () => {
    await prisma.medicationStop.create({ data: { patient_id: patientId, medicine_key: `losartan ong ${runId}`, medicine_name: `Losartan ONG ${runId}`, stopped_by: doctorId, stopped_at: daysAgo(10) } });
    let { medicines } = await getOngoingMedications(patientId, { now: NOW });
    expect(byName(medicines, 'Losartan')).toBeUndefined();

    await visit(patientId, daysAgo(5), [{ med: 'Losartan', duration: '30 Days', longTerm: true }]);
    ({ medicines } = await getOngoingMedications(patientId, { now: NOW }));
    expect(byName(medicines, 'Losartan')).toMatchObject({ status: 'running', daysLeft: 25 });
  });

  it('rejects a stop for an unknown patient', async () => {
    const res = await request(app).post('/api/v1/prescriptions/medication-stops').set('Authorization', `Bearer ${doctorToken}`).send({ patient_id: 'PT-NOPE', medicine_name: 'X' });
    expect(res.status).toBe(404);
  });
});
