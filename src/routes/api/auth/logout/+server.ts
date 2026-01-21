import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logout, getSessionCookieName } from '$lib/server/services/auth';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	try {
		const cookieName = getSessionCookieName();
		const sessionId = cookies.get(cookieName);

		if (sessionId) {
			await logout(sessionId);
		}

		// Clear local user/session
		locals.user = null;
		locals.session = null;

		// Clear the session cookie using SvelteKit's cookies API
		cookies.delete(cookieName, { path: '/' });

		return json({
			success: true,
			message: 'Logged out successfully'
		});
	} catch (err) {
		console.error('Logout error:', err);
		throw error(500, 'An unexpected error occurred during logout');
	}
};
