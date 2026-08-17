-- CreateTable
CREATE TABLE "expense_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "bill_path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_requests_user_id_created_at_idx" ON "expense_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "expense_requests_status_created_at_idx" ON "expense_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_requests" ADD CONSTRAINT "expense_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
