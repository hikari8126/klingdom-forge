-- CreateTable
CREATE TABLE "WorkerStatus" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "beatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerStatus_pkey" PRIMARY KEY ("id")
);
