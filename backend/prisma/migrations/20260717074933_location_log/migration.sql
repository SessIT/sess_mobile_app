-- CreateTable
CREATE TABLE "location_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "acc" DOUBLE PRECISION,
    "address" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_log_user_id_captured_at_idx" ON "location_log"("user_id", "captured_at");

-- AddForeignKey
ALTER TABLE "location_log" ADD CONSTRAINT "location_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
