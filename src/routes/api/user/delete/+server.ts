import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteAccount, type ProfileServiceError } from '$lib/server/services/profile';
import { createBlankSessionCookie } from '$lib/server/services/auth';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user || !locals.session) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await deleteAccount(locals.user.id);

		return json(
			{
				success: true,
				message: 'Your account has been deleted. You have been logged out.'
			},
			{
				headers: {
					'Set-Cookie': createBlankSessionCookie()
				}
			}
		);
	} catch (err) {
		if (err && typeof err === 'object' && 'code' in err) {
			const serviceError = err as ProfileServiceError;
			return json({ success: false, error: serviceError.message }, { status: 400 });
		}

		console.error('Account deletion error:', err);
		throw error(500, 'Failed to delete account');
	}
};
