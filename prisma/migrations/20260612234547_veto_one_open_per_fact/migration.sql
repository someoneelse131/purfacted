-- At most one OPEN veto per fact (R16). Partial unique indexes cannot be
-- expressed in the Prisma schema; the veto service maps the P2002 unique
-- violation to "this fact already has an open veto".
CREATE UNIQUE INDEX "vetoes_one_open_per_fact" ON "vetoes"("factId") WHERE "status" = 'OPEN';
