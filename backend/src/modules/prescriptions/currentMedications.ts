import { prisma } from '../../lib/prisma';
import { parseSchedule } from './qtyCalc';

// Which medicines a patient is on. Shared by the prescription page's "Ongoing medicines" panel and
// by the consultation, prescription, patient-profile and AI summaries, so they all agree.
//
// Each medicine is judged by its LATEST course (newest prescription first):
//   running — the course has not run out yet (or is open-ended and recent);
//   due     — a long-term medicine whose supply has run out: the patient is probably back for more;
//   ended   — an ordinary course that finished within the last few weeks (shown separately, in case
//             it should be continued; not counted as "current").
// A medicine is long-term when the doctor ticked "Long-term" on the line, or its duration says so
// ("Ongoing", "Continue"...). Without that, a monthly medicine written as "30 days" would drop off
// the list on day 31 — exactly when the patient comes back for a refill. A doctor's "Stop"
// (MedicationStop) hides every course issued before it.

const DAY_MS = 86_400_000;
// How far back to look for long-term medicines.
const LOOKBACK_DAYS = 365;
// An open-ended course ("Ongoing") counts as running for this long, then as due for re-confirming.
const OPEN_ENDED_DAYS = 180;
// No duration (or one we cannot read): treat it as running for about a week.
const UNKNOWN_DURATION_DAYS = 7;
// Ordinary courses that finished within this many days are offered under "ended recently".
const RECENTLY_ENDED_DAYS = 60;
const OPEN_ENDED = /ONGOING|CONTINU|LONG[\s-]?TERM|INDEFINITE|UNTIL|REGULAR|LIFE/i;

export type OngoingStatus = 'running' | 'due' | 'ended';

export interface OngoingMedication {
  /** Lower-cased name: the key courses are grouped by and stops are recorded against. */
  key: string;
  name: string;
  /** Clinic catalogue id (null for a manually typed outside medicine). */
  medicineId: number | null;
  /** Bought outside the clinic (an external medicine), not dispensed here. */
  outside: boolean;
  status: OngoingStatus;
  /** Ticked "Long-term" by the doctor, or written with an open-ended duration. */
  longTerm: boolean;
  /** The doctor ticked "Long-term" on the latest line. */
  markedLongTerm: boolean;
  issuedAt: Date;
  /** End of the latest course, or null for an open-ended one. */
  endsAt: Date | null;
  /** Whole days of supply left (negative once it ran out); null when open-ended. */
  daysLeft: number | null;
  prescriptionId: number;
  consultationId: number;
  lastDispensedAt: Date | null;
  dosage: string;
  doseQty: number | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  qty: number;
  genericName: string | null;
  // Outside medicines only.
  brandName: string | null;
  dosageForm: string | null;
  strength: string | null;
  quantityUnit: string | null;
}

/** The short form the summaries have always used. */
export interface CurrentMedication {
  name: string;
  outside: boolean;
  issuedAt: Date;
  endsAt: Date | null;
}

const classify = (issuedAt: Date, duration: string | null, longTerm: boolean, now: Date): { status: OngoingStatus | null; endsAt: Date | null } => {
  const days = parseSchedule(undefined, duration ?? undefined).days;
  const age = now.getTime() - issuedAt.getTime();
  if (days) {
    const endsAt = new Date(issuedAt.getTime() + days * DAY_MS);
    if (endsAt >= now) return { status: 'running', endsAt };
    if (longTerm) return { status: 'due', endsAt };
    return { status: now.getTime() - endsAt.getTime() <= RECENTLY_ENDED_DAYS * DAY_MS ? 'ended' : null, endsAt };
  }
  if (longTerm) return { status: age <= OPEN_ENDED_DAYS * DAY_MS ? 'running' : 'due', endsAt: null };
  if (age <= UNKNOWN_DURATION_DAYS * DAY_MS) return { status: 'running', endsAt: null };
  return { status: age <= RECENTLY_ENDED_DAYS * DAY_MS ? 'ended' : null, endsAt: null };
};

export const medicineKey = (name: string) => name.trim().toLowerCase();

/**
 * Every medicine the patient is on or recently finished, newest first, plus when anything was last
 * prescribed. `excludeConsultationId` leaves out the visit being worked on, so what the doctor is
 * prescribing today does not show up as "ongoing" on the same page.
 */
