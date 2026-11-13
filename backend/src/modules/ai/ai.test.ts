import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import app from '../../app';
import { __setAiClientForTests, buildClinicalExtract, PatientSummary } from './service';

// AI pre-consultation summary. Claude is never called here: a fake client stands in for the SDK
// and records what it was sent, so the tests also check that no identifiers leave the clinic.

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const login = async (username: string, password: string) => (await request(app).post('/api/v1/auth/login').send({ username, password })).body.token as string;

const SAMPLE: PatientSummary = {
  overview: '52-year-old woman with type 2 diabetes, seen twice this year.',
  activeProblems: [{ problem: 'Type 2 diabetes', since: '2026-01-10', basis: 'Diagnosis at visit 2026-01-10' }],
  currentMedications: [{ name: 'Metformin', details: '500 mg twice daily since 2026-01-10' }],
  allergies: ['Penicillin'],
  recentVisits: [{ date: '2026-01-10', summary: 'Polyuria; diagnosed T2DM; metformin started' }],
  labHighlights: [{ date: '2026-01-10', test: 'FBS', finding: '182 mg/dL (High)' }],
  pointsToCheck: [{ point: 'Follow-up was due', reason: 'Follow-up date 2026-02-10 has passed' }],
};

const fakeClient = (respond: (args: any) => any) => {
  const calls: any[] = [];
  const parse = jest.fn(async (args: any) => {
    calls.push(args);
    return respond(args);
  });
  return { client: { beta: { messages: { parse } } } as any, calls, parse };
};

const ok = () => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', parsed_output: SAMPLE, usage: { input_tokens: 1200, output_tokens: 300 } });

