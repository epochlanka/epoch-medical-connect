import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';
import { mergeChronicConditions } from './conditions';

// Fixes from the doctor-side walkthrough: a visit cannot be finalized without a reason for the
// visit (from any page), and conditions recorded at registration show up during the visit.

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe('Doctor visit rules', () => {
  let doctorToken: string;
  let doctorId: number;
  let receptionId: number;

  const visitFor = async (tag: string, patientData: { chronic_conditions?: string } = {}) => {
    const family = await prisma.family.create({ data: { family_name: `Flow ${tag} ${runId}` } });
    const patient = await prisma.patient.create({
      data: { patient_id: `PT-FLOW-${tag}-${runId}`, family_id: family.family_id, full_name: 'Flow Test', dob: new Date('1970-01-01'), gender: 'Female', ...patientData },
    });
    const appointment = await prisma.appointment.create({
      data: { patient_id: patient.patient_id, doctor_id: doctorId, created_by: receptionId, scheduled_at: new Date(), status: 'Consulting' },
    });
    return { patient, appointment };
  };

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = res.body.token;
    doctorId = res.body.user.id;
    receptionId = (await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } })).user_id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('refuses to finalize a visit with no reason for the visit, then accepts it once recorded', async () => {
    const { appointment } = await visitFor('NOREASON');
    const created = await request(app).post('/api/v1/consultations').set('Authorization', `Bearer ${doctorToken}`).send({ appointment_id: appointment.appointment_id, complaint: '   ' });
    const id = created.body.consultation_id;

    const refused = await request(app).post(`/api/v1/consultations/${id}/finalize`).set('Authorization', `Bearer ${doctorToken}`);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/reason for the visit/i);
    expect((await prisma.consultation.findUniqueOrThrow({ where: { consultation_id: id } })).status).toBe('Draft');

    await request(app).put(`/api/v1/consultations/${id}`).set('Authorization', `Bearer ${doctorToken}`).send({ complaint: 'Cough for a week' }).expect(200);
    const ok = await request(app).post(`/api/v1/consultations/${id}/finalize`).set('Authorization', `Bearer ${doctorToken}`);
    expect(ok.status).toBe(200);
  });

  it('shows conditions recorded at registration alongside those added at visits', async () => {
    const { appointment } = await visitFor('COND', { chronic_conditions: 'Type 2 diabetes, Hypertension' });
    const res = await request(app).get(`/api/v1/consultations/context/${appointment.appointment_id}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.patientSummary.chronicConditions).toEqual(['Type 2 diabetes', 'Hypertension']);
  });

  it('merges both sources without repeating a condition', () => {
    expect(mergeChronicConditions('Asthma; hypertension', [JSON.stringify(['Hypertension', 'CKD']), null, 'not json'])).toEqual(['Asthma', 'hypertension', 'CKD']);
    expect(mergeChronicConditions(null, [])).toEqual([]);
  });
});
