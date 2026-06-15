-- AlterTable
ALTER TABLE "facts" ADD COLUMN     "duplicateOfId" TEXT;

-- CreateIndex
CREATE INDEX "facts_duplicateOfId_idx" ON "facts"("duplicateOfId");

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- R27: pg_trgm baseline for duplicate-claim detection over fact titles.
-- The trigram GIN index keeps similarity() scans fast as the corpus grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "facts_title_trgm_idx" ON "facts" USING GIN ("title" gin_trgm_ops);
