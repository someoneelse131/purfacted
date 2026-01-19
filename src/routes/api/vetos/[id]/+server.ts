import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getVetoById,
	getVetoVotingSummary,
	getUserVetoVote,
	VetoError
} from '$lib/server/services/veto';

/**
 * GET /api/vetos/:id - Get veto details with voting summary
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const veto = await getVetoById(params.id);

		if (!veto) {
			throw error(404, 'Veto not found');
		}

		// Get voting summary
		const votingSummary = await getVetoVotingSummary(params.id);

		// Get user's vote if authenticated
		let userVote = null;
		if (locals.user) {
			userVote = await getUserVetoVote(locals.user.id, params.id);
		}

		return json({
			success: true,
			data: {
				id: veto.id,
				reason: veto.reason,
				status: veto.status,
				createdAt: veto.createdAt,
				resolvedAt: veto.resolvedAt,
				sources: veto.sources,
				fact: veto.fact,
				user: veto.user,
				voting: votingSummary,
				userVote: userVote
					? {
							value: userVote.value,
							weight: userVote.weight
						}
					: null
			}
		});
	} catch (err) {
		if ((err as any).status === 404) {
			throw err;
		}
		console.error('Error fetching veto:', err);
		throw error(500, 'Failed to fetch veto');
	}
};
