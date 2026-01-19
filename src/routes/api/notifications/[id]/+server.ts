import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	markAsRead,
	deleteNotification,
	NotificationError
} from '$lib/server/services/notification';

/**
 * PATCH /api/notifications/:id - Mark notification as read
 */
export const PATCH: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const notification = await markAsRead(params.id, locals.user.id);

		return json({
			success: true,
			data: notification
		});
	} catch (err) {
		if (err instanceof NotificationError) {
			if (err.code === 'NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'UNAUTHORIZED') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error marking notification as read:', err);
		throw error(500, 'Failed to mark notification as read');
	}
};

/**
 * DELETE /api/notifications/:id - Delete notification
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await deleteNotification(params.id, locals.user.id);

		return json({
			success: true,
			message: 'Notification deleted'
		});
	} catch (err) {
		if (err instanceof NotificationError) {
			if (err.code === 'NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'UNAUTHORIZED') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error deleting notification:', err);
		throw error(500, 'Failed to delete notification');
	}
};
