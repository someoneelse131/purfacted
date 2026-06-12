import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { changePassword } from '$lib/server/services/auth/password-reset';
import { createSession, invalidateAllSessions } from '$lib/server/services/auth/session';
import { deleteSessionCookie, setSessionCookie } from '$lib/server/services/auth/cookies';
import {
	requestEmailChange,
	softDeleteAccount,
	updateProfile,
	updateSettings
} from '$lib/server/services/users/profile';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	return {};
};

export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		const result = await updateProfile(authDeps(), {
			userId: locals.user.id,
			bio: String(form.get('bio') ?? ''),
			avatarUrl: String(form.get('avatarUrl') ?? '')
		});
		if (!result.ok) return fail(400, { section: 'profile', error: result.error });
		return { section: 'profile', saved: true };
	},

	changeEmail: async ({ request, locals, url }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		const result = await requestEmailChange(authDeps(), {
			userId: locals.user.id,
			newEmail: String(form.get('newEmail') ?? ''),
			origin: url.origin
		});
		if (!result.ok) return fail(400, { section: 'email', error: result.error });
		return { section: 'email', saved: true };
	},

	updateSettings: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		await updateSettings(authDeps(), {
			userId: locals.user.id,
			hideStats: form.get('hideStats') === 'on',
			notifyEmail: form.get('notifyEmail') === 'on'
		});
		return { section: 'settings', saved: true };
	},

	changePassword: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		const deps = authDeps();
		const result = await changePassword(deps, {
			userId: locals.user.id,
			currentPassword: String(form.get('currentPassword') ?? ''),
			newPassword: String(form.get('newPassword') ?? '')
		});
		if (!result.ok) return fail(400, { section: 'password', error: result.error });
		// changePassword invalidated every session - issue a fresh one here
		const { token, expiresAt } = await createSession(deps, locals.user.id, false);
		setSessionCookie(cookies, token, expiresAt);
		return { section: 'password', saved: true };
	},

	logoutEverywhere: async ({ locals, cookies }) => {
		if (!locals.user) redirect(302, '/login');
		await invalidateAllSessions(authDeps(), locals.user.id);
		deleteSessionCookie(cookies);
		redirect(303, '/login');
	},

	deleteAccount: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		const result = await softDeleteAccount(authDeps(), {
			userId: locals.user.id,
			password: String(form.get('password') ?? '')
		});
		if (!result.ok) return fail(400, { section: 'delete', error: result.error });
		deleteSessionCookie(cookies);
		redirect(303, '/');
	}
};
