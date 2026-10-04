CREATE TABLE "LoginAttempt" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginAttempt_key_key" ON "LoginAttempt"("key");
CREATE INDEX "LoginAttempt_blockedUntil_idx" ON "LoginAttempt"("blockedUntil");