/**
 * Public API v1 - Sources Endpoint
 *
 * GET /api/v1/sources - List sources with filtering options
 *
 * Query Parameters:
 * - factId: Filter by fact ID
 * - type: Filter by source type (ACADEMIC, NEWS, GOV, etc.)
 * - minCredibility: Minimum credibility score (0-100)
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20, max: 100)
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, apiError, parsePagination, buildPaginationMeta, API_ERRORS } from '$lib/server/api/response';
import type { SourceType, Prisma } from '@prisma/client';

const VALID_SOURCE_TYPES: SourceType[] = ['PEER_REVIEWED', 'OFFICIAL', 'NEWS', 'COMPANY', 'BLOG', 'OTHER'];

export const GET: RequestHandler = async (event) => {
	// Authenticate
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const url = new URL(event.request.url);
		const { page, limit, offset } = parsePagination(url);

		// Parse query parameters
		const factId = url.searchParams.get('factId');
		const type = url.searchParams.get('type')?.toUpperCase() as SourceType | null;
		const minCredibility = url.searchParams.get('minCredibility');

		// Validate type
		if (type && !VALID_SOURCE_TYPES.includes(type)) {
			await completeApiRequest(auth.context, event, 400);
			return apiError('INVALID_SOURCE_TYPE', `Invalid source type. Valid values: ${VALID_SOURCE_TYPES.join(', ')}`, 400);
		}

		// Build where clause
		const where: Prisma.SourceWhereInput = {};

		if (factId) {
			where.factId = factId;
		}

		if (type) {
			where.type = type;
		}

		if (minCredibility) {
			const credScore = parseInt(minCredibility, 10);
			if (isNaN(credScore) || credScore < 0 || credScore > 100) {
				await completeApiRequest(auth.context, event, 400);
				return apiError('INVALID_CREDIBILITY', 'minCredibility must be a number between 0 and 100', 400);
			}
			where.credibility = { gte: credScore };
		}

		// Execute queries
		const [sources, total] = await Promise.all([
			db.source.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: offset,
				take: limit,
				select: {
					id: true,
					url: true,
					title: true,
					type: true,
					credibility: true,
					createdAt: true,
					fact: {
						select: {
							id: true,
							title: true,
							status: true
						}
					},
					addedBy: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							userType: true
						}
					}
				}
			}),
			db.source.count({ where })
		]);

		// Transform response
		const data = sources.map(source => ({
			id: source.id,
			url: source.url,
			title: source.title,
			type: source.type,
			credibility: source.credibility,
			addedAt: source.createdAt.toISOString(),
			fact: {
				id: source.fact.id,
				title: source.fact.title,
				status: source.fact.status
			},
			addedBy: {
				id: source.addedBy.id,
				name: `${source.addedBy.firstName} ${source.addedBy.lastName}`,
				type: source.addedBy.userType
			}
		}));

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(
			{ sources: data },
			buildPaginationMeta(page, limit, total),
			getRateLimitInfo(auth.context)
		);
	} catch (error) {
		console.error('API v1 sources error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
