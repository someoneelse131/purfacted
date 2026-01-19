import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	voteOnUser,
	canVoteOnUser,
	getRemainingVotes,
	getUserVotesReceived,
	getTrustVoteConfig,
	UserTrustVoteError
} from '$lib/server/services/userTrustVote';

/**
 * GET /api/users/:id/trust-vote - Check voting status or get votes received
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		// Check if current user can vote on target
		if (url.searchParams.get('check') === 'true') {
			const canVote = await canVoteOnUser(locals.user.id, params.id);
			const remaining = await getRemainingVotes(locals.user.id);

			return json({
				success: true,
				data: {
					canVote: canVote.canVote,
					reason: canVote.reason,
					cooldownUntil: canVote.cooldownUntil,
					remainingVotesToday: remaining
				}
			});
		}

		// Get votes received by target user
		const limit = parseInt(url.searchParams.get('limit') || '20', 10);
		const offset = parseInt(url.searchParams.get('offset') || '0', 10);

		const votesReceived = await getUserVotesReceived(params.id, limit, offset);

		return json({
			success: true,
			data: {
				upvotes: votesReceived.upvotes,
				downvotes: votesReceived.downvotes,
				netScore: votesReceived.upvotes - votesReceived.downvotes,
				recentCount: votesReceived.recent.length
			}
		});
	} catch (err) {
		console.error('Error getting trust vote info:', err);
		throw error(500, 'Failed to get trust vote info');
	}
};

/**
 * POST /api/users/:id/trust-vote - Vote on a user's trust
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		// Validate vote value
		if (body.value !== 1 && body.value !== -1) {
			throw error(400, 'Vote value must be 1 (upvote) or -1 (downvote)');
		}

		const result = await voteOnUser(locals.user.id, params.id, body.value);

		return json({
			success: true,
			data: {
				voteId: result.vote.id,
				targetNewTrustScore: result.targetNewTrustScore,
				voterRemainingVotes: result.voterRemainingVotes,
				message: body.value === 1 ? 'User upvoted' : 'User downvoted'
			}
		});
	} catch (err) {
		if (err instanceof UserTrustVoteError) {
			if (err.code === 'VOTER_NOT_FOUND' || err.code === 'TARGET_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'VOTE_NOT_ALLOWED') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error voting on user:', err);
		throw error(500, 'Failed to vote on user');
	}
};
