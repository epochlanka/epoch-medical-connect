// What a prescription line asks for depends on what kind of medicine it is. A tablet needs "take 1
// tablet", a syrup "5 ml", eye drops "2 drops, which eye", a cream "apply to where" — and showing
// every field for every medicine (strength, dosage, take, route...) confused doctors. This decides,
// from the dosage form and the unit it is dispensed in, which dose field to show, which routes to
// suggest, whether the quantity can be calculated, and writes the "dosage" text the pharmacy screen,
// labels and slips print ("1 tablet", "5 ml", "2 drops").

export type DoseKind = 'solid' | 'liquid' | 'drops' | 'inhaler' | 'topical' | 'injection' | 'other';

export interface DoseProfile {
  kind: DoseKind;
  /** The dose is a number of dispensing units (tablets, ml), so the quantity can be calculated. */
  counted: boolean;
  /** Label of the dose field. */
  doseLabel: string;
  /** Unit word after the dose number ("tablet", "ml", "drops", "puffs"); empty for free text. */
  doseUnit: (n: number) => string;
  /** For uncounted kinds: what the free dose field holds. */
  amountKind: 'number' | 'text';
  amountPlaceholder: string;
  routeDefault: string;
  routeOptions: string[];
  /** Example strength for an outside medicine of this kind. */
  strengthExample: string;
}

// "tablet"/"tablets" either way round, so a unit stored as "Tablet" or "tablets" reads right.
const plural = (word: string, n: number) => {
  if (/^(ml|g|mg|mcg|gram|grams|kg|units?)$/i.test(word)) return word;
  const one = word.replace(/s$/i, '');
  return n === 1 ? one : `${one}s`;
};

export const kindOf = (form?: string | null, unit?: string | null): DoseKind => {
  const f = (form ?? '').toLowerCase();
  if (/drop/.test(f)) return 'drops';
  if (/inhal|puff|nebul|nasal spray|spray/.test(f)) return 'inhaler';
  if (/cream|ointment|gel|lotion|paste|balm/.test(f)) return 'topical';
  if (/inject|vial|ampoule|ampule/.test(f)) return 'injection';
  if (/syrup|suspension|solution|elixir|mixture|liquid|linctus/.test(f)) return 'liquid';
  if (/tablet|capsule|sachet|lozenge|pill|caplet|powder/.test(f)) return 'solid';
  const u = (unit ?? '').toLowerCase();
  if (/tablet|capsule|sachet/.test(u)) return 'solid';
  if (/^ml$/.test(u)) return 'liquid';
  return 'other';
};

const isMl = (unit?: string | null) => /^ml$/i.test((unit ?? '').trim());
const isGramLike = (unit?: string | null) => /^(g|gram|grams|kg|mg)$/i.test((unit ?? '').trim());

const ORAL = ['Oral', 'Sublingual', 'Chewed'];

export const doseProfile = (form?: string | null, unit?: string | null): DoseProfile => {
  const kind = kindOf(form, unit);
  const unitWord = (unit ?? '').trim().toLowerCase() || 'unit';
  switch (kind) {
    case 'solid':
      // A tablet dispensed by weight (rare, but in the clinic's list) cannot be counted per dose.
      if (isGramLike(unit)) break;
      return { kind, counted: true, doseLabel: 'Take each time', doseUnit: (n) => plural(unitWord, n), amountKind: 'number', amountPlaceholder: '1', routeDefault: 'Oral', routeOptions: ORAL, strengthExample: 'e.g. 500 mg' };
    case 'liquid':
      return {
        kind,
        // Dispensed in ml: the ml per dose totals up. Dispensed by the bottle: the doctor enters bottles.
        counted: isMl(unit),
        doseLabel: 'Each dose',
        doseUnit: () => 'ml',
        amountKind: 'number',
        amountPlaceholder: '5',
        routeDefault: 'Oral',
        routeOptions: ORAL,
        strengthExample: 'e.g. 125 mg/5 ml',
      };
    case 'drops':
      return { kind, counted: false, doseLabel: 'Drops each time', doseUnit: (n) => (n === 1 ? 'drop' : 'drops'), amountKind: 'number', amountPlaceholder: '2', routeDefault: /ear/i.test(form ?? '') ? 'Ear' : /nas|nose/i.test(form ?? '') ? 'Nose' : /eye/i.test(form ?? '') ? 'Both eyes' : '', routeOptions: ['Both eyes', 'Left eye', 'Right eye', 'Ear', 'Both ears', 'Nose'], strengthExample: 'e.g. 0.5%' };
    case 'inhaler':
      return { kind, counted: false, doseLabel: 'Puffs each time', doseUnit: (n) => (n === 1 ? 'puff' : 'puffs'), amountKind: 'number', amountPlaceholder: '2', routeDefault: 'Inhaled', routeOptions: ['Inhaled', 'Nasal'], strengthExample: 'e.g. 100 mcg/puff' };
    case 'topical':
      return { kind, counted: false, doseLabel: 'Apply to', doseUnit: () => '', amountKind: 'text', amountPlaceholder: 'e.g. affected area', routeDefault: 'Topical', routeOptions: ['Topical'], strengthExample: 'e.g. 1%' };
    case 'injection':
      return { kind, counted: false, doseLabel: 'Dose', doseUnit: () => '', amountKind: 'text', amountPlaceholder: 'e.g. 1 g', routeDefault: '', routeOptions: ['IM', 'IV', 'SC', 'Intradermal'], strengthExample: 'e.g. 1 g vial' };
    default:
      break;
  }
  // Anything else: the dose is a number of whatever it is dispensed in.
  return { kind: 'other', counted: true, doseLabel: 'Take each time', doseUnit: (n) => plural(unitWord, n), amountKind: 'number', amountPlaceholder: '1', routeDefault: '', routeOptions: ['Oral', 'Topical', 'Inhaled', 'IM', 'IV', 'SC'], strengthExample: 'e.g. 500 mg' };
};

/** Every route any profile suggests — the list stays available whatever the medicine. */
export const ALL_ROUTES = ['Oral', 'Sublingual', 'Chewed', 'Topical', 'Inhaled', 'Nasal', 'Both eyes', 'Left eye', 'Right eye', 'Ear', 'Both ears', 'Nose', 'IM', 'IV', 'SC', 'Intradermal', 'Rectal', 'Vaginal'];

/** The dosage text that is saved and printed, from the dose the doctor entered. */
export const composeDosage = (p: DoseProfile, doseQty: string, amount: string, fallback?: string | null): string => {
  if (p.counted) {
    const n = Number(doseQty);
    if (n > 0) return `${doseQty.trim()} ${p.doseUnit(n)}`.trim();
  } else if (p.kind === 'topical') {
    return amount.trim() ? `Apply to ${amount.trim()}` : 'Apply thinly';
  } else if (p.amountKind === 'number') {
    const n = Number(amount);
    if (n > 0) return `${amount.trim()} ${p.doseUnit(n)}`.trim();
  } else if (amount.trim()) {
    return amount.trim();
  }
  return (fallback ?? '').trim() || 'As directed';
};

/** Best guess at the dose field from a saved dosage text ("2 drops" -> "2", "Apply to face" -> "face"). */
export const amountFromDosage = (p: DoseProfile, dosage?: string | null): string => {
  const text = (dosage ?? '').trim();
  if (!text) return '';
  if (p.kind === 'topical') return text.replace(/^apply( to)?\s*/i, '').replace(/^thinly$/i, '');
  if (p.amountKind === 'number') return text.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? '';
  return /^as directed$/i.test(text) ? '' : text;
};
