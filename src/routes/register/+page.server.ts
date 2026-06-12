import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { authDeps } from '$lib/server/auth-deps';
import { register } from '$lib/server/services/auth/registration';
import { verifyCaptcha } from '$lib/server/services/auth/captcha';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/');
	return { turnstileSiteKey: publicEnv.PUBLIC_TURNSTILE_SITE_KEY ?? null };
};

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '');
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');
		const honeypot = String(form.get('website') ?? '');
		const captchaToken = form.get('cf-turnstile-response');

		// Honeypot: bots fill the hidden field; pretend success, create nothing.
		if (honeypot !== '') {
			redirect(303, '/register/sent');
		}

		const captchaOk = await verifyCaptcha(
			env.TURNSTILE_SECRET_KEY || undefined,
			captchaToken ? String(captchaToken) : undefined,
			getClientAddress()
		);
		if (!captchaOk) {
			return fail(400, { error: 'Captcha verification failed.', username, email });
		}

		const result = await register(authDeps(), {
			username,
			email,
			password,
			origin: url.origin,
			ip: getClientAddress()
		});
		if (!result.ok) {
			return fail(400, { error: result.error, field: result.field, username, email });
		}
		redirect(303, '/register/sent');
	}
};
