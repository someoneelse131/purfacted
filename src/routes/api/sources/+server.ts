import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getSourceCredibilityConfig,
	getSourceStatistics,
	suggestSourceType
} from '$lib/server/services/sourceCredibility';

/**
 * GET /api/sources - Get source credibility configuration and statistics
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const action = url.searchParams.get('action');

		if (action === 'config') {
			// Get credibility point configuration
			const config = await getSourceCredibilityConfig();
			return json({
				success: true,
				data: config
			});
		}

		if (action === 'stats') {
			// Get source statistics
			const stats = await getSourceStatistics();
			return json({
				success: true,
				data: stats
			});
		}

		if (action === 'detect') {
			// Detect source type from URL
			const sourceUrl = url.searchParams.get('url');
			if (!sourceUrl) {
				throw error(400, 'URL parameter is required');
			}

			const result = suggestSourceType(sourceUrl);
			return json({
				success: true,
				data: {
					url: sourceUrl,
					...result
				}
			});
		}

		// Default: return both config and stats
		const [config, stats] = await Promise.all([
			getSourceCredibilityConfig(),
			getSourceStatistics()
		]);

		return json({
			success: true,
			data: {
				config,
				stats
			}
		});
	} catch (err) {
		console.error('Error fetching source data:', err);
		throw error(500, 'Failed to fetch source data');
	}
};
