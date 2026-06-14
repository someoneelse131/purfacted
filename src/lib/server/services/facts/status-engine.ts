import type { FactStatus } from '@prisma/client';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { checkQuorum, effectiveBalance, evidenceScores, statusForBalance } from './scoring';
import type { QuorumResult } from './scoring';
import { resolveVetoes } from './veto';
import { awardMany, type ReputationAward } from '../reputation';
import { evaluateBadges } from '../badges';
import { emitActivity } from '../activity';

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

const DECIDED_STATUSES: FactStatus[] = ['VERIFIED', 'DISPUTED', 'REFUTED'];

interface LoadedFact {
	id: string;
	status: string;
	authorId: string;
	categoryId: string;
	reviewStartedAt: Date;
	sources: {
		id: string;
		side: 'PRO' | 'CONTRA';
		credibility: number;
		addedById: string;
		votes: {
			userId: string;
			value: number;
			weight: number;
			onProbation: boolean;
			createdAt: Date;
		}[];
	}[];
}

async function loadFact(deps: AuthDeps, factId: string): Promise<LoadedFact | null> {
	// soft-deleted facts are inert: never evaluated, decided or paid out
	return deps.prisma.fact.findFirst({
		where: { id: factId, deletedAt: null },
		select: {
			id: true,
			status: true,
			authorId: true,
			categoryId: true,
			reviewStartedAt: true,
			sources: {
				where: { status: 'ACTIVE' },
				select: {
					id: true,
					side: true,
					credibility: true,
					addedById: true,
					votes: {
						select: { userId: true, value: true, weight: true, onProbation: true, createdAt: true }
					}
				}
			}
		}
	});
}

export function quorumInputsOf(
	fact: {
		reviewStartedAt: Date;
		sources: { votes: { userId: string; weight: number; onProbation?: boolean }[] }[];
	},
	now = new Date()
) {
	const allVotes = fact.sources.flatMap((s) => s.votes);
	return {
		// probation votes still contribute their (reduced) weight, but never
		// count as a distinct reviewer toward the quorum (R24)
		totalVoteWeight: allVotes.reduce((sum, v) => sum + v.weight, 0),
		distinctReviewers: new Set(allVotes.filter((v) => !v.onProbation).map((v) => v.userId)).size,
		reviewAgeHours: (now.getTime() - fact.reviewStartedAt.getTime()) / 3_600_000
	};
}

