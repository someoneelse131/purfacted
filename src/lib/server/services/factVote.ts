import { db } from '../db';
import type { FactVote, Fact, FactStatus } from '@prisma/client';
import { calculateVoteWeight } from '$lib/utils/voteWeight';

// Configuration defaults
const FACT_MIN_VOTES_FOR_STATUS = parseInt(process.env.FACT_MIN_VOTES_FOR_STATUS || '20');
const FACT_PROVEN_THRESHOLD = parseInt(process.env.FACT_PROVEN_THRESHOLD || '75');
const FACT_DISPROVEN_THRESHOLD = parseInt(process.env.FACT_DISPROVEN_THRESHOLD || '25');

// Debounce tracking - in-memory for simplicity (could use Redis for distributed)
const voteDebounce = new Map<string, number>();
const DEBOUNCE_MS = 1000; // 1 second debounce

export class VoteError extends Error {
	constructor(
		message: string,
		public code: string
	) {
		super(message);
		this.name = 'VoteError';
	}
}

/**
 * Check if user can vote (debounce rapid clicks)
 */
function checkDebounce(userId: string, factId: string): boolean {
	const key = `${userId}:${factId}`;
	const lastVote = voteDebounce.get(key);
	const now = Date.now();

	if (lastVote && now - lastVote < DEBOUNCE_MS) {
		return false;
	}

	voteDebounce.set(key, now);
	return true;
}

/**
 * Vote on a fact (upvote or downvote)
 */
export async function voteOnFact(
	userId: string,
	factId: string,
	value: 1 | -1
): Promise<{
	vote: FactVote;
	factScore: number;
	statusChanged: boolean;
	newStatus?: FactStatus;
}> {
	// Check debounce
	if (!checkDebounce(userId, factId)) {
		throw new VoteError('Please wait before voting again', 'DEBOUNCE');
	}

	// Get user for vote weight calculation
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { id: true, userType: true, trustScore: true, emailVerified: true, bannedUntil: true }
	});

	if (!user) {
		throw new VoteError('User not found', 'USER_NOT_FOUND');
	}

	if (!user.emailVerified) {
		throw new VoteError('Please verify your email before voting', 'EMAIL_NOT_VERIFIED');
	}

	if (user.bannedUntil && user.bannedUntil > new Date()) {
		throw new VoteError('Your account is currently suspended', 'USER_BANNED');
	}

	// Get fact
	const fact = await db.fact.findUnique({
		where: { id: factId }
	});

	if (!fact) {
		throw new VoteError('Fact not found', 'FACT_NOT_FOUND');
	}

	// Users cannot vote on their own facts
	if (fact.userId === userId) {
		throw new VoteError('Cannot vote on your own fact', 'OWN_FACT');
	}

	// Calculate vote weight
	const weight = calculateVoteWeight(user.userType, user.trustScore);

	// Upsert vote (allows changing vote)
	const vote = await db.factVote.upsert({
		where: {
			factId_userId: { factId, userId }
		},
		create: {
			factId,
			userId,
			value,
			weight
		},
		update: {
			value,
			weight
		}
	});

	// Calculate new fact score and check for status change
	const { score, statusChanged, newStatus } = await updateFactScore(factId);

	return {
		vote,
		factScore: score,
		statusChanged,
		newStatus
	};
}

/**
 * Remove vote from a fact
 */
export async function removeVote(userId: string, factId: string): Promise<void> {
	const existing = await db.factVote.findUnique({
		where: { factId_userId: { factId, userId } }
	});

	if (!existing) {
		throw new VoteError('Vote not found', 'VOTE_NOT_FOUND');
	}

	await db.factVote.delete({
		where: { factId_userId: { factId, userId } }
	});

	// Update fact score after vote removal
	await updateFactScore(factId);
}

/**
 * Calculate weighted score for a fact
 */
