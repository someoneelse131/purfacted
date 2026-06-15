-- CreateEnum
CREATE TYPE "ExpertApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "expert_applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "requestedCategoryIds" TEXT[],
    "credentialFile" TEXT NOT NULL,
    "credentialMime" TEXT NOT NULL,
    "status" "ExpertApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "expert_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expert_applications_userId_idx" ON "expert_applications"("userId");

-- CreateIndex
CREATE INDEX "expert_applications_status_idx" ON "expert_applications"("status");

-- AddForeignKey
ALTER TABLE "expert_applications" ADD CONSTRAINT "expert_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
