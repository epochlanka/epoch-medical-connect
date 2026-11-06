-- End-of-day cash count (FR-076): one signed-off close per clinic day, comparing what the desk
-- counted with what the system recorded. See CashDayClose in schema.prisma.

CREATE TABLE "CashDayClose" (
    "close_id" SERIAL NOT NULL,
    "business_date" TEXT NOT NULL,
    "opening_float" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lines_json" TEXT NOT NULL,
    "denominations_json" TEXT,
    "expected_total" DOUBLE PRECISION NOT NULL,
    "counted_total" DOUBLE PRECISION NOT NULL,
    "variance_total" DOUBLE PRECISION NOT NULL,
    "payment_count" INTEGER NOT NULL,
    "refund_count" INTEGER NOT NULL,
    "notes" TEXT,
    "closed_by" INTEGER NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDayClose_pkey" PRIMARY KEY ("close_id")
);

CREATE UNIQUE INDEX "CashDayClose_business_date_key" ON "CashDayClose"("business_date");

ALTER TABLE "CashDayClose" ADD CONSTRAINT "CashDayClose_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same as every other table (20260921000000_lock_down_public_schema): row-level security on with
-- no policies, so nothing but the application's own owner connection can read it.
ALTER TABLE "CashDayClose" ENABLE ROW LEVEL SECURITY;
