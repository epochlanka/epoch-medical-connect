import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// "Find the patient in front of me" from whatever they can tell you: the number on their card
// ("123", "PT123", "PT-000123"), a phone number in any common Sri Lankan form, their NIC, or part
// of their name. Exact identifier matches come first so the right person is the top result.

const ID_PATTERN = /^(?:pt[-\s]?)?0*(\d{1,6})$/i;

/** "123" / "PT123" / "pt-000123" → "PT-000123"; null when the text is not a patient number. */
export const patientIdFromText = (text: string): string | null => {
  const match = ID_PATTERN.exec(text.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? `PT-${String(n).padStart(6, '0')}` : null;
};

/** The short number staff say aloud and write on the card: PT-000123 → "123". */
export const shortPatientNumber = (patientId: string) => {
  const match = /^PT-(\d{6})$/.exec(patientId);
  return match ? String(Number(match[1])) : null;
};

// 0771234567, 077 123 4567, +94 77 123 4567 and 94771234567 are the same phone. Compare the last
// nine digits (the number without the leading 0 or country code).
export const phoneKey = (text: string) => {
  const digits = text.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
};

/** Same phone in any format; short local numbers (under nine digits) must match digit for digit. */
export const samePhone = (a: string, b: string) => {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  return ka && kb ? ka === kb : a.replace(/\D/g, '') === b.replace(/\D/g, '') && /\d/.test(a);
};

export interface PatientLookupHit {
  patient_id: string;
  short_number: string | null;
  full_name: string;
  gender: string;
  dob: Date;
  dob_estimated: boolean;
  phone: string | null;
  nic: string | null;
  is_active: boolean;
  allergies: string | null;
  /** Why this patient matched, shown next to the result. */
  matched_on: 'id' | 'phone' | 'nic' | 'name';
}

const select = {
  patient_id: true,
  full_name: true,
  gender: true,
  dob: true,
  dob_estimated: true,
  phone: true,
  nic: true,
  is_active: true,
  allergies: true,
} satisfies Prisma.PatientSelect;

export const lookupPatients = async (query: string, limit = 8): Promise<PatientLookupHit[]> => {
  const term = query.trim();
  if (term.length < 2 && !patientIdFromText(term)) return [];

  const id = patientIdFromText(term);
  const phone = phoneKey(term);
  const words = term.split(/\s+/).filter((w) => w.length > 0);

  const or: Prisma.PatientWhereInput[] = [
    { patient_id: { contains: term, mode: 'insensitive' } },
    { nic: { contains: term, mode: 'insensitive' } },
    // Every word must appear somewhere in the name, in any order ("perera kamal" finds Kamal Perera).
    { AND: words.map((w) => ({ full_name: { contains: w, mode: 'insensitive' as const } })) },
  ];
  if (id) or.push({ patient_id: id });
  // Stored phones vary in format; the last 7 digits are distinctive enough to fetch candidates,
  // then the exact nine-digit comparison below decides.
  if (phone) or.push({ phone: { contains: phone.slice(-7) } });
  else if (/^\+?\d{4,}$/.test(term)) or.push({ phone: { contains: term.replace(/\D/g, '') } });

  // A short number ("7", "123") is someone's patient number, not a fragment of every NIC and phone
  // that happens to contain those digits.
  const shortNumberOnly = /^\d{1,3}$/.test(term) && !!id;
  const candidates = await prisma.patient.findMany({ where: shortNumberOnly ? { patient_id: id! } : { OR: or }, select, take: 60 });

  const lower = term.toLowerCase();
  const scored = candidates
    .map((p) => {
      let score = 50;
      let matched_on: PatientLookupHit['matched_on'] = 'name';
      const name = p.full_name.toLowerCase();
      if (id && p.patient_id === id) [score, matched_on] = [0, 'id'];
      else if (p.patient_id.toLowerCase() === lower) [score, matched_on] = [0, 'id'];
      else if (phone && p.phone && phoneKey(p.phone) === phone) [score, matched_on] = [1, 'phone'];
      else if (p.nic && p.nic.toLowerCase() === lower) [score, matched_on] = [2, 'nic'];
      else if (name === lower) score = 3;
      else if (name.startsWith(lower)) score = 4;
      else if (words.every((w) => name.includes(w.toLowerCase()))) score = 5;
      else if (p.phone && p.phone.replace(/\D/g, '').includes(term.replace(/\D/g, '')) && /\d{4,}/.test(term)) [score, matched_on] = [6, 'phone'];
      else if (p.nic && p.nic.toLowerCase().includes(lower)) [score, matched_on] = [7, 'nic'];
      else if (p.patient_id.toLowerCase().includes(lower)) [score, matched_on] = [8, 'id'];
      // Inactive (archived/merged) records sink below active ones with the same score.
      return { p, score: score + (p.is_active ? 0 : 0.5), matched_on };
    })
    .filter((s) => s.score < 50)
    .sort((a, b) => a.score - b.score || a.p.full_name.localeCompare(b.p.full_name));

  return scored.slice(0, limit).map(({ p, matched_on }) => ({ ...p, short_number: shortPatientNumber(p.patient_id), matched_on }));
};
