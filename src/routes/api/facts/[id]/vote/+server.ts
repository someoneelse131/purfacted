import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	voteOnFact,
	removeVote,
	getUserVote,
	getFactVotingSummary,
	VoteError
} from '$lib/server/services/factVote';

/**
 * GET /api/facts/:id/vote - Get user's vote and voting summary
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const summary = await getFactVotingSummary(params.id);

		let userVote = null;
		if (locals.user) {
			userVote = await getUserVote(locals.user.id, params.id);
		}

		return json({
			success: true,
			data: {
				summary,
				userVote: userVote
					? {
							value: userVote.value,
							weight: userVote.weight,
							createdAt: userVote.createdAt
						}
					: null
			}
		});
	} catch (err) {
		if (err instanceof VoteError) {
			if (err.code === 'FACT_NOT_FOUND') {
				throw error(404, err.message);
			}
		}
		console.error('Error fetching vote data:', err);
		throw error(500, 'Failed to fetch vote data');
	}
};

/**
 * POST /api/facts/:id/vote - Vote on a fact
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		// Validate vote value
		if (body.value !== 1 && body.value !== -1) {
			throw error(400, 'Vote value must be 1 (upvote) or -1 (downvote)');
		}

		const result = await voteOnFact(locals.user.id, params.id, body.value);

		return json({
			success: true,
			data: {
				vote: {
					value: result.vote.value,
					weight: result.vote.weight
				},
				factScore: result.factScore,
				statusChanged: result.statusChanged,
				newStatus: result.newStatus
			}
		});
	} catch (err) {
		if (err instanceof VoteError) {
			if (err.code === 'FACT_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'EMAIL_NOT_VERIFIED' || err.code === 'USER_BANNED') {
				throw error(403, err.message);
			}
			if (err.code === 'OWN_FACT' || err.code === 'DEBOUNCE') {
				throw error(400, err.message);
			}
		}
		console.error('Error voting:', err);
		throw error(500, 'Failed to record vote');
	}
};

/**
 * DELETE /api/facts/:id/vote - Remove vote
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await removeVote(locals.user.id, params.id);

		return json({
			success: true,
			message: 'Vote removed successfully'
		});
	} catch (err) {
		if (err instanceof VoteError) {
			if (err.code === 'VOTE_NOT_FOUND') {
				throw error(404, err.message);
			}
		}
		console.error('Error removing vote:', err);
		throw error(500, 'Failed to remove vote');
	}
};
