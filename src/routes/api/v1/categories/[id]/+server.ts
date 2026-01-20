/**
 * Public API v1 - Single Category Endpoint
 *
 * GET /api/v1/categories/:id - Get a specific category by ID
 *
 * Returns detailed information about a category including:
 * - Category name and hierarchy
 * - Parent category info
 * - Children categories
 * - Fact counts
 * - Aliases
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

		const category = await db.category.findUnique({
			where: { id },
			include: {
				parent: {
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
				children: {
					select: {
						id: true,
						name: true,
						_count: {
							select: {
								facts: true,
								children: true
							}
						}
					},
					orderBy: { name: 'asc' }
				},
				aliases: {
					select: {
						id: true,
						name: true
					}
				},
				createdBy: {
					select: {
						id: true,
						firstName: true,
						lastName: true
					}
				},
				_count: {
					select: {
						facts: true
					}
				}
			}
		});

		if (!category) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Category');
		}

		// Build breadcrumb path
		const breadcrumb: { id: string; name: string }[] = [];
		if (category.parent) {
			if (category.parent.parent) {
				breadcrumb.push({ id: category.parent.parent.id, name: category.parent.parent.name });
			}
			breadcrumb.push({ id: category.parent.id, name: category.parent.name });
		}
		breadcrumb.push({ id: category.id, name: category.name });

		// Transform response
		const data = {
			id: category.id,
			name: category.name,
			createdAt: category.createdAt.toISOString(),

			breadcrumb,

			parent: category.parent ? {
				id: category.parent.id,
				name: category.parent.name
			} : null,

			children: category.children.map(child => ({
				id: child.id,
				name: child.name,
				stats: {
					facts: child._count.facts,
					subcategories: child._count.children
				}
			})),

			aliases: category.aliases.map(alias => alias.name),

			createdBy: category.createdBy ? {
				id: category.createdBy.id,
				name: `${category.createdBy.firstName} ${category.createdBy.lastName}`
			} : null,

			stats: {
				facts: category._count.facts,
				subcategories: category.children.length
			}
		};

		await completeApiRequest(auth.context, event, 200);

		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 category detail error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
