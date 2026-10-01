-- Harden payout selection and hand status
CREATE TYPE "HandStatus" AS ENUM ('PENDING', 'SELECTED');
CREATE TYPE "PayoutSelectionMethod" AS ENUM ('RANDOM', 'MANUAL');

ALTER TABLE "CycleHand"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "CycleHand"
  ALTER COLUMN "status" TYPE "HandStatus"
  USING "status"::"HandStatus";

ALTER TABLE "CycleHand"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "Payout"
  ADD COLUMN "selectionMethod" "PayoutSelectionMethod" NOT NULL DEFAULT 'RANDOM',
  ADD COLUMN "manualReason" TEXT;

