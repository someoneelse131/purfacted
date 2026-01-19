import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	requestFactEdit,
	getPendingEdit,
	getFactEdits,
	cancelFactEdit,
	generateDiff,
	FactEditError
} from '$lib/server/services/factEdit';
import { getFactById } from '$lib/server/services/fact';

/**
 * GET /api/facts/:id/edit - Get edit history and pending edit
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const [pendingEdit, editHistory] = await Promise.all([
			getPendingEdit(params.id),
			getFactEdits(params.id)
		]);

		// Generate diff for pending edit
		let diff = null;
		if (pendingEdit) {
			diff = generateDiff(pendingEdit.oldBody, pendingEdit.newBody);
		}

		return json({
			success: true,
			data: {
				pendingEdit: pendingEdit
					? {
							...pendingEdit,
							diff
						}
					: null,
				editHistory
			}
		});
	} catch (err) {
		console.error('Error fetching edit data:', err);
		throw error(500, 'Failed to fetch edit data');
	}
};

/**
 * POST /api/facts/:id/edit - Request an edit
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		if (!body.newBody) {
			throw error(400, 'New body content is required');
		}

		const edit = await requestFactEdit(params.id, locals.user.id, body.newBody);

		// Generate diff
		const diff = generateDiff(edit.oldBody, edit.newBody);

		return json({
			success: true,
			data: {
				edit,
				diff
			}
		});
	} catch (err) {
		if (err instanceof FactEditError) {
			if (err.code === 'FACT_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_AUTHOR') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error requesting edit:', err);
		throw error(500, 'Failed to request edit');
	}
};

/**
 * DELETE /api/facts/:id/edit - Cancel pending edit
 */
export const DELETE: RequestHandler = async ({ params, locals, url }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const editId = url.searchParams.get('editId');

		if (!editId) {
			// Cancel the pending edit for this fact
			const pendingEdit = await getPendingEdit(params.id);
			if (!pendingEdit) {
				throw error(404, 'No pending edit found');
			}
			await cancelFactEdit(pendingEdit.id, locals.user.id);
		} else {
			await cancelFactEdit(editId, locals.user.id);
		}

		return json({
			success: true,
			message: 'Edit request cancelled'
		});
	} catch (err) {
		if (err instanceof FactEditError) {
			if (err.code === 'EDIT_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_AUTHOR') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error cancelling edit:', err);
		throw error(500, 'Failed to cancel edit');
	}
};
