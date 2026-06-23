-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "klingAccountId" TEXT;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_klingAccountId_fkey" FOREIGN KEY ("klingAccountId") REFERENCES "KlingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
