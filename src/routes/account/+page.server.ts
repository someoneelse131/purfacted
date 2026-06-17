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
import { listFollows, unfollowTarget } from '$lib/server/services/follows';
import { EMAIL_BATCH_TYPES } from '$lib/server/services/email/notify';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const follows = await listFollows(authDeps(), locals.user.id);
	// set by the /verify-email redirect after a successful confirmation
	return { follows, justVerified: url.searchParams.get('verified') === '1' };
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
			currentPassword: String(form.get('currentPassword') ?? ''),
			origin: url.origin
		});
		if (!result.ok) return fail(400, { section: 'email', error: result.error });
		return { section: 'email', saved: true };
	},

	updateSettings: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		// per-type email toggles: a missing checkbox means opted out -> false
		const emailNotifyPrefs: Record<string, boolean> = {};
		for (const type of EMAIL_BATCH_TYPES) {
			if (form.get(`email_${type}`) !== 'on') emailNotifyPrefs[type] = false;
		}
		await updateSettings(authDeps(), {
			userId: locals.user.id,
			hideStats: form.get('hideStats') === 'on',
			notifyEmail: form.get('notifyEmail') === 'on',
			emailNotifyPrefs
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
			newPassword: String(form.get('newPassword') ?? ''),
			confirmPassword: String(form.get('confirmPassword') ?? '')
		});
		if (!result.ok) return fail(400, { section: 'password', error: result.error });
		// changePassword invalidated every session - issue a fresh one here
		const { token, expiresAt } = await createSession(deps, locals.user.id, false);
		setSessionCookie(cookies, token, expiresAt);
		return { section: 'password', saved: true };
	},

	unfollow: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		const targetType = String(form.get('targetType') ?? '');
		if (targetType !== 'USER' && targetType !== 'CATEGORY') {
			return fail(400, { section: 'follows', error: 'Invalid follow target.' });
		}
		await unfollowTarget(authDeps(), {
			followerId: locals.user.id,
			targetType,
			targetId: String(form.get('targetId') ?? '')
		});
		return { section: 'follows', saved: true };
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
