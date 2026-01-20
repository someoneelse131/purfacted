/**
 * Public API v1 - Category Tree Endpoint
 *
 * GET /api/v1/categories/tree - Get full category tree hierarchy
 *
 * Returns nested tree structure of all categories
 * with fact counts at each level.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, API_ERRORS } from '$lib/server/api/response';
import { getCacheKey, getCachedResponse, cacheResponse, CACHE_TTL, recordCacheHit, recordCacheMiss } from '$lib/server/api/cache';

interface CategoryNode {
	id: string;
	name: string;
	factCount: number;
	children: CategoryNode[];
}

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
		const cacheKey = getCacheKey('categories/tree', {});

		if (!noCache) {
			const cached = await getCachedResponse<any>(cacheKey);

			if (cached) {
				recordCacheHit();
				await completeApiRequest(auth.context, event, 200);
				return apiSuccess(cached, undefined, getRateLimitInfo(auth.context));
			}
		}

		recordCacheMiss();

		// Get all categories with counts
		const categories = await db.category.findMany({
			select: {
				id: true,
				name: true,
				parentId: true,
				_count: {
					select: {
						facts: true
					}
				}
			},
			orderBy: { name: 'asc' }
		});

		// Build tree structure
		const categoryMap = new Map<string, CategoryNode>();
		const rootCategories: CategoryNode[] = [];

		// First pass: create all nodes
		for (const cat of categories) {
			categoryMap.set(cat.id, {
				id: cat.id,
				name: cat.name,
				factCount: cat._count.facts,
				children: []
			});
		}

		// Second pass: build hierarchy
		for (const cat of categories) {
			const node = categoryMap.get(cat.id)!;
			if (cat.parentId) {
				const parent = categoryMap.get(cat.parentId);
				if (parent) {
					parent.children.push(node);
				} else {
					// Parent not found, treat as root
					rootCategories.push(node);
				}
			} else {
				rootCategories.push(node);
			}
		}

		// Sort children at each level
		const sortChildren = (nodes: CategoryNode[]) => {
			nodes.sort((a, b) => a.name.localeCompare(b.name));
			for (const node of nodes) {
				sortChildren(node.children);
			}
		};
		sortChildren(rootCategories);

		// Calculate total facts including children
		const calculateTotalFacts = (node: CategoryNode): number => {
			let total = node.factCount;
			for (const child of node.children) {
				total += calculateTotalFacts(child);
			}
			return total;
		};

		// Add totalFactCount to response
		const enrichNode = (node: CategoryNode): any => ({
			id: node.id,
			name: node.name,
			factCount: node.factCount,
			totalFactCount: calculateTotalFacts(node),
			children: node.children.map(enrichNode)
		});

		const data = {
			tree: rootCategories.map(enrichNode),
			stats: {
				totalCategories: categories.length,
				rootCategories: rootCategories.length
			}
		};

		// Cache the result
		await cacheResponse(cacheKey, data, CACHE_TTL.CATEGORY_TREE);

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 category tree error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
