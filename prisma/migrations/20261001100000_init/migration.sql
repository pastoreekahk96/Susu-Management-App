-- Initial SUSU Management schema
CREATE TYPE "CycleStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "WeekStatus" AS ENUM ('OPEN', 'ELIGIBLE', 'PAID');
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');
CREATE TYPE "PayoutStatus" AS ENUM ('DRAWN', 'COLLECTED');
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "numberOfWeeks" INTEGER NOT NULL,
    "contributionPerHandDay" INTEGER NOT NULL,
    "daysPerWeek" INTEGER NOT NULL,
    "totalHandsSnapshot" INTEGER NOT NULL,
    "weeklyPayoutAmount" INTEGER NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CycleMember" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "handsCount" INTEGER NOT NULL,
    CONSTRAINT "CycleMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CycleHand" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleMemberId" TEXT NOT NULL,
    "handNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "CycleHand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "WeekStatus" NOT NULL DEFAULT 'OPEN',
    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyPayment" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "cycleMemberId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "expectedAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'DRAWN',
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" TIMESTAMP(3),
    "recordedById" TEXT,
    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Member_name_key" ON "Member"("name");
CREATE INDEX "Cycle_status_idx" ON "Cycle"("status");
CREATE UNIQUE INDEX "CycleMember_cycleId_memberId_key" ON "CycleMember"("cycleId", "memberId");
CREATE UNIQUE INDEX "CycleHand_cycleId_handNumber_key" ON "CycleHand"("cycleId", "handNumber");
CREATE UNIQUE INDEX "CycleHand_cycleMemberId_handNumber_key" ON "CycleHand"("cycleMemberId", "handNumber");
CREATE INDEX "CycleHand_cycleId_status_idx" ON "CycleHand"("cycleId", "status");
CREATE UNIQUE INDEX "Week_cycleId_weekNumber_key" ON "Week"("cycleId", "weekNumber");
CREATE INDEX "Week_cycleId_startDate_idx" ON "Week"("cycleId", "startDate");
CREATE UNIQUE INDEX "DailyPayment_weekId_cycleMemberId_dayIndex_key" ON "DailyPayment"("weekId", "cycleMemberId", "dayIndex");
CREATE INDEX "DailyPayment_weekId_paymentDate_idx" ON "DailyPayment"("weekId", "paymentDate");
CREATE UNIQUE INDEX "Payout_weekId_key" ON "Payout"("weekId");
CREATE UNIQUE INDEX "Payout_handId_key" ON "Payout"("handId");
CREATE INDEX "Payout_status_idx" ON "Payout"("status");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "CycleMember"
    ADD CONSTRAINT "CycleMember_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CycleMember"
    ADD CONSTRAINT "CycleMember_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CycleHand"
    ADD CONSTRAINT "CycleHand_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CycleHand"
    ADD CONSTRAINT "CycleHand_cycleMemberId_fkey"
    FOREIGN KEY ("cycleMemberId") REFERENCES "CycleMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Week"
    ADD CONSTRAINT "Week_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyPayment"
    ADD CONSTRAINT "DailyPayment_weekId_fkey"
    FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyPayment"
    ADD CONSTRAINT "DailyPayment_cycleMemberId_fkey"
    FOREIGN KEY ("cycleMemberId") REFERENCES "CycleMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyPayment"
    ADD CONSTRAINT "DailyPayment_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payout"
    ADD CONSTRAINT "Payout_weekId_fkey"
    FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payout"
    ADD CONSTRAINT "Payout_handId_fkey"
    FOREIGN KEY ("handId") REFERENCES "CycleHand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payout"
    ADD CONSTRAINT "Payout_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
