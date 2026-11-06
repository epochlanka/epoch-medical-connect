/**
 * How a prescribed medicine is to be taken, in words — shared by everything printed from a
 * prescription (the pharmacy's medicine label and the prescription PDF) so the dose per time is
 * never left off one of them.
 *
 * `dosage` is free text, usually the medicine's strength ("500 mg"), so on its own it does not
 * say how many tablets or how many ml to take. `dose_qty` does, and it leads the line.
 */

/** "2 tablets", "1 capsule", "5 ml", "2.5 g": the amount taken each time, in the dispensing unit. */
export const doseAmount = (doseQty: number | null | undefined, baseUnit: string | null | undefined): string | null => {
  if (doseQty == null || !Number.isFinite(doseQty) || doseQty <= 0) return null;
  const amount = Number.isInteger(doseQty) ? String(doseQty) : String(Number(doseQty.toFixed(2)));
  const unit = (baseUnit ?? '').trim().toLowerCase();
  if (unit === 'ml') return `${amount} ml`;
  if (unit === 'gram' || unit === 'g') return `${amount} g`;
  if (!unit || unit === 'piece') return amount;
  return `${amount} ${doseQty <= 1 ? unit : `${unit}s`}`;
};

interface DoseItem {
  dose_qty?: number | null;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  route?: string | null;
  instructions?: string | null;
}

/** The instruction parts in reading order, starting with the dose per time when it is known. */
export const howToTakeParts = (item: DoseItem, baseUnit: string | null | undefined, { withInstructions = true } = {}): string[] => {
  const dose = doseAmount(item.dose_qty, baseUnit);
  return [
    dose ? `Take ${dose} each time` : null,
    item.dosage,
    item.frequency,
    item.duration,
    item.route,
    withInstructions ? item.instructions : null,
  ].filter((part): part is string => !!part && !!String(part).trim());
};
