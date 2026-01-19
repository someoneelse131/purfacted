import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getDiscussionById,
	updateDiscussion,
	deleteDiscussion,
	getUserDiscussionVote,
	DiscussionError
} from '$lib/server/services/discussion';

/**
 * GET /api/discussions/:id - Get discussion details
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const discussion = await getDiscussionById(params.id);

		if (!discussion) {
			throw error(404, 'Discussion not found');
		}

		// Get user's vote if authenticated
		let userVote = null;
		if (locals.user) {
			userVote = await getUserDiscussionVote(locals.user.id, params.id);
		}

		return json({
			success: true,
			data: {
				id: discussion.id,
				factId: discussion.factId,
				type: discussion.type,
				body: discussion.body,
				user: discussion.user,
				voteSummary: discussion.voteSummary,
				userVote: userVote ? { value: userVote.value } : null,
				createdAt: discussion.createdAt,
				updatedAt: discussion.updatedAt
			}
		});
	} catch (err) {
		if ((err as any).status === 404) {
			throw err;
		}
		console.error('Error fetching discussion:', err);
		throw error(500, 'Failed to fetch discussion');
	}
};

/**
 * PATCH /api/discussions/:id - Update a discussion
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		if (!body.body) {
			throw error(400, 'Discussion body is required');
		}

		const discussion = await updateDiscussion(locals.user.id, params.id, body.body);

		return json({
			success: true,
			data: {
				id: discussion.id,
				body: discussion.body,
				updatedAt: discussion.updatedAt,
				message: 'Discussion updated successfully'
			}
		});
	} catch (err) {
		if (err instanceof DiscussionError) {
			if (err.code === 'DISCUSSION_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_AUTHOR') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error updating discussion:', err);
		throw error(500, 'Failed to update discussion');
	}
};

/**
 * DELETE /api/discussions/:id - Delete a discussion
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await deleteDiscussion(locals.user.id, params.id);

		return json({
			success: true,
			data: {
				message: 'Discussion deleted successfully'
			}
		});
	} catch (err) {
		if (err instanceof DiscussionError) {
			if (err.code === 'DISCUSSION_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_AUTHOR') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error deleting discussion:', err);
		throw error(500, 'Failed to delete discussion');
	}
};
