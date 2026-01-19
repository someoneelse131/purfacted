import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	submitVeto,
	getFactVetos,
	VetoError
} from '$lib/server/services/veto';

/**
 * GET /api/facts/:id/veto - Get vetos for a fact
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const vetos = await getFactVetos(params.id);

		return json({
			success: true,
			data: vetos.map((veto) => ({
				id: veto.id,
				reason: veto.reason,
				status: veto.status,
				createdAt: veto.createdAt,
				resolvedAt: veto.resolvedAt,
				sources: veto.sources,
				user: veto.user,
				voteCount: veto._count.votes
			}))
		});
	} catch (err) {
		console.error('Error fetching vetos:', err);
		throw error(500, 'Failed to fetch vetos');
	}
};

/**
 * POST /api/facts/:id/veto - Submit a veto against this fact
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check email verification
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before submitting vetos');
	}

	try {
		const body = await request.json();

		if (!body.reason) {
			throw error(400, 'Reason is required');
		}

		if (!body.sources || body.sources.length === 0) {
			throw error(400, 'At least one source is required');
		}

		const veto = await submitVeto(locals.user.id, {
			factId: params.id,
			reason: body.reason,
			sources: body.sources
		});

		return json({
			success: true,
			data: {
				id: veto.id,
				status: veto.status,
				message: 'Veto submitted successfully. The fact is now under review.'
			}
		});
	} catch (err) {
		if (err instanceof VetoError) {
			if (err.code === 'FACT_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'INVALID_STATUS') {
				throw error(400, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error submitting veto:', err);
		throw error(500, 'Failed to submit veto');
	}
};
