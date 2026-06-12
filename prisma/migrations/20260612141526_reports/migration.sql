-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('FACT', 'SOURCE', 'COMMENT', 'USER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");
