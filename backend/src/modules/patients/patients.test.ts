import request from 'supertest';
import app from '../../app';

// Unique per test run so re-running against the same persistent dev DB never collides on NIC
// or trips the fuzzy-duplicate detector against leftover patients from earlier runs.
const runId = Date.now();
const nic = (n: number) => `PT-TEST-NIC-${runId}-${n}`;
// Deterministic-but-unique DOB per (run, slot) — keeps a fuzzy-match pair sharing the same DOB
// within one run, while different runs land on different DOBs.
const runDob = (slot: number) => {
  const daysOffset = (runId + slot * 104729) % 7300; // ~20 year spread
  const date = new Date(new Date(1980, 0, 1).getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};
// Unique per test run so the search test (which relies on default `limit: 20` list ordering)
// doesn't get buried under same-named patients left over from earlier runs against the persistent dev DB.
const patientName = `Kasun Silva ${runId}`;
const patientNameTypo = `Kasun Silwa ${runId}`; // one-letter edit distance from patientName, for fuzzy-match test

describe('Patients API', () => {
  let adminToken: string;
  let doctorToken: string;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/patients');
    expect(res.status).toBe(401);
  });

  it('rejects registration from a read-only role (Doctor)', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        full_name: 'Should Not Register',
        dob: '1985-01-01',
        gender: 'Male',
        nic: nic(1),
        new_family: { family_name: 'Should Not Family' },
      });
    expect(res.status).toBe(403);
  });

  it('blocks registration when family_id and new_family are both missing', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'No Family', dob: '1985-01-01', gender: 'Male', nic: nic(2) });
    expect(res.status).toBe(400);
  });

  let firstPatientId: string;

  it('registers a new patient with a new family and auto-generates a Patient ID', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: patientName,
        dob: runDob(1),
        gender: 'Male',
        nic: nic(3),
        phone: `072${String(runId).slice(-7)}`,
        new_family: { family_name: 'Silva Family', address: 'Kandy' },
      });

    expect(res.status).toBe(201);
    expect(res.body.patient.patient_id).toMatch(/^PT-\d{6}$/);
    expect(res.body.duplicateFlags).toEqual([]);
    firstPatientId = res.body.patient.patient_id;
  });

  it('blocks registration on an exact NIC duplicate', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: patientName,
        dob: runDob(1),
        gender: 'Male',
        nic: nic(3),
        new_family: { family_name: 'Another Family' },
      });

    expect(res.status).toBe(409);
    expect(res.body.conflictingPatient.patient_id).toBe(firstPatientId);
  });

  let flagId: number;

  it('flags (but does not block) a fuzzy name+DOB match under a different NIC', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: patientNameTypo,
        dob: runDob(1),
        gender: 'Male',
        nic: nic(4),
        new_family: { family_name: 'Silwa Family' },
      });

    expect(res.status).toBe(201);
    expect(res.body.duplicateFlags.length).toBeGreaterThan(0);
    flagId = res.body.duplicateFlags[0].flag_id;
  });

  it('registers a minor using guardian_nic + dob instead of their own nic', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Minor Child',
        dob: runDob(2),
        gender: 'Female',
        guardian_nic: nic(5),
        new_family: { family_name: 'Child Family' },
      });

    expect(res.status).toBe(201);
  });

  it('blocks a second minor registration on the same guardian_nic + dob', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Minor Child',
        dob: runDob(2),
        gender: 'Female',
        guardian_nic: nic(5),
        new_family: { family_name: 'Another Child Family' },
      });

    expect(res.status).toBe(409);
  });

  it('finds the registered patient via search', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .query({ search: patientName })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((p: any) => p.patient_id === firstPatientId)).toBe(true);
  });

  it('filters the list by gender and includes a last_visit field', async () => {
    const res = await request(app).get('/api/v1/patients').query({ gender: 'Male' }).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.gender === 'Male')).toBe(true);
    expect(res.body.data[0]).toHaveProperty('last_visit');
  });

  it('returns patient summary stats used by the list header cards', async () => {
    const res = await request(app).get('/api/v1/patients/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalPatients).toBeGreaterThan(0);
    expect(res.body.malePatients + res.body.femalePatients).toBeLessThanOrEqual(res.body.totalPatients);
    expect(res.body).toHaveProperty('activePatients');
    expect(res.body).toHaveProperty('newPatientsThisMonth');
  });

  it('returns a single patient by id', async () => {
    const res = await request(app).get(`/api/v1/patients/${firstPatientId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.patient_id).toBe(firstPatientId);
  });

  it('updates a patient field and records it in the audit log', async () => {
    // Unique per run: a phone number can belong to only one patient outside their family.
    const newPhone = `079${String(runId).slice(-7)}`;
    const updateRes = await request(app)
      .put(`/api/v1/patients/${firstPatientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: newPhone });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.phone).toBe(newPhone);

    const auditRes = await request(app)
      .get(`/api/v1/patients/${firstPatientId}/audit-log`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.some((e: any) => e.field === 'phone' && e.newValue === newPhone)).toBe(true);
  });

  it('requires a reason when reassigning family', async () => {
    const res = await request(app)
      .put(`/api/v1/patients/${firstPatientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ family_id: 1 });
    expect(res.status).toBe(400);
  });

  it('archives and restores a patient (soft delete only)', async () => {
    const archiveRes = await request(app)
      .patch(`/api/v1/patients/${firstPatientId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false, reason: 'Test archive' });
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.is_active).toBe(false);

    const restoreRes = await request(app)
      .patch(`/api/v1/patients/${firstPatientId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: true });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.is_active).toBe(true);
  });

  it('returns the patient history timeline as a list', async () => {
    const res = await request(app)
      .get(`/api/v1/patients/${firstPatientId}/history`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('uploads and stores a patient photo', async () => {
    // Smallest valid 1x1 PNG.
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
        '53de000000097048597300000ec300000ec301c76fa864000000174944415' +
        '478da6360606060f80f0000050001ff1f6ac5000000000049454e44ae4260' +
        '82',
      'hex'
    );

    const res = await request(app)
      .post(`/api/v1/patients/${firstPatientId}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', pngBuffer, 'test.png');

    expect(res.status).toBe(200);
    expect(res.body.photo_url).toMatch(/^\/uploads\/patients\/.+\.png$/);
  });

  it('rejects a photo upload with a disallowed file type', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${firstPatientId}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', Buffer.from('not an image'), { filename: 'note.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
  });

  it('exports the patient history as a PDF', async () => {
    const res = await request(app)
      .get(`/api/v1/patients/${firstPatientId}/history/pdf`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.length || res.text.length).toBeGreaterThan(0);
  });

  it('lists the pending duplicate review queue and dismisses a flag', async () => {
    const listRes = await request(app)
      .get('/api/v1/patients/duplicates')
      .query({ search: patientNameTypo, limit: 20 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((f: any) => f.flagId === flagId)).toBe(true);

    const dismissRes = await request(app)
      .post(`/api/v1/patients/duplicates/${flagId}/dismiss`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.status).toBe('Dismissed');
  });

  it('merges a duplicate flag, archiving the losing record', async () => {
    const regA = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Nadeesha Fernando',
        dob: runDob(3),
        gender: 'Female',
        nic: nic(6),
        new_family: { family_name: 'Fernando A' },
      });
    expect(regA.status).toBe(201);
    const primaryId = regA.body.patient.patient_id;

    const regB = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Nadeesha Fernando', // exact same normalized name + dob, different NIC
        dob: runDob(3),
        gender: 'Female',
        nic: nic(7),
        new_family: { family_name: 'Fernando B' },
      });
    expect(regB.status).toBe(201);
    const duplicateId = regB.body.patient.patient_id;
    expect(regB.body.duplicateFlags.length).toBeGreaterThan(0);
    const mergeFlagId = regB.body.duplicateFlags[0].flag_id;

    const mergeRes = await request(app)
      .post(`/api/v1/patients/duplicates/${mergeFlagId}/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryPatientId: primaryId });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.status).toBe('Merged');

    const loserRes = await request(app).get(`/api/v1/patients/${duplicateId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(loserRes.body.is_active).toBe(false);
  });
});

