import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProfile, updateProfile, type ProfileServiceError } from '$lib/server/services/profile';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !locals.session) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const profile = await getProfile(locals.user.id);

		if (!profile) {
			return json({ success: false, error: 'Profile not found' }, { status: 404 });
		}

		return json({
			success: true,
			profile: {
				id: profile.id,
				email: profile.email,
				firstName: profile.firstName,
				lastName: profile.lastName,
				userType: profile.userType,
				trustScore: profile.trustScore,
				emailVerified: profile.emailVerified,
				createdAt: profile.createdAt
			}
		});
	} catch (err) {
		console.error('Get profile error:', err);
		throw error(500, 'Failed to get profile');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !locals.session) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { firstName, lastName } = body;

		const updatedProfile = await updateProfile(locals.user.id, { firstName, lastName });

		return json({
			success: true,
			message: 'Profile updated successfully',
			profile: {
				id: updatedProfile.id,
				email: updatedProfile.email,
				firstName: updatedProfile.firstName,
				lastName: updatedProfile.lastName,
				userType: updatedProfile.userType,
				trustScore: updatedProfile.trustScore
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'code' in err) {
			const serviceError = err as ProfileServiceError;
			return json({ success: false, error: serviceError.message }, { status: 400 });
		}

		console.error('Update profile error:', err);
		throw error(500, 'Failed to update profile');
	}
};
