import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllOrganizations,
	getOrganizationStats,
	OrganizationError
} from '$lib/server/services/organization';

/**
 * GET /api/organizations - Get organizations or statistics
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		// Get statistics (moderators only)
		if (url.searchParams.get('stats') === 'true') {
			if (locals.user.userType !== 'MODERATOR') {
				throw error(403, 'Only moderators can view organization statistics');
			}

			const stats = await getOrganizationStats();
			return json({
				success: true,
				data: stats
			});
		}

		// Get all organizations
		const limit = parseInt(url.searchParams.get('limit') || '50', 10);
		const offset = parseInt(url.searchParams.get('offset') || '0', 10);

		const organizations = await getAllOrganizations(limit, offset);

		return json({
			success: true,
			data: organizations.map((org) => ({
				id: org.id,
				firstName: org.firstName, // Organization name
				lastName: org.lastName, // Organization type
				trustScore: org.trustScore,
				createdAt: org.createdAt,
				lastLoginAt: org.lastLoginAt
			}))
		});
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error fetching organizations:', err);
		throw error(500, 'Failed to fetch organizations');
	}
};
