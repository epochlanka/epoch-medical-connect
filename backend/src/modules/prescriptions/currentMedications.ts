import { prisma } from '../../lib/prisma';
import { parseSchedule } from './qtyCalc';

// "Current medications" used to mean "everything on the last prescription", so a 5-day antibiotic
// from months ago still read as current. A course now counts only while it is still running.
// Shared by the consultation, prescription and patient-profile summaries so all three agree.

const DAY_MS = 86_400_000;
// Long-term medicines ("Ongoing", "Continue") have no end date; assume they are still taken for
// this long after the last prescription, after which the doctor should re-confirm them.
const OPEN_ENDED_DAYS = 180;
// No duration (or one we cannot read): only treat it as current for about a week.
const UNKNOWN_DURATION_DAYS = 7;
const OPEN_ENDED = /ONGOING|CONTINU|LONG[\s-]?TERM|INDEFINITE|UNTIL|REGULAR|LIFE/i;

export interface CurrentMedication {
  name: string;
  /** Bought outside the clinic (an external medicine), not dispensed here. */
  outside: boolean;
  issuedAt: Date;
  /** End of the course, or null for an open-ended one. */
  endsAt: Date | null;
}

const isStillRunning = (issuedAt: Date, duration: string | null, now: Date) => {
  const days = parseSchedule(undefined, duration ?? undefined).days;
  if (days) {
    const endsAt = new Date(issuedAt.getTime() + days * DAY_MS);
    return { running: endsAt >= now, endsAt };
  }
  const windowDays = duration && OPEN_ENDED.test(duration) ? OPEN_ENDED_DAYS : UNKNOWN_DURATION_DAYS;
  return { running: now.getTime() - issuedAt.getTime() <= windowDays * DAY_MS, endsAt: null };
};

/**
 * Medicines the patient is most likely still taking, newest first, plus when anything was last
 * prescribed (so an empty list can say "last prescribed on …" instead of looking like "never").
 * `excludeConsultationId` leaves out the visit being worked on.
 */
export const getCurrentMedications = async (patientId: string, opts: { excludeConsultationId?: number; now?: Date } = {}) => {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - OPEN_ENDED_DAYS * DAY_MS);
  const consultationFilter = {
    appointment: { patient_id: patientId },
    ...(opts.excludeConsultationId ? { consultation_id: { not: opts.excludeConsultationId } } : {}),
  };

  const [recent, latest] = await Promise.all([
    prisma.prescription.findMany({
      where: { consultation: consultationFilter, issued_at: { gte: since } },
      orderBy: { issued_at: 'desc' },
      include: {
        items: { select: { duration: true, medicine: { select: { name: true } } } },
        external_medicines: { select: { medicine_name: true, duration: true } },
      },
    }),
    prisma.prescription.findFirst({
      where: { consultation: consultationFilter },
      orderBy: { issued_at: 'desc' },
      select: { issued_at: true },
    }),
  ]);

  const seen = new Set<string>();
  const current: CurrentMedication[] = [];
  const consider = (name: string, duration: string | null, outside: boolean, issuedAt: Date) => {
    const key = name.trim().toLowerCase();
    // Newest prescription first, so the first sighting of a medicine is its latest course.
    if (seen.has(key)) return;
    seen.add(key);
    const { running, endsAt } = isStillRunning(issuedAt, duration, now);
    if (running) current.push({ name, outside, issuedAt, endsAt });
  };
  for (const rx of recent) {
    for (const item of rx.items) consider(item.medicine.name, item.duration, false, rx.issued_at);
    for (const ext of rx.external_medicines) consider(ext.medicine_name, ext.duration, true, rx.issued_at);
  }

  return { current, lastPrescribedAt: latest?.issued_at ?? null };
};

/** The plain list the summaries have always returned, with outside purchases labelled. */
export const currentMedicationLabels = (current: CurrentMedication[]) =>
  current.map((m) => (m.outside ? `${m.name} (bought outside)` : m.name));
