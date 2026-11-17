-- CreateTable
CREATE TABLE "request_approvals" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "request_id" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'manager',
    "decision" TEXT NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "request_approvals_actor_id_idx" ON "request_approvals"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "request_approvals_kind_request_id_stage_key" ON "request_approvals"("kind", "request_id", "stage");

