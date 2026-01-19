import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBlockedUsers } from '$lib/server/services/userBlock';

/**
 * GET /api/user/blocked - Get current user's blocked users list
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const blockedUsers = await getBlockedUsers(locals.user.id);

		return json({
			success: true,
			data: {
				blockedUsers: blockedUsers.map((u) => ({
					id: u.id,
					firstName: u.firstName,
					lastName: u.lastName,
					blockedAt: u.blockedAt
				})),
				count: blockedUsers.length
			}
		});
	} catch (err) {
		console.error('Error fetching blocked users:', err);
		throw error(500, 'Failed to fetch blocked users');
	}
};
