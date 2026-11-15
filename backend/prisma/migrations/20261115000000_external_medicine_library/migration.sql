-- The shared list of outside medicines (see ExternalMedicineLibrary in schema.prisma).

CREATE TABLE "ExternalMedicineLibrary" (
    "library_id" SERIAL NOT NULL,
    "name_key" TEXT NOT NULL,
    "medicine_name" TEXT NOT NULL,
    "generic_name" TEXT,
    "brand_name" TEXT,
    "dosage_form" TEXT NOT NULL,
    "strength" TEXT,
    "quantity_unit" TEXT NOT NULL,
    "dosage" TEXT,
    "dose_qty" DOUBLE PRECISION,
    "frequency" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "is_long_term" BOOLEAN NOT NULL DEFAULT false,
    "use_count" INTEGER NOT NULL DEFAULT 1,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_by" INTEGER,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalMedicineLibrary_pkey" PRIMARY KEY ("library_id")
);

CREATE UNIQUE INDEX "ExternalMedicineLibrary_name_key_key" ON "ExternalMedicineLibrary"("name_key");

CREATE INDEX "ExternalMedicineLibrary_hidden_use_count_idx" ON "ExternalMedicineLibrary"("hidden", "use_count");

-- Start the list from the outside medicines already prescribed by hand (not from the catalogue):
-- names are matched ignoring case and extra spaces, as the app does (libraryKey); the latest line
-- of each name supplies the details, with how often and when it was last used.
INSERT INTO "ExternalMedicineLibrary" (
    "name_key", "medicine_name", "generic_name", "brand_name", "dosage_form", "strength", "quantity_unit",
    "dosage", "dose_qty", "frequency", "duration", "instructions", "is_long_term",
    "use_count", "last_used_at", "last_used_by", "created_at", "updated_at"
)
SELECT
    l.name_key, l.medicine_name, l.generic_name, l.brand_name, l.dosage_form, l.strength, l.quantity_unit,
    l.dosage, l.dose_qty, l.frequency, l.duration, l.instructions, l.is_long_term,
    c.uses, l.created_at, l.doctor_id, c.first_used, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (lower(regexp_replace(btrim(medicine_name), '\s+', ' ', 'g')))
        lower(regexp_replace(btrim(medicine_name), '\s+', ' ', 'g')) AS name_key, regexp_replace(btrim(medicine_name), '\s+', ' ', 'g') AS medicine_name, generic_name, brand_name,
        dosage_form, strength, quantity_unit, dosage, dose_qty, frequency, duration, instructions, is_long_term,
        created_at, doctor_id
    FROM "ExternalPrescriptionMedicine"
    WHERE medicine_id IS NULL AND btrim(medicine_name) <> ''
    ORDER BY lower(regexp_replace(btrim(medicine_name), '\s+', ' ', 'g')), created_at DESC, ext_item_id DESC
) l
JOIN (
    SELECT lower(regexp_replace(btrim(medicine_name), '\s+', ' ', 'g')) AS name_key, count(*)::int AS uses, min(created_at) AS first_used
    FROM "ExternalPrescriptionMedicine"
    WHERE medicine_id IS NULL
    GROUP BY 1
) c ON c.name_key = l.name_key;

-- Row-level security on, no policies — as for every other table.
ALTER TABLE "ExternalMedicineLibrary" ENABLE ROW LEVEL SECURITY;
