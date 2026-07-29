/*
  Warnings:

  - A unique constraint covering the columns `[employee_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bank_account" TEXT,
ADD COLUMN     "bank_ifsc" TEXT,
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "blood_group" TEXT,
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "date_of_joining" DATE,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "emergency_contact" TEXT,
ADD COLUMN     "employee_id" TEXT,
ADD COLUMN     "employment_type" TEXT,
ADD COLUMN     "epf_number" TEXT,
ADD COLUMN     "esi_number" TEXT,
ADD COLUMN     "exit_date" DATE,
ADD COLUMN     "exit_formalities_done" BOOLEAN,
ADD COLUMN     "exit_reason" TEXT,
ADD COLUMN     "notice_served" BOOLEAN,
ADD COLUMN     "pan_number" TEXT,
ADD COLUMN     "reporting_manager_id" INTEGER,
ADD COLUMN     "salary_ctc" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "requested_in" TIMESTAMP(3),
    "requested_out" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_corrections_user_id_date_idx" ON "attendance_corrections"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_reporting_manager_id_fkey" FOREIGN KEY ("reporting_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
