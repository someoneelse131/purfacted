import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	voteOnComment,
	getUserCommentVote,
	removeCommentVote,
	getCommentVotingSummary,
	CommentError
} from '$lib/server/services/comment';

/**
 * GET /api/comments/:id/vote - Get user's vote and voting summary
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const votingSummary = await getCommentVotingSummary(params.id);

		let userVote = null;
		if (locals.user) {
			userVote = await getUserCommentVote(locals.user.id, params.id);
		}

		return json({
			success: true,
			data: {
				summary: votingSummary,
				userVote: userVote
					? {
							value: userVote.value,
							weight: userVote.weight
						}
					: null
			}
		});
	} catch (err) {
		console.error('Error fetching vote:', err);
		throw error(500, 'Failed to fetch vote data');
	}
};

/**
 * POST /api/comments/:id/vote - Vote on a comment
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check email verification
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before voting');
	}

	try {
		const body = await request.json();

		// Validate vote value
		if (body.value !== 1 && body.value !== -1) {
			throw error(400, 'Vote value must be 1 (upvote) or -1 (downvote)');
		}

		const result = await voteOnComment(locals.user.id, params.id, body.value);

		return json({
			success: true,
			data: {
				vote: {
					value: result.vote.value,
					weight: result.vote.weight
				},
				votingSummary: result.votingSummary
			}
		});
	} catch (err) {
		if (err instanceof CommentError) {
			if (err.code === 'COMMENT_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error voting on comment:', err);
		throw error(500, 'Failed to record vote');
	}
};

/**
 * DELETE /api/comments/:id/vote - Remove vote from a comment
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await removeCommentVote(locals.user.id, params.id);

		const votingSummary = await getCommentVotingSummary(params.id);

		return json({
			success: true,
			data: {
				message: 'Vote removed successfully',
				votingSummary
			}
		});
	} catch (err) {
		if (err instanceof CommentError) {
			if (err.code === 'VOTE_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error removing vote:', err);
		throw error(500, 'Failed to remove vote');
	}
};
