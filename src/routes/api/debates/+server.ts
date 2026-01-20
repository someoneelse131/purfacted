import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	initiateDebate,
	getUserDebates,
	getPublishedDebates,
	getRetentionNotice,
	DebateError
} from '$lib/server/services/debate';

/**
 * GET /api/debates - Get debates (published are public, user's own require auth)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const status = url.searchParams.get('status') as any;
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');

		// If requesting published debates, allow public access
		if (status === 'PUBLISHED') {
			const result = await getPublishedDebates({ page, limit });
			return json({
				success: true,
				data: {
					debates: result.debates.map(formatDebate),
					total: result.total,
					page,
					limit
				}
			});
		}

		// For user's own debates, require authentication
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}

		const result = await getUserDebates(locals.user.id, {
			status: status || undefined,
			page,
			limit
		});

		return json({
			success: true,
			data: {
				debates: result.debates.map(formatDebate),
				total: result.total,
				page,
				limit,
				retentionNotice: getRetentionNotice()
			}
		});
	} catch (err) {
		if ((err as any).status) throw err;
		console.error('Error fetching debates:', err);
		throw error(500, 'Failed to fetch debates');
	}
};

/**
 * POST /api/debates - Initiate a new debate
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before initiating debates');
	}

	try {
		const body = await request.json();

		if (!body.factId) {
			throw error(400, 'Fact ID is required');
		}

		if (!body.participantId) {
			throw error(400, 'Participant ID is required');
		}

		const debate = await initiateDebate(locals.user.id, {
			factId: body.factId,
			participantId: body.participantId
		});

		return json({
			success: true,
			data: {
				id: debate.id,
				status: debate.status,
				message: 'Debate invitation sent',
				retentionNotice: getRetentionNotice()
			}
		});
	} catch (err) {
		if (err instanceof DebateError) {
			if (err.code === 'FACT_NOT_FOUND' || err.code === 'PARTICIPANT_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_VERIFIED' || err.code === 'EMAIL_NOT_VERIFIED') {
				throw error(403, err.message);
			}
			if (err.code === 'DEBATE_EXISTS') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error initiating debate:', err);
		throw error(500, 'Failed to initiate debate');
	}
};

function formatDebate(d: any) {
	return {
		id: d.id,
		fact: d.fact,
		initiator: d.initiator,
		participant: d.participant,
		title: d.title,
		status: d.status,
		messageCount: d._count?.messages || 0,
		voteCount: d._count?.votes || 0,
		publishedAt: d.publishedAt,
		createdAt: d.createdAt,
		updatedAt: d.updatedAt
	};
}
