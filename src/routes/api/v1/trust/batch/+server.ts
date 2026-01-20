/**
 * Public API v1 - Batch Trust Lookup Endpoint
 *
 * POST /api/v1/trust/batch - Get trust metrics for multiple facts
 *
 * Request Body:
 * {
 *   "factIds": ["id1", "id2", "id3"]
 * }
 *
 * Returns simplified trust metrics for each requested fact.
 * Maximum 100 facts per request.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, apiError, API_ERRORS } from '$lib/server/api/response';

const MAX_BATCH_SIZE = 100;

export const POST: RequestHandler = async (event) => {
	// Authenticate
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const body = await event.request.json();
		const { factIds } = body;

		// Validate input
		if (!Array.isArray(factIds) || factIds.length === 0) {
			await completeApiRequest(auth.context, event, 400);
			return apiError('INVALID_INPUT', 'factIds must be a non-empty array', 400);
		}

		if (factIds.length > MAX_BATCH_SIZE) {
			await completeApiRequest(auth.context, event, 400);
			return apiError('BATCH_TOO_LARGE', `Maximum ${MAX_BATCH_SIZE} facts per request`, 400);
		}

		// Fetch facts with their trust data
		const facts = await db.fact.findMany({
			where: { id: { in: factIds } },
			select: {
				id: true,
				status: true,
				updatedAt: true,
				sources: {
					select: {
						credibility: true
					}
				},
				votes: {
					select: {
						value: true,
						weight: true
					}
				},
				_count: {
					select: {
						vetos: true
					}
				}
			}
		});

		// Build response map
		const trustMap: Record<string, any> = {};

		for (const fact of facts) {
			const upvotes = fact.votes.filter(v => v.value > 0);
			const downvotes = fact.votes.filter(v => v.value < 0);
			const weightedScore = fact.votes.reduce((sum, v) => sum + (v.value * v.weight), 0);
			const totalVotes = fact.votes.length;
			const avgSourceCredibility = fact.sources.length > 0
				? Math.round(fact.sources.reduce((sum, s) => sum + s.credibility, 0) / fact.sources.length)
				: null;

			trustMap[fact.id] = {
				status: fact.status,
				updatedAt: fact.updatedAt.toISOString(),
				votes: {
					total: totalVotes,
					upvotes: upvotes.length,
					downvotes: downvotes.length,
					weightedScore: Math.round(weightedScore * 100) / 100
				},
				sources: {
					count: fact.sources.length,
					averageCredibility: avgSourceCredibility
				},
				vetos: fact._count.vetos
			};
		}

		// Track which IDs weren't found
		const notFound = factIds.filter(id => !trustMap[id]);

		const data = {
			trust: trustMap,
			found: Object.keys(trustMap).length,
			notFound: notFound.length > 0 ? notFound : undefined
		};

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 trust batch error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
