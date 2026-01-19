import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getMergeRequestById,
	getUserMergeVote,
	CategoryError
} from '$lib/server/services/category';

/**
 * GET /api/categories/merge-requests/:id - Get merge request details
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const request = await getMergeRequestById(params.id);

		if (!request) {
			throw error(404, 'Merge request not found');
		}

		// Get user's vote if authenticated
		let userVote = null;
		if (locals.user) {
			userVote = await getUserMergeVote(locals.user.id, params.id);
		}

		return json({
			success: true,
			data: {
				id: request.id,
				fromCategory: { id: request.fromCategory.id, name: request.fromCategory.name },
				toCategory: { id: request.toCategory.id, name: request.toCategory.name },
				requestedBy: request.requestedBy,
				status: request.status,
				voteSummary: request.voteSummary,
				userVote: userVote ? { value: userVote.value } : null,
				createdAt: request.createdAt,
				resolvedAt: request.resolvedAt
			}
		});
	} catch (err) {
		if ((err as any).status === 404) {
			throw err;
		}
		console.error('Error fetching merge request:', err);
		throw error(500, 'Failed to fetch merge request');
	}
};