export async function calculateFactScore(factId: string): Promise<{
	score: number;
	totalVotes: number;
	upvotes: number;
	downvotes: number;
	weightedUp: number;
	weightedDown: number;
	positivePercent: number;
}> {
	const votes = await db.factVote.findMany({
		where: { factId }
	});

	let weightedUp = 0;
	let weightedDown = 0;
	let upvotes = 0;
	let downvotes = 0;

	for (const vote of votes) {
		if (vote.value > 0) {
			weightedUp += vote.weight;
			upvotes++;
		} else {
			weightedDown += vote.weight;
			downvotes++;
		}
	}

	const score = weightedUp - weightedDown;
	const totalWeighted = weightedUp + weightedDown;
	const positivePercent = totalWeighted > 0 ? (weightedUp / totalWeighted) * 100 : 50;

	return {
		score,
		totalVotes: votes.length,
		upvotes,
		downvotes,
		weightedUp,
		weightedDown,
		positivePercent
	};
}

/**
 * Update fact score and potentially change status
 */
async function updateFactScore(factId: string): Promise<{
	score: number;
	statusChanged: boolean;
	newStatus?: FactStatus;
}> {
	const scoreData = await calculateFactScore(factId);
	const fact = await db.fact.findUnique({
		where: { id: factId }
	});

	if (!fact) {
		return { score: scoreData.score, statusChanged: false };
	}

	// Only update status if minimum votes reached and not under veto review
	if (
		scoreData.totalVotes < FACT_MIN_VOTES_FOR_STATUS ||
		fact.status === 'UNDER_VETO_REVIEW'
	) {
		return { score: scoreData.score, statusChanged: false };
	}

	// Determine new status based on thresholds
	let newStatus: FactStatus;
	if (scoreData.positivePercent >= FACT_PROVEN_THRESHOLD) {
		newStatus = 'PROVEN';
	} else if (scoreData.positivePercent <= FACT_DISPROVEN_THRESHOLD) {
		newStatus = 'DISPROVEN';
	} else {
		newStatus = 'CONTROVERSIAL';
	}

	// Only update if status actually changed
	if (newStatus !== fact.status && fact.status !== 'SUBMITTED') {
		await db.fact.update({
			where: { id: factId },
			data: { status: newStatus }
		});

		return { score: scoreData.score, statusChanged: true, newStatus };
	}

	// If fact is still SUBMITTED and meets threshold, move to appropriate status
	if (fact.status === 'SUBMITTED') {
		await db.fact.update({
			where: { id: factId },
			data: { status: newStatus }
		});

		return { score: scoreData.score, statusChanged: true, newStatus };
	}

	return { score: scoreData.score, statusChanged: false };
}

/**
 * Get user's vote on a fact
 */
export async function getUserVote(
	userId: string,
	factId: string
): Promise<FactVote | null> {
	return db.factVote.findUnique({
		where: { factId_userId: { factId, userId } }
	});
}

/**
 * Get all votes for a fact
 */
export async function getFactVotes(factId: string): Promise<FactVote[]> {
	return db.factVote.findMany({
		where: { factId },
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Get voting summary for a fact
 */
export async function getFactVotingSummary(factId: string): Promise<{
	score: number;
	totalVotes: number;
	upvotes: number;
	downvotes: number;
	positivePercent: number;
	status: FactStatus;
	minVotesRequired: number;
	votesRemaining: number;
}> {
	const [scoreData, fact] = await Promise.all([
		calculateFactScore(factId),
		db.fact.findUnique({ where: { id: factId } })
	]);

	if (!fact) {
		throw new VoteError('Fact not found', 'FACT_NOT_FOUND');
	}

	return {
		...scoreData,
		status: fact.status,
		minVotesRequired: FACT_MIN_VOTES_FOR_STATUS,
		votesRemaining: Math.max(0, FACT_MIN_VOTES_FOR_STATUS - scoreData.totalVotes)
	};
}

/**
 * Get user's voting history
 */
export async function getUserVotingHistory(
	userId: string,
	options: { limit?: number; offset?: number } = {}
): Promise<{
	votes: Array<FactVote & { fact: { id: string; title: string; status: FactStatus } }>;
	total: number;
}> {
	const limit = options.limit || 20;
	const offset = options.offset || 0;

	const [votes, total] = await Promise.all([
		db.factVote.findMany({
			where: { userId },
			include: {
				fact: {
					select: { id: true, title: true, status: true }
				}
			},
			orderBy: { createdAt: 'desc' },
			take: limit,
			skip: offset
		}),
		db.factVote.count({ where: { userId } })
	]);

	return { votes, total };
}
