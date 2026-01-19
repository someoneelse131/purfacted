import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getQueueItem,
	claimQueueItem,
	releaseQueueItem,
	resolveQueueItem,
	dismissQueueItem,
	ModerationError
} from '$lib/server/services/moderation';

/**
 * GET /api/moderation/queue/:id - Get queue item details
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can access the queue');
	}

	try {
		const item = await getQueueItem(params.id);

		if (!item) {
			throw error(404, 'Queue item not found');
		}

		return json({
			success: true,
			data: item
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error fetching queue item:', err);
		throw error(500, 'Failed to fetch queue item');
	}
};

/**
 * PATCH /api/moderation/queue/:id - Update queue item (claim, release, resolve, dismiss)
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can modify queue items');
	}

	try {
		const body = await request.json();
		const { action, resolution, reason } = body;

		let item;

		switch (action) {
			case 'claim':
				item = await claimQueueItem(params.id, locals.user.id);
				break;

			case 'release':
				item = await releaseQueueItem(params.id, locals.user.id);
				break;

			case 'resolve':
				if (!resolution) {
					throw error(400, 'Resolution is required');
				}
				item = await resolveQueueItem(params.id, locals.user.id, resolution);
				break;

			case 'dismiss':
				if (!reason) {
					throw error(400, 'Reason is required for dismissal');
				}
				item = await dismissQueueItem(params.id, locals.user.id, reason);
				break;

			default:
				throw error(400, 'Invalid action. Must be: claim, release, resolve, or dismiss');
		}

		return json({
			success: true,
			data: item,
			message: `Item ${action}ed successfully`
		});
	} catch (err) {
		if (err instanceof ModerationError) {
			if (err.code === 'NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_MODERATOR') {
				throw error(403, err.message);
			}
			if (err.code === 'NOT_PENDING' || err.code === 'ALREADY_RESOLVED') {
				throw error(409, err.message);
			}
			if (err.code === 'NOT_ASSIGNED') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error updating queue item:', err);
		throw error(500, 'Failed to update queue item');
	}
};
