import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { login } from '$lib/server/services/auth/login';
import { setSessionCookie } from '$lib/server/services/auth/cookies';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const identifier = String(form.get('identifier') ?? '');
		const password = String(form.get('password') ?? '');
		const rememberMe = form.get('rememberMe') === 'on';

		const result = await login(authDeps(), {
			identifier,
			password,
			ip: getClientAddress(),
			rememberMe
		});
		if (!result.ok) {
			return fail(result.retryAfterSeconds ? 429 : 400, { error: result.error, identifier });
		}
		setSessionCookie(cookies, result.token, result.expiresAt);
		redirect(303, '/');
	}
};
