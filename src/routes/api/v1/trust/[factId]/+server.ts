/**
 * Public API v1 - Single Fact Trust Endpoint
 *
 * GET /api/v1/trust/:factId - Get trust metrics for a specific fact
 *
 * Returns comprehensive trust information including:
 * - Current status (PROVEN, DISPROVEN, CONTROVERSIAL, etc.)
 * - Weighted vote score
 * - Vote breakdown (upvotes, downvotes)
 * - Source credibility average
 * - Author trust score
 * - Veto information
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
		const { factId } = event.params;

		const fact = await db.fact.findUnique({
			where: { id: factId },
			include: {
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
						credibility: true,
						type: true
					}
				},
				votes: {
					select: {
						value: true,
						weight: true,
						user: {
							select: {
								userType: true,
								trustScore: true
							}
						}
					}
				},
				vetos: {
					where: {
						status: 'PENDING'
					},
					select: {
						id: true,
						status: true,
						reason: true,
						createdAt: true
					}
				},
				_count: {
					select: {
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

		// Calculate weighted upvote/downvote scores
		const weightedUpvotes = upvotes.reduce((sum, v) => sum + v.weight, 0);
		const weightedDownvotes = downvotes.reduce((sum, v) => sum + v.weight, 0);

		// Calculate average source credibility
		const avgSourceCredibility = fact.sources.length > 0
			? Math.round(fact.sources.reduce((sum, s) => sum + s.credibility, 0) / fact.sources.length)
			: null;

		// Calculate credibility by source type
		const sourcesByType: Record<string, { count: number; avgCredibility: number }> = {};
		for (const source of fact.sources) {
			if (!sourcesByType[source.type]) {
				sourcesByType[source.type] = { count: 0, avgCredibility: 0 };
			}
			sourcesByType[source.type].count++;
			sourcesByType[source.type].avgCredibility += source.credibility;
		}
		for (const type in sourcesByType) {
			sourcesByType[type].avgCredibility = Math.round(sourcesByType[type].avgCredibility / sourcesByType[type].count);
		}

		// Calculate vote weight by user type
		const votesByUserType: Record<string, { count: number; totalWeight: number }> = {};
		for (const vote of fact.votes) {
			const userType = vote.user?.userType || 'UNKNOWN';
			if (!votesByUserType[userType]) {
				votesByUserType[userType] = { count: 0, totalWeight: 0 };
			}
			votesByUserType[userType].count++;
			votesByUserType[userType].totalWeight += vote.weight;
		}

		// Calculate trust confidence (higher when more votes from trusted users)
		const avgVoteWeight = totalVotes > 0
			? fact.votes.reduce((sum, v) => sum + v.weight, 0) / totalVotes
			: 0;
		const trustConfidence = Math.min(100, Math.round(
			(totalVotes / 10) * 20 + // More votes = higher confidence
			(avgVoteWeight * 20) + // Higher average weight = higher confidence
			(fact.sources.length / 3) * 20 + // More sources = higher confidence
			(avgSourceCredibility || 0) / 5 // Higher source credibility = higher confidence
		));

		// Transform response
		const data = {
			factId: fact.id,
			status: fact.status,
			createdAt: fact.createdAt.toISOString(),
			updatedAt: fact.updatedAt.toISOString(),

			author: {
				id: fact.user.id,
				name: `${fact.user.firstName} ${fact.user.lastName}`,
				type: fact.user.userType,
				trustScore: fact.user.trustScore
			},

			votes: {
				total: totalVotes,
				upvotes: upvotes.length,
				downvotes: downvotes.length,
				weightedScore: Math.round(weightedScore * 100) / 100,
				weightedUpvotes: Math.round(weightedUpvotes * 100) / 100,
				weightedDownvotes: Math.round(weightedDownvotes * 100) / 100,
				upvotePercentage,
				byUserType: votesByUserType
			},

			sources: {
				count: fact.sources.length,
				averageCredibility: avgSourceCredibility,
				byType: sourcesByType
			},

			vetos: {
				total: fact._count.vetos,
				pending: fact.vetos.length,
				pendingVetos: fact.vetos.map(v => ({
					id: v.id,
					reason: v.reason,
					createdAt: v.createdAt.toISOString()
				}))
			},

			trustMetrics: {
				confidence: trustConfidence,
				averageVoteWeight: Math.round(avgVoteWeight * 100) / 100
			}
		};

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 trust detail error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
