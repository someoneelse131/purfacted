import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	approveContent,
	rejectContent,
	warnUser,
	banUserAction,
	editContent,
	overrideVerification,
	dismissReport,
	markActionAsWrong,
	getModerationDashboard,
	ModerationActionError
} from '$lib/server/services/moderation.actions';

/**
 * GET /api/moderation/actions - Get dashboard summary
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can access this');
	}

	try {
		const dashboard = await getModerationDashboard(locals.user.id);

		return json({
			success: true,
			data: dashboard
		});
	} catch (err) {
		console.error('Error fetching dashboard:', err);
		throw error(500, 'Failed to fetch dashboard');
	}
};

/**
 * POST /api/moderation/actions - Execute a moderation action
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can perform actions');
	}

	try {
		const body = await request.json();
		const { action, queueItemId, ...params } = body;

		if (!action) {
			throw error(400, 'Action is required');
		}

		if (!queueItemId) {
			throw error(400, 'queueItemId is required');
		}

		let result;

		switch (action) {
			case 'approve':
				result = await approveContent(queueItemId, locals.user.id, params.notes);
				break;

			case 'reject':
				if (!params.reason) {
					throw error(400, 'Reason is required for rejection');
				}
				result = await rejectContent(queueItemId, locals.user.id, params.reason);
				break;

			case 'warn':
				if (!params.userId || !params.reason) {
					throw error(400, 'userId and reason are required for warning');
				}
				result = await warnUser(queueItemId, locals.user.id, params.userId, params.reason);
				break;

			case 'ban':
				if (!params.userId || !params.reason) {
					throw error(400, 'userId and reason are required for ban');
				}
				result = await banUserAction(
					queueItemId,
					locals.user.id,
					params.userId,
					params.reason,
					params.ip
				);
				break;

			case 'edit':
				if (!params.changes) {
					throw error(400, 'Changes object is required for edit');
				}
				result = await editContent(queueItemId, locals.user.id, params.changes);
				break;

			case 'override':
				if (params.approved === undefined) {
					throw error(400, 'approved (true/false) is required for override');
				}
				result = await overrideVerification(
					queueItemId,
					locals.user.id,
					params.approved,
					params.notes
				);
				break;

			case 'dismiss':
				if (!params.reason) {
					throw error(400, 'Reason is required for dismissal');
				}
				result = await dismissReport(queueItemId, locals.user.id, params.reason);
				break;

			case 'mark_wrong':
				if (!params.reason) {
					throw error(400, 'Reason is required for marking as wrong');
				}
				result = await markActionAsWrong(queueItemId, locals.user.id, params.reason);
				break;

			default:
				throw error(400, 'Invalid action');
		}

		return json({
			success: true,
			data: result,
			message: `Action "${action}" completed successfully`
		});
	} catch (err) {
		if (err instanceof ModerationActionError) {
			if (err.code === 'NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_ASSIGNED' || err.code === 'INVALID_TYPE') {
				throw error(400, err.message);
			}
			throw error(400, err.message);
		}
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error executing action:', err);
		throw error(500, 'Failed to execute action');
	}
};
