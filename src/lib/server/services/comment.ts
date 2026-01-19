import { db } from '../db';
import type { Comment, CommentVote } from '@prisma/client';
import { calculateVoteWeight } from '$lib/utils/voteWeight';

// ============================================
// Types
// ============================================

export interface CreateCommentInput {
	factId: string;
	body: string;
	parentId?: string | null;
}

export interface CommentWithDetails extends Comment {
	user: {
		id: string;
		firstName: string;
		lastName: string;
		userType: string;
	};
	_count: {
		votes: number;
		replies: number;
	};
	voteSummary?: VotingSummary;
	replies?: CommentWithDetails[];
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

export class CommentError extends Error {
	code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = 'CommentError';
		this.code = code;
	}
}

// ============================================
// Configuration
// ============================================

const MAX_BODY_LENGTH = 2000;
const COMMENTS_PER_PAGE = 20;
const MAX_REPLY_DEPTH = 5; // Maximum nesting depth for replies

// ============================================
// Validation
// ============================================

function validateCommentInput(input: CreateCommentInput): void {
	if (!input.body || input.body.trim().length === 0) {
		throw new CommentError('Comment body is required', 'BODY_REQUIRED');
	}

	if (input.body.length > MAX_BODY_LENGTH) {
		throw new CommentError(
			`Comment must be ${MAX_BODY_LENGTH} characters or less`,
			'BODY_TOO_LONG'
		);
	}
}

// ============================================
// Comment CRUD
// ============================================

/**
 * Create a new comment
 */
export async function createComment(
	userId: string,
	input: CreateCommentInput
): Promise<Comment> {
	validateCommentInput(input);

	// Verify fact exists
	const fact = await db.fact.findUnique({
		where: { id: input.factId }
	});

	if (!fact) {
		throw new CommentError('Fact not found', 'FACT_NOT_FOUND');
	}

	// If replying to a parent comment, verify it exists and check depth
	if (input.parentId) {
		const parent = await db.comment.findUnique({
			where: { id: input.parentId }
		});

		if (!parent) {
			throw new CommentError('Parent comment not found', 'PARENT_NOT_FOUND');
		}

		if (parent.factId !== input.factId) {
			throw new CommentError('Parent comment belongs to a different fact', 'INVALID_PARENT');
		}

		// Check reply depth
		const depth = await getCommentDepth(input.parentId);
		if (depth >= MAX_REPLY_DEPTH) {
			throw new CommentError(
				`Maximum reply depth of ${MAX_REPLY_DEPTH} reached`,
				'MAX_DEPTH_REACHED'
			);
		}
	}

	return db.comment.create({
		data: {
			factId: input.factId,
			userId,
			body: input.body.trim(),
			parentId: input.parentId || null
		}
	});
}

/**
 * Get comment depth in reply chain
 */
async function getCommentDepth(commentId: string): Promise<number> {
	let depth = 0;
	let currentId: string | null = commentId;

	while (currentId) {
		const comment = await db.comment.findUnique({
			where: { id: currentId },
			select: { parentId: true }
		});

		if (!comment || !comment.parentId) break;

		depth++;
		currentId = comment.parentId;
	}

	return depth;
}

/**
 * Get comment by ID with details
 */
export async function getCommentById(commentId: string): Promise<CommentWithDetails | null> {
	const comment = await db.comment.findUnique({
		where: { id: commentId },
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
				select: { votes: true, replies: true }
			}
		}
	});

	if (!comment) return null;

	// Get vote summary
	const voteSummary = await getCommentVotingSummary(commentId);

	return {
		...comment,
		voteSummary
	};
}

/**
 * Get comments for a fact (top-level comments with nested replies)
 */
export async function getFactComments(
	factId: string,
	options?: {
		sortBy?: 'newest' | 'oldest' | 'votes';
		page?: number;
		limit?: number;
		includeReplies?: boolean;
	}
): Promise<{ comments: CommentWithDetails[]; total: number }> {
	const page = options?.page || 1;
	const limit = Math.min(options?.limit || COMMENTS_PER_PAGE, 50);
	const skip = (page - 1) * limit;
	const includeReplies = options?.includeReplies ?? true;

	let orderBy: any = { createdAt: 'desc' };
	if (options?.sortBy === 'oldest') {
		orderBy = { createdAt: 'asc' };
	}

	// Get top-level comments (no parent)
	const [comments, total] = await Promise.all([
		db.comment.findMany({
			where: { factId, parentId: null },
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
					select: { votes: true, replies: true }
				}
			},
			orderBy,
			skip,
			take: limit
		}),
		db.comment.count({ where: { factId, parentId: null } })
	]);

	// Add vote summaries and optionally fetch replies
	const commentsWithDetails = await Promise.all(
		comments.map(async (c) => {
			const voteSummary = await getCommentVotingSummary(c.id);
			const commentWithSummary: CommentWithDetails = { ...c, voteSummary };

			if (includeReplies && c._count.replies > 0) {
				commentWithSummary.replies = await getCommentReplies(c.id);
			}

			return commentWithSummary;
		})
	);

	// Sort by votes if requested
	if (options?.sortBy === 'votes') {
		commentsWithDetails.sort(
			(a, b) => (b.voteSummary?.weightedScore || 0) - (a.voteSummary?.weightedScore || 0)
		);
	}

	return { comments: commentsWithDetails, total };
}

