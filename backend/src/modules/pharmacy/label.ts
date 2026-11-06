import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { howToTakeParts } from '../prescriptions/doseText';

const DEFAULT_CLINIC_NAME = 'MediCare Clinic & Dispensary';

// The label that goes home with the patient: each medicine actually given, and how to take it —
// the dose per time first ("Take 2 tablets each time"), then the doctor's schedule and notes.
export const streamDispenseLabel = (prescription: any, res: Response, clinicName: string = DEFAULT_CLINIC_NAME) => {
  const doc = new PDFDocument({ size: 'A5', margin: 24 });
  doc.pipe(res);

  const appointment = prescription.consultation.appointment;
  const patientName = appointment.patient?.full_name ?? appointment.temp_patient_name ?? 'Unregistered Patient';
  doc.fontSize(14).text(clinicName, { align: 'center' });
  doc.fontSize(9).fillColor('#555').text(`RX${String(prescription.prescription_id).padStart(6, '0')}`, { align: 'center' });
  doc.fillColor('black').moveDown();
  doc.fontSize(11).text(`Patient: ${patientName}`);
  doc.fontSize(9).text('Clinic medicine actually dispensed (external purchases are not included)');
  doc.moveDown();

  // A prescription item remembers only its last batch; each dispense record carries the
  // actual medicine, batch and quantity, including earlier partial draws.
  for (const item of prescription.items) {
    for (const dispense of item.dispenses) {
      const medicine = dispense.batch.medicine;
      doc.fontSize(11).fillColor('black').text(`${medicine.name} — ${dispense.qty} ${medicine.base_unit}`);
      doc.fontSize(8).fillColor('#475569').text(`Batch ${dispense.batch.batch_no} · Expires ${new Date(dispense.batch.expiry_date).toISOString().slice(0, 10)} · Given ${new Date(dispense.dispensed_at).toISOString().slice(0, 10)}`);
      const instructions = howToTakeParts(item, medicine.base_unit).join(', ');
      if (instructions) doc.fontSize(10).fillColor('black').text(instructions);
      doc.moveDown(0.7);
    }
  }

  doc.end();
};
