/**
 * Public API v1 - Categories Endpoint
 *
 * GET /api/v1/categories - List categories with filtering options
 *
 * Query Parameters:
 * - q: Search query (searches name)
 * - parent: Filter by parent ID (use 'root' for top-level categories)
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 50, max: 100)
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, parsePagination, buildPaginationMeta, API_ERRORS } from '$lib/server/api/response';
import type { Prisma } from '@prisma/client';

export const GET: RequestHandler = async (event) => {
	// Authenticate
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const url = new URL(event.request.url);
		const { page, limit, offset } = parsePagination(url, 50, 100);

		// Parse query parameters
		const query = url.searchParams.get('q')?.trim();
		const parentFilter = url.searchParams.get('parent');

		// Build where clause
		const where: Prisma.CategoryWhereInput = {};

		if (query) {
			where.name = { contains: query, mode: 'insensitive' };
		}

		if (parentFilter === 'root') {
			where.parentId = null;
		} else if (parentFilter) {
			where.parentId = parentFilter;
		}

		// Execute queries
		const [categories, total] = await Promise.all([
			db.category.findMany({
				where,
				orderBy: { name: 'asc' },
				skip: offset,
				take: limit,
				select: {
					id: true,
					name: true,
					parentId: true,
					createdAt: true,
					parent: {
						select: {
							id: true,
							name: true
						}
					},
					_count: {
						select: {
							facts: true,
							children: true
						}
					}
				}
			}),
			db.category.count({ where })
		]);

		// Transform response
		const data = categories.map(cat => ({
			id: cat.id,
			name: cat.name,
			parentId: cat.parentId,
			parent: cat.parent ? {
				id: cat.parent.id,
				name: cat.parent.name
			} : null,
			createdAt: cat.createdAt.toISOString(),
			stats: {
				facts: cat._count.facts,
				subcategories: cat._count.children
			}
		}));

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(
			{ categories: data },
			buildPaginationMeta(page, limit, total),
			getRateLimitInfo(auth.context)
		);
	} catch (error) {
		console.error('API v1 categories error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
