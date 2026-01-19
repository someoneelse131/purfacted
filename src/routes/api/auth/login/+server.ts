import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { login, type AuthServiceError } from '$lib/server/services/auth';
import { loginSchema } from '$lib/utils/validation';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const body = await request.json();

		// Validate input
		const validation = loginSchema.safeParse(body);
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

		const { email, password, rememberMe } = validation.data;

		// Get client IP for rate limiting
		let ipAddress: string | undefined;
		try {
			ipAddress = getClientAddress();
		} catch {
			// IP not available, will fall back to email for rate limiting
		}

		const result = await login(email, password, rememberMe, ipAddress);

		return json(
			{
				success: true,
				message: 'Login successful',
				user: {
					id: result.user.id,
					email: result.user.email,
					firstName: result.user.firstName,
					lastName: result.user.lastName,
					userType: result.user.userType,
					trustScore: result.user.trustScore
				}
			},
			{
				status: 200,
				headers: {
					'Set-Cookie': result.sessionCookie
				}
			}
		);
	} catch (err) {
		// Handle known auth errors
		if (err && typeof err === 'object' && 'code' in err) {
			const authError = err as AuthServiceError;

			switch (authError.code) {
				case 'INVALID_CREDENTIALS':
					return json(
						{
							success: false,
							error: authError.message
						},
						{ status: 401 }
					);

				case 'EMAIL_NOT_VERIFIED':
					return json(
						{
							success: false,
							error: authError.message,
							code: 'EMAIL_NOT_VERIFIED'
						},
						{ status: 403 }
					);

				case 'RATE_LIMITED':
					return json(
						{
							success: false,
							error: authError.message,
							retryAfterSeconds: authError.retryAfterSeconds
						},
						{
							status: 429,
							headers: authError.retryAfterSeconds
								? { 'Retry-After': String(authError.retryAfterSeconds) }
								: {}
						}
					);

				case 'USER_BANNED':
					return json(
						{
							success: false,
							error: authError.message,
							code: 'USER_BANNED'
						},
						{ status: 403 }
					);
			}
		}

		// Unknown error
		console.error('Login error:', err);
		throw error(500, 'An unexpected error occurred during login');
	}
};
