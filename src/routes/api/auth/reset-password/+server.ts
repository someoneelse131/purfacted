import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resetPassword, type PasswordServiceError } from '$lib/server/services/password';
import { passwordResetSchema } from '$lib/utils/validation';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate input
		const validation = passwordResetSchema.safeParse(body);
		if (!validation.success) {
			return json(
				{
					success: false,
					error: 'Invalid input',
					details: validation.error.flatten().fieldErrors
				},
				{ status: 400 }
			);
		}

		const { token, password } = validation.data;

		await resetPassword(token, password);

		return json({
			success: true,
			message: 'Password has been reset successfully. You can now log in with your new password.'
		});
	} catch (err) {
		// Handle known errors
		if (err && typeof err === 'object' && 'code' in err) {
			const serviceError = err as PasswordServiceError;

			switch (serviceError.code) {
				case 'INVALID_TOKEN':
				case 'TOKEN_EXPIRED':
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

		console.error('Password reset error:', err);
		throw error(500, 'An unexpected error occurred');
	}
};
