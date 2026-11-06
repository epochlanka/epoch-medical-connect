-- An administrator reopening a closed day (see CashDayReopen in schema.prisma).

CREATE TABLE "CashDayReopen" (
    "reopen_id" SERIAL NOT NULL,
    "business_date" TEXT NOT NULL,
    "previous_close_json" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reopened_by" INTEGER NOT NULL,
    "reopened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDayReopen_pkey" PRIMARY KEY ("reopen_id")
);

CREATE INDEX "CashDayReopen_business_date_idx" ON "CashDayReopen"("business_date");

ALTER TABLE "CashDayReopen" ADD CONSTRAINT "CashDayReopen_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security on, no policies — as for every other table.
ALTER TABLE "CashDayReopen" ENABLE ROW LEVEL SECURITY;
