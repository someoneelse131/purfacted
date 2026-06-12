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
}

export async function listReviewHub(deps: AuthDeps, filter: HubFilter): Promise<HubEntry[]> {
	const [minTotalWeight, minReviewers, minReviewHours] = await Promise.all([
		getConfigNumber(deps, 'quorum.min_total_weight'),
		getConfigNumber(deps, 'quorum.min_reviewers'),
		getConfigNumber(deps, 'quorum.min_review_hours')
	]);

	const facts = await deps.prisma.fact.findMany({
		where: {
			status: filter.tab === 'review' ? 'UNDER_REVIEW' : 'UNSUBSTANTIATED',
			...(filter.categorySlug
				? {
						category: {
							OR: [{ slug: filter.categorySlug }, { parent: { slug: filter.categorySlug } }]
						}
					}
				: {})
		},
		orderBy: { createdAt: filter.sort === 'oldest' ? 'asc' : 'desc' },
		take: 100,
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

	const entries = facts.map((fact) => {
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

	if (filter.sort === 'close-to-quorum') {
		entries.sort((a, b) => b.quorumProgress - a.quorumProgress);
	}
	return entries;
}
