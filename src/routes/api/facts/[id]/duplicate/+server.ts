import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	flagAsDuplicate,
	rejectDuplicate,
	getDuplicatesOf,
	getPrimaryFact,
	findPotentialDuplicates,
	DuplicateError
} from '$lib/server/services/duplicate';
import { getFactById } from '$lib/server/services/fact';

/**
 * GET /api/facts/:id/duplicate - Get duplicate info for a fact
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const action = url.searchParams.get('action');

		if (action === 'potential') {
			// Find potential duplicates based on title similarity
			const fact = await getFactById(params.id);
			if (!fact) {
				throw error(404, 'Fact not found');
			}

			const potentialDuplicates = await findPotentialDuplicates(fact.title, params.id);
			return json({
				success: true,
				data: potentialDuplicates
			});
		}

		// Get duplicates of this fact and check if it's a duplicate itself
		const [duplicates, primaryFact] = await Promise.all([
			getDuplicatesOf(params.id),
			getPrimaryFact(params.id)
		]);

		return json({
			success: true,
			data: {
				isDuplicate: !!primaryFact,
				primaryFact: primaryFact
					? {
							id: primaryFact.id,
							title: primaryFact.title
						}
					: null,
				duplicates: duplicates.map((d) => ({
					id: d.id,
					title: d.title,
					createdAt: d.createdAt
				}))
			}
		});
	} catch (err) {
		console.error('Error fetching duplicate info:', err);
		throw error(500, 'Failed to fetch duplicate info');
	}
};

/**
 * POST /api/facts/:id/duplicate - Flag this fact as duplicate of another
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		if (!body.duplicateOfId) {
			throw error(400, 'duplicateOfId is required');
		}

		const fact = await flagAsDuplicate(params.id, body.duplicateOfId, locals.user.id);

		return json({
			success: true,
			data: {
				id: fact.id,
				duplicateOfId: fact.duplicateOfId
			}
		});
	} catch (err) {
		if (err instanceof DuplicateError) {
			if (err.code === 'FACT_NOT_FOUND' || err.code === 'TARGET_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error flagging duplicate:', err);
		throw error(500, 'Failed to flag duplicate');
	}
};

/**
 * DELETE /api/facts/:id/duplicate - Remove duplicate flag (moderator or author)
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const fact = await rejectDuplicate(params.id);

		return json({
			success: true,
			message: 'Duplicate flag removed',
			data: {
				id: fact.id
			}
		});
	} catch (err) {
		if (err instanceof DuplicateError) {
			if (err.code === 'FACT_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error removing duplicate flag:', err);
		throw error(500, 'Failed to remove duplicate flag');
	}
};
