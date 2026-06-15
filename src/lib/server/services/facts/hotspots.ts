import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { checkQuorum } from './scoring';
import { quorumInputsOf } from './status-engine';

// Hotspots / "Needs your review" (R31): the under-review facts that most need
// community attention right now. A fact is a hotspot when it is close to
// quorum, freshly contested by a veto, or carries under-reviewed evidence
// (a source with too few votes). The list is ranked by urgency, defined as
// deadline proximity x how much quorum is still missing - facts about to lapse
// to UNSUBSTANTIATED without help float to the top.

export interface HotspotFlags {
	closeToQuorum: boolean;
	freshVeto: boolean;
	underReviewedSources: boolean;
}

// 0..1: how far the review window has elapsed. Approaches 1 as the deadline
// nears (and is clamped to 1 once past it). A degenerate window (deadline <=
// start) is treated as fully elapsed.
export function deadlineProximity(reviewStartedAt: Date, reviewDeadline: Date, now: Date): number {
	const totalMs = reviewDeadline.getTime() - reviewStartedAt.getTime();
	if (totalMs <= 0) return 1;
	const elapsedMs = now.getTime() - reviewStartedAt.getTime();
	return Math.min(1, Math.max(0, elapsedMs / totalMs));
}

export interface UrgencyInput {
	reviewStartedAt: Date;
	reviewDeadline: Date;
	// 0..1 averaged quorum progress (see review-hub / computeQuorumProgress)
	quorumProgress: number;
	now: Date;
}

// urgency = deadline proximity x missing quorum (R31). Both factors are 0..1,
// so urgency is 0..1. Highest for facts that are near their deadline yet still
// short of quorum - exactly the ones a reviewer should act on before they
// expire unproven.
export function hotspotUrgency(input: UrgencyInput): number {
	const proximity = deadlineProximity(input.reviewStartedAt, input.reviewDeadline, input.now);
	const missingQuorum = Math.min(1, Math.max(0, 1 - input.quorumProgress));
	return proximity * missingQuorum;
}

// The averaged 0..1 quorum progress used by both the Review Hub and hotspots.
export function computeQuorumProgress(
	inputs: { totalVoteWeight: number; distinctReviewers: number; reviewAgeHours: number },
	config: { minTotalWeight: number; minReviewers: number; minReviewHours: number }
): number {
	const weightProgress = Math.min(1, inputs.totalVoteWeight / config.minTotalWeight);
	const reviewerProgress = Math.min(1, inputs.distinctReviewers / config.minReviewers);
	const ageProgress = Math.min(1, inputs.reviewAgeHours / config.minReviewHours);
	return (weightProgress + reviewerProgress + ageProgress) / 3;
}

export interface HotspotEntry {
	id: string;
	title: string;
	categoryName: string;
	categorySlug: string;
	author: string;
	reviewDeadline: Date;
	missingReviewers: number;
	missingWeight: number;
	underReviewedSourceCount: number;
	flags: HotspotFlags;
	urgency: number;
}

export interface HotspotFilter {
	categorySlug?: string;
	limit?: number;
}

export async function getHotspots(
	deps: AuthDeps,
	filter: HotspotFilter = {},
	now: Date = new Date()
): Promise<HotspotEntry[]> {
	const [
		minTotalWeight,
		minReviewers,
		minReviewHours,
		closeThreshold,
		freshVetoHours,
		minSourceVotes,
		limit
	] = await Promise.all([
		getConfigNumber(deps, 'quorum.min_total_weight'),
		getConfigNumber(deps, 'quorum.min_reviewers'),
		getConfigNumber(deps, 'quorum.min_review_hours'),
		getConfigNumber(deps, 'hotspots.close_to_quorum_threshold'),
		getConfigNumber(deps, 'hotspots.veto_fresh_hours'),
		getConfigNumber(deps, 'hotspots.min_source_votes'),
		getConfigNumber(deps, 'hotspots.limit')
	]);
	const quorumConfig = { minTotalWeight, minReviewers, minReviewHours };
	const freshVetoCutoff = new Date(now.getTime() - freshVetoHours * 3_600_000);

	const facts = await deps.prisma.fact.findMany({
		where: {
			deletedAt: null,
			status: 'UNDER_REVIEW',
			...(filter.categorySlug
				? {
						category: {
							OR: [{ slug: filter.categorySlug }, { parent: { slug: filter.categorySlug } }]
						}
					}
				: {})
		},
		include: {
			category: { select: { name: true, slug: true } },
			author: { select: { username: true } },
			sources: {
				where: { status: 'ACTIVE' },
				select: {
					_count: { select: { votes: true } },
					votes: { select: { userId: true, weight: true, onProbation: true } }
				}
			},
			vetoes: { where: { status: 'OPEN' }, select: { createdAt: true } }
		}
	});

	const entries: HotspotEntry[] = [];
	for (const fact of facts) {
		const inputs = quorumInputsOf(fact, now);
		const quorum = checkQuorum(inputs, quorumConfig);
		if (quorum.reached) continue; // already decidable, not a review hotspot

		const progress = computeQuorumProgress(inputs, quorumConfig);
		const underReviewedSourceCount = fact.sources.filter(
			(s) => s._count.votes < minSourceVotes
		).length;
		const freshVeto = fact.vetoes.some((v) => v.createdAt >= freshVetoCutoff);

		const flags: HotspotFlags = {
			closeToQuorum: progress >= closeThreshold,
			freshVeto,
			underReviewedSources: underReviewedSourceCount > 0
		};
		if (!flags.closeToQuorum && !flags.freshVeto && !flags.underReviewedSources) continue;

		entries.push({
			id: fact.id,
			title: fact.title,
			categoryName: fact.category.name,
			categorySlug: fact.category.slug,
			author: fact.author.username,
			reviewDeadline: fact.reviewDeadline,
			missingReviewers: quorum.missingReviewers,
			missingWeight: Math.round(quorum.missingWeight * 10) / 10,
			underReviewedSourceCount,
			flags,
			urgency: hotspotUrgency({
				reviewStartedAt: fact.reviewStartedAt,
				reviewDeadline: fact.reviewDeadline,
				quorumProgress: progress,
				now
			})
		});
	}

	entries.sort(
		(a, b) => b.urgency - a.urgency || a.reviewDeadline.getTime() - b.reviewDeadline.getTime()
	);
	return entries.slice(0, filter.limit ?? limit);
}
