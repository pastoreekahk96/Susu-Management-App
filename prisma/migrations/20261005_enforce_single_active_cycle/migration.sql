-- Prevent ambiguous selection of an active SUSU cycle.
-- Partial unique indexes are PostgreSQL-specific and intentionally managed
-- in SQL rather than Prisma's schema.prisma.
-- If multiple ACTIVE cycles already exist, this migration fails safely.
CREATE UNIQUE INDEX "Cycle_only_one_active"
ON "Cycle" ("status")
WHERE "status" = 'ACTIVE';
