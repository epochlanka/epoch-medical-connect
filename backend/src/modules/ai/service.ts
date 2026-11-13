import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getCurrentMedications } from '../prescriptions/currentMedications';

// ---- AI pre-consultation summary (Pro) --------------------------------------------------------
// Before a visit the doctor can ask for a short digest of the patient's record: active problems,
// what they are taking, allergies, what happened at recent visits and which lab results stood out.
// Claude writes it from a DE-IDENTIFIED extract (no name, NIC, phone, address or exact birth date —
// see buildClinicalExtract) and the result is shown as a draft to check, never saved into the
// clinical record. Off unless AI_FEATURES_ENABLED=true and ANTHROPIC_API_KEY are set.

export const AI_MODEL = 'claude-opus-5-5';
// Bump when the prompt or output shape changes, so cached summaries from the old prompt are not reused.
const PROMPT_VERSION = 'summary-v1';
const MAX_VISITS = 12;
const MAX_LAB_ORDERS = 20;

export class AiDisabledError extends Error {}
export class AiUnavailableError extends Error {}
export class AiRefusedError extends Error {}
export class PatientNotFoundError extends Error {}

export const isAiEnabled = () => process.env.AI_FEATURES_ENABLED === 'true' && !!process.env.ANTHROPIC_API_KEY;

// Created on first use so the API key is read at call time. ANTHROPIC_BASE_URL, if set, is honoured
// by the SDK — that is how a clinic would be pointed at a relay instead of the API directly.
let client: Pick<Anthropic, 'beta'> | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }));
/** Tests only: swap in a fake client (or null to go back to the real one). */
export const __setAiClientForTests = (fake: Pick<Anthropic, 'beta'> | null) => {
  client = fake;
};

// ---- Output shape -----------------------------------------------------------------------------

export const SummarySchema = z.object({
  overview: z.string().describe('Two or three sentences a doctor can read in ten seconds before calling the patient in.'),
  activeProblems: z
    .array(z.object({ problem: z.string(), since: z.string().nullable().describe('YYYY-MM-DD or YYYY-MM when first recorded, if known'), basis: z.string().describe('Where in the record this comes from, with dates') }))
    .describe('Ongoing or recurring conditions supported by the record. Empty if none.'),
  currentMedications: z.array(z.object({ name: z.string(), details: z.string().describe('Dose, frequency and since when, as recorded') })),
  allergies: z.array(z.string()).describe('Recorded allergies exactly as stated. Empty if none recorded.'),
  recentVisits: z.array(z.object({ date: z.string().describe('YYYY-MM-DD'), summary: z.string().describe('One line: complaint, diagnosis, what was done') })).describe('Most recent first, at most 5.'),
  labHighlights: z.array(z.object({ date: z.string(), test: z.string(), finding: z.string().describe('The value and whether it was flagged, as recorded') })).describe('Abnormal or clinically notable results and pending tests. Empty if none.'),
  pointsToCheck: z
    .array(z.object({ point: z.string(), reason: z.string() }))
    .describe('Things in the record worth confirming at this visit: a missed follow-up, a pending test, a trend in vitals or results, a medication that may have run out. Not treatment advice.'),
});
export type PatientSummary = z.infer<typeof SummarySchema>;

const SYSTEM_PROMPT = `You prepare a pre-consultation summary of a patient's record for their doctor at an outpatient clinic in Sri Lanka. The doctor reads it in the few seconds before seeing the patient, then checks anything that matters against the full record.

The record is given as JSON. It is de-identified: the patient's age and sex are given, not their name or birth date.

How to write it:
- Use only what is in the record. Never add a condition, medicine, allergy, result or date that is not there. If something is unclear or inconsistent in the record, say so plainly rather than resolving it.
- Give dates (YYYY-MM-DD) for visits, results and when problems were first recorded, so the doctor can find them.
- Be brief and clinical. Use the abbreviations a doctor expects (BP, HbA1c, FBS), not explanations of them.
- Do not recommend diagnoses, treatments or doses. "Points to check" are things the record suggests are worth confirming at this visit, such as an overdue follow-up, a pending test, a worsening trend, or a medicine that has probably run out.
- Allergies are safety-critical: list every recorded allergy exactly as written. If none are recorded, return an empty list.
- If the record is nearly empty (a first visit), say so in the overview and keep the other sections empty.`;

