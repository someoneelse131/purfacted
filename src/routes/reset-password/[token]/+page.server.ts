import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { resetPassword } from '$lib/server/services/auth/password-reset';

export const actions: Actions = {
	default: async ({ request, params }) => {
		const form = await request.formData();
		const newPassword = String(form.get('password') ?? '');
		const result = await resetPassword(authDeps(), { token: params.token, newPassword });
		if (!result.ok) {
			return fail(400, { error: result.error });
		}
		redirect(303, '/login?reset=1');
	}
};
