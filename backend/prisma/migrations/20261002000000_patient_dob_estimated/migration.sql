-- Quick registration at the front desk accepts an age instead of a date of birth. The stored dob is
-- then an estimate, and this marks it so screens can show it as approximate and staff can correct it.
-- Existing patients were all registered with a real date of birth, hence the false default.
ALTER TABLE "Patient" ADD COLUMN "dob_estimated" BOOLEAN NOT NULL DEFAULT false;
