import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

const makePatient = async () => {
  const family = await prisma.family.create({ data: { family_name: `Lab Test Order Family ${runId}-${Math.random()}` } });
  return prisma.patient.create({
    data: {
      patient_id: `PT-LABTO-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      family_id: family.family_id,
      nic: `LABTO-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: 'Lab Test Order Test Patient',
      dob: new Date('1990-01-01'),
      gender: 'Male',
    },
  });
};

const makeDraftConsultation = async (doctorToken: string, doctorId: number) => {
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const patient = await makePatient();
  const appointment = await prisma.appointment.create({
    data: { patient_id: patient.patient_id, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  const consultRes = await request(app)
    .post('/api/v1/consultations')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ appointment_id: appointment.appointment_id, complaint: 'Test visit' });
  return { consultationId: consultRes.body.consultation_id, patientId: patient.patient_id };
};

describe('Lab Test Orders API', () => {
  let doctorToken: string;
  let doctorId: number;
  let adminToken: string;
  let receptionistToken: string;
  let pharmacistToken: string;
  let fbcTestId: number;

  beforeAll(async () => {
    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;

    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const receptionistRes = await request(app).post('/api/v1/auth/login').send({ username: 'reception', password: 'reception123' });
    receptionistToken = receptionistRes.body.token;

    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;

    const fbc = await prisma.labTestCatalog.findUnique({ where: { test_code: 'FBC' } });
    fbcTestId = fbc!.test_id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/lab-test-orders');
    expect(res.status).toBe(401);
  });

  it('rejects order creation from a non-doctor role (business rule #1)', async () => {
    const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
    for (const token of [adminToken, receptionistToken, pharmacistToken]) {
      const res = await request(app)
        .post('/api/v1/lab-test-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ consultation_id: consultationId, test_name: 'Complete Blood Count' });
      expect(res.status).toBe(403);
    }
  });

  it('searches the lab test catalog by code and abbreviation', async () => {
    const byCode = await request(app).get('/api/v1/lab-test-orders/catalog').query({ search: 'FBC' }).set('Authorization', `Bearer ${doctorToken}`);
    expect(byCode.status).toBe(200);
    expect(byCode.body.some((t: any) => t.test_code === 'FBC')).toBe(true);

    const byPartial = await request(app).get('/api/v1/lab-test-orders/catalog').query({ search: 'lipid' }).set('Authorization', `Bearer ${doctorToken}`);
    expect(byPartial.body.some((t: any) => t.test_name === 'Lipid Profile')).toBe(true);
  });

  describe('the full catalogue every installation starts with', () => {
    const search = (q?: string) =>
      request(app).get('/api/v1/lab-test-orders/catalog').query(q ? { search: q } : {}).set('Authorization', `Bearer ${doctorToken}`);

    it('offers the commonly ordered tests before anything is typed', async () => {
      const res = await search();
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(20);
      expect(res.body.every((t: any) => t.is_common)).toBe(true);
      expect(res.body.map((t: any) => t.test_code)).toEqual(expect.arrayContaining(['FBC', 'FBS', 'HBA1C', 'UFR', 'NS1', 'CRP']));
    });

    it('finds tests by everyday words, not just their names', async () => {
      expect((await search('kidney')).body.map((t: any) => t.test_code)).toEqual(expect.arrayContaining(['RFT', 'CREAT']));
      expect((await search('sugar')).body.map((t: any) => t.test_code)).toEqual(expect.arrayContaining(['FBS', 'RBS', 'PPBS']));
      expect((await search('dengue')).body.map((t: any) => t.test_code)).toEqual(expect.arrayContaining(['NS1', 'DENAB']));
    });

    it('matches every word typed, in any order', async () => {
      const codes = (await search('sugar blood')).body.map((t: any) => t.test_code);
      expect(codes).toEqual(expect.arrayContaining(['FBS', 'RBS']));
      expect(codes).not.toContain('USUG'); // urine sugar has no "blood"
    });

    it('puts an exact abbreviation first, then the usual panel', async () => {
      expect((await search('tsh')).body[0].test_code).toBe('TSH');
      expect((await search('cholesterol')).body[0].test_code).toBe('LIPID');
    });

    it('comes with result fields for the common panels', async () => {
      const ufr = (await search('ufr')).body.find((t: any) => t.test_code === 'UFR');
      const params = await request(app).get(`/api/v1/lab-test-orders/catalog/${ufr.test_id}/parameters`).set('Authorization', `Bearer ${doctorToken}`);
      expect(params.body.map((p: any) => p.parameter_name)).toEqual(expect.arrayContaining(['Pus cells', 'Red cells', 'Protein']));
    });
  });

  it("returns a catalog test's configured parameters", async () => {
    const res = await request(app).get(`/api/v1/lab-test-orders/catalog/${fbcTestId}/parameters`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((p: any) => p.parameter_name === 'Haemoglobin')).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
  });

  let labTestOrderId: number;
  let patientId: string;

  it('lets a doctor create a lab test order from the catalog as Pending, with a generated request number', async () => {
    const created = await makeDraftConsultation(doctorToken, doctorId);
    patientId = created.patientId;

    const res = await request(app)
      .post('/api/v1/lab-test-orders')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        consultation_id: created.consultationId,
        catalog_test_id: fbcTestId,
        instructions: 'Fasting sample',
        priority: 'Urgent',
        additional_notes: 'Patient reports fatigue',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Pending');
    expect(res.body.test_name).toBe('Full Blood Count');
    expect(res.body.patient_id).toBe(patientId);
    expect(res.body.doctor_id).toBe(doctorId);
    expect(res.body.consultation_id).toBe(created.consultationId);
    expect(res.body.priority).toBe('Urgent');
    expect(res.body.request_number).toBe(`LAB${String(res.body.lab_test_order_id).padStart(6, '0')}`);

    labTestOrderId = res.body.lab_test_order_id;
  });

  it('lists the pending order for that patient — it must remain visible even though no result exists yet', async () => {
    const res = await request(app).get('/api/v1/lab-test-orders').query({ patientId, status: 'Pending' }).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((o: any) => o.lab_test_order_id === labTestOrderId)).toBe(true);
  });

  it('generates a printable lab test request PDF and stamps printed_at/printed_by', async () => {
    const res = await request(app).get(`/api/v1/lab-test-orders/${labTestOrderId}/print`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');

    const after = await request(app).get(`/api/v1/lab-test-orders/${labTestOrderId}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(after.body.printed_at).toBeTruthy();
    expect(after.body.printed_by_user?.user_id).toBe(doctorId);
    expect(after.body.status).toBe('Pending'); // printing must never change status
  });

  it('rejects a Pharmacist marking a report received (not an authorized clinic-staff role)', async () => {
    const res = await request(app).post(`/api/v1/lab-test-orders/${labTestOrderId}/received`).set('Authorization', `Bearer ${pharmacistToken}`).send({});
    expect(res.status).toBe(403);
  });

  it('lets a Receptionist mark the report received — status becomes "Report Received", with no clinical values involved', async () => {
    const res = await request(app)
      .post(`/api/v1/lab-test-orders/${labTestOrderId}/received`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .field('note', 'Report dropped off at front desk');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Report Received');
    expect(res.body.report_received_by_user?.user_id).not.toBeNull();
    expect(res.body.received_note).toBe('Report dropped off at front desk');
    expect(res.body.result_value).toBeNull();
  });

  it('rejects a Receptionist attempting to complete/enter clinical results (business rule: Reception cannot finalize lab results)', async () => {
    const res = await request(app)
      .post(`/api/v1/lab-test-orders/${labTestOrderId}/complete`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ results: [{ parameter_name: 'Haemoglobin', result_value: '13.5' }] });
    expect(res.status).toBe(403);
  });

  it('rejects completing an order before its report has been received', async () => {
    const created = await makeDraftConsultation(doctorToken, doctorId);
    const orderRes = await request(app)
      .post('/api/v1/lab-test-orders')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: created.consultationId, test_name: 'Fasting Blood Sugar' });
    const pendingId = orderRes.body.lab_test_order_id;

    const res = await request(app)
      .post(`/api/v1/lab-test-orders/${pendingId}/complete`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ results: [{ parameter_name: 'Fasting Blood Glucose', result_value: '95' }] });
    expect(res.status).toBe(400);
  });

  it('lets the doctor enter per-parameter results, add doctor notes/interpretation, and complete the order with automatic flagging', async () => {
    const res = await request(app)
      .post(`/api/v1/lab-test-orders/${labTestOrderId}/complete`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        results: [
          { parameter_name: 'Haemoglobin', unit: 'g/dL', reference_range: '13-17', result_value: '13.5' },
          { parameter_name: 'WBC Count', unit: '×10⁹/L', reference_range: '4-11', result_value: '7.2' },
          { parameter_name: 'Platelets', unit: '×10⁹/L', reference_range: '150-450', result_value: '250' },
          { parameter_name: 'Haemoglobin (low check)', unit: 'g/dL', reference_range: '13-17', result_value: '10.2' },
        ],
        doctor_notes: 'Values largely within normal limits.',
        interpretation: 'No acute concern; routine follow-up.',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Completed');
    expect(res.body.completed_by_user?.user_id).toBe(doctorId);
    expect(res.body.review_notes).toBe('Values largely within normal limits.');
    expect(res.body.interpretation).toBe('No acute concern; routine follow-up.');

    const hb = res.body.results.find((r: any) => r.parameter_name === 'Haemoglobin');
    expect(hb.result_flag).toBe('Normal');
    const low = res.body.results.find((r: any) => r.parameter_name === 'Haemoglobin (low check)');
    expect(low.result_flag).toBe('Low');
  });

  it('generates a lab result report PDF only once the order is Completed', async () => {
    const created = await makeDraftConsultation(doctorToken, doctorId);
    const orderRes = await request(app)
      .post('/api/v1/lab-test-orders')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: created.consultationId, test_name: 'Fasting Blood Sugar' });

    const tooEarly = await request(app).get(`/api/v1/lab-test-orders/${orderRes.body.lab_test_order_id}/result-print`).set('Authorization', `Bearer ${doctorToken}`);
    expect(tooEarly.status).toBe(400);

    const res = await request(app).get(`/api/v1/lab-test-orders/${labTestOrderId}/result-print`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('rejects a Receptionist printing a result report (clinical output restricted to Doctor/Admin)', async () => {
    const res = await request(app).get(`/api/v1/lab-test-orders/${labTestOrderId}/result-print`).set('Authorization', `Bearer ${receptionistToken}`);
    expect(res.status).toBe(403);
  });

  it('re-completing (amending) an order updates the same results rather than creating duplicates', async () => {
    const before = await request(app).get('/api/v1/lab-test-orders').query({ patientId }).set('Authorization', `Bearer ${doctorToken}`);
    const countBefore = before.body.pagination.total;

    const res = await request(app)
      .put(`/api/v1/lab-test-orders/${labTestOrderId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ results: [{ parameter_name: 'Haemoglobin', unit: 'g/dL', reference_range: '13-17', result_value: '13.6' }], doctor_notes: 'Corrected typo.' });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].result_value).toBe('13.6');

    const after = await request(app).get('/api/v1/lab-test-orders').query({ patientId }).set('Authorization', `Bearer ${doctorToken}`);
    expect(after.body.pagination.total).toBe(countBefore);
  });

  it('rejects cancelling a completed order, and allows cancelling a pending one', async () => {
    const rejected = await request(app).post(`/api/v1/lab-test-orders/${labTestOrderId}/cancel`).set('Authorization', `Bearer ${doctorToken}`);
    expect(rejected.status).toBe(400);

    const created = await makeDraftConsultation(doctorToken, doctorId);
    const orderRes = await request(app)
      .post('/api/v1/lab-test-orders')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: created.consultationId, test_name: 'Urine Full Report' });

    const cancelled = await request(app).post(`/api/v1/lab-test-orders/${orderRes.body.lab_test_order_id}/cancel`).set('Authorization', `Bearer ${doctorToken}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('Cancelled');
  });
  describe('front desk entering results, and remembering a typed-in test', () => {
    const typedName = `Vitamin B12 Panel ${runId}`;
    const orderTyped = async (name = typedName) => {
      const created = await makeDraftConsultation(doctorToken, doctorId);
      const res = await request(app).post('/api/v1/lab-test-orders').set('Authorization', `Bearer ${doctorToken}`).send({ consultation_id: created.consultationId, test_name: name });
      expect(res.status).toBe(201);
      return res.body.lab_test_order_id as number;
    };
    const lines = [
      { parameter_name: 'Vitamin B12', unit: 'pg/mL', reference_range: '200-900', result_value: '150' },
      { parameter_name: 'Folate', unit: 'ng/mL', reference_range: '3-17', result_value: '8' },
    ];

    it('lets the front desk type in values for a pending test; it stays with the doctor as Report Received', async () => {
      const id = await orderTyped();
      const res = await request(app).post(`/api/v1/lab-test-orders/${id}/results`).set('Authorization', `Bearer ${receptionistToken}`).send({ results: lines });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Report Received');
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results.find((r: any) => r.parameter_name === 'Vitamin B12').result_flag).toBe('Low');
      // Typing again replaces, never duplicates.
      const again = await request(app).post(`/api/v1/lab-test-orders/${id}/results`).set('Authorization', `Bearer ${receptionistToken}`).send({ results: [lines[0]] });
      expect(again.body.results).toHaveLength(1);
      // The doctor completes it.
      const done = await request(app).post(`/api/v1/lab-test-orders/${id}/complete`).set('Authorization', `Bearer ${doctorToken}`).send({ results: lines, interpretation: 'Low B12' });
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('Completed');
      // Not after it is completed.
      const late = await request(app).post(`/api/v1/lab-test-orders/${id}/results`).set('Authorization', `Bearer ${receptionistToken}`).send({ results: lines });
      expect(late.status).toBe(400);
    });

    it('refuses empty values and a pharmacist', async () => {
      const id = await orderTyped();
      const empty = await request(app).post(`/api/v1/lab-test-orders/${id}/results`).set('Authorization', `Bearer ${receptionistToken}`).send({ results: [{ parameter_name: 'X', result_value: ' ' }] });
      expect(empty.status).toBe(400);
      const pharmacist = await request(app).post(`/api/v1/lab-test-orders/${id}/results`).set('Authorization', `Bearer ${pharmacistToken}`).send({ results: lines });
      expect(pharmacist.status).toBe(403);
    });

    it('saves the parameters of a typed-in test, so the next order of it comes with them', async () => {
      const id = await orderTyped();
      const res = await request(app).post(`/api/v1/lab-test-orders/${id}/results`).set('Authorization', `Bearer ${receptionistToken}`).send({ results: lines, save_parameters: true });
      expect(res.status).toBe(200);
      const testId = res.body.catalog_test_id;
      expect(testId).toBeTruthy();
      const params = await request(app).get(`/api/v1/lab-test-orders/catalog/${testId}/parameters`).set('Authorization', `Bearer ${doctorToken}`);
      expect(params.body.map((p: any) => [p.parameter_name, p.unit, p.reference_range])).toEqual([
        ['Vitamin B12', 'pg/mL', '200-900'],
        ['Folate', 'ng/mL', '3-17'],
      ]);
      expect(res.body.results.every((r: any) => r.parameter_id)).toBe(true);

      // Same name typed again (different case): the same list entry; a new parameter is added, existing ones kept.
      const second = await orderTyped(typedName.toUpperCase());
      const res2 = await request(app)
        .post(`/api/v1/lab-test-orders/${second}/complete`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ results: [{ parameter_name: 'x' , result_value: '' }], save_parameters: true });
      expect(res2.status).toBe(400); // not received yet, nothing saved
      await request(app).post(`/api/v1/lab-test-orders/${second}/results`).set('Authorization', `Bearer ${doctorToken}`).send({ results: [{ parameter_name: 'folate', unit: 'other', result_value: '5' }, { parameter_name: 'Ferritin', unit: 'ng/mL', reference_range: '30-400', result_value: '50' }], save_parameters: true }).expect(200);
      const after = await prisma.labTestParameter.findMany({ where: { test_id: testId }, orderBy: { display_order: 'asc' } });
      expect(after.map((p) => [p.parameter_name, p.unit])).toEqual([
        ['Vitamin B12', 'pg/mL'],
        ['Folate', 'ng/mL'],
        ['Ferritin', 'ng/mL'],
      ]);
      expect((await prisma.labTestOrder.findUniqueOrThrow({ where: { lab_test_order_id: second } })).catalog_test_id).toBe(testId);
      expect(await prisma.labTestCatalog.count({ where: { test_name: { equals: typedName, mode: 'insensitive' } } })).toBe(1);
    });
  });
});
