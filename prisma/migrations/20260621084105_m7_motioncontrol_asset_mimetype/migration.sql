-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'motioncontrol';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "mimeType" TEXT;
