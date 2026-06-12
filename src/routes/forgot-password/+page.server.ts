import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { requestPasswordReset } from '$lib/server/services/auth/password-reset';
import { honeypotTriggered } from '$lib/server/honeypot';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/account');
	return {};
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		// bots get the same response, nothing is sent (R19)
		if (honeypotTriggered(form)) return { sent: true };
		const email = String(form.get('email') ?? '');
		await requestPasswordReset(authDeps(), { email, origin: url.origin });
		// Always succeed - no account enumeration.
		return { sent: true };
	}
};
