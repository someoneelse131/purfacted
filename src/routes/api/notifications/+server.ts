import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getUserNotifications,
	getUnreadCount,
	markAllAsRead,
	NotificationError
} from '$lib/server/services/notification';

/**
 * GET /api/notifications - Get user notifications
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const unreadOnly = url.searchParams.get('unread') === 'true';
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const countOnly = url.searchParams.get('count') === 'true';

		// If only count requested
		if (countOnly) {
			const count = await getUnreadCount(locals.user.id);
			return json({
				success: true,
				data: { unreadCount: count }
			});
		}

		const notifications = await getUserNotifications(locals.user.id, {
			unreadOnly,
			limit: Math.min(limit, 50),
			offset
		});

		const unreadCount = await getUnreadCount(locals.user.id);

		return json({
			success: true,
			data: {
				notifications,
				unreadCount
			}
		});
	} catch (err) {
		console.error('Error fetching notifications:', err);
		throw error(500, 'Failed to fetch notifications');
	}
};

/**
 * POST /api/notifications - Mark all as read
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		if (body.action === 'mark_all_read') {
			const count = await markAllAsRead(locals.user.id);
			return json({
				success: true,
				data: { markedRead: count }
			});
		}

		throw error(400, 'Invalid action');
	} catch (err) {
		if (err instanceof NotificationError) {
			throw error(400, err.message);
		}
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error processing notification action:', err);
		throw error(500, 'Failed to process action');
	}
};
