import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getCategoryById,
	addCategoryAlias,
	CategoryError
} from '$lib/server/services/category';

/**
 * GET /api/categories/:id/aliases - Get category aliases
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
				categoryId: category.id,
				categoryName: category.name,
				aliases: category.aliases.map((a) => ({
					id: a.id,
					name: a.name,
					createdAt: a.createdAt
				}))
			}
		});
	} catch (err) {
		if ((err as any).status === 404) {
			throw err;
		}
		console.error('Error fetching aliases:', err);
		throw error(500, 'Failed to fetch aliases');
	}
};

/**
 * POST /api/categories/:id/aliases - Add an alias to a category
 * (Moderator only in production)
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check email verification
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email');
	}

	// In production, only moderators can add aliases directly
	// Regular users should use merge requests
	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can add aliases directly. Use merge requests instead.');
	}

	try {
		const body = await request.json();

		if (!body.name) {
			throw error(400, 'Alias name is required');
		}

		const alias = await addCategoryAlias(params.id, body.name);

		return json({
			success: true,
			data: {
				id: alias.id,
				name: alias.name,
				categoryId: alias.categoryId,
				message: 'Alias added successfully'
			}
		});
	} catch (err) {
		if (err instanceof CategoryError) {
			if (err.code === 'CATEGORY_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'ALIAS_EXISTS') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error adding alias:', err);
		throw error(500, 'Failed to add alias');
	}
};
