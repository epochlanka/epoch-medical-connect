import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

// The shared list of outside medicines: typed-in medicines are remembered when a prescription is
// saved, refreshed with the latest dosing on reuse, searchable by every doctor, and removable from
// the suggestions without touching past prescriptions.

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe('Saved outside medicines', () => {
  let doctorToken: string;
  let doctorId: number;
  let adminToken: string;
  let pharmacistToken: string;
  let receptionId: number;
  let catalogMedicineId: number;
  const name = `Zincovit Gold ${runId}`;

  const prescriptionFor = async () => {
    const family = await prisma.family.create({ data: { family_name: `Library ${runId}-${Math.random()}` } });
    const patient = await prisma.patient.create({
      data: { patient_id: `PT-LIB-${runId}-${Math.random().toString(36).slice(2, 8)}`, family_id: family.family_id, full_name: 'Library Test', dob: new Date('1980-01-01'), gender: 'Male' },
    });
    const appointment = await prisma.appointment.create({ data: { patient_id: patient.patient_id, doctor_id: doctorId, created_by: receptionId, scheduled_at: new Date(), status: 'Consulting' } });
    const consult = await request(app).post('/api/v1/consultations').set('Authorization', `Bearer ${doctorToken}`).send({ appointment_id: appointment.appointment_id, complaint: 'Test visit' });
    const rx = await request(app).post('/api/v1/prescriptions').set('Authorization', `Bearer ${doctorToken}`).send({ consultation_id: consult.body.consultation_id, external_only: true });
    expect(rx.status).toBe(201);
    return rx.body.prescription_id as number;
  };

  const line = (over: Record<string, unknown> = {}) => ({
    medicine_name: name,
    generic_name: 'Multivitamin',
    dosage_form: 'Tablet',
    strength: '500 mg',
    dosage: '1 tab',
    dose_qty: 1,
    frequency: 'OD',
    duration: '30 Days',
    quantity: 30,
    quantity_unit: 'tablets',
    instructions: 'After meals',
    ...over,
  });

  const search = (token: string, term?: string) =>
    request(app).get('/api/v1/external-medicines/library').query(term ? { search: term } : {}).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const login = async (u: string, p: string) => (await request(app).post('/api/v1/auth/login').send({ username: u, password: p })).body;
    const doc = await login('doctor', 'doctor123');
    doctorToken = doc.token;
    doctorId = doc.user.id;
    adminToken = (await login('admin', 'admin123')).token;
    pharmacistToken = (await login('pharmacist', 'pharmacist123')).token;
    receptionId = (await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } })).user_id;
    catalogMedicineId = (await prisma.medicine.create({ data: { name: `Library Catalog Drug ${runId}`, base_unit: 'Tablet' } })).medicine_id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('remembers a typed-in outside medicine, with its details and dosing, but not catalogue ones', async () => {
    const rx = await prescriptionFor();
    const res = await request(app)
      .post(`/api/v1/external-medicines/prescription/${rx}/bulk`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ items: [line(), { ...line({ medicine_name: undefined }), medicine_id: catalogMedicineId }] });
    expect(res.status).toBe(201);

    const found = await search(doctorToken, 'zincovit gold');
    expect(found.status).toBe(200);
    const entry = found.body.find((e: any) => e.medicineName === name);
    expect(entry).toMatchObject({ genericName: 'Multivitamin', dosageForm: 'Tablet', strength: '500 mg', dosage: '1 tab', doseQty: 1, frequency: 'OD', duration: '30 Days', quantityUnit: 'tablets', instructions: 'After meals', useCount: 1 });
    expect(await prisma.externalMedicineLibrary.count({ where: { name_key: `library catalog drug ${runId}`.toLowerCase() } })).toBe(0);
  });

  it('finds it by generic name too, and refreshes the dosing and count when it is used again', async () => {
    const rx = await prescriptionFor();
    // Different spacing and case: still the same medicine.
    await request(app)
      .post(`/api/v1/external-medicines/prescription/${rx}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(line({ medicine_name: `  zincovit   GOLD ${runId} `, frequency: 'BD', duration: '14 Days', quantity: 28 }))
      .expect(201);

    const rows = await prisma.externalMedicineLibrary.findMany({ where: { name_key: name.toLowerCase() } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ frequency: 'BD', duration: '14 Days', use_count: 2 });

    const byGeneric = await search(doctorToken, 'multivitamin');
    expect(byGeneric.body.some((e: any) => e.libraryId === rows[0].library_id)).toBe(true);
  });

  it('is shared: an admin sees the same list; a pharmacist cannot use it', async () => {
    const asAdmin = await search(adminToken, name);
    expect(asAdmin.body).toHaveLength(1);
    expect((await search(pharmacistToken, name)).status).toBe(403);
  });

  it('removes an entry from the suggestions only, and prescribing it again brings it back', async () => {
    const entry = (await search(doctorToken, name)).body[0];
    const before = await prisma.externalPrescriptionMedicine.count({ where: { medicine_name: { contains: `${runId}` } } });

    await request(app).delete(`/api/v1/external-medicines/library/${entry.libraryId}`).set('Authorization', `Bearer ${doctorToken}`).expect(204);
    expect((await search(doctorToken, name)).body).toHaveLength(0);
    expect(await prisma.externalPrescriptionMedicine.count({ where: { medicine_name: { contains: `${runId}` } } })).toBe(before);
    expect(await prisma.auditLog.count({ where: { action: 'HIDE_EXTERNAL_MEDICINE_SUGGESTION', entity_id: String(entry.libraryId) } })).toBe(1);

    const rx = await prescriptionFor();
    await request(app).post(`/api/v1/external-medicines/prescription/${rx}/bulk`).set('Authorization', `Bearer ${doctorToken}`).send({ items: [line()] }).expect(201);
    expect((await search(doctorToken, name)).body).toHaveLength(1);
  });

  it('lists the most used ones when nothing is typed, and 404s an unknown entry', async () => {
    const top = await search(doctorToken);
    expect(top.status).toBe(200);
    expect(top.body.length).toBeLessThanOrEqual(8);
    const counts = top.body.map((e: any) => e.useCount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect((await request(app).delete('/api/v1/external-medicines/library/999999999').set('Authorization', `Bearer ${doctorToken}`)).status).toBe(404);
  });
});
