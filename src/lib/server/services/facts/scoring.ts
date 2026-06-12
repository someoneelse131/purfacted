// Evidence scoring math (Part A / R12), pure and table-testable.
// sourceScore = max(0, sum of weighted votes) * credibility
// balance     = (proScore - contraScore) / (proScore + contraScore)

export interface ScorableVote {
	value: number; // +1 / -1
	weight: number;
}

export interface ScorableSource {
	side: 'PRO' | 'CONTRA';
	credibility: number;
	votes: ScorableVote[];
}

export function sourceScore(source: ScorableSource): number {
	const voteSum = source.votes.reduce((sum, vote) => sum + vote.value * vote.weight, 0);
	return Math.max(0, voteSum) * source.credibility;
}

export interface EvidenceScores {
	proScore: number;
	contraScore: number;
	// -1..+1; null while no source has a positive score (nothing to weigh)
	balance: number | null;
}

export function evidenceScores(sources: ScorableSource[]): EvidenceScores {
	let proScore = 0;
	let contraScore = 0;
	for (const source of sources) {
		const score = sourceScore(source);
		if (source.side === 'PRO') proScore += score;
		else contraScore += score;
	}
	const total = proScore + contraScore;
	return {
		proScore,
		contraScore,
		balance: total === 0 ? null : (proScore - contraScore) / total
	};
}

export type DecidedStatus = 'VERIFIED' | 'DISPUTED' | 'REFUTED';

export function statusForBalance(
	balance: number | null,
	verifiedThreshold: number,
	refutedThreshold: number
): DecidedStatus {
	if (balance !== null && balance >= verifiedThreshold) return 'VERIFIED';
	if (balance !== null && balance <= refutedThreshold) return 'REFUTED';
	return 'DISPUTED';
}

export interface QuorumInput {
	totalVoteWeight: number;
	distinctReviewers: number;
	reviewAgeHours: number;
}

export interface QuorumConfig {
	minTotalWeight: number;
	minReviewers: number;
	minReviewHours: number;
}

export interface QuorumResult {
	reached: boolean;
	missingWeight: number;
	missingReviewers: number;
	missingHours: number;
}

export function checkQuorum(input: QuorumInput, config: QuorumConfig): QuorumResult {
	const missingWeight = Math.max(0, config.minTotalWeight - input.totalVoteWeight);
	const missingReviewers = Math.max(0, config.minReviewers - input.distinctReviewers);
	const missingHours = Math.max(0, config.minReviewHours - input.reviewAgeHours);
	return {
		reached: missingWeight === 0 && missingReviewers === 0 && missingHours === 0,
		missingWeight,
		missingReviewers,
		missingHours
	};
}
