import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	sendMessage,
	getDebateMessages,
	canUserAccessDebate,
	DebateError
} from '$lib/server/services/debate';

/**
 * GET /api/debates/:id/messages - Get messages in a debate
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		// Check access
		const canAccess = await canUserAccessDebate(locals.user?.id || '', params.id);
		if (!canAccess) {
			throw error(403, 'You do not have access to this debate');
		}

		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');

		const result = await getDebateMessages(params.id, { page, limit });

		return json({
			success: true,
			data: {
				messages: result.messages.map((m) => ({
					id: m.id,
					body: m.body,
					user: m.user,
					createdAt: m.createdAt
				})),
				total: result.total,
				page,
				limit
			}
		});
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error fetching messages:', err);
		throw error(500, 'Failed to fetch messages');
	}
};

/**
 * POST /api/debates/:id/messages - Send a message in a debate
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before sending messages');
	}

	try {
		const body = await request.json();

		if (!body.body) {
			throw error(400, 'Message body is required');
		}

		const message = await sendMessage(locals.user.id, params.id, body.body);

		return json({
			success: true,
			data: {
				id: message.id,
				body: message.body,
				createdAt: message.createdAt
			}
		});
	} catch (err) {
		if (err instanceof DebateError) {
			if (err.code === 'DEBATE_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_IN_DEBATE') {
				throw error(403, err.message);
			}
			if (err.code === 'DUPLICATE_MESSAGE') {
				throw error(429, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error sending message:', err);
		throw error(500, 'Failed to send message');
	}
};
