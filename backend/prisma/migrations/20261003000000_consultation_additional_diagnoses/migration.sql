-- Further diagnoses beyond the primary one (which stays in diagnosis/icd10_code so reports,
-- printouts and amendments keep working). JSON array of {"code": string|null, "title": string},
-- the same storage convention as medical_history_json and vitals_json.
ALTER TABLE "Consultation" ADD COLUMN "additional_diagnoses_json" TEXT;
