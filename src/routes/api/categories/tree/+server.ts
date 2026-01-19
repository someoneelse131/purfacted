import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCategoryTree } from '$lib/server/services/category';

interface CategoryTreeNode {
	id: string;
	name: string;
	factCount: number;
	childCount: number;
	aliases: { id: string; name: string }[];
	children: CategoryTreeNode[];
}

function mapCategoryToTree(category: any): CategoryTreeNode {
	return {
		id: category.id,
		name: category.name,
		factCount: category._count?.facts || 0,
		childCount: category._count?.children || 0,
		aliases: category.aliases?.map((a: any) => ({ id: a.id, name: a.name })) || [],
		children: category.children?.map(mapCategoryToTree) || []
	};
}

/**
 * GET /api/categories/tree - Get full category hierarchy
 */
export const GET: RequestHandler = async () => {
	try {
		const rootCategories = await getCategoryTree();

		const tree: CategoryTreeNode[] = rootCategories.map(mapCategoryToTree);

		return json({
			success: true,
			data: tree
		});
	} catch (err) {
		console.error('Error fetching category tree:', err);
		throw error(500, 'Failed to fetch category tree');
	}
};
