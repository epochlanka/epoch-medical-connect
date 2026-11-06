import { shortPatientNumber, dateLabel, ageLabel } from './patientNumber';

// A wallet-sized card (85 × 54 mm, the size of a bank card) the front desk hands to the patient,
// so a patient who has no NIC or will not give a phone can still be found instantly next time.
// Printed from the browser, so any printer the clinic PC already uses works.

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface PatientCardInput {
  patientId: string;
  fullName: string;
  dob?: string | null;
  dobEstimated?: boolean;
  gender?: string | null;
  clinicName?: string | null;
  clinicPhone?: string | null;
}

export const printPatientCard = (p: PatientCardInput) => {
  const short = shortPatientNumber(p.patientId);
  const birth = p.dob ? (p.dobEstimated ? `Age ${ageLabel(p.dob, true)}` : `Born ${dateLabel(p.dob)}`) : '';
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Patient card — ${escapeHtml(p.fullName)}</title>
<style>
  @page { size: 85mm 54mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
  .card { width: 85mm; height: 54mm; padding: 4mm 5mm; display: flex; flex-direction: column; justify-content: space-between; border: 0.3mm solid #999; border-radius: 3mm; }
  .clinic { font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; }
  .label { font-size: 7pt; color: #555; text-transform: uppercase; letter-spacing: 0.08em; }
  .number { font-size: 30pt; font-weight: bold; line-height: 1; letter-spacing: 0.02em; }
  .id { font-size: 8pt; color: #444; margin-top: 1mm; }
  .name { font-size: 11pt; font-weight: bold; }
  .meta { font-size: 8pt; color: #333; }
  .note { font-size: 6.5pt; color: #555; }
  @media screen { body { padding: 10mm; background: #eee; } .card { background: #fff; } }
</style></head>
<body onload="window.print()">
  <div class="card">
    <div class="clinic">${escapeHtml(p.clinicName || 'Clinic')}</div>
    <div>
      <div class="label">Patient number</div>
      <div class="number">${escapeHtml(short ?? p.patientId)}</div>
      ${short ? `<div class="id">${escapeHtml(p.patientId)}</div>` : ''}
    </div>
    <div>
      <div class="name">${escapeHtml(p.fullName)}</div>
      <div class="meta">${escapeHtml([birth, p.gender].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="note">Please bring this card to every visit${p.clinicPhone ? ` · ${escapeHtml(p.clinicPhone)}` : ''}.</div>
  </div>
</body></html>`;
  const win = window.open('', '_blank', 'width=520,height=420');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
};
