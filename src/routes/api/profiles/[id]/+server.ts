import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPublicProfile, ProfileError } from '$lib/server/services/userProfile';

/**
 * GET /api/profiles/:id - Get public user profile
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const profile = await getPublicProfile(params.id, locals.user?.id);

		if (!profile) {
			throw error(404, 'User not found');
		}

		return json({
			success: true,
			data: profile
		});
	} catch (err) {
		if (err instanceof ProfileError) {
			throw error(400, err.message);
		}
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error fetching profile:', err);
		throw error(500, 'Failed to fetch profile');
	}
};
