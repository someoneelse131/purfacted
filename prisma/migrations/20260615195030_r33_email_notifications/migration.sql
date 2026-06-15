-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "emailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailNotifyPrefs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "lastEmailNotifyAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notifications_emailedAt_idx" ON "notifications"("emailedAt");