/**
 * Get replies to a comment (recursive)
 */
export async function getCommentReplies(commentId: string): Promise<CommentWithDetails[]> {
	const replies = await db.comment.findMany({
		where: { parentId: commentId },
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
				select: { votes: true, replies: true }
			}
		},
		orderBy: { createdAt: 'asc' }
	});

	// Recursively get replies and vote summaries
	const repliesWithDetails = await Promise.all(
		replies.map(async (r) => {
			const voteSummary = await getCommentVotingSummary(r.id);
			const replyWithSummary: CommentWithDetails = { ...r, voteSummary };

			if (r._count.replies > 0) {
				replyWithSummary.replies = await getCommentReplies(r.id);
			}

			return replyWithSummary;
		})
	);

	return repliesWithDetails;
}

/**
 * Update a comment (only author can update)
 */
export async function updateComment(
	userId: string,
	commentId: string,
	body: string
): Promise<Comment> {
	const comment = await db.comment.findUnique({
		where: { id: commentId }
	});

	if (!comment) {
		throw new CommentError('Comment not found', 'COMMENT_NOT_FOUND');
	}

	if (comment.userId !== userId) {
		throw new CommentError('You can only edit your own comments', 'NOT_AUTHOR');
	}

	if (!body || body.trim().length === 0) {
		throw new CommentError('Comment body is required', 'BODY_REQUIRED');
	}

	if (body.length > MAX_BODY_LENGTH) {
		throw new CommentError(
			`Comment must be ${MAX_BODY_LENGTH} characters or less`,
			'BODY_TOO_LONG'
		);
	}

	return db.comment.update({
		where: { id: commentId },
		data: { body: body.trim() }
	});
}

/**
 * Delete a comment (only author can delete)
 */
export async function deleteComment(userId: string, commentId: string): Promise<void> {
	const comment = await db.comment.findUnique({
		where: { id: commentId }
	});

	if (!comment) {
		throw new CommentError('Comment not found', 'COMMENT_NOT_FOUND');
	}

	if (comment.userId !== userId) {
		throw new CommentError('You can only delete your own comments', 'NOT_AUTHOR');
	}

	await db.comment.delete({
		where: { id: commentId }
	});
}

// ============================================
// Comment Voting
// ============================================

/**
 * Vote on a comment
 */
export async function voteOnComment(
	userId: string,
	commentId: string,
	value: 1 | -1
): Promise<{ vote: CommentVote; votingSummary: VotingSummary }> {
	const comment = await db.comment.findUnique({
		where: { id: commentId }
	});

	if (!comment) {
		throw new CommentError('Comment not found', 'COMMENT_NOT_FOUND');
	}

	// Get user for vote weight calculation
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { userType: true, trustScore: true }
	});

	if (!user) {
		throw new CommentError('User not found', 'USER_NOT_FOUND');
	}

	const weight = calculateVoteWeight(user.userType, user.trustScore);

	// Upsert vote
	const vote = await db.commentVote.upsert({
		where: {
			commentId_userId: {
				commentId,
				userId
			}
		},
		create: {
			commentId,
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
	const votingSummary = await getCommentVotingSummary(commentId);

	return { vote, votingSummary };
}

/**
 * Get user's vote on a comment
 */
export async function getUserCommentVote(
	userId: string,
	commentId: string
): Promise<CommentVote | null> {
	return db.commentVote.findUnique({
		where: {
			commentId_userId: {
				commentId,
				userId
			}
		}
	});
}

/**
 * Get voting summary for a comment
 */
export async function getCommentVotingSummary(commentId: string): Promise<VotingSummary> {
	const votes = await db.commentVote.findMany({
		where: { commentId }
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
 * Remove user's vote from a comment
 */
export async function removeCommentVote(userId: string, commentId: string): Promise<void> {
	const vote = await db.commentVote.findUnique({
		where: {
			commentId_userId: {
				commentId,
				userId
			}
		}
	});

	if (!vote) {
		throw new CommentError('Vote not found', 'VOTE_NOT_FOUND');
	}

	await db.commentVote.delete({
		where: {
			commentId_userId: {
				commentId,
				userId
			}
		}
	});
}
