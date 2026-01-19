import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getQueueItems,
	getQueueStats,
	addToQueue,
	ModerationError
} from '$lib/server/services/moderation';
import type { ModerationQueueType, ModerationStatus } from '@prisma/client';

const VALID_TYPES: ModerationQueueType[] = [
	'REPORTED_CONTENT',
	'EDIT_REQUEST',
	'DUPLICATE_MERGE',
	'VETO_REVIEW',
	'ORG_APPROVAL',
	'VERIFICATION_REVIEW',
	'FLAGGED_ACCOUNT'
];

const VALID_STATUSES: ModerationStatus[] = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'];

/**
 * GET /api/moderation/queue - Get queue items or stats
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can access the queue');
	}

	try {
		const stats = url.searchParams.get('stats') === 'true';

		if (stats) {
			const queueStats = await getQueueStats();
			return json({
				success: true,
				data: queueStats
			});
		}

		const type = url.searchParams.get('type') as ModerationQueueType | null;
		const status = url.searchParams.get('status') as ModerationStatus | null;
		const assignedToMe = url.searchParams.get('mine') === 'true';
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = parseInt(url.searchParams.get('offset') || '0');

		const filter: Record<string, unknown> = {};

		if (type && VALID_TYPES.includes(type)) {
			filter.type = type;
		}

		if (status && VALID_STATUSES.includes(status)) {
			filter.status = status;
		}

		if (assignedToMe) {
			filter.assignedToId = locals.user.id;
		}

		const items = await getQueueItems(filter, {
			limit: Math.min(limit, 100),
			offset
		});

		return json({
			success: true,
			data: items
		});
	} catch (err) {
		console.error('Error fetching queue:', err);
		throw error(500, 'Failed to fetch queue');
	}
};

/**
 * POST /api/moderation/queue - Add item to queue (for internal use)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Allow moderators and the system to add items
	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can add items directly');
	}

	try {
		const body = await request.json();
		const { type, contentId, contentType, reason, details, priority } = body;

		if (!type || !VALID_TYPES.includes(type)) {
			throw error(400, 'Invalid queue type');
		}

		if (!contentId || !contentType) {
			throw error(400, 'contentId and contentType are required');
		}

		const item = await addToQueue({
			type,
			contentId,
			contentType,
			reason,
			details,
			priority
		});

		return json({
			success: true,
			data: item
		});
	} catch (err) {
		if (err instanceof ModerationError) {
			throw error(400, err.message);
		}
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error adding to queue:', err);
		throw error(500, 'Failed to add to queue');
	}
};
