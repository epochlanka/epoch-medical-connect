import PDFDocument from 'pdfkit';
import { Response } from 'express';

const CLINIC_NAME = 'MediCare Clinic & Dispensary';
const CLINIC_ADDRESS = '123 Galle Road, Colombo 03';
const CLINIC_PHONE = '+94 11 234 5678';

const calculateAge = (dob: Date, at: Date = new Date()) => {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--;
  return age;
};

// The clinic's own name and address from Settings; the built-in sample details only when none are set.
const header = (doc: PDFKit.PDFDocument, subtitle: string, clinic?: { clinic_name?: string | null; clinic_address?: string | null } | null) => {
  doc.fontSize(16).font('Helvetica-Bold').text(clinic?.clinic_name || CLINIC_NAME, { align: 'center' });
  doc.fontSize(10).font('Helvetica').fillColor('#555');
  if (clinic?.clinic_name) {
    if (clinic.clinic_address) doc.text(clinic.clinic_address, { align: 'center' });
  } else {
    doc.text(CLINIC_ADDRESS, { align: 'center' });
    doc.text(`Tel: ${CLINIC_PHONE}`, { align: 'center' });
  }
  doc.fillColor('black').moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').text(subtitle, { align: 'center' });
  doc.font('Helvetica');
  doc.moveDown(0.4);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').stroke();
  doc.strokeColor('black');
  doc.moveDown(0.6);
};

// Document 1 — Laboratory Investigation Request, printed before the patient goes to the lab.
// Every test ordered at the same visit goes on one sheet: the lab gets one request, not one page
// per test. `orders` all belong to one patient and visit; the first is the one printed from.
const PRIORITY_RANK: Record<string, number> = { Routine: 0, Urgent: 1, STAT: 2 };

