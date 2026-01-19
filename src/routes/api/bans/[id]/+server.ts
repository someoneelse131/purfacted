import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	isUserBanned,
	unbanUser,
	getUserBanHistory,
	BanError
} from '$lib/server/services/ban';

/**
 * GET /api/bans/:id - Get ban status or history for a user
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		// Get ban status
		const banStatus = await isUserBanned(params.id);

		// Get ban history (moderators only)
		let history = null;
		if (url.searchParams.get('history') === 'true' && locals.user.userType === 'MODERATOR') {
			history = await getUserBanHistory(params.id);
		}

		return json({
			success: true,
			data: {
				banned: banStatus.banned,
				level: banStatus.level,
				expiresAt: banStatus.expiresAt,
				reason: banStatus.reason,
				history
			}
		});
	} catch (err) {
		console.error('Error getting ban status:', err);
		throw error(500, 'Failed to get ban status');
	}
};

/**
 * DELETE /api/bans/:id - Unban a user
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can unban users');
	}

	try {
		const user = await unbanUser(params.id);

		return json({
			success: true,
			data: {
				id: user.id,
				message: 'User unbanned successfully'
			}
		});
	} catch (err) {
		if (err instanceof BanError) {
			if (err.code === 'USER_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error unbanning user:', err);
		throw error(500, 'Failed to unban user');
	}
};
