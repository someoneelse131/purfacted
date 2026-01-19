import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logout, createBlankSessionCookie, getSessionCookieName } from '$lib/server/services/auth';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	try {
		const sessionId = cookies.get(getSessionCookieName());

		if (sessionId) {
			await logout(sessionId);
		}

		// Clear local user/session
		locals.user = null;
		locals.session = null;

		return json(
			{
				success: true,
				message: 'Logged out successfully'
			},
			{
				headers: {
					'Set-Cookie': createBlankSessionCookie()
				}
			}
		);
	} catch (err) {
		console.error('Logout error:', err);
		throw error(500, 'An unexpected error occurred during logout');
	}
};
