-- AlterTable
ALTER TABLE "users" ADD COLUMN     "shift_id" INTEGER;

-- CreateTable
CREATE TABLE "shifts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 10,
    "hours_per_day" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "half_day_hours" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "week_off_days" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_locks" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "locked_by_id" INTEGER,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB,

    CONSTRAINT "attendance_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shifts_name_key" ON "shifts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_locks_month_key" ON "attendance_locks"("month");

-- CreateIndex
CREATE INDEX "users_shift_id_idx" ON "users"("shift_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the default shift with the rules the code hardcoded until now
-- (09:30 start, 10-minute grace, 8 h/day, Sunday off), so behaviour is
-- unchanged until an admin edits it.
INSERT INTO "shifts" ("name", "start_time", "end_time", "grace_minutes", "hours_per_day", "half_day_hours", "week_off_days", "is_default")
VALUES ('General Shift', '09:30', '18:30', 10, 8, 4, ARRAY[0]::INTEGER[], true);