// Evaluates a fact and decides it when quorum is reached. Safe to call often;
// the decision itself is guarded so payouts run exactly once.
export async function evaluateFact(deps: AuthDeps, factId: string): Promise<FactEvaluation | null> {
	const fact = await loadFact(deps, factId);
	if (!fact) return null;

	const [
		minTotalWeight,
		minReviewers,
		minReviewHours,
		verifiedThreshold,
		refutedThreshold,
		confidenceK
	] = await Promise.all([
		getConfigNumber(deps, 'quorum.min_total_weight'),
		getConfigNumber(deps, 'quorum.min_reviewers'),
		getConfigNumber(deps, 'quorum.min_review_hours'),
		getConfigNumber(deps, 'status.verified_threshold'),
		getConfigNumber(deps, 'status.refuted_threshold'),
		getConfigNumber(deps, 'scoring.confidence_k')
	]);

	const quorum = checkQuorum(quorumInputsOf(fact), {
		minTotalWeight,
		minReviewers,
		minReviewHours
	});
	const scores = evidenceScores(fact.sources);
	// status is decided on the confidence-damped balance (R24), not the raw one
	const balance = effectiveBalance(scores, confidenceK);
	const result: FactEvaluation = { factId: fact.id, quorum, balance, decided: false };

	if (fact.status !== 'UNDER_REVIEW' || !quorum.reached) return result;

	const newStatus = statusForBalance(balance, verifiedThreshold, refutedThreshold);

	// claim the decision atomically - whoever flips the row does the payouts
	const claimed = await deps.prisma.fact.updateMany({
		where: { id: fact.id, status: 'UNDER_REVIEW', deletedAt: null },
		data: { status: newStatus, decidedAt: new Date() }
	});
	if (claimed.count === 0) return result;

	// system-driven event (no actor): the quorum decided this, not a user
	await emitActivity(deps, {
		type: 'fact_decided',
		subjectType: 'FACT',
		subjectId: fact.id,
		factId: fact.id,
		categoryId: fact.categoryId,
		payload: { status: newStatus }
	});

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

	// Early-vote consensus bonus (R24): a consensus-matching vote only earns
	// the +1 while the source had less than this accumulated absolute vote
	// weight - rewarding the reviewers who weighed in before the outcome was
	// already obvious, not the bandwagon that piled on afterwards.
	const earlyThreshold = await getConfigNumber(deps, 'rep.early_vote_weight_threshold');

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
			// replay the votes in the order they were cast, tracking the absolute
			// weight that had accumulated before each one
			const ordered = [...source.votes].sort(
				(a, b) => a.createdAt.getTime() - b.createdAt.getTime()
			);
			let accumulated = 0;
			for (const vote of ordered) {
				const wasEarly = accumulated < earlyThreshold;
				accumulated += Math.abs(vote.weight);
				if (wasEarly && Math.sign(vote.value) === consensusSign) {
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

// Expires one overdue review. Veto re-reviews that run out of quorum restore
// the previous decided status and the veto FAILS (a veto must never succeed
// just by stalling the re-review); normal first reviews go UNSUBSTANTIATED.
// Returns true when this call performed the expiry.
async function expireFact(deps: AuthDeps, factId: string, now: Date): Promise<boolean> {
	const openVeto = await deps.prisma.veto.findFirst({
		where: { factId, status: 'OPEN' },
		select: { previousStatus: true }
	});
	const restoredStatus = openVeto?.previousStatus ?? null;
	const expiredStatus: FactStatus = restoredStatus ?? 'UNSUBSTANTIATED';

	// per-fact guarded claim: a concurrent evaluateFact decision wins and this
	// expiry becomes a no-op (no veto resolution, no payout side effects)
	const claimed = await deps.prisma.fact.updateMany({
		where: { id: factId, status: 'UNDER_REVIEW', deletedAt: null },
		data: { status: expiredStatus, decidedAt: now }
	});
	if (claimed.count === 0) return false;

	// system-driven status change (review window ran out): UNSUBSTANTIATED on a
	// first review, or the restored decided status when a veto re-review stalled
	const expired = await deps.prisma.fact.findUnique({
		where: { id: factId },
		select: { categoryId: true }
	});
	await emitActivity(deps, {
		type: 'fact_status_changed',
		subjectType: 'FACT',
		subjectId: factId,
		factId,
		categoryId: expired?.categoryId ?? null,
		payload: { status: expiredStatus, restored: restoredStatus !== null }
	});

	// previousStatus === expiredStatus -> the veto resolves as FAILED
	await resolveVetoes(deps, factId, expiredStatus);
	return true;
}

// Repair pass (crash recovery): re-runs payouts and veto resolution for
// recently decided facts. Both operations are idempotent (ledger dedup,
// guarded veto claims), so this is a no-op when nothing was lost.
async function repairRecentDecisions(deps: AuthDeps, now: Date, batchSize: number): Promise<void> {
	const since = new Date(now.getTime() - 24 * 3_600_000);
	const recent = await deps.prisma.fact.findMany({
		where: { status: { in: DECIDED_STATUSES }, decidedAt: { gte: since }, deletedAt: null },
		orderBy: { decidedAt: 'desc' },
		take: batchSize,
		select: { id: true, status: true }
	});
	for (const fact of recent) {
		const loaded = await loadFact(deps, fact.id);
		if (!loaded) continue;
		await payoutOnDecision(deps, loaded, fact.status as 'VERIFIED' | 'DISPUTED' | 'REFUTED');
		await resolveVetoes(deps, fact.id, fact.status);
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
		where: { status: 'UNDER_REVIEW', reviewDeadline: { lt: now }, deletedAt: null },
		select: { id: true }
	});
	let expired = 0;
	for (const fact of overdue) {
		if (await expireFact(deps, fact.id, now)) expired += 1;
	}

	const candidates = await deps.prisma.fact.findMany({
		where: { status: 'UNDER_REVIEW', deletedAt: null },
		orderBy: { reviewStartedAt: 'asc' },
		take: batchSize,
		select: { id: true }
	});
	let decided = 0;
	for (const candidate of candidates) {
		const result = await evaluateFact(deps, candidate.id);
		if (result?.decided) decided += 1;
	}

	// crash recovery: if a previous process died between the decision claim
	// and the payouts, this re-applies them (idempotent, see above)
	await repairRecentDecisions(deps, now, batchSize);

	return { expired, decided };
}