describe('AI patient summary', () => {
  let doctorToken: string;
  let receptionToken: string;
  let patientId: string;
  const env = { ...process.env };

  beforeAll(async () => {
    doctorToken = await login('doctor', 'doctor123');
    receptionToken = await login('reception', 'reception123');
    const doctor = await prisma.user.findUniqueOrThrow({ where: { username: 'doctor' } });
    const family = await prisma.family.create({ data: { family_name: `AI Family ${runId}` } });
    const patient = await prisma.patient.create({
      data: {
        patient_id: `PT-AI-${runId}`,
        family_id: family.family_id,
        nic: `AI-NIC-${runId}`,
        full_name: `Kamala Secretname ${runId}`,
        phone: '0771234567',
        dob: new Date('1974-03-15'),
        gender: 'Female',
        allergies: 'Penicillin',
        chronic_conditions: 'Hypertension',
        emergency_contact_name: 'Sunil Hiddenname',
      },
    });
    patientId = patient.patient_id;
    const appointment = await prisma.appointment.create({ data: { patient_id: patientId, doctor_id: doctor.user_id, created_by: doctor.user_id, scheduled_at: new Date('2026-01-10T09:00:00Z'), status: 'Completed' } });
    const consultation = await prisma.consultation.create({
      data: {
        appointment_id: appointment.appointment_id,
        complaint: 'Polyuria for 2 weeks',
        diagnosis: 'Type 2 diabetes mellitus',
        vitals_json: JSON.stringify({ bp: '142/90', weight: 71 }),
        follow_up_date: new Date('2026-02-10'),
        status: 'Finalized',
        created_at: new Date('2026-01-10T09:10:00Z'),
        finalized_at: new Date('2026-01-10T09:25:00Z'),
      },
    });
    await prisma.labTestOrder.create({
      data: {
        patient_id: patientId,
        doctor_id: doctor.user_id,
        consultation_id: consultation.consultation_id,
        test_name: 'Fasting blood sugar',
        status: 'Completed',
        order_date: new Date('2026-01-10T09:20:00Z'),
        results: { create: [{ parameter_name: 'FBS', result_value: '182', unit: 'mg/dL', result_flag: 'High', entered_by: doctor.user_id }] },
      },
    });
  });

  beforeEach(() => {
    process.env.AI_FEATURES_ENABLED = 'true';
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterAll(async () => {
    process.env = env;
    __setAiClientForTests(null);
    await prisma.aiPatientSummary.deleteMany({ where: { patient_id: patientId } });
    await prisma.$disconnect();
  });

  it('reports whether AI is enabled', async () => {
    const on = await request(app).get('/api/v1/ai/status').set('Authorization', `Bearer ${doctorToken}`);
    expect(on.body.enabled).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
    const off = await request(app).get('/api/v1/ai/status').set('Authorization', `Bearer ${doctorToken}`);
    expect(off.body.enabled).toBe(false);
  });

  it('refuses when AI is switched off, without calling Claude', async () => {
    process.env.AI_FEATURES_ENABLED = 'false';
    const fake = fakeClient(ok);
    __setAiClientForTests(fake.client);
    const res = await request(app).post(`/api/v1/ai/patients/${patientId}/summary`).set('Authorization', `Bearer ${doctorToken}`).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AI_DISABLED');
    expect(fake.parse).not.toHaveBeenCalled();
  });

  it('is for doctors and admins only', async () => {
    const res = await request(app).post(`/api/v1/ai/patients/${patientId}/summary`).set('Authorization', `Bearer ${receptionToken}`).send({});
    expect(res.status).toBe(403);
  });

  it('builds a de-identified extract', async () => {
    const extract = await buildClinicalExtract(patientId, new Date('2026-11-06T00:00:00Z'));
    const text = JSON.stringify(extract);
    for (const secret of ['Secretname', 'Hiddenname', '0771234567', `AI-NIC-${runId}`, patientId, '1974-03-15']) {
      expect(text).not.toContain(secret);
    }
    expect(extract.patient).toMatchObject({ age: 52, sex: 'Female', allergies: 'Penicillin', chronicConditions: 'Hypertension' });
    expect(extract.visits[0]).toMatchObject({ date: '2026-01-10', diagnosis: 'Type 2 diabetes mellitus', vitals: { bp: '142/90', weight: 71 } });
    expect(extract.labTests[0].results[0]).toMatchObject({ parameter: 'FBS', value: '182', flag: 'High' });
  });

  it('writes a summary, stores it with token usage, and audits it', async () => {
    const fake = fakeClient(ok);
    __setAiClientForTests(fake.client);
    const res = await request(app).post(`/api/v1/ai/patients/${patientId}/summary`).set('Authorization', `Bearer ${doctorToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cached: false, summary: SAMPLE, basedOn: { visits: 1, labTests: 1 } });

    const sent = fake.calls[0];
    expect(sent.model).toBe('claude-opus-5-5');
    expect(sent.fallbacks).toBe('default');
    expect(JSON.stringify(sent.messages)).not.toContain('Secretname');

    const row = await prisma.aiPatientSummary.findFirstOrThrow({ where: { patient_id: patientId } });
    expect(row).toMatchObject({ input_tokens: 1200, output_tokens: 300 });
    expect(await prisma.auditLog.count({ where: { action: 'AI_SUMMARY', entity_id: patientId } })).toBeGreaterThan(0);
  });

  it('reuses the stored summary while the record is unchanged, and regenerates on refresh', async () => {
    const fake = fakeClient(ok);
    __setAiClientForTests(fake.client);
    const again = await request(app).post(`/api/v1/ai/patients/${patientId}/summary`).set('Authorization', `Bearer ${doctorToken}`).send({});
    expect(again.body.cached).toBe(true);
    expect(fake.parse).not.toHaveBeenCalled();

    const fresh = await request(app).post(`/api/v1/ai/patients/${patientId}/summary`).set('Authorization', `Bearer ${doctorToken}`).send({ refresh: true });
    expect(fresh.body.cached).toBe(false);
    expect(fake.parse).toHaveBeenCalledTimes(1);
  });

  it('writes a new summary once the record changes', async () => {
    await prisma.patient.update({ where: { patient_id: patientId }, data: { allergies: 'Penicillin, sulfa drugs' } });
    const fake = fakeClient(ok);
    __setAiClientForTests(fake.client);
    const res = await request(app).post(`/api/v1/ai/patients/${patientId}/summary`).set('Authorization', `Bearer ${doctorToken}`).send({});
    expect(res.body.cached).toBe(false);
    expect(fake.parse).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal as 422 and stores nothing', async () => {
    await prisma.patient.update({ where: { patient_id: patientId }, data: { blood_group: 'O+' } });
    __setAiClientForTests(fakeClient(() => ({ ...ok(), stop_reason: 'refusal', parsed_output: null })).client);
    const before = await prisma.aiPatientSummary.count({ where: { patient_id: patientId } });
    const res = await request(app).post(`/api/v1/ai/patients/${patientId}/summary`).set('Authorization', `Bearer ${doctorToken}`).send({});
    expect(res.status).toBe(422);
    expect(await prisma.aiPatientSummary.count({ where: { patient_id: patientId } })).toBe(before);
  });

  it('turns API errors into a friendly 503', async () => {
    __setAiClientForTests(
      fakeClient(() => {
        throw new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'slow down', new Headers());
      }).client,
    );
    const res = await request(app).post(`/api/v1/ai/patients/${patientId}/summary`).set('Authorization', `Bearer ${doctorToken}`).send({ refresh: true });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/busy/);
  });

  it('404s for an unknown patient', async () => {
    __setAiClientForTests(fakeClient(ok).client);
    const res = await request(app).post('/api/v1/ai/patients/PT-NOPE-0/summary').set('Authorization', `Bearer ${doctorToken}`).send({});
    expect(res.status).toBe(404);
  });
});
