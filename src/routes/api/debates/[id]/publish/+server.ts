import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	requestPublish,
	acceptPublish,
	DebateError
} from '$lib/server/services/debate';

/**
 * POST /api/debates/:id/publish - Request to publish a debate
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		if (body.action === 'accept') {
			// Accept the publish request
			const debate = await acceptPublish(locals.user.id, params.id);

			return json({
				success: true,
				data: {
					id: debate.id,
					status: debate.status,
					publishedAt: debate.publishedAt,
					message: 'Debate published successfully'
				}
			});
		} else {
			// Request to publish with title
			if (!body.title) {
				throw error(400, 'Title is required for publishing');
			}

			const debate = await requestPublish(locals.user.id, params.id, body.title);

			return json({
				success: true,
				data: {
					id: debate.id,
					title: debate.title,
					message: 'Publish request sent. Waiting for other participant to accept.'
				}
			});
		}
	} catch (err) {
		if (err instanceof DebateError) {
			if (err.code === 'DEBATE_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_IN_DEBATE') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error publishing debate:', err);
		throw error(500, 'Failed to process publish request');
	}
};
