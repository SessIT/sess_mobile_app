-- CreateTable
CREATE TABLE "ot_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'employee',
    "review_note" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ot_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ot_requests_user_id_date_idx" ON "ot_requests"("user_id", "date");

-- CreateIndex
CREATE INDEX "ot_requests_status_date_idx" ON "ot_requests"("status", "date");

-- AddForeignKey
ALTER TABLE "ot_requests" ADD CONSTRAINT "ot_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_requests" ADD CONSTRAINT "ot_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
