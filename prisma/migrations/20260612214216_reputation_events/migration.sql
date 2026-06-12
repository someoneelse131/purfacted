-- CreateTable
CREATE TABLE "reputation_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reputation_events_userId_idx" ON "reputation_events"("userId");

-- CreateIndex
CREATE INDEX "reputation_events_createdAt_idx" ON "reputation_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reputation_events_userId_action_subjectId_key" ON "reputation_events"("userId", "action", "subjectId");

-- AddForeignKey
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