describe('Quick registration (front desk check-in)', () => {
  let adminToken: string;
  let doctorToken: string;
  const quick = (body: object, token = adminToken) =>
    request(app).post('/api/v1/patients/quick').set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    adminToken = (await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).body.token;
    doctorToken = (await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' })).body.token;
  });

  it('registers with just a name, gender and age — no NIC, no family — and marks the birth date as estimated', async () => {
    const res = await quick({ full_name: `Quick Age ${runId}`, gender: 'Female', age: 34, phone: '', nic: '' });
    expect(res.status).toBe(201);
    const { patient } = res.body;
    expect(patient.nic).toBeNull();
    expect(patient.dob_estimated).toBe(true);

    // The birth date is today's date 34 years ago, so the age shown afterwards is the age given.
    const today = new Date();
    expect(patient.dob.slice(0, 10)).toBe(new Date(Date.UTC(today.getFullYear() - 34, today.getMonth(), today.getDate())).toISOString().slice(0, 10));

    // A household of their own, with them as its head.
    const family = await request(app).get(`/api/v1/families/${patient.family_id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(family.body.family_name).toBe(`Household of Quick Age ${runId}`);
    expect(family.body.head_patient_id).toBe(patient.patient_id);
  });

  it('records allergies given at the desk, and keeps "none known" as blank', async () => {
    const withAllergy = await quick({ full_name: `Quick Allergy ${runId}`, gender: 'Female', age: 29, allergies: ' Penicillin ' });
    expect(withAllergy.status).toBe(201);
    expect(withAllergy.body.patient.allergies).toBe('Penicillin');

    // The doctor's screens treat any allergy text as an allergy, so blank must stay empty.
    const none = await quick({ full_name: `Quick No Allergy ${runId}`, gender: 'Male', age: 31, allergies: '   ' });
    expect(none.status).toBe(201);
    expect(none.body.patient.allergies).toBeNull();
  });

  it('keeps a real date of birth as a real one', async () => {
    const res = await quick({ full_name: `Quick Dob ${runId}`, gender: 'Male', dob: '1990-05-17', nic: `QR-${runId}-1` });
    expect(res.status).toBe(201);
    expect(res.body.patient.dob.slice(0, 10)).toBe('1990-05-17');
    expect(res.body.patient.dob_estimated).toBe(false);
    expect(res.body.patient.nic).toBe(`QR-${runId}-1`);
  });

  it('can join an existing family instead of starting a household', async () => {
    const first = await quick({ full_name: `Quick Parent ${runId}`, gender: 'Female', age: 40 });
    const familyId = first.body.patient.family_id;
    const res = await quick({ full_name: `Quick Child ${runId}`, gender: 'Male', age: 8, family_id: familyId });
    expect(res.status).toBe(201);
    expect(res.body.patient.family_id).toBe(familyId);
  });

  it('still refuses a NIC that is already registered', async () => {
    const res = await quick({ full_name: `Someone Else ${runId}`, gender: 'Male', age: 50, nic: `QR-${runId}-1` });
    expect(res.status).toBe(409);
  });

  it('flags a likely duplicate when the ages are close and the names similar', async () => {
    await quick({ full_name: `Ruwan Jayasinghe ${runId}`, gender: 'Male', age: 45 });
    const res = await quick({ full_name: `Ruwan Jayasinge ${runId}`, gender: 'Male', age: 46 });
    expect(res.status).toBe(201);
    expect(res.body.duplicateFlags.length).toBeGreaterThan(0);
  });

  it('needs exactly one of age or date of birth', async () => {
    expect((await quick({ full_name: 'No Age', gender: 'Male' })).status).toBe(400);
    expect((await quick({ full_name: 'Both', gender: 'Male', age: 30, dob: '1995-01-01' })).status).toBe(400);
  });

  it('rejects a missing name or gender, and a birth date in the future', async () => {
    expect((await quick({ full_name: '  ', gender: 'Male', age: 30 })).status).toBe(400);
    expect((await quick({ full_name: 'No Gender', age: 30 })).status).toBe(400);
    const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect((await quick({ full_name: 'Not Born Yet', gender: 'Male', dob: tomorrow })).status).toBe(400);
  });

  it('is limited to front desk roles', async () => {
    expect((await quick({ full_name: 'Doctor Cannot', gender: 'Male', age: 30 }, doctorToken)).status).toBe(403);
  });
});

describe('Patient lookup (search box on every screen)', () => {
  let adminToken: string;
  let pharmacistToken: string;
  let patientId: string;
  const phone = `075${String(runId).slice(-7)}`;
  const nic = `${String(runId).slice(-9)}V`;
  const name = `Lookup Sunil ${runId}`;
  const lookup = (q: string, token = adminToken) =>
    request(app).get('/api/v1/patients/lookup').query({ q }).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    adminToken = (await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).body.token;
    pharmacistToken = (await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' })).body.token;
    const res = await request(app)
      .post('/api/v1/patients/quick')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: name, gender: 'Male', age: 51, phone, nic });
    expect(res.status).toBe(201);
    patientId = res.body.patient.patient_id;
  });

  it('finds a patient by the short number on their card, first', async () => {
    const short = String(Number(patientId.replace('PT-', '')));
    for (const q of [short, `PT${short}`, patientId]) {
      const res = await lookup(q);
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ patient_id: patientId, short_number: short, matched_on: 'id' });
    }
  });

  it('matches a phone typed with the country code and spaces', async () => {
    const intl = `+94 ${phone.slice(1, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
    const res = await lookup(intl);
    expect(res.body[0]).toMatchObject({ patient_id: patientId, matched_on: 'phone' });
  });

  it('matches the NIC and name words in any order', async () => {
    expect((await lookup(nic.toLowerCase())).body[0]).toMatchObject({ patient_id: patientId, matched_on: 'nic' });
    expect((await lookup(`${runId} sunil`)).body.map((p: any) => p.patient_id)).toContain(patientId);
  });

  it('is available to pharmacy staff too', async () => {
    const res = await lookup(name, pharmacistToken);
    expect(res.status).toBe(200);
    expect(res.body[0].patient_id).toBe(patientId);
  });
});

describe('One phone number per patient (except within a family)', () => {
  let adminToken: string;
  const phone = `071${String(runId).slice(-7)}`;
  const quick = (body: object) => request(app).post('/api/v1/patients/quick').set('Authorization', `Bearer ${adminToken}`).send(body);
  let first: { patient_id: string; family_id: number };

  beforeAll(async () => {
    adminToken = (await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).body.token;
    const res = await quick({ full_name: `Phone Owner ${runId}`, gender: 'Female', age: 40, phone });
    expect(res.status).toBe(201);
    first = res.body.patient;
  });

  it('refuses a second patient with the same phone, in any format, naming the existing patient', async () => {
    const res = await quick({ full_name: `Phone Copier ${runId}`, gender: 'Male', age: 30, phone: `+94 ${phone.slice(1)}` });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`A patient with this phone number already exists under the name of: Phone Owner ${runId}`);
    expect(res.body.conflictingPatient.patient_id).toBe(first.patient_id);
  });

  it('allows the same phone for a member of the same family', async () => {
    const res = await quick({ full_name: `Phone Child ${runId}`, gender: 'Male', age: 6, phone, family_id: first.family_id });
    expect(res.status).toBe(201);
  });

  it('reports phone and NIC holders before anything is saved', async () => {
    const res = await request(app)
      .get('/api/v1/patients/check-identifiers')
      .query({ phone: `0${phone.slice(1)}` })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.phone.blocked).toBe(true);
    expect(res.body.phone.message).toContain(`Phone Owner ${runId}`);

    const sameFamily = await request(app)
      .get('/api/v1/patients/check-identifiers')
      .query({ phone, familyId: first.family_id })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sameFamily.body.phone.blocked).toBe(false);
  });
});
