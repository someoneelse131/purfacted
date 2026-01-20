/**
 * Public API v1 - Trust Statistics Endpoint
 *
 * GET /api/v1/trust/stats - Get overall platform trust statistics
 *
 * Returns:
 * - Total facts by status
 * - Vote distribution
 * - Source credibility metrics
 * - User participation stats
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, API_ERRORS } from '$lib/server/api/response';
import { getCacheKey, getCachedResponse, cacheResponse, CACHE_TTL, recordCacheHit, recordCacheMiss } from '$lib/server/api/cache';

export const GET: RequestHandler = async (event) => {
	// Authenticate
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		// Check if cache should be bypassed (for testing)
		const noCache = event.request.headers.get('X-No-Cache') === 'true';

		// Check cache first (unless bypassed)
		const cacheKey = getCacheKey('trust/stats', {});

		if (!noCache) {
			const cached = await getCachedResponse<any>(cacheKey);

			if (cached) {
				recordCacheHit();
				await completeApiRequest(auth.context, event, 200);
				return apiSuccess(cached, undefined, getRateLimitInfo(auth.context));
			}
		}

		recordCacheMiss();

		// Execute all queries in parallel
		const [
			factsByStatus,
			totalFacts,
			totalSources,
			totalVotes,
			totalUsers,
			sourceCredibilityStats,
			vetoStats,
			recentActivity
		] = await Promise.all([
			// Facts by status
			db.fact.groupBy({
				by: ['status'],
				_count: { id: true }
			}),

			// Total facts
			db.fact.count(),

			// Total sources
			db.source.count(),

			// Total votes
			db.factVote.count(),

			// Total users who have participated
			db.user.count({
				where: {
					OR: [
						{ facts: { some: {} } },
						{ factVotes: { some: {} } },
						{ sources: { some: {} } }
					]
				}
			}),

			// Source credibility stats
			db.source.aggregate({
				_avg: { credibility: true },
				_min: { credibility: true },
				_max: { credibility: true }
			}),

			// Veto stats
			db.veto.groupBy({
				by: ['status'],
				_count: { id: true }
			}),

			// Recent activity (last 7 days)
			Promise.all([
				db.fact.count({
					where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
				}),
				db.factVote.count({
					where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
				}),
				db.source.count({
					where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
				})
			])
		]);

		// Transform facts by status
		const statusCounts: Record<string, number> = {};
		for (const item of factsByStatus) {
			statusCounts[item.status] = item._count.id;
		}

		// Transform veto stats
		const vetoCounts: Record<string, number> = {};
		for (const item of vetoStats) {
			vetoCounts[item.status] = item._count.id;
		}
		const totalVetos = Object.values(vetoCounts).reduce((sum, count) => sum + count, 0);

		// Calculate percentages
		const provenPercentage = totalFacts > 0
			? Math.round(((statusCounts['PROVEN'] || 0) / totalFacts) * 100)
			: 0;
		const disputedPercentage = totalFacts > 0
			? Math.round((((statusCounts['DISPROVEN'] || 0) + (statusCounts['CONTROVERSIAL'] || 0)) / totalFacts) * 100)
			: 0;

		const data = {
			facts: {
				total: totalFacts,
				byStatus: statusCounts,
				provenPercentage,
				disputedPercentage
			},

			sources: {
				total: totalSources,
				averagePerFact: totalFacts > 0 ? Math.round((totalSources / totalFacts) * 100) / 100 : 0,
				credibility: {
					average: Math.round(sourceCredibilityStats._avg.credibility || 0),
					min: sourceCredibilityStats._min.credibility || 0,
					max: sourceCredibilityStats._max.credibility || 0
				}
			},

			votes: {
				total: totalVotes,
				averagePerFact: totalFacts > 0 ? Math.round((totalVotes / totalFacts) * 100) / 100 : 0
			},

			vetos: {
				total: totalVetos,
				byStatus: vetoCounts
			},

			participation: {
				activeUsers: totalUsers
			},

			recentActivity: {
				period: '7 days',
				newFacts: recentActivity[0],
				newVotes: recentActivity[1],
				newSources: recentActivity[2]
			},

			generatedAt: new Date().toISOString()
		};

		// Cache the result
		await cacheResponse(cacheKey, data, CACHE_TTL.TRUST_STATS);

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 trust stats error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
