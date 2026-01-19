import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getFactById,
	deleteFact,
	getFactCredibilityScore,
	FactValidationError
} from '$lib/server/services/fact';

/**
 * GET /api/facts/:id - Get a single fact
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const fact = await getFactById(params.id);

		if (!fact) {
			throw error(404, 'Fact not found');
		}

		// Calculate credibility score
		const credibilityScore = await getFactCredibilityScore(params.id);

		return json({
			success: true,
			data: {
				...fact,
				credibilityScore
			}
		});
	} catch (err) {
		if ((err as any).status === 404) {
			throw err;
		}
		console.error('Error fetching fact:', err);
		throw error(500, 'Failed to fetch fact');
	}
};

/**
 * DELETE /api/facts/:id - Delete a fact (owner only, SUBMITTED status only)
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await deleteFact(params.id, locals.user.id);

		return json({
			success: true,
			message: 'Fact deleted successfully'
		});
	} catch (err) {
		if (err instanceof FactValidationError) {
			if (err.code === 'NOT_AUTHORIZED') {
				throw error(403, err.message);
			}
			if (err.code === 'FACT_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error deleting fact:', err);
		throw error(500, 'Failed to delete fact');
	}
};
