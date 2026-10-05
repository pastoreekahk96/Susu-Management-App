-- Prevent multiple active SUSU cycles at the database level.
-- This preserves the existing cycle and rejects any future second ACTIVE cycle.
CREATE UNIQUE INDEX "Cycle_one_active_key"
ON "Cycle" ("status")
WHERE "status" = 'ACTIVE';
