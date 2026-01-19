import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getBannedUsers,
	banUser,
	getBanConfig,
	BanError
} from '$lib/server/services/ban';

/**
 * GET /api/bans - Get banned users or configuration
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can view bans');
	}

	try {
		// Get configuration
		if (url.searchParams.get('config') === 'true') {
			const config = getBanConfig();
			return json({
				success: true,
				data: config
			});
		}

		// Get banned users
		const banned = await getBannedUsers();

		return json({
			success: true,
			data: banned.map((u) => ({
				id: u.id,
				firstName: u.firstName,
				lastName: u.lastName,
				email: u.email,
				banLevel: u.banLevel,
				bannedUntil: u.bannedUntil
			}))
		});
	} catch (err) {
		console.error('Error fetching bans:', err);
		throw error(500, 'Failed to fetch bans');
	}
};

/**
 * POST /api/bans - Ban a user
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can ban users');
	}

	try {
		const body = await request.json();

		if (!body.userId) {
			throw error(400, 'userId is required');
		}

		if (!body.reason) {
			throw error(400, 'reason is required');
		}

		const ban = await banUser(body.userId, body.reason, locals.user.id, body.ip);

		return json({
			success: true,
			data: {
				id: ban.id,
				level: ban.level,
				expiresAt: ban.expiresAt,
				message: `User banned at level ${ban.level}`
			}
		});
	} catch (err) {
		if (err instanceof BanError) {
			if (err.code === 'USER_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error banning user:', err);
		throw error(500, 'Failed to ban user');
	}
};
