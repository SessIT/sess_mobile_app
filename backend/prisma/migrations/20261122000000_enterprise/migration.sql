-- DropIndex
DROP INDEX "holidays_date_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "biometric_id" TEXT,
ADD COLUMN     "branch_id" INTEGER;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "attendance_session" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'mobile';

-- AlterTable
ALTER TABLE "holidays" ADD COLUMN     "branch_id" INTEGER;

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "state" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "user_name" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "status" INTEGER NOT NULL,
    "ip" TEXT,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_devices" (
    "id" SERIAL NOT NULL,
    "serial_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch_id" INTEGER,
    "site_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_logs" (
    "id" SERIAL NOT NULL,
    "device_sn" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "punch_time" TIMESTAMP(3) NOT NULL,
    "user_id" INTEGER,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_openings" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "branch_id" INTEGER,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "experience_years" DOUBLE PRECISION,
    "current_ctc" DOUBLE PRECISION,
    "expected_ctc" DOUBLE PRECISION,
    "notice_days" INTEGER,
    "stage" TEXT NOT NULL DEFAULT 'applied',
    "resume_path" TEXT,
    "resume_mime" TEXT,
    "notes" TEXT,
    "offered_ctc" DOUBLE PRECISION,
    "joining_date" TEXT,
    "hired_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" SERIAL NOT NULL,
    "candidate_id" INTEGER NOT NULL,
    "interviewer_id" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "rating" INTEGER,
    "recommendation" TEXT,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content_url" TEXT,
    "duration_mins" INTEGER,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "due_date" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_assignments" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "course_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_tasks" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "period" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filed_on" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_created_at_idx" ON "audit_logs"("entity", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_devices_serial_no_key" ON "biometric_devices"("serial_no");

-- CreateIndex
CREATE INDEX "biometric_logs_created_at_idx" ON "biometric_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_logs_device_sn_pin_punch_time_key" ON "biometric_logs"("device_sn", "pin", "punch_time");

-- CreateIndex
CREATE INDEX "candidates_job_id_stage_idx" ON "candidates"("job_id", "stage");

-- CreateIndex
CREATE INDEX "interviews_interviewer_id_scheduled_at_idx" ON "interviews"("interviewer_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "course_assignments_user_id_idx" ON "course_assignments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_assignments_course_id_user_id_key" ON "course_assignments"("course_id", "user_id");

-- CreateIndex
CREATE INDEX "compliance_tasks_due_date_idx" ON "compliance_tasks"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_tasks_title_due_date_key" ON "compliance_tasks"("title", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "users_biometric_id_key" ON "users"("biometric_id");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_branch_id_key" ON "holidays"("date", "branch_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_openings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_assignments" ADD CONSTRAINT "course_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

