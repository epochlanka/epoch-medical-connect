-- Ongoing medicines: a long-term flag on prescription lines, and doctors' stop decisions.

ALTER TABLE "ExternalPrescriptionMedicine" ADD COLUMN     "is_long_term" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PrescriptionItem" ADD COLUMN     "is_long_term" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MedicationStop" (
    "stop_id" SERIAL NOT NULL,
    "patient_id" TEXT NOT NULL,
    "medicine_key" TEXT NOT NULL,
    "medicine_name" TEXT NOT NULL,
    "reason" TEXT,
    "consultation_id" INTEGER,
    "stopped_by" INTEGER NOT NULL,
    "stopped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationStop_pkey" PRIMARY KEY ("stop_id")
);

CREATE INDEX "MedicationStop_patient_id_medicine_key_idx" ON "MedicationStop"("patient_id", "medicine_key");

ALTER TABLE "MedicationStop" ADD CONSTRAINT "MedicationStop_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicationStop" ADD CONSTRAINT "MedicationStop_stopped_by_fkey" FOREIGN KEY ("stopped_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security on, no policies — as for every other table.
ALTER TABLE "MedicationStop" ENABLE ROW LEVEL SECURITY;
