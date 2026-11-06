import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { howToTakeParts } from './doseText';

// Only used if the clinic settings row is somehow missing; the clinic's own name comes from Settings.
const DEFAULT_CLINIC_NAME = 'MediCare Clinic & Dispensary';

// A birth date worked out from an age given at check-in is printed as that age, never as a date.
const birthLine = (patient: { dob: Date | string; dob_estimated?: boolean }) => {
  const dob = new Date(patient.dob);
  if (!patient.dob_estimated) return `DOB: ${dob.toISOString().slice(0, 10)}`;
  const now = new Date();
  const age = now.getFullYear() - dob.getFullYear() - (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate()) ? 1 : 0);
  return `Age: about ${age} (date of birth not known)`;
};

export const streamPrescriptionPdf = (prescription: any, res: Response, clinicName: string = DEFAULT_CLINIC_NAME) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  const appointment = prescription.consultation.appointment;
  const patient = appointment.patient;
  const doctor = appointment.doctor;

  doc.fontSize(18).text(clinicName, { align: 'center' });
  doc.fontSize(11).fillColor('#555').text('Prescription', { align: 'center' });
  doc.fillColor('black').moveDown();

  doc.fontSize(11);
  doc.text(`Prescription: RX${String(prescription.prescription_id).padStart(6, '0')}`);
  doc.text(`Date: ${new Date(prescription.issued_at).toISOString().slice(0, 10)}`);
  if (prescription.is_refill) doc.text('Type: Refill / Repeat Prescription');
  doc.moveDown(0.5);

  if (patient) {
    doc.text(`Patient: ${patient.full_name} (${patient.patient_id})`);
    doc.text(`${birthLine(patient)}   Gender: ${patient.gender}`);
    if (patient.allergies) doc.text(`Known allergies: ${patient.allergies}`);
  } else {
    doc.text(`Patient: ${appointment.temp_patient_name ?? 'Unregistered Patient'} (Temporary — Today Only)`);
    if (appointment.temp_patient_gender) doc.text(`Gender: ${appointment.temp_patient_gender}`);
  }
  doc.moveDown();

  if (prescription.items.length > 0) {
    doc.fontSize(13).text('Medicines', { underline: true });
    doc.moveDown(0.5);
  }

  for (const item of prescription.items) {
    doc.fontSize(11).text(`${item.medicine.name}${item.medicine.generic_name ? ` (${item.medicine.generic_name})` : ''} — Qty ${item.qty}`);
    const parts = howToTakeParts(item, item.medicine.base_unit, { withInstructions: false });
    if (parts.length) doc.fontSize(10).fillColor('#555').text(parts.join(' · '), { indent: 15 });
    if (item.instructions) doc.fontSize(10).fillColor('#555').text(item.instructions, { indent: 15 });
    doc.fillColor('black').moveDown(0.5);
  }

  // Medicines the patient buys elsewhere go on the same sheet, so one printout carries the
  // whole treatment rather than relying on a separate slip being remembered.
  const outside = prescription.external_medicines ?? [];
  if (outside.length > 0) {
    doc.moveDown(0.5);
    doc.fontSize(13).text('To buy outside (not from the clinic pharmacy)', { underline: true });
    doc.moveDown(0.5);
    for (const ext of outside) {
      doc.fontSize(11).text(`${ext.medicine_name}${ext.strength ? ` (${ext.strength})` : ''} — Qty ${ext.quantity} ${ext.quantity_unit}`);
      const parts = howToTakeParts({ ...ext, route: null }, ext.quantity_unit, { withInstructions: false });
      if (parts.length) doc.fontSize(10).fillColor('#555').text(parts.join(' · '), { indent: 15 });
      if (ext.instructions) doc.fontSize(10).fillColor('#555').text(ext.instructions, { indent: 15 });
      doc.fillColor('black').moveDown(0.5);
    }
  }

  if (prescription.notes) {
    doc.moveDown(0.5);
    doc.fontSize(11).text('Notes to Pharmacist:', { underline: true });
    doc.fontSize(10).text(prescription.notes);
  }

  doc.moveDown();
  doc.fontSize(11).text(`Prescribing Doctor: ${doctor.username}`);
  if (doctor.registration_number) doc.text(`Registration No: ${doctor.registration_number}`);

  doc.end();
};

// Only the items a doctor has marked External Purchase (external_qty > 0) — the qty shown is
// the externally-sourced portion, not the full prescribed qty, so a partially-split line reads
// correctly here (e.g. "10 of 18 prescribed" would still just show the 8 to be bought outside).
export const streamExternalPurchaseSlipPdf = (prescription: any, res: Response, clinicName: string = DEFAULT_CLINIC_NAME) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  const appointment = prescription.consultation.appointment;
  const patient = appointment.patient;
  const doctor = appointment.doctor;
  const externalItems = prescription.items.filter((i: any) => i.external_qty > 0);

  doc.fontSize(18).text(clinicName, { align: 'center' });
  doc.fontSize(13).fillColor('#555').text('EXTERNAL MEDICINE PURCHASE SLIP', { align: 'center' });
  doc.fillColor('black').moveDown();

  doc.fontSize(11);
  doc.text(`Prescription: RX${String(prescription.prescription_id).padStart(6, '0')}`);
  doc.text(`Date: ${new Date(prescription.issued_at).toISOString().slice(0, 10)}`);
  doc.moveDown(0.5);

  if (patient) {
    doc.text(`Patient: ${patient.full_name} (${patient.patient_id})`);
    doc.text(`${birthLine(patient)}   Gender: ${patient.gender}`);
  } else {
    doc.text(`Patient: ${appointment.temp_patient_name ?? 'Unregistered Patient'} (Temporary — Today Only)`);
  }
  doc.moveDown();

  doc.fontSize(13).text('Medicines — External Purchase', { underline: true });
  doc.moveDown(0.5);

  for (const item of externalItems) {
    doc.fontSize(11).text(`${item.medicine.name}${item.medicine.strength ? ` (${item.medicine.strength})` : ''} — Qty ${item.external_qty}`);
    const parts = howToTakeParts({ ...item, route: null }, item.medicine.base_unit, { withInstructions: false });
    if (parts.length) doc.fontSize(10).fillColor('#555').text(parts.join(' · '), { indent: 15 });
    if (item.instructions) doc.fontSize(10).fillColor('#555').text(item.instructions, { indent: 15 });
    doc.fillColor('black').moveDown(0.5);
  }

  doc.moveDown();
  doc.fontSize(9).fillColor('#555').text(
    'The above medicines are to be purchased from an external pharmacy or other authorized source. These medicines are not being dispensed by the clinic pharmacy.',
    { align: 'left' }
  );
  doc.fillColor('black');

  doc.moveDown(2);
  doc.fontSize(11).text(`Doctor: ${doctor.username}`);
  if (doctor.registration_number) doc.text(`Registration No: ${doctor.registration_number}`);

  doc.end();
};
