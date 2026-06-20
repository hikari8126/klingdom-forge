-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('image2video', 'lipsync');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'submitted', 'processing', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "KlingAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accessKeyEnc" TEXT NOT NULL,
    "secretKeyEnc" TEXT NOT NULL,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KlingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "batchId" TEXT,
    "createdById" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "params" JSONB NOT NULL,
    "klingAccountId" TEXT,
    "klingTaskId" TEXT,
    "resultUrl" TEXT,
    "resultExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_projectId_idx" ON "Job"("projectId");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_klingAccountId_fkey" FOREIGN KEY ("klingAccountId") REFERENCES "KlingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
