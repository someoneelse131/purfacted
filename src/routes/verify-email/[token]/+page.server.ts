import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { verifyEmail } from '$lib/server/services/auth/registration';

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = await verifyEmail(authDeps(), params.token);
	// A logged-in user (the common case: verify right after registering, or
	// confirm an email change) is bounced to /account. That full navigation
	// reloads the session-backed layout, so the "email not verified" notice
	// clears immediately instead of lingering until a manual hard refresh.
	// (We must not invalidate/re-run this load - the token is single-use and a
	// second verifyEmail call would report the link as already spent.)
	if (user && locals.user) {
		redirect(303, '/account?verified=1');
	}
	return { verified: user !== null, username: user?.username ?? null };
};
