import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getNotificationPreferences,
	updateNotificationPreference,
	NotificationError
} from '$lib/server/services/notification';
import type { NotificationType } from '@prisma/client';

const VALID_TYPES: NotificationType[] = [
	'TRUST_LOST',
	'TRUST_GAINED',
	'FACT_REPLY',
	'FACT_DISPUTED',
	'VETO_RECEIVED',
	'VERIFICATION_RESULT',
	'ORG_COMMENT',
	'DEBATE_REQUEST',
	'DEBATE_PUBLISHED',
	'MODERATOR_STATUS',
	'FACT_STATUS'
];

/**
 * GET /api/notifications/preferences - Get notification preferences
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const preferences = await getNotificationPreferences(locals.user.id);

		return json({
			success: true,
			data: preferences
		});
	} catch (err) {
		console.error('Error fetching preferences:', err);
		throw error(500, 'Failed to fetch preferences');
	}
};

/**
 * PATCH /api/notifications/preferences - Update notification preferences
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();
		const { type, email, inApp } = body;

		if (!type || !VALID_TYPES.includes(type)) {
			throw error(400, 'Invalid notification type');
		}

		if (email === undefined && inApp === undefined) {
			throw error(400, 'Must specify email or inApp setting');
		}

		const preference = await updateNotificationPreference(locals.user.id, type, {
			email,
			inApp
		});

		return json({
			success: true,
			data: preference
		});
	} catch (err) {
		if (err instanceof NotificationError) {
			throw error(400, err.message);
		}
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error updating preferences:', err);
		throw error(500, 'Failed to update preferences');
	}
};
