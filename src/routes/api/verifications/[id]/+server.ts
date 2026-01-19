import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getVerificationById,
	reviewVerification,
	moderatorOverride,
	VerificationError
} from '$lib/server/services/expertVerification';

/**
 * GET /api/verifications/:id - Get verification details
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const verification = await getVerificationById(params.id);

		if (!verification) {
			throw error(404, 'Verification not found');
		}

		// Only show document URL to moderators or the user themselves
		const canSeeDocument =
			locals.user.userType === 'MODERATOR' || verification.userId === locals.user.id;

		return json({
			success: true,
			data: {
				id: verification.id,
				type: verification.type,
				field: verification.field,
				documentUrl: canSeeDocument ? verification.documentUrl : null,
				status: verification.status,
				user: verification.user,
				reviews: verification.reviews.map((r) => ({
					id: r.id,
					reviewer: r.reviewer,
					approved: r.approved,
					comment:
						locals.user!.userType === 'MODERATOR' ||
						verification.userId === locals.user!.id
							? r.comment
							: null,
					createdAt: r.createdAt
				})),
				createdAt: verification.createdAt,
				updatedAt: verification.updatedAt
			}
		});
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error fetching verification:', err);
		throw error(500, 'Failed to fetch verification');
	}
};

/**
 * POST /api/verifications/:id - Submit a review or moderator override
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		// Moderator override
		if (body.action === 'override') {
			if (locals.user.userType !== 'MODERATOR') {
				throw error(403, 'Only moderators can override verifications');
			}

			if (typeof body.approved !== 'boolean') {
				throw error(400, 'approved must be a boolean');
			}

			const verification = await moderatorOverride(
				params.id,
				locals.user.id,
				body.approved,
				body.comment
			);

			return json({
				success: true,
				data: {
					id: verification.id,
					status: verification.status,
					message: body.approved
						? 'Verification approved by moderator'
						: 'Verification rejected by moderator'
				}
			});
		}

		// Regular review
		if (body.action === 'review') {
			if (typeof body.approved !== 'boolean') {
				throw error(400, 'approved must be a boolean');
			}

			const review = await reviewVerification(
				params.id,
				locals.user.id,
				body.approved,
				body.comment
			);

			return json({
				success: true,
				data: {
					id: review.id,
					message: body.approved
						? 'Verification approved'
						: 'Verification rejected'
				}
			});
		}

		throw error(400, 'Action must be "review" or "override"');
	} catch (err) {
		if (err instanceof VerificationError) {
			if (err.code === 'VERIFICATION_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'SELF_REVIEW') {
				throw error(403, err.message);
			}
			if (err.code === 'ALREADY_REVIEWED') {
				throw error(409, err.message);
			}
			if (err.code === 'NOT_MODERATOR') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error reviewing verification:', err);
		throw error(500, 'Failed to process review');
	}
};
