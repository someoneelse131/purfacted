import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getCategoryTree, proposeCategory } from '$lib/server/services/categories';
import { requireVerified } from '$lib/server/guards';

export const load: PageServerLoad = async () => {
	return { tree: await getCategoryTree(authDeps()) };
};

export const actions: Actions = {
	propose: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const parentIdRaw = String(form.get('parentId') ?? '');
		const result = await proposeCategory(authDeps(), {
			name: String(form.get('name') ?? ''),
			parentId: parentIdRaw === '' ? null : parentIdRaw,
			userId: user.id
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { proposed: true };
	}
};
