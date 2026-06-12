import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { listProposals, resolveProposal } from '$lib/server/services/categories';
import { requireModerator } from '$lib/server/guards';

export const load: PageServerLoad = async ({ locals }) => {
	requireModerator(locals.user);
	return { proposals: await listProposals(authDeps()) };
};

export const actions: Actions = {
	resolveProposal: async ({ request, locals }) => {
		requireModerator(locals.user);
		const form = await request.formData();
		const result = await resolveProposal(authDeps(), {
			categoryId: String(form.get('categoryId') ?? ''),
			approve: form.get('decision') === 'approve'
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { resolved: true };
	}
};
