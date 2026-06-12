import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getCategoryTree } from '$lib/server/services/categories';
import { submitFact } from '$lib/server/services/facts/submit';
import { suggestSourceType } from '$lib/server/services/facts/source-type';
import { requireVerified } from '$lib/server/guards';

export const load: PageServerLoad = async ({ locals }) => {
	requireVerified(locals.user);
	return { tree: await getCategoryTree(authDeps()) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const values = {
			title: String(form.get('title') ?? ''),
			body: String(form.get('body') ?? ''),
			categoryId: String(form.get('categoryId') ?? ''),
			sourceUrl: String(form.get('sourceUrl') ?? ''),
			sourceTitle: String(form.get('sourceTitle') ?? ''),
			sourceType: String(form.get('sourceType') ?? '')
		};
		// honeypot (R3/R19 pattern): pretend success, store nothing
		if (String(form.get('website') ?? '') !== '') redirect(303, '/review');

		const result = await submitFact(authDeps(), {
			userId: user.id,
			title: values.title,
			body: values.body,
			categoryId: values.categoryId,
			source: {
				url: values.sourceUrl,
				title: values.sourceTitle,
				type: values.sourceType || suggestSourceType(values.sourceUrl)
			}
		});
		if (!result.ok) return fail(400, { error: result.error, ...values });
		redirect(303, `/facts/${result.fact.id}`);
	}
};
