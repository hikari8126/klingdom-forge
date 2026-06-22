ALTER TABLE "Asset" ADD COLUMN "batchId" TEXT;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Asset_batchId_idx" ON "Asset"("batchId");
