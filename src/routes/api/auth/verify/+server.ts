import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyEmail } from '$lib/server/services/user';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { token } = body;

		if (!token || typeof token !== 'string') {
			return json(
				{
					success: false,
					error: 'Verification token is required'
				},
				{ status: 400 }
			);
		}

		const user = await verifyEmail(token);

		if (!user) {
			return json(
				{
					success: false,
					error: 'Invalid or expired verification token'
				},
				{ status: 400 }
			);
		}

		return json({
			success: true,
			message: 'Email verified successfully. You can now log in.'
		});
	} catch (err) {
		console.error('Email verification error:', err);
		throw error(500, 'An unexpected error occurred during email verification');
	}
};

// Also support GET for clicking links in emails
export const GET: RequestHandler = async ({ url }) => {
	const token = url.searchParams.get('token');

	if (!token) {
		return json(
			{
				success: false,
				error: 'Verification token is required'
			},
			{ status: 400 }
		);
	}

	const user = await verifyEmail(token);

	if (!user) {
		return json(
			{
				success: false,
				error: 'Invalid or expired verification token'
			},
			{ status: 400 }
		);
	}

	return json({
		success: true,
		message: 'Email verified successfully. You can now log in.'
	});
};
