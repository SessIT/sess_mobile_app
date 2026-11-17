-- CreateTable
CREATE TABLE "salary_structures" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "effective_from" TEXT NOT NULL,
    "basic" DOUBLE PRECISION NOT NULL,
    "da" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conveyance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "special_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pf_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pf_on_full_wage" BOOLEAN NOT NULL DEFAULT false,
    "esi_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pt_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tds_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tds_monthly_override" DOUBLE PRECISION,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "settings" JSONB NOT NULL,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finalized_by_id" INTEGER,
    "finalized_at" TIMESTAMP(3),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "days_in_month" INTEGER NOT NULL,
    "payable_days" DOUBLE PRECISION NOT NULL,
    "lop_days" DOUBLE PRECISION NOT NULL,
    "paid_days" DOUBLE PRECISION NOT NULL,
    "ot_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL,
    "total_deductions" DOUBLE PRECISION NOT NULL,
    "net_pay" DOUBLE PRECISION NOT NULL,
    "pf_wage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pf_employee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epf_employer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eps_employer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esi_wage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esi_employee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esi_employer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "earnings" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "adjustments" JSONB NOT NULL,
    "employee" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_user_id_effective_from_key" ON "salary_structures"("user_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_month_key" ON "payroll_runs"("month");

-- CreateIndex
CREATE INDEX "payslips_user_id_month_idx" ON "payslips"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_run_id_user_id_key" ON "payslips"("run_id", "user_id");

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

