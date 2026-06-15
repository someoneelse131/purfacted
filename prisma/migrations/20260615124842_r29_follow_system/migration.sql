-- CreateEnum
CREATE TYPE "FollowTargetType" AS ENUM ('USER', 'CATEGORY');

-- DropIndex
DROP INDEX "facts_title_trgm_idx";

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "targetType" "FollowTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follows_targetType_targetId_idx" ON "follows"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "follows_followerId_targetType_targetId_key" ON "follows"("followerId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
