import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	voteOnVeto,
	getUserVetoVote,
	getVetoVotingSummary,
	VetoError
} from '$lib/server/services/veto';

/**
 * GET /api/vetos/:id/vote - Get user's vote and voting summary
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const votingSummary = await getVetoVotingSummary(params.id);

		let userVote = null;
		if (locals.user) {
			userVote = await getUserVetoVote(locals.user.id, params.id);
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
		console.error('Error fetching veto vote:', err);
		throw error(500, 'Failed to fetch vote data');
	}
};

/**
 * POST /api/vetos/:id/vote - Vote on a veto
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
			throw error(400, 'Vote value must be 1 (approve) or -1 (reject)');
		}

		const result = await voteOnVeto(locals.user.id, params.id, body.value);

		return json({
			success: true,
			data: {
				vote: result.vote,
				vetoStatus: result.vetoStatus,
				resolved: result.resolved
			}
		});
	} catch (err) {
		if (err instanceof VetoError) {
			if (err.code === 'VETO_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error voting on veto:', err);
		throw error(500, 'Failed to record vote');
	}
};
