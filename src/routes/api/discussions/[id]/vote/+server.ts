import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	voteOnDiscussion,
	getUserDiscussionVote,
	removeDiscussionVote,
	getDiscussionVotingSummary,
	DiscussionError
} from '$lib/server/services/discussion';

/**
 * GET /api/discussions/:id/vote - Get user's vote and voting summary
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const votingSummary = await getDiscussionVotingSummary(params.id);

		let userVote = null;
		if (locals.user) {
			userVote = await getUserDiscussionVote(locals.user.id, params.id);
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
 * POST /api/discussions/:id/vote - Vote on a discussion
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

		const result = await voteOnDiscussion(locals.user.id, params.id, body.value);

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
		if (err instanceof DiscussionError) {
			if (err.code === 'DISCUSSION_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error voting on discussion:', err);
		throw error(500, 'Failed to record vote');
	}
};

/**
 * DELETE /api/discussions/:id/vote - Remove vote from a discussion
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await removeDiscussionVote(locals.user.id, params.id);

		const votingSummary = await getDiscussionVotingSummary(params.id);

		return json({
			success: true,
			data: {
				message: 'Vote removed successfully',
				votingSummary
			}
		});
	} catch (err) {
		if (err instanceof DiscussionError) {
			if (err.code === 'VOTE_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error removing vote:', err);
		throw error(500, 'Failed to remove vote');
	}
};