// ---- De-identified extract --------------------------------------------------------------------

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const clean = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};
const parseJson = (s: string | null | undefined): unknown => {
  if (!s || s === 'null') return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const ageInYears = (dob: Date, now: Date) => {
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
};

/**
 * Everything the summary is written from. Identifiers are deliberately left out: name, NIC,
 * guardian NIC, phone, emergency contact, occupation and employer, family links and exact date of
 * birth (age only). Doctors' free-text notes are sent as written, so a name typed into a note would
 * go too — the screen says the summary is sent to Anthropic.
 */
export const buildClinicalExtract = async (patientId: string, now = new Date()) => {
  const patient = await prisma.patient.findUnique({
    where: { patient_id: patientId },
    select: { dob: true, dob_estimated: true, gender: true, blood_group: true, allergies: true, chronic_conditions: true, current_medications: true },
  });
  if (!patient) throw new PatientNotFoundError('Patient not found');

  const [consultations, labOrders, currentMeds] = await Promise.all([
    prisma.consultation.findMany({
      where: { appointment: { patient_id: patientId } },
      orderBy: { created_at: 'desc' },
      take: MAX_VISITS,
      select: {
        consultation_id: true,
        status: true,
        created_at: true,
        complaint: true,
        history_of_present_illness: true,
        examination_findings: true,
        diagnosis: true,
        icd10_code: true,
        additional_diagnoses_json: true,
        notes: true,
        follow_up_date: true,
        vitals_json: true,
        prescriptions: {
          orderBy: { issued_at: 'asc' },
          select: {
            items: { select: { dosage: true, frequency: true, duration: true, route: true, instructions: true, medicine: { select: { name: true } } } },
            external_medicines: { select: { medicine_name: true, strength: true, dosage: true, frequency: true, duration: true } },
          },
        },
      },
    }),
    prisma.labTestOrder.findMany({
      where: { patient_id: patientId, status: { not: 'Cancelled' } },
      orderBy: { order_date: 'desc' },
      take: MAX_LAB_ORDERS,
      select: {
        test_name: true,
        status: true,
        order_date: true,
        completed_at: true,
        interpretation: true,
        result_value: true,
        unit: true,
        reference_range: true,
        results: { orderBy: { result_id: 'asc' }, select: { parameter_name: true, result_value: true, unit: true, reference_range: true, result_flag: true } },
      },
    }),
    getCurrentMedications(patientId, { now }),
  ]);

  return {
    today: day(now),
    patient: {
      age: ageInYears(patient.dob, now),
      ageIsEstimate: patient.dob_estimated,
      sex: patient.gender,
      bloodGroup: clean(patient.blood_group),
      allergies: clean(patient.allergies),
      chronicConditions: clean(patient.chronic_conditions),
      medicationsReportedAtRegistration: clean(patient.current_medications),
    },
    medicinesStillRunning: currentMeds.current.map((m) => ({
      name: m.name,
      boughtOutside: m.outside,
      prescribed: day(m.issuedAt),
      courseEnds: m.endsAt ? day(m.endsAt) : 'open-ended',
    })),
    visits: consultations.map((c) => ({
      date: day(c.created_at),
      status: c.status === 'Finalized' ? 'finalized' : 'draft (in progress)',
      complaint: clean(c.complaint),
      historyOfPresentIllness: clean(c.history_of_present_illness),
      examination: clean(c.examination_findings),
      diagnosis: clean(c.diagnosis),
      diagnosisCode: clean(c.icd10_code),
      otherDiagnoses: parseJson(c.additional_diagnoses_json),
      vitals: parseJson(c.vitals_json),
      notes: clean(c.notes),
      followUpDate: day(c.follow_up_date),
      prescribed: c.prescriptions.flatMap((p) => [
        ...p.items.map((i) => [i.medicine.name, i.dosage, i.frequency, i.duration, i.route, i.instructions].filter(Boolean).join(' · ')),
        ...p.external_medicines.map((e) => [e.medicine_name, e.strength, e.dosage, e.frequency, e.duration, '(outside pharmacy)'].filter(Boolean).join(' · ')),
      ]),
    })),
    labTests: labOrders.map((o) => ({
      test: o.test_name,
      ordered: day(o.order_date),
      status: o.status,
      completed: day(o.completed_at),
      results: o.results.length
        ? o.results.map((r) => ({ parameter: r.parameter_name, value: r.result_value, unit: r.unit, referenceRange: r.reference_range, flag: r.result_flag }))
        : o.result_value
          ? [{ parameter: o.test_name, value: o.result_value, unit: o.unit, referenceRange: o.reference_range, flag: null }]
          : [],
      doctorInterpretation: clean(o.interpretation),
    })),
  };
};

// ---- Generate (or reuse) a summary ------------------------------------------------------------

export interface SummaryResult {
  summary: PatientSummary;
  generatedAt: Date;
  model: string;
  cached: boolean;
  basedOn: { visits: number; labTests: number };
}

const toResult = (row: { summary_json: string; created_at: Date; model: string }, cached: boolean, basedOn: SummaryResult['basedOn']): SummaryResult => ({
  summary: JSON.parse(row.summary_json),
  generatedAt: row.created_at,
  model: row.model,
  cached,
  basedOn,
});

export const summarisePatient = async (patientId: string, actor: { user_id: number }, opts: { refresh?: boolean } = {}): Promise<SummaryResult> => {
  if (!isAiEnabled()) throw new AiDisabledError('AI features are not enabled for this clinic.');

  const extract = await buildClinicalExtract(patientId);
  const basedOn = { visits: extract.visits.length, labTests: extract.labTests.length };
  // `today` is left out of the fingerprint: an unchanged record keeps its summary across days.
  const { today: _today, ...stable } = extract;
  const inputHash = crypto.createHash('sha256').update(`${PROMPT_VERSION}|${AI_MODEL}|${JSON.stringify(stable)}`).digest('hex');

  if (!opts.refresh) {
    const cached = await prisma.aiPatientSummary.findFirst({ where: { patient_id: patientId, input_hash: inputHash }, orderBy: { created_at: 'desc' } });
    if (cached) return toResult(cached, true, basedOn);
  }

  let message;
  try {
    message = await getClient().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      // If Opus is overloaded the API retries the request on its default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: betaZodOutputFormat(SummarySchema), effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Patient record:\n\n${JSON.stringify(extract, null, 1)}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AiUnavailableError('The AI service rejected this clinic’s API key. Ask the administrator to check it.');
    }
    if (err instanceof Anthropic.RateLimitError) throw new AiUnavailableError('The AI service is busy. Try again in a minute.');
    if (err instanceof Anthropic.APIConnectionError) throw new AiUnavailableError('Could not reach the AI service. Check the internet connection.');
    if (err instanceof Anthropic.APIError) throw new AiUnavailableError('The AI service could not write a summary right now. Try again shortly.');
    throw err;
  }

  if (message.stop_reason === 'refusal') throw new AiRefusedError('The AI declined to summarise this record.');
  if (message.stop_reason === 'max_tokens' || !message.parsed_output) {
    throw new AiUnavailableError('The AI returned an incomplete summary. Try again.');
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.aiPatientSummary.create({
      data: {
        patient_id: patientId,
        input_hash: inputHash,
        model: message.model,
        summary_json: JSON.stringify(message.parsed_output),
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        created_by: actor.user_id,
      },
    });
    await tx.auditLog.create({ data: { user_id: actor.user_id, action: 'AI_SUMMARY', entity: 'Patient', entity_id: patientId } });
    return created;
  });
  return toResult(row, false, basedOn);
};
