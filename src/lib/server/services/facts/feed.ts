import { Prisma, type FactStatus } from '@prisma/client';
import type { AuthDeps } from '../auth/session';

// Main feed + full-text search (R14). Only decided facts appear here;
// facts under review live in the Review Hub.

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
	status: FactStatus;
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
	const statuses = filter.status ? [filter.status] : DECIDED;

	const conditions: Prisma.Sql[] = [Prisma.sql`f.status::text IN (${Prisma.join(statuses)})`];
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

	const orderBy =
		filter.sort === 'most-reviewed'
			? Prisma.sql`review_count DESC, f."decidedAt" DESC NULLS LAST`
			: filter.sort === 'controversial'
				? Prisma.sql`(f.status = 'DISPUTED') DESC, review_count DESC, f."decidedAt" DESC NULLS LAST`
				: Prisma.sql`f."decidedAt" DESC NULLS LAST`;

	const rows = await deps.prisma.$queryRaw<
		{ id: string; review_count: number; total: bigint }[]
	>(Prisma.sql`
		SELECT f.id,
			COUNT(sv.id)::int AS review_count,
			COUNT(*) OVER ()::bigint AS total
		FROM facts f
		JOIN categories c ON c.id = f."categoryId"
		LEFT JOIN categories cp ON cp.id = c."parentId"
		LEFT JOIN sources s ON s."factId" = f.id AND s.status = 'ACTIVE'
		LEFT JOIN source_votes sv ON sv."sourceId" = s.id
		WHERE ${Prisma.join(conditions, ' AND ')}
		GROUP BY f.id
		ORDER BY ${orderBy}
		LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
	`);

	const total = rows.length > 0 ? Number(rows[0].total) : 0;
	const reviewCounts = new Map(rows.map((r) => [r.id, r.review_count]));

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
					status: fact.status,
					categoryName: fact.category.name,
					categorySlug: fact.category.slug,
					author: fact.author.username,
					decidedAt: fact.decidedAt,
					reviewCount: reviewCounts.get(fact.id) ?? 0
				}
			];
		}),
		page,
		pageSize,
		total,
		totalPages: Math.max(1, Math.ceil(total / pageSize))
	};
}
