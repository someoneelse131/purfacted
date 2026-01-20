/**
 * Public API v1 - Facts Endpoint
 *
 * GET /api/v1/facts - Search and list facts
 *
 * Query Parameters:
 * - q: Search query (searches title and body)
 * - status: Filter by status (PROVEN, DISPROVEN, CONTROVERSIAL, etc.)
 * - category: Filter by category ID
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20, max: 100)
 * - sort: Sort order (recent, popular, controversial)
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, apiError, parsePagination, buildPaginationMeta, API_ERRORS } from '$lib/server/api/response';
import type { FactStatus, Prisma } from '@prisma/client';

const VALID_STATUSES: FactStatus[] = ['SUBMITTED', 'IN_REVIEW', 'PROVEN', 'DISPROVEN', 'CONTROVERSIAL', 'UNDER_VETO_REVIEW'];
const VALID_SORTS = ['recent', 'popular', 'controversial'] as const;

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
		const query = url.searchParams.get('q')?.trim();
		const status = url.searchParams.get('status')?.toUpperCase() as FactStatus | null;
		const categoryId = url.searchParams.get('category');
		const sort = (url.searchParams.get('sort') || 'recent') as typeof VALID_SORTS[number];

		// Validate status
		if (status && !VALID_STATUSES.includes(status)) {
			await completeApiRequest(auth.context, event, 400);
			return apiError('INVALID_STATUS', `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}`, 400);
		}

		// Validate sort
		if (!VALID_SORTS.includes(sort)) {
			await completeApiRequest(auth.context, event, 400);
			return apiError('INVALID_SORT', `Invalid sort. Valid values: ${VALID_SORTS.join(', ')}`, 400);
		}

		// Build where clause
		const where: Prisma.FactWhereInput = {};

		if (query) {
			where.OR = [
				{ title: { contains: query, mode: 'insensitive' } },
				{ body: { contains: query, mode: 'insensitive' } }
			];
		}

		if (status) {
			where.status = status;
		}

		if (categoryId) {
			where.categoryId = categoryId;
		}

		// Build order by
		let orderBy: Prisma.FactOrderByWithRelationInput;
		switch (sort) {
			case 'popular':
				orderBy = { votes: { _count: 'desc' } };
				break;
			case 'controversial':
				// Facts with mixed votes (many upvotes AND downvotes)
				orderBy = { updatedAt: 'desc' }; // Simplified - would need raw query for true controversy score
				break;
			case 'recent':
			default:
				orderBy = { createdAt: 'desc' };
		}

		// Execute queries
		const [facts, total] = await Promise.all([
			db.fact.findMany({
				where,
				orderBy,
				skip: offset,
				take: limit,
				select: {
					id: true,
					title: true,
					body: true,
					status: true,
					createdAt: true,
					updatedAt: true,
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
							votes: true,
							sources: true,
							comments: true,
							discussions: true
						}
					}
				}
			}),
			db.fact.count({ where })
		]);

		// Transform response
		const data = facts.map(fact => ({
			id: fact.id,
			title: fact.title,
			body: fact.body,
			status: fact.status,
			createdAt: fact.createdAt.toISOString(),
			updatedAt: fact.updatedAt.toISOString(),
			category: fact.category ? {
				id: fact.category.id,
				name: fact.category.name
			} : null,
			author: {
				id: fact.user.id,
				name: `${fact.user.firstName} ${fact.user.lastName}`,
				type: fact.user.userType
			},
			stats: {
				votes: fact._count.votes,
				sources: fact._count.sources,
				comments: fact._count.comments,
				discussions: fact._count.discussions
			}
		}));

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(
			{ facts: data },
			buildPaginationMeta(page, limit, total),
			getRateLimitInfo(auth.context)
		);
	} catch (error) {
		console.error('API v1 facts error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