export const streamLabTestRequestPdf = (orders: any[], res: Response, clinic?: { clinic_name?: string | null; clinic_address?: string | null } | null) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  const first = orders[0];
  const patient = first.patient;
  const doctor = first.doctor;
  const requestNo = (o: any) => o.request_number || `LAB${String(o.lab_test_order_id).padStart(6, '0')}`;
  const priority = orders.reduce((top: string, o: any) => ((PRIORITY_RANK[o.priority] ?? 0) > (PRIORITY_RANK[top] ?? 0) ? o.priority : top), 'Routine');

  header(doc, 'LABORATORY INVESTIGATION REQUEST', clinic);

  doc.fontSize(10.5);
  doc.text(`Patient Name: ${patient.full_name}`);
  doc.text(`Patient ID: ${patient.patient_id}     Age: ${calculateAge(new Date(patient.dob))}     Gender: ${patient.gender}`);
  if (patient.phone) doc.text(`Contact Number: ${patient.phone}`);
  doc.text(`Date: ${new Date(first.order_date).toISOString().slice(0, 10)}`);
  doc.text(`Visit / Consultation No: ${first.consultation_id}`);
  doc.text(`Request No: ${orders.map(requestNo).join(', ')}`);
  doc.text(`Priority: ${priority}`);
  doc.moveDown(0.7);

  doc.fontSize(12).font('Helvetica-Bold').text(`Requested Investigations (${orders.length})`, { underline: true });
  doc.moveDown(0.3);
  orders.forEach((o, i) => {
    doc.font('Helvetica-Bold').fontSize(11).text(`${i + 1}. ${o.test_name}${o.test_category ? ` (${o.test_category})` : ''}${o.priority !== 'Routine' ? `  [${o.priority}]` : ''}`);
    doc.font('Helvetica').fontSize(10);
    if (o.instructions) doc.text(`Instructions: ${o.instructions}`, { indent: 14 });
    if (o.additional_notes) doc.text(`Clinical notes: ${o.additional_notes}`, { indent: 14 });
    doc.moveDown(0.25);
  });

  doc.moveDown(1.2);
  doc.fontSize(10.5);
  doc.text(`Doctor Name: ${doctor.username}`);
  if (doctor.registration_number) doc.text(`Registration No: ${doctor.registration_number}`);
  doc.moveDown(1);
  doc.text('Signature: ______________________________');
  doc.moveDown(0.6);
  doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`);
  doc.moveDown(0.8);
  doc.text('Clinic Seal:');
  doc.rect(doc.x, doc.y + 4, 140, 60).strokeColor('#cbd5e1').stroke();
  doc.strokeColor('black');

  doc.moveDown(6);
  doc.fontSize(8).fillColor('#94a3b8').text(`Reference: ${orders.map(requestNo).join(', ')}`, { align: 'right' });

  doc.end();
};

// Document 2 — Laboratory Result / Review Report, available once the doctor has completed the
// order (entered values + reviewed). Separate document from the request letter above.
export const streamLabResultReportPdf = (order: any, res: Response, clinic?: { clinic_name?: string | null; clinic_address?: string | null } | null) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  const patient = order.patient;
  const doctor = order.doctor;
  const requestNo = order.request_number || `LAB${String(order.lab_test_order_id).padStart(6, '0')}`;

  header(doc, 'LABORATORY RESULT / REVIEW REPORT', clinic);

  doc.fontSize(10.5);
  doc.text(`Patient Name: ${patient.full_name}`);
  doc.text(`Patient ID: ${patient.patient_id}     Age: ${calculateAge(new Date(patient.dob))}     Gender: ${patient.gender}`);
  doc.text(`Request No: ${requestNo}`);
  doc.text(`Test: ${order.test_name}${order.test_category ? ` (${order.test_category})` : ''}`);
  doc.text(`Requested: ${new Date(order.order_date).toISOString().slice(0, 10)}`);
  if (order.report_received_at) doc.text(`Report Received: ${new Date(order.report_received_at).toISOString().slice(0, 10)}`);
  if (order.completed_at) doc.text(`Reviewed: ${new Date(order.completed_at).toISOString().slice(0, 10)}`);
  doc.moveDown(0.7);

  doc.fontSize(12).font('Helvetica-Bold').text('Results', { underline: true });
  doc.font('Helvetica');
  doc.moveDown(0.4);

  const colX = [doc.x, doc.x + 190, doc.x + 280, doc.x + 340, doc.x + 430];
  doc.fontSize(9.5).font('Helvetica-Bold');
  doc.text('Parameter', colX[0], doc.y, { continued: false });
  doc.text('Result', colX[1], doc.y - doc.currentLineHeight());
  doc.text('Unit', colX[2], doc.y - doc.currentLineHeight());
  doc.text('Reference Range', colX[3], doc.y - doc.currentLineHeight());
  doc.text('Flag', colX[4], doc.y - doc.currentLineHeight());
  doc.moveDown(0.3);
  doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').stroke();
  doc.strokeColor('black').font('Helvetica').fontSize(9.5);
  doc.moveDown(0.3);

  for (const r of order.results || []) {
    const y = doc.y;
    doc.text(r.parameter_name, colX[0], y, { width: 180 });
    doc.text(r.result_value, colX[1], y, { width: 80 });
    doc.text(r.unit || '—', colX[2], y, { width: 55 });
    doc.text(r.reference_range || '—', colX[3], y, { width: 85 });
    doc.text(r.result_flag || '—', colX[4], y, { width: 60 });
    doc.moveDown(0.5);
  }

  if (order.review_notes) {
    doc.moveDown(0.6);
    doc.fontSize(10.5).font('Helvetica-Bold').text('Doctor Notes:');
    doc.font('Helvetica').text(order.review_notes);
  }
  if (order.interpretation) {
    doc.moveDown(0.5);
    doc.fontSize(10.5).font('Helvetica-Bold').text('Interpretation:');
    doc.font('Helvetica').text(order.interpretation);
  }

  doc.moveDown(1.5);
  doc.fontSize(10.5);
  doc.text(`Doctor Name: ${doctor.username}`);
  if (doctor.registration_number) doc.text(`Registration No: ${doctor.registration_number}`);
  doc.moveDown(1);
  doc.text('Signature: ______________________________');
  doc.moveDown(0.6);
  doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`);
  doc.moveDown(0.8);
  doc.text('Clinic Seal:');
  doc.rect(doc.x, doc.y + 4, 140, 60).strokeColor('#cbd5e1').stroke();
  doc.strokeColor('black');

  doc.moveDown(6);
  doc.fontSize(8).fillColor('#94a3b8').text(`Reference: ${requestNo}`, { align: 'right' });

  doc.end();
};
