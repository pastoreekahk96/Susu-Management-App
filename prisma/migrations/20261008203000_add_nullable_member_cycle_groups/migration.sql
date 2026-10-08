-- Transitional tenancy links. Existing rows remain unassigned (NULL).
-- No backfill or financial values are changed. Existing uniqueness rules remain.
BEGIN;

ALTER TABLE "Member" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Cycle" ADD COLUMN "groupId" TEXT;

CREATE INDEX "Member_groupId_idx" ON "Member"("groupId");
CREATE INDEX "Cycle_groupId_idx" ON "Cycle"("groupId");

ALTER TABLE "Member" ADD CONSTRAINT "Member_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
