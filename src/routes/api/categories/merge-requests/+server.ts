import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createMergeRequest,
	listMergeRequests,
	CategoryError
} from '$lib/server/services/category';

/**
 * GET /api/categories/merge-requests - List merge requests
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const status = url.searchParams.get('status') as 'PENDING' | 'APPROVED' | 'REJECTED' | null;
		const categoryId = url.searchParams.get('categoryId');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');

		const result = await listMergeRequests({
			status: status || undefined,
			categoryId: categoryId || undefined,
			page,
			limit
		});

		return json({
			success: true,
			data: {
				requests: result.requests.map((req) => ({
					id: req.id,
					fromCategory: { id: req.fromCategory.id, name: req.fromCategory.name },
					toCategory: { id: req.toCategory.id, name: req.toCategory.name },
					requestedBy: req.requestedBy,
					status: req.status,
					voteSummary: req.voteSummary,
					createdAt: req.createdAt,
					resolvedAt: req.resolvedAt
				})),
				total: result.total,
				page,
				limit
			}
		});
	} catch (err) {
		console.error('Error listing merge requests:', err);
		throw error(500, 'Failed to list merge requests');
	}
};

/**
 * POST /api/categories/merge-requests - Create a merge request
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check email verification
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before creating merge requests');
	}

	try {
		const body = await request.json();

		if (!body.fromCategoryId || !body.toCategoryId) {
			throw error(400, 'Both fromCategoryId and toCategoryId are required');
		}

		const mergeRequest = await createMergeRequest(locals.user.id, {
			fromCategoryId: body.fromCategoryId,
			toCategoryId: body.toCategoryId
		});

		return json({
			success: true,
			data: {
				id: mergeRequest.id,
				status: mergeRequest.status,
				message: 'Merge request created successfully. Community voting has begun.'
			}
		});
	} catch (err) {
		if (err instanceof CategoryError) {
			if (
				err.code === 'FROM_CATEGORY_NOT_FOUND' ||
				err.code === 'TO_CATEGORY_NOT_FOUND'
			) {
				throw error(404, err.message);
			}
			if (err.code === 'REQUEST_EXISTS') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error creating merge request:', err);
		throw error(500, 'Failed to create merge request');
	}
};
