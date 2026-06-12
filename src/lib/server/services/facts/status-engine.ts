import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { checkQuorum, evidenceScores, statusForBalance } from './scoring';
import type { QuorumResult } from './scoring';
import { resolveVetoes } from './veto';
import { awardMany, type ReputationAward } from '../reputation';
import { evaluateBadges } from '../badges';

export { reopenReview } from './review-window';

// Status engine (R12): decides facts once quorum is reached, expires stale
// reviews, pays out reputation per Part A. All thresholds from config.

export interface FactEvaluation {
	factId: string;
	quorum: QuorumResult;
	balance: number | null;
	decided: boolean;
	newStatus?: 'VERIFIED' | 'DISPUTED' | 'REFUTED';
}

interface LoadedFact {
	id: string;
	status: string;
	authorId: string;
	reviewStartedAt: Date;
	sources: {
		id: string;
		side: 'PRO' | 'CONTRA';
		credibility: number;
		addedById: string;
		votes: { userId: string; value: number; weight: number }[];
	}[];
}

async function loadFact(deps: AuthDeps, factId: string): Promise<LoadedFact | null> {
	return deps.prisma.fact.findUnique({
		where: { id: factId },
		select: {
			id: true,
			status: true,
			authorId: true,
			reviewStartedAt: true,
			sources: {
				where: { status: 'ACTIVE' },
				select: {
					id: true,
					side: true,
					credibility: true,
					addedById: true,
					votes: { select: { userId: true, value: true, weight: true } }
				}
			}
		}
	});
}

export function quorumInputsOf(
	fact: {
		reviewStartedAt: Date;
		sources: { votes: { userId: string; value: number; weight: number }[] }[];
	},
	now = new Date()
) {
	const allVotes = fact.sources.flatMap((s) => s.votes);
	return {
		totalVoteWeight: allVotes.reduce((sum, v) => sum + v.weight, 0),
		distinctReviewers: new Set(allVotes.map((v) => v.userId)).size,
		reviewAgeHours: (now.getTime() - fact.reviewStartedAt.getTime()) / 3_600_000
	};
}

// Evaluates a fact and decides it when quorum is reached. Safe to call often;
// the decision itself is guarded so payouts run exactly once.
export async function evaluateFact(deps: AuthDeps, factId: string): Promise<FactEvaluation | null> {
	const fact = await loadFact(deps, factId);
	if (!fact) return null;

	const [minTotalWeight, minReviewers, minReviewHours, verifiedThreshold, refutedThreshold] =
		await Promise.all([
			getConfigNumber(deps, 'quorum.min_total_weight'),
			getConfigNumber(deps, 'quorum.min_reviewers'),
			getConfigNumber(deps, 'quorum.min_review_hours'),
			getConfigNumber(deps, 'status.verified_threshold'),
			getConfigNumber(deps, 'status.refuted_threshold')
		]);

	const quorum = checkQuorum(quorumInputsOf(fact), {
		minTotalWeight,
		minReviewers,
		minReviewHours
	});
	const { balance } = evidenceScores(fact.sources);
	const result: FactEvaluation = { factId: fact.id, quorum, balance, decided: false };

	if (fact.status !== 'UNDER_REVIEW' || !quorum.reached) return result;

	const newStatus = statusForBalance(balance, verifiedThreshold, refutedThreshold);

	// claim the decision atomically - whoever flips the row does the payouts
	const claimed = await deps.prisma.fact.updateMany({
		where: { id: fact.id, status: 'UNDER_REVIEW' },
		data: { status: newStatus, decidedAt: new Date() }
	});
	if (claimed.count === 0) return result;

	await payoutOnDecision(deps, fact, newStatus);
	await resolveVetoes(deps, fact.id, newStatus);
	return { ...result, decided: true, newStatus };
}

async function payoutOnDecision(
	deps: AuthDeps,
	fact: LoadedFact,
	newStatus: 'VERIFIED' | 'DISPUTED' | 'REFUTED'
): Promise<void> {
	// All payouts go through the reputation engine (R21): append-only events
	// deduplicated per (user, action, subject), so re-decisions never
	// double-pay. The fact/source id is the subject.
	const awards: ReputationAward[] = [];

	if (newStatus === 'VERIFIED') {
		awards.push({ userId: fact.authorId, action: 'fact_verified', subjectId: fact.id });
	}
	if (newStatus === 'REFUTED') {
		awards.push({ userId: fact.authorId, action: 'fact_refuted', subjectId: fact.id });
	}

	for (const source of fact.sources) {
		const voteSum = source.votes.reduce((sum, v) => sum + v.value * v.weight, 0);
		if (voteSum > 0) {
			awards.push({
				userId: source.addedById,
				action: 'source_consensus',
				subjectId: source.id
			});
		}
		if (voteSum !== 0) {
			const consensusSign = Math.sign(voteSum);
			for (const vote of source.votes) {
				if (Math.sign(vote.value) === consensusSign) {
					awards.push({
						userId: vote.userId,
						action: 'vote_matched_consensus',
						subjectId: source.id
					});
				}
			}
		}
	}

	await awardMany(deps, awards);

	// consensus payouts may unlock Source Hunter for source adders (R22)
	const affected = [...new Set(awards.map((a) => a.userId))];
	for (const userId of affected) {
		await evaluateBadges(deps, userId);
	}
}

// Periodic tick: expire overdue reviews, then re-evaluate facts whose 48h
// gate may just have opened (quorum can be reached without a new vote).
export async function runStatusTick(
	deps: AuthDeps,
	batchSize = 50
): Promise<{ expired: number; decided: number }> {
	const now = new Date();

	const overdue = await deps.prisma.fact.findMany({
		where: { status: 'UNDER_REVIEW', reviewDeadline: { lt: now } },
		select: { id: true }
	});
	const expired = await deps.prisma.fact.updateMany({
		where: { id: { in: overdue.map((f) => f.id) }, status: 'UNDER_REVIEW' },
		data: { status: 'UNSUBSTANTIATED', decidedAt: now }
	});
	for (const fact of overdue) {
		await resolveVetoes(deps, fact.id, 'UNSUBSTANTIATED');
	}

	const candidates = await deps.prisma.fact.findMany({
		where: { status: 'UNDER_REVIEW' },
		orderBy: { reviewStartedAt: 'asc' },
		take: batchSize,
		select: { id: true }
	});
	let decided = 0;
	for (const candidate of candidates) {
		const result = await evaluateFact(deps, candidate.id);
		if (result?.decided) decided += 1;
	}
	return { expired: expired.count, decided };
}
