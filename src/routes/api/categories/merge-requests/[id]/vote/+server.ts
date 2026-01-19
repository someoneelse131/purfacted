import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	voteOnMergeRequest,
	getUserMergeVote,
	CategoryError
} from '$lib/server/services/category';

/**
 * GET /api/categories/merge-requests/:id/vote - Get user's vote
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({
			success: true,
			data: { userVote: null }
		});
	}

	try {
		const userVote = await getUserMergeVote(locals.user.id, params.id);

		return json({
			success: true,
			data: {
				userVote: userVote ? { value: userVote.value } : null
			}
		});
	} catch (err) {
		console.error('Error fetching vote:', err);
		throw error(500, 'Failed to fetch vote');
	}
};

/**
 * POST /api/categories/merge-requests/:id/vote - Vote on a merge request
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

		const result = await voteOnMergeRequest(locals.user.id, params.id, body.value);

		return json({
			success: true,
			data: {
				vote: { value: result.vote.value },
				requestStatus: result.requestStatus,
				resolved: result.resolved,
				message: result.resolved
					? result.requestStatus === 'APPROVED'
						? 'Merge request approved! Categories have been merged.'
						: 'Merge request rejected.'
					: 'Vote recorded successfully.'
			}
		});
	} catch (err) {
		if (err instanceof CategoryError) {
			if (err.code === 'REQUEST_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error voting on merge request:', err);
		throw error(500, 'Failed to record vote');
	}
};
