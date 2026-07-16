-- CreateTable
CREATE TABLE "attendance_session" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "punch_in_time" TIMESTAMP(3) NOT NULL,
    "punch_out_time" TIMESTAMP(3),
    "punch_in_lat" DOUBLE PRECISION,
    "punch_in_lng" DOUBLE PRECISION,
    "punch_in_acc" DOUBLE PRECISION,
    "punch_out_lat" DOUBLE PRECISION,
    "punch_out_lng" DOUBLE PRECISION,
    "punch_out_acc" DOUBLE PRECISION,
    "working_hours" DOUBLE PRECISION,
    "is_late" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_session_user_id_punch_in_time_idx" ON "attendance_session"("user_id", "punch_in_time");

-- AddForeignKey
ALTER TABLE "attendance_session" ADD CONSTRAINT "attendance_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
