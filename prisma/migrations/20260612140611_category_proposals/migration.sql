-- AlterEnum
ALTER TYPE "CategoryStatus" ADD VALUE 'DISABLED';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "proposedById" TEXT;

-- CreateIndex
CREATE INDEX "categories_status_idx" ON "categories"("status");