export const getOngoingMedications = async (patientId: string, opts: { excludeConsultationId?: number; now?: Date } = {}) => {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  const consultationFilter = {
    appointment: { patient_id: patientId },
    ...(opts.excludeConsultationId ? { consultation_id: { not: opts.excludeConsultationId } } : {}),
  };

  const [recent, latest, stops] = await Promise.all([
    prisma.prescription.findMany({
      where: { consultation: consultationFilter, issued_at: { gte: since } },
      orderBy: [{ issued_at: 'desc' }, { prescription_id: 'desc' }],
      include: {
        items: {
          orderBy: { rx_item_id: 'asc' },
          select: {
            medicine_id: true,
            dosage: true,
            dose_qty: true,
            frequency: true,
            duration: true,
            route: true,
            instructions: true,
            qty: true,
            is_long_term: true,
            dispensed_at: true,
            medicine: { select: { name: true, generic_name: true } },
          },
        },
        external_medicines: { orderBy: { ext_item_id: 'asc' } },
      },
    }),
    prisma.prescription.findFirst({ where: { consultation: consultationFilter }, orderBy: { issued_at: 'desc' }, select: { issued_at: true } }),
    prisma.medicationStop.findMany({ where: { patient_id: patientId }, select: { medicine_key: true, stopped_at: true } }),
  ]);

  const stoppedAt = new Map<string, Date>();
  for (const s of stops) {
    const prev = stoppedAt.get(s.medicine_key);
    if (!prev || s.stopped_at > prev) stoppedAt.set(s.medicine_key, s.stopped_at);
  }

  const seen = new Set<string>();
  const medicines: OngoingMedication[] = [];
  const consider = (
    line: Omit<OngoingMedication, 'key' | 'status' | 'longTerm' | 'endsAt' | 'daysLeft'>,
  ) => {
    const key = medicineKey(line.name);
    // Newest prescription first, so the first sighting of a medicine is its latest course.
    if (seen.has(key)) return;
    seen.add(key);
    const stop = stoppedAt.get(key);
    if (stop && stop >= line.issuedAt) return;
    const longTerm = line.markedLongTerm || (!!line.duration && OPEN_ENDED.test(line.duration));
    const { status, endsAt } = classify(line.issuedAt, line.duration, longTerm, now);
    if (!status) return;
    const daysLeft = endsAt ? Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS) : null;
    medicines.push({ ...line, key, status, longTerm, endsAt, daysLeft });
  };

  for (const rx of recent) {
    for (const i of rx.items) {
      consider({
        name: i.medicine.name,
        medicineId: i.medicine_id,
        outside: false,
        markedLongTerm: i.is_long_term,
        issuedAt: rx.issued_at,
        prescriptionId: rx.prescription_id,
        consultationId: rx.consultation_id,
        lastDispensedAt: i.dispensed_at,
        dosage: i.dosage,
        doseQty: i.dose_qty,
        frequency: i.frequency,
        duration: i.duration,
        route: i.route,
        instructions: i.instructions,
        qty: i.qty,
        genericName: i.medicine.generic_name,
        brandName: null,
        dosageForm: null,
        strength: null,
        quantityUnit: null,
      });
    }
    for (const e of rx.external_medicines) {
      consider({
        name: e.medicine_name,
        medicineId: e.medicine_id,
        outside: true,
        markedLongTerm: e.is_long_term,
        issuedAt: rx.issued_at,
        prescriptionId: rx.prescription_id,
        consultationId: rx.consultation_id,
        lastDispensedAt: null,
        dosage: e.dosage,
        doseQty: e.dose_qty,
        frequency: e.frequency,
        duration: e.duration,
        route: null,
        instructions: e.instructions,
        qty: e.quantity,
        genericName: e.generic_name,
        brandName: e.brand_name,
        dosageForm: e.dosage_form,
        strength: e.strength,
        quantityUnit: e.quantity_unit,
      });
    }
  }

  return { medicines, lastPrescribedAt: latest?.issued_at ?? null };
};

/**
 * Medicines the patient is most likely still taking (running, or long-term and due a refill),
 * newest first — the list the summaries show.
 */
export const getCurrentMedications = async (patientId: string, opts: { excludeConsultationId?: number; now?: Date } = {}) => {
  const { medicines, lastPrescribedAt } = await getOngoingMedications(patientId, opts);
  const current: CurrentMedication[] = medicines
    .filter((m) => m.status !== 'ended')
    .map((m) => ({ name: m.name, outside: m.outside, issuedAt: m.issuedAt, endsAt: m.endsAt }));
  return { current, lastPrescribedAt };
};

/** The plain list the summaries have always returned, with outside purchases labelled. */
export const currentMedicationLabels = (current: CurrentMedication[]) =>
  current.map((m) => (m.outside ? `${m.name} (bought outside)` : m.name));
