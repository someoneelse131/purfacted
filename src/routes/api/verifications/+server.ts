import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	submitVerification,
	getPendingVerifications,
	getUserVerifications,
	getVerificationStats,
	VerificationError
} from '$lib/server/services/expertVerification';

/**
 * GET /api/verifications - Get verifications
 * Query params:
 *   - pending=true: Get pending verifications for review (moderators/reviewers)
 *   - user=true: Get current user's verifications
 *   - stats=true: Get verification statistics
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		// Get statistics
		if (url.searchParams.get('stats') === 'true') {
			const stats = await getVerificationStats();
			return json({
				success: true,
				data: stats
			});
		}

		// Get user's own verifications
		if (url.searchParams.get('user') === 'true') {
			const verifications = await getUserVerifications(locals.user.id);
			return json({
				success: true,
				data: verifications
			});
		}

		// Get pending verifications for review
		if (url.searchParams.get('pending') === 'true') {
			const limit = parseInt(url.searchParams.get('limit') || '20', 10);
			const offset = parseInt(url.searchParams.get('offset') || '0', 10);

			const verifications = await getPendingVerifications(limit, offset);

			// Filter out user's own verifications
			const filteredVerifications = verifications.filter(
				(v) => v.userId !== locals.user!.id
			);

			return json({
				success: true,
				data: filteredVerifications.map((v) => ({
					id: v.id,
					type: v.type,
					field: v.field,
					documentUrl: v.documentUrl,
					user: v.user,
					reviewCount: v.reviews.length,
					approvalCount: v.reviews.filter((r) => r.approved).length,
					createdAt: v.createdAt
				}))
			});
		}

		throw error(400, 'Specify query parameter: pending, user, or stats');
	} catch (err) {
		console.error('Error fetching verifications:', err);
		throw error(500, 'Failed to fetch verifications');
	}
};

/**
 * POST /api/verifications - Submit a new verification request
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		if (!body.type || !['EXPERT', 'PHD'].includes(body.type)) {
			throw error(400, 'Type must be EXPERT or PHD');
		}

		if (!body.documentUrl) {
			throw error(400, 'Document URL is required');
		}

		if (!body.field) {
			throw error(400, 'Field of expertise is required');
		}

		const verification = await submitVerification(locals.user.id, {
			type: body.type,
			documentUrl: body.documentUrl,
			field: body.field
		});

		return json({
			success: true,
			data: {
				id: verification.id,
				message: 'Verification request submitted successfully'
			}
		});
	} catch (err) {
		if (err instanceof VerificationError) {
			if (err.code === 'ALREADY_VERIFIED') {
				throw error(409, err.message);
			}
			if (err.code === 'PENDING_EXISTS') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error submitting verification:', err);
		throw error(500, 'Failed to submit verification');
	}
};
