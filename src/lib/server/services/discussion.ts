import { db } from '../db';
import type { Discussion, DiscussionVote, DiscussionType } from '@prisma/client';
import { calculateVoteWeight } from '$lib/utils/voteWeight';

// ============================================
// Types
// ============================================

export interface CreateDiscussionInput {
	factId: string;
	type: DiscussionType;
	body: string;
}

export interface DiscussionWithDetails extends Discussion {
	user: {
		id: string;
		firstName: string;
		lastName: string;
		userType: string;
	};
	_count: {
		votes: number;
	};
	voteSummary?: {
		upvotes: number;
		downvotes: number;
		weightedScore: number;
	};
}

export interface VotingSummary {
	upvotes: number;
	downvotes: number;
	weightedScore: number;
	totalVotes: number;
}

// ============================================
// Error Handling
// ============================================

export class DiscussionError extends Error {
	code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = 'DiscussionError';
		this.code = code;
	}
}

// ============================================
// Configuration
// ============================================

const MAX_BODY_LENGTH = 2000;
const DISCUSSIONS_PER_PAGE = 20;

// ============================================
// Validation
// ============================================

function validateDiscussionInput(input: CreateDiscussionInput): void {
	if (!input.body || input.body.trim().length === 0) {
		throw new DiscussionError('Discussion body is required', 'BODY_REQUIRED');
	}

	if (input.body.length > MAX_BODY_LENGTH) {
		throw new DiscussionError(
			`Discussion body must be ${MAX_BODY_LENGTH} characters or less`,
			'BODY_TOO_LONG'
		);
	}

	if (!['PRO', 'CONTRA', 'NEUTRAL'].includes(input.type)) {
		throw new DiscussionError(
			'Discussion type must be PRO, CONTRA, or NEUTRAL',
			'INVALID_TYPE'
		);
	}
}

// ============================================
// Discussion CRUD
// ============================================

/**
 * Create a new discussion post
 */
export async function createDiscussion(
	userId: string,
	input: CreateDiscussionInput
): Promise<Discussion> {
	validateDiscussionInput(input);

	// Verify fact exists
	const fact = await db.fact.findUnique({
		where: { id: input.factId }
	});

	if (!fact) {
		throw new DiscussionError('Fact not found', 'FACT_NOT_FOUND');
	}

	return db.discussion.create({
		data: {
			factId: input.factId,
			userId,
			type: input.type,
			body: input.body.trim()
		}
	});
}

/**
 * Get discussion by ID with details
 */
export async function getDiscussionById(
	discussionId: string
): Promise<DiscussionWithDetails | null> {
	const discussion = await db.discussion.findUnique({
		where: { id: discussionId },
		include: {
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					userType: true
				}
			},
			_count: {
				select: { votes: true }
			}
		}
	});

	if (!discussion) return null;

	// Get vote summary
	const voteSummary = await getDiscussionVotingSummary(discussionId);

	return {
		...discussion,
		voteSummary
	};
}

/**
 * Get discussions for a fact, organized by type
 */
export async function getFactDiscussions(
	factId: string,
	options?: {
		type?: DiscussionType;
		sortBy?: 'newest' | 'oldest' | 'votes';
		page?: number;
		limit?: number;
	}
): Promise<{ discussions: DiscussionWithDetails[]; total: number }> {
	const page = options?.page || 1;
	const limit = Math.min(options?.limit || DISCUSSIONS_PER_PAGE, 50);
	const skip = (page - 1) * limit;

	const where: any = { factId };

	if (options?.type) {
		where.type = options.type;
	}

	let orderBy: any = { createdAt: 'desc' };
	if (options?.sortBy === 'oldest') {
		orderBy = { createdAt: 'asc' };
	}

	const [discussions, total] = await Promise.all([
		db.discussion.findMany({
			where,
			include: {
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						userType: true
					}
				},
				_count: {
					select: { votes: true }
				}
			},
			orderBy,
			skip,
			take: limit
		}),
		db.discussion.count({ where })
	]);

	// Add vote summaries
	const discussionsWithSummaries = await Promise.all(
		discussions.map(async (d) => {
			const voteSummary = await getDiscussionVotingSummary(d.id);
			return { ...d, voteSummary };
		})
	);

	// Sort by votes if requested
	if (options?.sortBy === 'votes') {
		discussionsWithSummaries.sort(
			(a, b) => (b.voteSummary?.weightedScore || 0) - (a.voteSummary?.weightedScore || 0)
		);
	}

	return { discussions: discussionsWithSummaries, total };
}

/**
 * Get discussions grouped by type (for PRO/CONTRA columns view)
 */
