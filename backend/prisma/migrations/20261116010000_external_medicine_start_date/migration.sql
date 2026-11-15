-- Outside medicines can start later than the day they are prescribed, like clinic lines.
ALTER TABLE "ExternalPrescriptionMedicine" ADD COLUMN "start_date" DATE;
