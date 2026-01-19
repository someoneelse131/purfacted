/**
 * R36: User Trust Voting Service
 *
 * Users can upvote/downvote other users to affect their trust score.
 */

import { db } from '../db';
import type { UserTrustVote, User } from '@prisma/client';

// Configurable values
const MAX_VOTES_PER_DAY = parseInt(process.env.USER_VOTE_MAX_PER_DAY || '10', 10);
const VOTE_COOLDOWN_DAYS = parseInt(process.env.USER_VOTE_COOLDOWN_DAYS || '30', 10);
const TRUST_CHANGE_PER_VOTE = parseInt(process.env.USER_VOTE_TRUST_CHANGE || '1', 10);

export class UserTrustVoteError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'UserTrustVoteError';
		this.code = code;
	}
}

export interface TrustVoteResult {
	vote: UserTrustVote;
	targetNewTrustScore: number;
	voterRemainingVotes: number;
}

/**
 * Get the start of today (for daily limit tracking)
 */
function getStartOfToday(): Date {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Get the date that is N days ago
 */
function getDaysAgo(days: number): Date {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date;
}

/**
 * Get how many votes a user has made today
 */
export async function getVotesUsedToday(voterId: string): Promise<number> {
	const startOfToday = getStartOfToday();

	return db.userTrustVote.count({
		where: {
			voterId,
			createdAt: { gte: startOfToday }
		}
	});
}

/**
 * Get remaining votes for a user today
 */
export async function getRemainingVotes(voterId: string): Promise<number> {
	const usedToday = await getVotesUsedToday(voterId);
	return Math.max(0, MAX_VOTES_PER_DAY - usedToday);
}

/**
 * Check if user can vote on target (cooldown check)
 */
export async function canVoteOnUser(voterId: string, targetId: string): Promise<{
	canVote: boolean;
	reason?: string;
	cooldownUntil?: Date;
}> {
	// Can't vote on yourself
	if (voterId === targetId) {
		return { canVote: false, reason: 'Cannot vote on yourself' };
	}

	// Check for recent vote within cooldown period
	const cooldownDate = getDaysAgo(VOTE_COOLDOWN_DAYS);

	const recentVote = await db.userTrustVote.findFirst({
		where: {
			voterId,
			targetId,
			createdAt: { gte: cooldownDate }
		},
		orderBy: { createdAt: 'desc' }
	});

	if (recentVote) {
		const cooldownUntil = new Date(recentVote.createdAt);
		cooldownUntil.setDate(cooldownUntil.getDate() + VOTE_COOLDOWN_DAYS);

		return {
			canVote: false,
			reason: `Already voted on this user. Can vote again on ${cooldownUntil.toDateString()}`,
			cooldownUntil
		};
	}

	// Check daily limit
	const remaining = await getRemainingVotes(voterId);
	if (remaining <= 0) {
		return {
			canVote: false,
			reason: `Daily vote limit reached (${MAX_VOTES_PER_DAY} votes per day)`
		};
	}

	return { canVote: true };
}

/**
 * Vote on a user's trust
 */
export async function voteOnUser(
	voterId: string,
	targetId: string,
	value: 1 | -1
): Promise<TrustVoteResult> {
	// Validate voter exists
	const voter = await db.user.findUnique({
		where: { id: voterId }
	});

	if (!voter) {
		throw new UserTrustVoteError('Voter not found', 'VOTER_NOT_FOUND');
	}

	// Validate target exists
	const target = await db.user.findUnique({
		where: { id: targetId }
	});

	if (!target) {
		throw new UserTrustVoteError('Target user not found', 'TARGET_NOT_FOUND');
	}

	// Check if voting is allowed
	const voteCheck = await canVoteOnUser(voterId, targetId);
	if (!voteCheck.canVote) {
		throw new UserTrustVoteError(voteCheck.reason!, 'VOTE_NOT_ALLOWED');
	}

	// Create the vote
	const vote = await db.userTrustVote.create({
		data: {
			voterId,
			targetId,
			value
		}
	});

	// Update target's trust score
	const trustChange = value * TRUST_CHANGE_PER_VOTE;
	const updatedTarget = await db.user.update({
		where: { id: targetId },
		data: {
			trustScore: {
				increment: trustChange
			}
		}
	});

	// Get remaining votes
	const remainingVotes = await getRemainingVotes(voterId);

	return {
		vote,
		targetNewTrustScore: updatedTarget.trustScore,
		voterRemainingVotes: remainingVotes
	};
}

/**
 * Get votes a user has made
 */
export async function getUserVotesMade(
	voterId: string,
	limit: number = 20,
	offset: number = 0
): Promise<(UserTrustVote & { target: Pick<User, 'id' | 'firstName' | 'lastName'> })[]> {
	return db.userTrustVote.findMany({
		where: { voterId },
		include: {
			target: {
				select: {
					id: true,
					firstName: true,
					lastName: true
				}
			}
		},
		orderBy: { createdAt: 'desc' },
		take: limit,
		skip: offset
	});
}

/**
 * Get votes a user has received
 */
export async function getUserVotesReceived(
	targetId: string,
	limit: number = 20,
	offset: number = 0
): Promise<{ upvotes: number; downvotes: number; recent: UserTrustVote[] }> {
	const [upvotes, downvotes, recent] = await Promise.all([
		db.userTrustVote.count({
			where: { targetId, value: 1 }
		}),
		db.userTrustVote.count({
			where: { targetId, value: -1 }
		}),
		db.userTrustVote.findMany({
			where: { targetId },
			orderBy: { createdAt: 'desc' },
			take: limit,
			skip: offset
		})
	]);

	return { upvotes, downvotes, recent };
}

/**
 * Get user trust vote statistics
 */
export async function getTrustVoteStats(): Promise<{
	totalVotes: number;
	upvotes: number;
	downvotes: number;
	votesToday: number;
}> {
	const startOfToday = getStartOfToday();

	const [totalVotes, upvotes, downvotes, votesToday] = await Promise.all([
		db.userTrustVote.count(),
		db.userTrustVote.count({ where: { value: 1 } }),
		db.userTrustVote.count({ where: { value: -1 } }),
		db.userTrustVote.count({ where: { createdAt: { gte: startOfToday } } })
	]);

	return {
		totalVotes,
		upvotes,
		downvotes,
		votesToday
	};
}

/**
 * Get configuration values
 */
export function getTrustVoteConfig(): {
	maxVotesPerDay: number;
	cooldownDays: number;
	trustChangePerVote: number;
} {
	return {
		maxVotesPerDay: MAX_VOTES_PER_DAY,
		cooldownDays: VOTE_COOLDOWN_DAYS,
		trustChangePerVote: TRUST_CHANGE_PER_VOTE
	};
}
