import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllModerators,
	getModeratorStats,
	getEligibleCandidates,
	getInactiveModerators,
	runAutoElection,
	handleInactiveModerators,
	getModeratorConfig
} from '$lib/server/services/moderator';

/**
 * GET /api/moderators - Get moderators, stats, or candidates
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		// Get statistics
		if (url.searchParams.get('stats') === 'true') {
			const stats = await getModeratorStats();
			return json({
				success: true,
				data: stats
			});
		}

		// Get configuration (moderators only)
		if (url.searchParams.get('config') === 'true') {
			if (locals.user.userType !== 'MODERATOR') {
				throw error(403, 'Only moderators can view configuration');
			}

			const config = getModeratorConfig();
			return json({
				success: true,
				data: config
			});
		}

		// Get eligible candidates (moderators only)
		if (url.searchParams.get('candidates') === 'true') {
			if (locals.user.userType !== 'MODERATOR') {
				throw error(403, 'Only moderators can view candidates');
			}

			const limit = parseInt(url.searchParams.get('limit') || '20', 10);
			const candidates = await getEligibleCandidates(limit);

			return json({
				success: true,
				data: candidates.map((c) => ({
					id: c.id,
					firstName: c.firstName,
					lastName: c.lastName,
					trustScore: c.trustScore,
					userType: c.userType
				}))
			});
		}

		// Get inactive moderators (moderators only)
		if (url.searchParams.get('inactive') === 'true') {
			if (locals.user.userType !== 'MODERATOR') {
				throw error(403, 'Only moderators can view inactive list');
			}

			const inactive = await getInactiveModerators();

			return json({
				success: true,
				data: inactive.map((m) => ({
					id: m.id,
					firstName: m.firstName,
					lastName: m.lastName,
					trustScore: m.trustScore,
					lastLoginAt: m.lastLoginAt
				}))
			});
		}

		// Get all moderators
		const moderators = await getAllModerators();

		return json({
			success: true,
			data: moderators.map((m) => ({
				id: m.id,
				firstName: m.firstName,
				lastName: m.lastName,
				trustScore: m.trustScore,
				lastLoginAt: m.lastLoginAt
			}))
		});
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error fetching moderators:', err);
		throw error(500, 'Failed to fetch moderators');
	}
};

/**
 * POST /api/moderators - Run auto-election or handle inactive moderators
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can trigger elections');
	}

	try {
		const body = await request.json();

		// Run auto-election
		if (body.action === 'auto-elect') {
			const result = await runAutoElection();

			return json({
				success: true,
				data: {
					promoted: result.promoted.map((u) => ({
						id: u.id,
						firstName: u.firstName,
						lastName: u.lastName
					})),
					demoted: result.demoted.map((u) => ({
						id: u.id,
						firstName: u.firstName,
						lastName: u.lastName
					})),
					message: `Promoted ${result.promoted.length}, demoted ${result.demoted.length}`
				}
			});
		}

		// Handle inactive moderators
		if (body.action === 'handle-inactive') {
			const result = await handleInactiveModerators();

			return json({
				success: true,
				data: {
					demoted: result.demoted.map((u) => ({
						id: u.id,
						firstName: u.firstName,
						lastName: u.lastName
					})),
					promoted: result.promoted.map((u) => ({
						id: u.id,
						firstName: u.firstName,
						lastName: u.lastName
					})),
					message: `Demoted ${result.demoted.length} inactive, promoted ${result.promoted.length} replacements`
				}
			});
		}

		throw error(400, 'Action must be "auto-elect" or "handle-inactive"');
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error running moderator action:', err);
		throw error(500, 'Failed to run moderator action');
	}
};
