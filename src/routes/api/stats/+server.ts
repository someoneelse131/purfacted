import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPlatformStats,
	getActivityStats,
	getTrustDistribution,
	getTopContributors,
	getFactsByCategory,
	getFactsByStatus,
	getHomepageSummary
} from '$lib/server/services/statistics';

/**
 * GET /api/stats - Get platform statistics
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const type = url.searchParams.get('type') || 'summary';
		const days = parseInt(url.searchParams.get('days') || '30');
		const limit = parseInt(url.searchParams.get('limit') || '10');

		let data;

		switch (type) {
			case 'summary':
				data = await getHomepageSummary();
				break;

			case 'full':
				data = await getPlatformStats();
				break;

			case 'activity':
				data = await getActivityStats(Math.min(days, 365));
				break;

			case 'trust':
				data = await getTrustDistribution();
				break;

			case 'contributors':
				data = await getTopContributors(Math.min(limit, 100));
				break;

			case 'categories':
				data = await getFactsByCategory();
				break;

			case 'status':
				data = await getFactsByStatus();
				break;

			default:
				data = await getHomepageSummary();
		}

		return json({
			success: true,
			data
		});
	} catch (err) {
		console.error('Error fetching statistics:', err);
		throw error(500, 'Failed to fetch statistics');
	}
};
