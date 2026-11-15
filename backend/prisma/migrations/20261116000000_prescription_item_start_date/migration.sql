-- A prescription line can start later than the day it is prescribed (the next step of a dose change).
ALTER TABLE "PrescriptionItem" ADD COLUMN "start_date" DATE;
