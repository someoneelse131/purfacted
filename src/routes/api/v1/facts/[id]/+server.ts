/**
 * Public API v1 - Single Fact Endpoint
 *
 * GET /api/v1/facts/:id - Get a specific fact by ID
 *
 * Returns detailed information about a fact including:
 * - Full fact content
 * - Sources with credibility scores
 * - Vote summary (weighted scores)
 * - Category information
 * - Author information
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

		const fact = await db.fact.findUnique({
			where: { id },
			include: {
				category: {
					select: {
						id: true,
						name: true,
						parent: {
							select: {
								id: true,
								name: true
							}
						}
					}
				},
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						userType: true,
						trustScore: true
					}
				},
				sources: {
					select: {
						id: true,
						url: true,
						title: true,
						type: true,
						credibility: true,
						createdAt: true
					},
					orderBy: { credibility: 'desc' }
				},
				votes: {
					select: {
						value: true,
						weight: true
					}
				},
				_count: {
					select: {
						comments: true,
						discussions: true,
						vetos: true
					}
				}
			}
		});

		if (!fact) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Fact');
		}

		// Calculate vote statistics
		const upvotes = fact.votes.filter(v => v.value > 0);
		const downvotes = fact.votes.filter(v => v.value < 0);
		const weightedScore = fact.votes.reduce((sum, v) => sum + (v.value * v.weight), 0);
		const totalVotes = fact.votes.length;
		const upvotePercentage = totalVotes > 0 ? Math.round((upvotes.length / totalVotes) * 100) : 0;

		// Calculate average source credibility
		const avgSourceCredibility = fact.sources.length > 0
			? Math.round(fact.sources.reduce((sum, s) => sum + s.credibility, 0) / fact.sources.length)
			: null;

		// Transform response
		const data = {
			id: fact.id,
			title: fact.title,
			body: fact.body,
			status: fact.status,
			createdAt: fact.createdAt.toISOString(),
			updatedAt: fact.updatedAt.toISOString(),

			category: fact.category ? {
				id: fact.category.id,
				name: fact.category.name,
				parent: fact.category.parent ? {
					id: fact.category.parent.id,
					name: fact.category.parent.name
				} : null
			} : null,

			author: {
				id: fact.user.id,
				name: `${fact.user.firstName} ${fact.user.lastName}`,
				type: fact.user.userType,
				trustScore: fact.user.trustScore
			},

			sources: fact.sources.map(s => ({
				id: s.id,
				url: s.url,
				title: s.title,
				type: s.type,
				credibility: s.credibility,
				addedAt: s.createdAt.toISOString()
			})),

			trust: {
				status: fact.status,
				weightedScore: Math.round(weightedScore * 100) / 100,
				totalVotes,
				upvotes: upvotes.length,
				downvotes: downvotes.length,
				upvotePercentage,
				averageSourceCredibility: avgSourceCredibility
			},

			stats: {
				comments: fact._count.comments,
				discussions: fact._count.discussions,
				vetos: fact._count.vetos,
				sources: fact.sources.length
			}
		};

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 fact detail error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
