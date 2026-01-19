import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getOrganizationById,
	approveOrganization,
	rejectOrganization,
	getOrganizationFacts,
	getOrganizationOwnedFacts,
	OrganizationError
} from '$lib/server/services/organization';

/**
 * GET /api/organizations/:id - Get organization details
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const org = await getOrganizationById(params.id);

		if (!org) {
			throw error(404, 'Organization not found');
		}

		// Get tagged facts if requested
		let taggedFacts: { factId: string; isDisputed: boolean }[] = [];
		let ownedFacts: string[] = [];

		if (url.searchParams.get('include') === 'facts') {
			const limit = parseInt(url.searchParams.get('limit') || '20', 10);
			const offset = parseInt(url.searchParams.get('offset') || '0', 10);

			[taggedFacts, ownedFacts] = await Promise.all([
				getOrganizationFacts(params.id, limit, offset),
				getOrganizationOwnedFacts(params.id, limit, offset)
			]);
		}

		return json({
			success: true,
			data: {
				id: org.id,
				firstName: org.firstName,
				lastName: org.lastName,
				trustScore: org.trustScore,
				createdAt: org.createdAt,
				lastLoginAt: org.lastLoginAt,
				taggedFacts: taggedFacts.length > 0 ? taggedFacts : undefined,
				ownedFacts: ownedFacts.length > 0 ? ownedFacts : undefined
			}
		});
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error fetching organization:', err);
		throw error(500, 'Failed to fetch organization');
	}
};

/**
 * PATCH /api/organizations/:id - Approve or reject organization (moderators only)
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can manage organizations');
	}

	try {
		const body = await request.json();

		if (body.action === 'approve') {
			const org = await approveOrganization(params.id, locals.user.id, body.reason);

			return json({
				success: true,
				data: {
					id: org.id,
					userType: org.userType,
					trustScore: org.trustScore,
					message: 'Organization approved successfully'
				}
			});
		}

		if (body.action === 'reject') {
			if (!body.reason) {
				throw error(400, 'Reason is required for rejection');
			}

			await rejectOrganization(params.id, locals.user.id, body.reason);

			return json({
				success: true,
				data: {
					message: 'Organization registration rejected'
				}
			});
		}

		throw error(400, 'Action must be "approve" or "reject"');
	} catch (err) {
		if (err instanceof OrganizationError) {
			if (err.code === 'USER_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_MODERATOR') {
				throw error(403, err.message);
			}
			if (err.code === 'ALREADY_ORGANIZATION') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error managing organization:', err);
		throw error(500, 'Failed to manage organization');
	}
};
