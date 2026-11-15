import { prisma } from '../../lib/prisma';
import { NotFoundError } from './errors';

// The clinic's shared list of outside medicines that doctors have typed in by hand (see
// ExternalMedicineLibrary in schema.prisma). Saving a prescription adds each typed-in medicine to
// the list, or refreshes it with the latest details and dosing; the outside-medicine search then
// offers it to every doctor, most used first. Catalogue medicines are left out: the search finds
// those in the catalogue already.

export interface LibraryLine {
  medicine_id?: number | null;
  medicine_name: string;
  generic_name?: string | null;
  brand_name?: string | null;
  dosage_form: string;
  strength?: string | null;
  quantity_unit: string;
  dosage?: string | null;
  dose_qty?: number | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  is_long_term?: boolean;
}

export const libraryKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Records typed-in outside medicines. Runs inside the caller's transaction.
 * countUse: a prescription was saved with them (adds to "used N times"). Without it — the doctor has
 * only added the medicine to a prescription still being written — it is saved straight away, so the
 * next search finds it, but not counted until that prescription is saved.
 */
export const rememberExternalMedicines = async (tx: any, lines: LibraryLine[], userId: number, { countUse = true }: { countUse?: boolean } = {}) => {
  for (const line of lines) {
    if (line.medicine_id) continue;
    const name = line.medicine_name.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const details = {
      medicine_name: name,
      generic_name: line.generic_name || null,
      brand_name: line.brand_name || null,
      dosage_form: line.dosage_form.trim(),
      strength: line.strength || null,
      quantity_unit: line.quantity_unit.trim(),
      dosage: line.dosage?.trim() || null,
      dose_qty: line.dose_qty ?? null,
      frequency: line.frequency || null,
      duration: line.duration || null,
      instructions: line.instructions || null,
      is_long_term: !!line.is_long_term,
      last_used_at: new Date(),
      last_used_by: userId,
    };
    await tx.externalMedicineLibrary.upsert({
      where: { name_key: libraryKey(name) },
      create: { name_key: libraryKey(name), ...details, use_count: countUse ? 1 : 0 },
      // Prescribing it again puts a removed entry back on the list.
      update: { ...details, ...(countUse ? { use_count: { increment: 1 } } : {}), hidden: false },
    });
  }
};

const serialize = (row: any) => ({
  libraryId: row.library_id,
  medicineName: row.medicine_name,
  genericName: row.generic_name,
  brandName: row.brand_name,
  dosageForm: row.dosage_form,
  strength: row.strength,
  quantityUnit: row.quantity_unit,
  dosage: row.dosage,
  doseQty: row.dose_qty,
  frequency: row.frequency,
  duration: row.duration,
  instructions: row.instructions,
  isLongTerm: row.is_long_term,
  useCount: row.use_count,
  lastUsedAt: row.last_used_at,
});

/** Saved outside medicines matching the search (name, generic or brand), most used first. With no
 * search, the most used ones, so the doctor sees the usual picks as soon as the search opens. */
export const searchLibrary = async (search?: string) => {
  const term = search?.trim();
  const rows = await prisma.externalMedicineLibrary.findMany({
    where: {
      hidden: false,
      ...(term
        ? {
            OR: [
              { medicine_name: { contains: term, mode: 'insensitive' } },
              { generic_name: { contains: term, mode: 'insensitive' } },
              { brand_name: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ use_count: 'desc' }, { last_used_at: 'desc' }],
    take: term ? 15 : 8,
  });
  return rows.map(serialize);
};

/** "Remove from list": hides the suggestion. Past prescriptions are untouched. */
export const hideLibraryEntry = async (libraryId: number, userId: number) => {
  const row = await prisma.externalMedicineLibrary.findUnique({ where: { library_id: libraryId } });
  if (!row) throw new NotFoundError('That saved medicine was not found');
  await prisma.$transaction([
    prisma.externalMedicineLibrary.update({ where: { library_id: libraryId }, data: { hidden: true } }),
    prisma.auditLog.create({ data: { user_id: userId, action: 'HIDE_EXTERNAL_MEDICINE_SUGGESTION', entity: 'ExternalMedicineLibrary', entity_id: String(libraryId) } }),
  ]);
};

/** Saves one outside medicine as soon as the doctor adds it, before the prescription is saved. */
export const saveToLibrary = async (line: LibraryLine, userId: number) => {
  await prisma.$transaction((tx) => rememberExternalMedicines(tx, [line], userId, { countUse: false }));
  const row = await prisma.externalMedicineLibrary.findUnique({ where: { name_key: libraryKey(line.medicine_name) } });
  return row ? serialize(row) : null;
};
