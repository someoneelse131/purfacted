import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getDebateById,
	acceptDebate,
	declineDebate,
	canUserAccessDebate,
	getRetentionNotice,
	DebateError
} from '$lib/server/services/debate';

/**
 * GET /api/debates/:id - Get debate details
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const debate = await getDebateById(params.id);

		if (!debate) {
			throw error(404, 'Debate not found');
		}

		// Check access
		const canAccess = await canUserAccessDebate(locals.user?.id || '', params.id);
		if (!canAccess) {
			throw error(403, 'You do not have access to this debate');
		}

		return json({
			success: true,
			data: {
				id: debate.id,
				fact: debate.fact,
				initiator: debate.initiator,
				participant: debate.participant,
				title: debate.title,
				status: debate.status,
				messageCount: debate._count.messages,
				voteCount: debate._count.votes,
				publishedAt: debate.publishedAt,
				createdAt: debate.createdAt,
				updatedAt: debate.updatedAt,
				retentionNotice: getRetentionNotice()
			}
		});
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error fetching debate:', err);
		throw error(500, 'Failed to fetch debate');
	}
};

/**
 * PATCH /api/debates/:id - Accept or decline a debate
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		if (!body.action || !['accept', 'decline'].includes(body.action)) {
			throw error(400, 'Action must be "accept" or "decline"');
		}

		let debate;
		if (body.action === 'accept') {
			debate = await acceptDebate(locals.user.id, params.id);
		} else {
			debate = await declineDebate(locals.user.id, params.id);
		}

		return json({
			success: true,
			data: {
				id: debate.id,
				status: debate.status,
				message: body.action === 'accept' ? 'Debate accepted' : 'Debate declined'
			}
		});
	} catch (err) {
		if (err instanceof DebateError) {
			if (err.code === 'DEBATE_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_PARTICIPANT') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error updating debate:', err);
		throw error(500, 'Failed to update debate');
	}
};
