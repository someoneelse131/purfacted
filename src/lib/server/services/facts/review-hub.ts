import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { checkQuorum, evidenceScores } from './scoring';
import { quorumInputsOf } from './status-engine';

// Review Hub queries (R13): facts under review with quorum progress and a
// neutral balance indicator; UNSUBSTANTIATED facts on their own tab.

export type HubTab = 'review' | 'unsubstantiated';
export type HubSort = 'newest' | 'oldest' | 'close-to-quorum';

export interface HubEntry {
	id: string;
	title: string;
	categoryName: string;
	categorySlug: string;
	author: string;
	createdAt: Date;
	sourceCount: number;
	balance: number | null;
	quorumReached: boolean;
	missingWeight: number;
	missingReviewers: number;
	missingHours: number;
	// 0..1, how close the fact is to quorum (for sorting)
	quorumProgress: number;
}

export interface HubFilter {
	tab: HubTab;
	categorySlug?: string;
	sort: HubSort;
	page?: number;
}

export interface HubPage {
	entries: HubEntry[];
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

export async function listReviewHub(deps: AuthDeps, filter: HubFilter): Promise<HubPage> {
	const [minTotalWeight, minReviewers, minReviewHours, pageSize] = await Promise.all([
		getConfigNumber(deps, 'quorum.min_total_weight'),
		getConfigNumber(deps, 'quorum.min_reviewers'),
		getConfigNumber(deps, 'quorum.min_review_hours'),
		getConfigNumber(deps, 'review.page_size')
	]);
	const page = Math.max(1, filter.page ?? 1);

	const where = {
		deletedAt: null,
		status: (filter.tab === 'review' ? 'UNDER_REVIEW' : 'UNSUBSTANTIATED') as
			| 'UNDER_REVIEW'
			| 'UNSUBSTANTIATED',
		...(filter.categorySlug
			? {
					category: {
						OR: [{ slug: filter.categorySlug }, { parent: { slug: filter.categorySlug } }]
					}
				}
			: {})
	};
	const total = await deps.prisma.fact.count({ where });
	// close-to-quorum is computed from vote data, so it has to rank ALL
	// matching facts in memory before slicing the page; the date sorts
	// paginate in the database
	const inMemorySort = filter.sort === 'close-to-quorum';
	const facts = await deps.prisma.fact.findMany({
		where,
		orderBy: { createdAt: filter.sort === 'oldest' ? 'asc' : 'desc' },
		...(inMemorySort ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
		include: {
			category: { select: { name: true, slug: true } },
			author: { select: { username: true } },
			sources: {
				where: { status: 'ACTIVE' },
				select: {
					side: true,
					credibility: true,
					votes: { select: { userId: true, value: true, weight: true } }
				}
			}
		}
	});

	let entries = facts.map((fact) => {
		const inputs = quorumInputsOf(fact);
		const quorum = checkQuorum(inputs, { minTotalWeight, minReviewers, minReviewHours });
		const { balance } = evidenceScores(fact.sources);
		const weightProgress = Math.min(1, inputs.totalVoteWeight / minTotalWeight);
		const reviewerProgress = Math.min(1, inputs.distinctReviewers / minReviewers);
		const ageProgress = Math.min(1, inputs.reviewAgeHours / minReviewHours);
		return {
			id: fact.id,
			title: fact.title,
			categoryName: fact.category.name,
			categorySlug: fact.category.slug,
			author: fact.author.username,
			createdAt: fact.createdAt,
			sourceCount: fact.sources.length,
			balance,
			quorumReached: quorum.reached,
			missingWeight: Math.round(quorum.missingWeight * 10) / 10,
			missingReviewers: quorum.missingReviewers,
			missingHours: Math.ceil(quorum.missingHours),
			quorumProgress: (weightProgress + reviewerProgress + ageProgress) / 3
		};
	});

	if (inMemorySort) {
		entries.sort((a, b) => b.quorumProgress - a.quorumProgress);
		entries = entries.slice((page - 1) * pageSize, page * pageSize);
	}
	return {
		entries,
		page,
		pageSize,
		total,
		totalPages: Math.max(1, Math.ceil(total / pageSize))
	};
}
