import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	isAdmin,
	getAdminConfig,
	updateTrustConfig,
	updateVoteWeightConfig,
	getFeatureFlags,
	setFeatureFlag,
	promoteToModerator,
	demoteFromModerator,
	setUserType,
	adjustTrustScore,
	AdminError
} from '$lib/server/services/admin';
import type { TrustAction, UserType } from '@prisma/client';

const VALID_TRUST_ACTIONS: TrustAction[] = [
	'FACT_APPROVED',
	'FACT_WRONG',
	'FACT_OUTDATED',
	'VETO_SUCCESS',
	'VETO_FAIL',
	'VERIFICATION_CORRECT',
	'VERIFICATION_WRONG',
	'UPVOTED',
	'DOWNVOTED'
];

const VALID_USER_TYPES: UserType[] = [
	'ANONYMOUS',
	'VERIFIED',
	'EXPERT',
	'PHD',
	'ORGANIZATION',
	'MODERATOR'
];

/**
 * GET /api/admin - Get admin configuration
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	const admin = await isAdmin(locals.user.id);
	if (!admin) {
		throw error(403, 'Admin access required');
	}

	try {
		const config = await getAdminConfig();

		return json({
			success: true,
			data: config
		});
	} catch (err) {
		console.error('Error fetching admin config:', err);
		throw error(500, 'Failed to fetch configuration');
	}
};

/**
 * PATCH /api/admin - Update configuration
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	const admin = await isAdmin(locals.user.id);
	if (!admin) {
		throw error(403, 'Admin access required');
	}

	try {
		const body = await request.json();
		const { action, ...params } = body;

		switch (action) {
			case 'update_trust_config':
				if (!params.trustAction || !VALID_TRUST_ACTIONS.includes(params.trustAction)) {
					throw error(400, 'Invalid trust action');
				}
				if (typeof params.points !== 'number') {
					throw error(400, 'Points must be a number');
				}
				await updateTrustConfig(params.trustAction, params.points);
				break;

			case 'update_vote_weight':
				if (!params.userType || !VALID_USER_TYPES.includes(params.userType)) {
					throw error(400, 'Invalid user type');
				}
				if (typeof params.weight !== 'number') {
					throw error(400, 'Weight must be a number');
				}
				await updateVoteWeightConfig(params.userType, params.weight);
				break;

			case 'set_feature_flag':
				if (!params.flag || typeof params.enabled !== 'boolean') {
					throw error(400, 'Flag and enabled (boolean) are required');
				}
				setFeatureFlag(params.flag, params.enabled);
				break;

			case 'promote_moderator':
				if (!params.userId) {
					throw error(400, 'userId is required');
				}
				await promoteToModerator(params.userId, locals.user.id);
				break;

			case 'demote_moderator':
				if (!params.userId) {
					throw error(400, 'userId is required');
				}
				await demoteFromModerator(params.userId, locals.user.id);
				break;

			case 'set_user_type':
				if (!params.userId || !params.userType || !VALID_USER_TYPES.includes(params.userType)) {
					throw error(400, 'userId and valid userType are required');
				}
				await setUserType(params.userId, params.userType, locals.user.id);
				break;

			case 'adjust_trust_score':
				if (!params.userId || typeof params.adjustment !== 'number' || !params.reason) {
					throw error(400, 'userId, adjustment (number), and reason are required');
				}
				await adjustTrustScore(
					params.userId,
					params.adjustment,
					locals.user.id,
					params.reason
				);
				break;

			default:
				throw error(400, 'Invalid action');
		}

		return json({
			success: true,
			message: `Action "${action}" completed successfully`
		});
	} catch (err) {
		if (err instanceof AdminError) {
			if (err.code === 'NOT_ADMIN') {
				throw error(403, err.message);
			}
			if (err.code === 'NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error updating config:', err);
		throw error(500, 'Failed to update configuration');
	}
};