export async function getFactDiscussionsByType(factId: string): Promise<{
	pro: DiscussionWithDetails[];
	contra: DiscussionWithDetails[];
	neutral: DiscussionWithDetails[];
}> {
	const [pro, contra, neutral] = await Promise.all([
		getFactDiscussions(factId, { type: 'PRO', sortBy: 'votes', limit: 50 }),
		getFactDiscussions(factId, { type: 'CONTRA', sortBy: 'votes', limit: 50 }),
		getFactDiscussions(factId, { type: 'NEUTRAL', sortBy: 'votes', limit: 50 })
	]);

	return {
		pro: pro.discussions,
		contra: contra.discussions,
		neutral: neutral.discussions
	};
}

/**
 * Update a discussion (only author can update)
 */
export async function updateDiscussion(
	userId: string,
	discussionId: string,
	body: string
): Promise<Discussion> {
	const discussion = await db.discussion.findUnique({
		where: { id: discussionId }
	});

	if (!discussion) {
		throw new DiscussionError('Discussion not found', 'DISCUSSION_NOT_FOUND');
	}

	if (discussion.userId !== userId) {
		throw new DiscussionError('You can only edit your own discussions', 'NOT_AUTHOR');
	}

	if (!body || body.trim().length === 0) {
		throw new DiscussionError('Discussion body is required', 'BODY_REQUIRED');
	}

	if (body.length > MAX_BODY_LENGTH) {
		throw new DiscussionError(
			`Discussion body must be ${MAX_BODY_LENGTH} characters or less`,
			'BODY_TOO_LONG'
		);
	}

	return db.discussion.update({
		where: { id: discussionId },
		data: { body: body.trim() }
	});
}

/**
 * Delete a discussion (only author can delete)
 */
export async function deleteDiscussion(userId: string, discussionId: string): Promise<void> {
	const discussion = await db.discussion.findUnique({
		where: { id: discussionId }
	});

	if (!discussion) {
		throw new DiscussionError('Discussion not found', 'DISCUSSION_NOT_FOUND');
	}

	if (discussion.userId !== userId) {
		throw new DiscussionError('You can only delete your own discussions', 'NOT_AUTHOR');
	}

	await db.discussion.delete({
		where: { id: discussionId }
	});
}

// ============================================
// Discussion Voting
// ============================================

/**
 * Vote on a discussion
 */
export async function voteOnDiscussion(
	userId: string,
	discussionId: string,
	value: 1 | -1
): Promise<{ vote: DiscussionVote; votingSummary: VotingSummary }> {
	const discussion = await db.discussion.findUnique({
		where: { id: discussionId }
	});

	if (!discussion) {
		throw new DiscussionError('Discussion not found', 'DISCUSSION_NOT_FOUND');
	}

	// Get user for vote weight calculation
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { userType: true, trustScore: true }
	});

	if (!user) {
		throw new DiscussionError('User not found', 'USER_NOT_FOUND');
	}

	const weight = calculateVoteWeight(user.userType, user.trustScore);

	// Upsert vote
	const vote = await db.discussionVote.upsert({
		where: {
			discussionId_userId: {
				discussionId,
				userId
			}
		},
		create: {
			discussionId,
			userId,
			value,
			weight
		},
		update: {
			value,
			weight
		}
	});

	// Get updated voting summary
	const votingSummary = await getDiscussionVotingSummary(discussionId);

	return { vote, votingSummary };
}

/**
 * Get user's vote on a discussion
 */
export async function getUserDiscussionVote(
	userId: string,
	discussionId: string
): Promise<DiscussionVote | null> {
	return db.discussionVote.findUnique({
		where: {
			discussionId_userId: {
				discussionId,
				userId
			}
		}
	});
}

/**
 * Get voting summary for a discussion
 */
export async function getDiscussionVotingSummary(discussionId: string): Promise<VotingSummary> {
	const votes = await db.discussionVote.findMany({
		where: { discussionId }
	});

	let upvotes = 0;
	let downvotes = 0;
	let weightedScore = 0;

	for (const vote of votes) {
		if (vote.value > 0) {
			upvotes++;
		} else {
			downvotes++;
		}
		weightedScore += vote.value * vote.weight;
	}

	return {
		upvotes,
		downvotes,
		weightedScore: Math.round(weightedScore * 100) / 100,
		totalVotes: votes.length
	};
}

/**
 * Remove user's vote from a discussion
 */
export async function removeDiscussionVote(userId: string, discussionId: string): Promise<void> {
	const vote = await db.discussionVote.findUnique({
		where: {
			discussionId_userId: {
				discussionId,
				userId
			}
		}
	});

	if (!vote) {
		throw new DiscussionError('Vote not found', 'VOTE_NOT_FOUND');
	}

	await db.discussionVote.delete({
		where: {
			discussionId_userId: {
				discussionId,
				userId
			}
		}
	});
}
