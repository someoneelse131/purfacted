import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requestPasswordReset, type PasswordServiceError } from '$lib/server/services/password';
import { getUserByEmail } from '$lib/server/services/user';
import { sendPasswordResetEmail } from '$lib/server/mail';
import { passwordResetRequestSchema } from '$lib/utils/validation';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate input
		const validation = passwordResetRequestSchema.safeParse(body);
		if (!validation.success) {
			return json(
				{
					success: false,
					error: 'Invalid email address'
				},
				{ status: 400 }
			);
		}

		const { email } = validation.data;

		const token = await requestPasswordReset(email);

		// Send password reset email if token was generated
		if (token) {
			const user = await getUserByEmail(email);
			if (user) {
				const emailSent = await sendPasswordResetEmail(email, user.firstName, token);
				if (!emailSent && process.env.NODE_ENV === 'development') {
					console.log(`Password reset token for ${email}: ${token}`);
				}
			}
		}

		// Always return success to not reveal if email exists
		return json({
			success: true,
			message: 'If an account with that email exists, a password reset link has been sent.'
		});
	} catch (err) {
		// Handle rate limiting
		if (err && typeof err === 'object' && 'code' in err) {
			const serviceError = err as PasswordServiceError;

			if (serviceError.code === 'RATE_LIMITED') {
				return json(
					{
						success: false,
						error: serviceError.message
					},
					{
						status: 429,
						headers: serviceError.retryAfterSeconds
							? { 'Retry-After': String(serviceError.retryAfterSeconds) }
							: {}
					}
				);
			}
		}

		console.error('Password reset request error:', err);
		throw error(500, 'An unexpected error occurred');
	}
};
