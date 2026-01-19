import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCategoryById, CategoryError } from '$lib/server/services/category';

/**
 * GET /api/categories/:id - Get category details
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const category = await getCategoryById(params.id);

		if (!category) {
			throw error(404, 'Category not found');
		}

		return json({
			success: true,
			data: {
				id: category.id,
				name: category.name,
				parentId: category.parentId,
				parent: category.parent ? { id: category.parent.id, name: category.parent.name } : null,
				children: category.children.map((c) => ({ id: c.id, name: c.name })),
				aliases: category.aliases.map((a) => ({ id: a.id, name: a.name })),
				factCount: category._count.facts,
				childCount: category._count.children,
				createdAt: category.createdAt,
				updatedAt: category.updatedAt
			}
		});
	} catch (err) {
		if ((err as any).status === 404) {
			throw err;
		}
		console.error('Error fetching category:', err);
		throw error(500, 'Failed to fetch category');
	}
};
