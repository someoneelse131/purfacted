import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	appointModerator,
	demoteModerator,
	handleReturningModerator,
	isEligibleForModerator,
	ModeratorError
} from '$lib/server/services/moderator';

/**
 * GET /api/moderators/:id - Check eligibility for moderator
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const eligibility = await isEligibleForModerator(params.id);

		return json({
			success: true,
			data: {
				userId: params.id,
				eligible: eligibility.eligible,
				reason: eligibility.reason
			}
		});
	} catch (err) {
		console.error('Error checking eligibility:', err);
		throw error(500, 'Failed to check eligibility');
	}
};

/**
 * POST /api/moderators/:id - Appoint or demote moderator
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can manage moderators');
	}

	try {
		const body = await request.json();

		// Appoint as moderator
		if (body.action === 'appoint') {
			const user = await appointModerator(params.id, locals.user.id);

			return json({
				success: true,
				data: {
					id: user.id,
					firstName: user.firstName,
					lastName: user.lastName,
					userType: user.userType,
					message: 'User appointed as moderator'
				}
			});
		}

		// Demote moderator
		if (body.action === 'demote') {
			const user = await demoteModerator(params.id);

			return json({
				success: true,
				data: {
					id: user.id,
					firstName: user.firstName,
					lastName: user.lastName,
					userType: user.userType,
					message: 'Moderator demoted'
				}
			});
		}

		// Handle returning moderator
		if (body.action === 'reinstate') {
			const result = await handleReturningModerator(params.id);

			return json({
				success: true,
				data: {
					reinstated: result.reinstated,
					message: result.message
				}
			});
		}

		throw error(400, 'Action must be "appoint", "demote", or "reinstate"');
	} catch (err) {
		if (err instanceof ModeratorError) {
			if (err.code === 'USER_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'ALREADY_MODERATOR' || err.code === 'NOT_MODERATOR') {
				throw error(409, err.message);
			}
			if (err.code === 'ORG_CANNOT_MODERATE' || err.code === 'MAX_MODERATORS') {
				throw error(400, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error managing moderator:', err);
		throw error(500, 'Failed to manage moderator');
	}
};
