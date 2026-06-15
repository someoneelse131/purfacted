import type { FactStatus } from '@prisma/client';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber, getConfigValue } from '../config';

// Duplicate claim detection (R27). A `SimilarityProvider` ranks existing facts
// by title similarity to a candidate claim. The baseline uses PostgreSQL's
// pg_trgm `similarity()` over fact titles; an embedding-based provider lands
// later behind the R40 feature flag - the interface is designed for it now.

export interface SimilarFact {
	id: string;
	title: string;
	status: FactStatus;
	similarity: number;
}

export interface SimilarityQuery {
	title: string;
	// when re-checking an already-persisted fact, exclude it from its own results
	excludeId?: string;
	limit: number;
	minSimilarity: number;
}

export interface SimilarityProvider {
	readonly name: string;
	findSimilar(deps: AuthDeps, query: SimilarityQuery): Promise<SimilarFact[]>;
}

interface SimilarRow {
	id: string;
	title: string;
	status: FactStatus;
	sim: number;
}

// Baseline provider: pg_trgm trigram similarity over fact titles. Merged
// duplicates (`duplicateOfId`) and moderation-removed facts (`deletedAt`) are
// never offered as candidates.
export const trigramProvider: SimilarityProvider = {
	name: 'trgm',
	async findSimilar(deps, query) {
		const title = query.title.trim();
		if (title.length === 0) return [];
		const excludeId = query.excludeId ?? null;
		const rows = await deps.prisma.$queryRaw<SimilarRow[]>`
			SELECT id, title, status, similarity(title, ${title})::float8 AS sim
			FROM facts
			WHERE "deletedAt" IS NULL
				AND "duplicateOfId" IS NULL
				AND (${excludeId}::text IS NULL OR id <> ${excludeId})
				AND similarity(title, ${title}) >= ${query.minSimilarity}
			ORDER BY sim DESC, "createdAt" DESC
			LIMIT ${query.limit}
		`;
		return rows.map((row) => ({
			id: row.id,
			title: row.title,
			status: row.status,
			similarity: row.sim
		}));
	}
};

const PROVIDERS: Record<string, SimilarityProvider> = {
	trgm: trigramProvider
};

// Resolves the configured provider (`dedup.provider`). An unknown value (e.g.
// "embedding" before R40 ships it) falls back to the trgm baseline so a
// mis-set flag can never break the submit flow.
export async function getSimilarityProvider(deps: AuthDeps): Promise<SimilarityProvider> {
	const name = await getConfigValue(deps, 'dedup.provider');
	return PROVIDERS[name] ?? trigramProvider;
}

// High-level helper used by the submit flow and the merge UI: ranks existing
// facts similar to `title`, honoring the configured threshold and limit.
export async function findSimilarFacts(
	deps: AuthDeps,
	title: string,
	opts?: { excludeId?: string }
): Promise<SimilarFact[]> {
	const [limit, minSimilarity] = await Promise.all([
		getConfigNumber(deps, 'dedup.candidate_limit'),
		getConfigNumber(deps, 'dedup.min_similarity')
	]);
	const provider = await getSimilarityProvider(deps);
	return provider.findSimilar(deps, { title, excludeId: opts?.excludeId, limit, minSimilarity });
}
