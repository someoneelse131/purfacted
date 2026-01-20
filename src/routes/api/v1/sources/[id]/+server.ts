/**
 * Public API v1 - Single Source Endpoint
 *
 * GET /api/v1/sources/:id - Get a specific source by ID
 *
 * Returns detailed information about a source including:
 * - Source URL, title, type
 * - Credibility score
 * - Associated fact information
 * - Who added it
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, API_ERRORS } from '$lib/server/api/response';

export const GET: RequestHandler = async (event) => {
	// Authenticate
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const { id } = event.params;

		const source = await db.source.findUnique({
			where: { id },
			include: {
				fact: {
					select: {
						id: true,
						title: true,
						body: true,
						status: true,
						createdAt: true,
						category: {
							select: {
								id: true,
								name: true
							}
						},
						user: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								userType: true
							}
						},
						_count: {
							select: {
								sources: true,
								votes: true
							}
						}
					}
				},
				addedBy: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						userType: true,
						trustScore: true
					}
				}
			}
		});

		if (!source) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Source');
		}

		// Transform response
		const data = {
			id: source.id,
			url: source.url,
			title: source.title,
			type: source.type,
			credibility: source.credibility,
			addedAt: source.createdAt.toISOString(),

			fact: {
				id: source.fact.id,
				title: source.fact.title,
				body: source.fact.body,
				status: source.fact.status,
				createdAt: source.fact.createdAt.toISOString(),
				category: source.fact.category ? {
					id: source.fact.category.id,
					name: source.fact.category.name
				} : null,
				author: {
					id: source.fact.user.id,
					name: `${source.fact.user.firstName} ${source.fact.user.lastName}`,
					type: source.fact.user.userType
				},
				stats: {
					sources: source.fact._count.sources,
					votes: source.fact._count.votes
				}
			},

			addedBy: {
				id: source.addedBy.id,
				name: `${source.addedBy.firstName} ${source.addedBy.lastName}`,
				type: source.addedBy.userType,
				trustScore: source.addedBy.trustScore
			}
		};

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 source detail error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
