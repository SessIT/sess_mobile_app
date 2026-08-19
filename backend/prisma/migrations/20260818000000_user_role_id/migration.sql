-- Collapses the users <-> roles many-to-many onto a single "role_id" column.
-- The owner may have already run these statements by hand in psql. In that case do
-- NOT re-run them: register this migration as already applied instead, with
--   npx prisma migrate resolve --applied 20260818000000_user_role_id
-- Statement order is load-bearing: the backfill MUST run before the DROP, otherwise
-- the user -> role mapping held in "user_roles" is lost forever.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role_id" INTEGER;

-- Backfill: every user only ever had one role, so take the lowest role_id and
-- leave "role_id" NULL for legacy rows that have no join record at all.
UPDATE "users" u SET "role_id" = (SELECT ur."role_id" FROM "user_roles" ur
  WHERE ur."user_id" = u."id" ORDER BY ur."role_id" LIMIT 1);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id")
  REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- DropTable
DROP TABLE "user_roles";
