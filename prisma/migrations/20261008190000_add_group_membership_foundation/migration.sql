-- Additive multi-tenant identity foundation. No existing financial tables are modified.
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'MEMBER');

CREATE TABLE "Group" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "role" "GroupRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupMembership_userId_groupId_key" ON "GroupMembership"("userId", "groupId");
CREATE INDEX "GroupMembership_groupId_role_idx" ON "GroupMembership"("groupId", "role");
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
