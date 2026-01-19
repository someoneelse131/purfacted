import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	blockUser,
	unblockUser,
	isUserBlocked,
	getBlockedUsers,
	UserBlockError
} from '$lib/server/services/userBlock';

/**
 * GET /api/users/:id/block - Check if user is blocked
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const isBlocked = await isUserBlocked(locals.user.id, params.id);

		return json({
			success: true,
			data: { isBlocked }
		});
	} catch (err) {
		console.error('Error checking block status:', err);
		throw error(500, 'Failed to check block status');
	}
};

/**
 * POST /api/users/:id/block - Block a user
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await blockUser(locals.user.id, params.id);

		return json({
			success: true,
			data: {
				message: 'User blocked successfully'
			}
		});
	} catch (err) {
		if (err instanceof UserBlockError) {
			if (err.code === 'USER_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'ALREADY_BLOCKED') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error blocking user:', err);
		throw error(500, 'Failed to block user');
	}
};

/**
 * DELETE /api/users/:id/block - Unblock a user
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await unblockUser(locals.user.id, params.id);

		return json({
			success: true,
			data: {
				message: 'User unblocked successfully'
			}
		});
	} catch (err) {
		if (err instanceof UserBlockError) {
			if (err.code === 'NOT_BLOCKED') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error unblocking user:', err);
		throw error(500, 'Failed to unblock user');
	}
};
