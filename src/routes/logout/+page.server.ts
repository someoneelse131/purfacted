import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { invalidateSession } from '$lib/server/services/auth/session';
import { deleteSessionCookie } from '$lib/server/services/auth/cookies';

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		if (locals.sessionToken) {
			await invalidateSession(authDeps(), locals.sessionToken);
		}
		deleteSessionCookie(cookies);
		redirect(303, '/');
	}
};
