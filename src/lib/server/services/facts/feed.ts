import { Prisma, type FactStatus } from '@prisma/client';
import type { AuthDeps } from '../auth/session';

// Main feed + full-text search (R14). Decided facts appear here, plus facts
// back under review under an open veto (R24: they stay in the feed as
// "contested", keeping their previous decided status). Plain under-review
// facts live in the Review Hub.

export type FeedSort = 'newest' | 'most-reviewed' | 'controversial';
export type DecidedFilter = 'VERIFIED' | 'DISPUTED' | 'REFUTED';

export interface FeedFilter {
	sort: FeedSort;
	status?: DecidedFilter;
	categorySlug?: string;
	query?: string;
	page: number;
	pageSize?: number;
}

export interface FeedEntry {
	id: string;
	title: string;
	// effective status: the previous decided status while contested (R24)
	status: FactStatus;
	// true while the fact is back under review under an open veto (R24)
	contested: boolean;
	categoryName: string;
	categorySlug: string;
	author: string;
	decidedAt: Date | null;
	reviewCount: number;
}

export interface FeedPage {
	entries: FeedEntry[];
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

const DECIDED: DecidedFilter[] = ['VERIFIED', 'DISPUTED', 'REFUTED'];

export async function listFeed(deps: AuthDeps, filter: FeedFilter): Promise<FeedPage> {
	const pageSize = filter.pageSize ?? 20;
	const page = Math.max(1, filter.page);

	// A fact appears in the feed when it is decided OR when it is back under
	// review under an open veto (R24 "veto stays in feed"). The latter keeps
	// its previous decided status as the effective status. ov is at most one
	// row per fact (partial unique index: one OPEN veto per fact).
	const effectiveStatus = Prisma.sql`COALESCE(ov."previousStatus"::text, f.status::text)`;
	const conditions: Prisma.Sql[] = [
		Prisma.sql`f."deletedAt" IS NULL`,
		Prisma.sql`(
			f.status::text IN (${Prisma.join(DECIDED)})
			OR (f.status = 'UNDER_REVIEW' AND ov.id IS NOT NULL AND ov."previousStatus" IS NOT NULL)
		)`
	];
	if (filter.status) {
		conditions.push(Prisma.sql`${effectiveStatus} = ${filter.status}`);
	}
	if (filter.categorySlug) {
		conditions.push(
			Prisma.sql`(c.slug = ${filter.categorySlug} OR cp.slug = ${filter.categorySlug})`
		);
	}
	if (filter.query?.trim()) {
		conditions.push(
			Prisma.sql`f."searchVector" @@ websearch_to_tsquery('english', ${filter.query.trim()})`
		);
	}

	// contested facts have no decidedAt (reset on veto reopen); fall back to
	// reviewStartedAt so they sort by recency instead of sinking to the bottom
	const recency = Prisma.sql`COALESCE(f."decidedAt", f."reviewStartedAt") DESC`;
	const orderBy =
		filter.sort === 'most-reviewed'
			? Prisma.sql`review_count DESC, ${recency}`
			: filter.sort === 'controversial'
				? Prisma.sql`(f.status = 'DISPUTED') DESC, review_count DESC, ${recency}`
				: recency;

	const rows = await deps.prisma.$queryRaw<
		{
			id: string;
			effective_status: FactStatus;
			contested: boolean;
			review_count: number;
			total: bigint;
		}[]
	>(Prisma.sql`
		SELECT f.id,
			${effectiveStatus}::text AS effective_status,
			(ov.id IS NOT NULL) AS contested,
			COUNT(sv.id)::int AS review_count,
			COUNT(*) OVER ()::bigint AS total
		FROM facts f
		JOIN categories c ON c.id = f."categoryId"
		LEFT JOIN categories cp ON cp.id = c."parentId"
		LEFT JOIN vetoes ov ON ov."factId" = f.id AND ov.status = 'OPEN'
		LEFT JOIN sources s ON s."factId" = f.id AND s.status = 'ACTIVE'
		LEFT JOIN source_votes sv ON sv."sourceId" = s.id
		WHERE ${Prisma.join(conditions, ' AND ')}
		GROUP BY f.id, ov.id, ov."previousStatus"
		ORDER BY ${orderBy}
		LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
	`);

	const total = rows.length > 0 ? Number(rows[0].total) : 0;
	const byRow = new Map(rows.map((r) => [r.id, r]));

	const facts = await deps.prisma.fact.findMany({
		where: { id: { in: rows.map((r) => r.id) } },
		include: {
			category: { select: { name: true, slug: true } },
			author: { select: { username: true } }
		}
	});
	const byId = new Map(facts.map((f) => [f.id, f]));

	return {
		entries: rows.flatMap((row) => {
			const fact = byId.get(row.id);
			if (!fact) return [];
			return [
				{
					id: fact.id,
					title: fact.title,
					status: row.effective_status,
					contested: row.contested,
					categoryName: fact.category.name,
					categorySlug: fact.category.slug,
					author: fact.author.username,
					decidedAt: fact.decidedAt,
					reviewCount: byRow.get(fact.id)?.review_count ?? 0
				}
			];
		}),
		page,
		pageSize,
		total,
		totalPages: Math.max(1, Math.ceil(total / pageSize))
	};
}
