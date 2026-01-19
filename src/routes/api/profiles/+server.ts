import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	searchUsers,
	getTopContributors,
	getProfileStats
} from '$lib/server/services/userProfile';

/**
 * GET /api/profiles - Search users or get top contributors
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const query = url.searchParams.get('q');
		const topContributors = url.searchParams.get('top');
		const stats = url.searchParams.get('stats');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const offset = parseInt(url.searchParams.get('offset') || '0');

		// Get platform stats
		if (stats === 'true') {
			const platformStats = await getProfileStats();
			return json({
				success: true,
				data: platformStats
			});
		}

		// Get top contributors
		if (topContributors === 'true') {
			const contributors = await getTopContributors(Math.min(limit, 50));
			return json({
				success: true,
				data: contributors
			});
		}

		// Search users
		if (query) {
			const users = await searchUsers(query, Math.min(limit, 50), offset);
			return json({
				success: true,
				data: users
			});
		}

		// Default: return top contributors
		const contributors = await getTopContributors(10);
		return json({
			success: true,
			data: contributors
		});
	} catch (err) {
		console.error('Error fetching profiles:', err);
		throw error(500, 'Failed to fetch profiles');
	}
};
