import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { changePassword, type PasswordServiceError } from '$lib/server/services/password';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user || !locals.session) {
		return json(
			{
				success: false,
				error: 'You must be logged in to change your password'
			},
			{ status: 401 }
		);
	}

	try {
		const body = await request.json();
		const { currentPassword, newPassword } = body;

		if (!currentPassword || !newPassword) {
			return json(
				{
					success: false,
					error: 'Current password and new password are required'
				},
				{ status: 400 }
			);
		}

		await changePassword(locals.user.id, currentPassword, newPassword);

		return json({
			success: true,
			message: 'Password has been changed successfully'
		});
	} catch (err) {
		// Handle known errors
		if (err && typeof err === 'object' && 'code' in err) {
			const serviceError = err as PasswordServiceError;

			switch (serviceError.code) {
				case 'WRONG_CURRENT_PASSWORD':
					return json(
						{
							success: false,
							error: serviceError.message
						},
						{ status: 400 }
					);

				case 'VALIDATION_ERROR':
				case 'SAME_PASSWORD':
					return json(
						{
							success: false,
							error: serviceError.message
						},
						{ status: 400 }
					);
			}
		}

		console.error('Password change error:', err);
		throw error(500, 'An unexpected error occurred');
	}
};
