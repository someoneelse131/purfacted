import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPendingFlags,
	flagAccount,
	autoFlagNegativeVetoUsers,
	BanError
} from '$lib/server/services/ban';

/**
 * GET /api/flags - Get pending account flags
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can view flags');
	}

	try {
		const flags = await getPendingFlags();

		return json({
			success: true,
			data: flags.map((f) => ({
				id: f.id,
				user: {
					id: f.user.id,
					firstName: f.user.firstName,
					lastName: f.user.lastName,
					trustScore: f.user.trustScore
				},
				reason: f.reason,
				details: f.details,
				status: f.status,
				createdAt: f.createdAt
			}))
		});
	} catch (err) {
		console.error('Error fetching flags:', err);
		throw error(500, 'Failed to fetch flags');
	}
};

/**
 * POST /api/flags - Flag an account or run auto-flag
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can manage flags');
	}

	try {
		const body = await request.json();

		// Run auto-flag for negative veto users
		if (body.action === 'auto-flag') {
			const flags = await autoFlagNegativeVetoUsers();

			return json({
				success: true,
				data: {
					flagged: flags.length,
					message: `Auto-flagged ${flags.length} accounts`
				}
			});
		}

		// Manual flag
		if (!body.userId) {
			throw error(400, 'userId is required');
		}

		if (!body.reason) {
			throw error(400, 'reason is required');
		}

		const flag = await flagAccount(body.userId, body.reason, body.details);

		return json({
			success: true,
			data: {
				id: flag.id,
				message: 'Account flagged for review'
			}
		});
	} catch (err) {
		if (err instanceof BanError) {
			if (err.code === 'USER_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'ALREADY_FLAGGED') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error flagging account:', err);
		throw error(500, 'Failed to flag account');
	}
};
