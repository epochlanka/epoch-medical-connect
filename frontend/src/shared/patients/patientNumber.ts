// Every patient already gets a system number when registered (PT-000123). Staff and patients use
// the short form — "123" — which the search box accepts too.

const STANDARD_ID = /^PT-(\d{6})$/;

/** PT-000123 → "123"; null for non-standard ids (old imports, seed data). */
export const shortPatientNumber = (patientId: string): string | null => {
  const match = STANDARD_ID.exec(patientId);
  return match ? String(Number(match[1])) : null;
};

/** What to say or write: "No. 123", or the full id when there is no short form. */
export const patientNumberLabel = (patientId: string) => {
  const short = shortPatientNumber(patientId);
  return short ? `No. ${short}` : patientId;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Age in whole years, prefixed "about" when the birth date was estimated from an age. */
export const ageLabel = (dob: string, estimated?: boolean) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return `${estimated ? 'about ' : ''}${Math.max(age, 0)} y`;
};

export const dateLabel = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
