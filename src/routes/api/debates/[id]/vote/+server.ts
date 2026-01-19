import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	voteOnDebate,
	getUserDebateVote,
	getDebateVotingSummary,
	DebateError
} from '$lib/server/services/debate';

/**
 * GET /api/debates/:id/vote - Get user's vote and voting summary
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const votingSummary = await getDebateVotingSummary(params.id);

		let userVote = null;
		if (locals.user) {
			userVote = await getUserDebateVote(locals.user.id, params.id);
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
 * POST /api/debates/:id/vote - Vote on a published debate
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before voting');
	}

	try {
		const body = await request.json();

		if (body.value !== 1 && body.value !== -1) {
			throw error(400, 'Vote value must be 1 (upvote) or -1 (downvote)');
		}

		const result = await voteOnDebate(locals.user.id, params.id, body.value);

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
		if (err instanceof DebateError) {
			if (err.code === 'DEBATE_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_PUBLISHED') {
				throw error(400, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error voting on debate:', err);
		throw error(500, 'Failed to record vote');
	}
};
