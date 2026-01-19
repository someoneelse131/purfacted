import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFactPublishedDebates } from '$lib/server/services/debate';

/**
 * GET /api/facts/:id/debates - Get published debates for a fact
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '10');

		const result = await getFactPublishedDebates(params.id, { page, limit });

		return json({
			success: true,
			data: {
				debates: result.debates.map((d) => ({
					id: d.id,
					title: d.title,
					initiator: d.initiator,
					participant: d.participant,
					messageCount: d._count.messages,
					voteCount: d._count.votes,
					publishedAt: d.publishedAt,
					createdAt: d.createdAt
				})),
				total: result.total,
				page,
				limit
			}
		});
	} catch (err) {
		console.error('Error fetching debates:', err);
		throw error(500, 'Failed to fetch debates');
	}
};
