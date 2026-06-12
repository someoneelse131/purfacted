import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { changePassword } from '$lib/server/services/auth/password-reset';
import { createSession, invalidateAllSessions } from '$lib/server/services/auth/session';
import { deleteSessionCookie, setSessionCookie } from '$lib/server/services/auth/cookies';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	return {};
};

export const actions: Actions = {
	changePassword: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		const currentPassword = String(form.get('currentPassword') ?? '');
		const newPassword = String(form.get('newPassword') ?? '');

		const deps = authDeps();
		const result = await changePassword(deps, {
			userId: locals.user.id,
			currentPassword,
			newPassword
		});
		if (!result.ok) {
			return fail(400, { error: result.error });
		}
		// changePassword invalidated every session - issue a fresh one here
		const { token, expiresAt } = await createSession(deps, locals.user.id, false);
		setSessionCookie(cookies, token, expiresAt);
		return { changed: true };
	},

	logoutEverywhere: async ({ locals, cookies }) => {
		if (!locals.user) redirect(302, '/login');
		await invalidateAllSessions(authDeps(), locals.user.id);
		deleteSessionCookie(cookies);
		redirect(303, '/login');
	}
};
