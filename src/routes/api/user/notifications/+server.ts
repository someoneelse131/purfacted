import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getNotificationPreferences,
	updateNotificationPreference,
	setAllNotificationPreferences
} from '$lib/server/services/profile';
import type { NotificationType } from '@prisma/client';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !locals.session) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const preferences = await getNotificationPreferences(locals.user.id);

		return json({
			success: true,
			preferences
		});
	} catch (err) {
		console.error('Get notification preferences error:', err);
		throw error(500, 'Failed to get notification preferences');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !locals.session) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();

		// Handle bulk update (all notifications on/off)
		if ('allEmail' in body || 'allInApp' in body) {
			await setAllNotificationPreferences(
				locals.user.id,
				body.allEmail ?? true,
				body.allInApp ?? true
			);

			return json({
				success: true,
				message: 'All notification preferences updated'
			});
		}

		// Handle individual preference update
		const { type, email, inApp } = body;

		if (!type) {
			return json({ success: false, error: 'Notification type is required' }, { status: 400 });
		}

		const preference = await updateNotificationPreference(locals.user.id, {
			type: type as NotificationType,
			email: email ?? true,
			inApp: inApp ?? true
		});

		return json({
			success: true,
			preference
		});
	} catch (err) {
		console.error('Update notification preferences error:', err);
		throw error(500, 'Failed to update notification preferences');
	}
};
