-- Full-text search over title + body (R14): generated tsvector + GIN index.
ALTER TABLE "facts"
	ADD COLUMN "searchVector" tsvector
	GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("body", ''))) STORED;

CREATE INDEX "facts_searchVector_idx" ON "facts" USING GIN ("searchVector");
