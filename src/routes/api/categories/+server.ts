import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createCategory,
	listCategories,
	getCategoryByName,
	getCategoryStats,
	CategoryError
} from '$lib/server/services/category';

/**
 * GET /api/categories - List categories with optional filters
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const parentId = url.searchParams.get('parentId');
		const search = url.searchParams.get('search');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const stats = url.searchParams.get('stats') === 'true';

		// If stats requested, return statistics
		if (stats) {
			const categoryStats = await getCategoryStats();
			return json({
				success: true,
				data: categoryStats
			});
		}

		const result = await listCategories({
			parentId: parentId === 'null' ? null : parentId || undefined,
			search: search || undefined,
			page,
			limit
		});

		return json({
			success: true,
			data: {
				categories: result.categories.map((cat) => ({
					id: cat.id,
					name: cat.name,
					parentId: cat.parentId,
					parent: cat.parent ? { id: cat.parent.id, name: cat.parent.name } : null,
					aliases: cat.aliases.map((a) => ({ id: a.id, name: a.name })),
					factCount: cat._count.facts,
					childCount: cat._count.children,
					createdAt: cat.createdAt
				})),
				total: result.total,
				page,
				limit
			}
		});
	} catch (err) {
		console.error('Error listing categories:', err);
		throw error(500, 'Failed to list categories');
	}
};

/**
 * POST /api/categories - Create a new category
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check email verification
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before creating categories');
	}

	try {
		const body = await request.json();

		if (!body.name) {
			throw error(400, 'Category name is required');
		}

		const category = await createCategory(locals.user.id, {
			name: body.name,
			parentId: body.parentId || null
		});

		return json({
			success: true,
			data: {
				id: category.id,
				name: category.name,
				parentId: category.parentId,
				message: 'Category created successfully'
			}
		});
	} catch (err) {
		if (err instanceof CategoryError) {
			if (err.code === 'CATEGORY_EXISTS') {
				throw error(409, err.message);
			}
			if (err.code === 'PARENT_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error creating category:', err);
		throw error(500, 'Failed to create category');
	}
};
