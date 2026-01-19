import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requestEmailChange, type ProfileServiceError } from '$lib/server/services/profile';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !locals.session) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { email } = body;

		if (!email) {
			return json({ success: false, error: 'Email is required' }, { status: 400 });
		}

		await requestEmailChange(locals.user.id, email);

		return json({
			success: true,
			message: 'Verification email sent to your new email address. Please check your inbox.'
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'code' in err) {
			const serviceError = err as ProfileServiceError;

			if (serviceError.code === 'EMAIL_EXISTS') {
				return json({ success: false, error: serviceError.message }, { status: 409 });
			}

			return json({ success: false, error: serviceError.message }, { status: 400 });
		}

		console.error('Email change request error:', err);
		throw error(500, 'Failed to request email change');
	}
};
