-- AI pre-consultation summaries (see AiPatientSummary in schema.prisma).

CREATE TABLE "AiPatientSummary" (
    "summary_id" SERIAL NOT NULL,
    "patient_id" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "summary_json" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPatientSummary_pkey" PRIMARY KEY ("summary_id")
);

CREATE INDEX "AiPatientSummary_patient_id_created_at_idx" ON "AiPatientSummary"("patient_id", "created_at");

ALTER TABLE "AiPatientSummary" ADD CONSTRAINT "AiPatientSummary_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiPatientSummary" ADD CONSTRAINT "AiPatientSummary_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security on, no policies — as for every other table.
ALTER TABLE "AiPatientSummary" ENABLE ROW LEVEL SECURITY;
