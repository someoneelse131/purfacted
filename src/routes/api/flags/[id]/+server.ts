import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	reviewFlaggedAccount,
	BanError
} from '$lib/server/services/ban';

/**
 * PATCH /api/flags/:id - Review a flagged account
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can review flags');
	}

	try {
		const body = await request.json();

		if (!['dismiss', 'warn', 'ban'].includes(body.resolution)) {
			throw error(400, 'resolution must be "dismiss", "warn", or "ban"');
		}

		const flag = await reviewFlaggedAccount(
			params.id,
			locals.user.id,
			body.resolution,
			body.comment
		);

		return json({
			success: true,
			data: {
				id: flag.id,
				status: flag.status,
				resolution: flag.resolution,
				message: `Flag ${body.resolution === 'dismiss' ? 'dismissed' : 'resolved'}`
			}
		});
	} catch (err) {
		if (err instanceof BanError) {
			if (err.code === 'FLAG_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'ALREADY_RESOLVED') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error reviewing flag:', err);
		throw error(500, 'Failed to review flag');
	}
};
