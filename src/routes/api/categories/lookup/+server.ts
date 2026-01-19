import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCategoryByName } from '$lib/server/services/category';

/**
 * GET /api/categories/lookup?name=cooking - Look up a category by name or alias
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const name = url.searchParams.get('name');

		if (!name) {
			throw error(400, 'Category name is required');
		}

		const category = await getCategoryByName(name);

		if (!category) {
			return json({
				success: true,
				data: null,
				message: 'Category not found'
			});
		}

		return json({
			success: true,
			data: {
				id: category.id,
				name: category.name,
				parentId: category.parentId,
				isAlias: category.name.toLowerCase() !== name.toLowerCase()
			}
		});
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error looking up category:', err);
		throw error(500, 'Failed to lookup category');
	}
};
