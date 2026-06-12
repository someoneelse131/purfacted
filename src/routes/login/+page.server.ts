import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { authDeps } from '$lib/server/auth-deps';
import { login } from '$lib/server/services/auth/login';
import { setSessionCookie } from '$lib/server/services/auth/cookies';
import { verifyCaptcha } from '$lib/server/services/auth/captcha';
import { honeypotTriggered } from '$lib/server/honeypot';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, locals }) => {
		const form = await request.formData();
		const identifier = String(form.get('identifier') ?? '');
		const password = String(form.get('password') ?? '');
		const rememberMe = form.get('rememberMe') === 'on';

		// bots filling the honeypot get a generic failure (R19)
		if (honeypotTriggered(form)) {
			return fail(400, { error: 'Invalid credentials.', identifier });
		}
		// suspicious IPs must pass the captcha when one is configured
		if (locals.suspicious) {
			const captchaOk = await verifyCaptcha(
				env.TURNSTILE_SECRET_KEY || undefined,
				form.get('cf-turnstile-response') ? String(form.get('cf-turnstile-response')) : undefined,
				getClientAddress()
			);
			if (!captchaOk) return fail(400, { error: 'Captcha verification failed.', identifier });
		}

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
