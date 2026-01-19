import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { registerUser, type UserServiceError } from '$lib/server/services/user';
import { sendVerificationEmail } from '$lib/server/mail';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		const { email, firstName, lastName, password, captchaToken } = body;

		// TODO: Verify captcha token when captcha is implemented (R39)

		const result = await registerUser({
			email,
			firstName,
			lastName,
			password,
			captchaToken
		});

		// Send verification email
		const emailSent = await sendVerificationEmail(
			result.user.email,
			result.user.firstName,
			result.verificationToken
		);

		if (!emailSent && process.env.NODE_ENV === 'development') {
			console.log(`Verification token for ${email}: ${result.verificationToken}`);
		}

		return json(
			{
				success: true,
				message: 'Registration successful. Please check your email to verify your account.',
				user: {
					id: result.user.id,
					email: result.user.email,
					firstName: result.user.firstName,
					lastName: result.user.lastName
				}
			},
			{ status: 201 }
		);
	} catch (err) {
		// Handle known service errors
		if (err && typeof err === 'object' && 'code' in err) {
			const serviceError = err as UserServiceError;

			switch (serviceError.code) {
				case 'VALIDATION_ERROR':
					return json(
						{
							success: false,
							error: serviceError.message,
							details: serviceError.details
						},
						{ status: 400 }
					);

				case 'EMAIL_EXISTS':
					return json(
						{
							success: false,
							error: serviceError.message
						},
						{ status: 409 }
					);

				case 'DISPOSABLE_EMAIL':
					return json(
						{
							success: false,
							error: 'Disposable email addresses are not allowed'
						},
						{ status: 400 }
					);
			}
		}

		// Handle disposable email error (thrown as Error)
		if (err instanceof Error && err.message.includes('Disposable email')) {
			return json(
				{
					success: false,
					error: err.message
				},
				{ status: 400 }
			);
		}

		// Unknown error
		console.error('Registration error:', err);
		throw error(500, 'An unexpected error occurred during registration');
	}
};
