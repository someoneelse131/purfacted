import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getCategoryTree } from '$lib/server/services/categories';
import { getConfigNumber } from '$lib/server/services/config';
import {
	applyForExpert,
	EXPERT_CREDENTIAL_MIMES,
	listOwnApplications
} from '$lib/server/services/experts';
import { requireVerified } from '$lib/server/guards';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireVerified(locals.user);
	const deps = authDeps();
	const [tree, fieldMin, fieldMax, maxBytes, applications] = await Promise.all([
		getCategoryTree(deps),
		getConfigNumber(deps, 'expert.field_min'),
		getConfigNumber(deps, 'expert.field_max'),
		getConfigNumber(deps, 'expert.credential_max_bytes'),
		listOwnApplications(deps, user.id)
	]);
	return {
		tree,
		limits: { fieldMin, fieldMax, maxBytes },
		acceptMimes: EXPERT_CREDENTIAL_MIMES.join(','),
		applications: applications.map((a) => ({
			id: a.id,
			field: a.field,
			status: a.status,
			note: a.note,
			createdAt: a.createdAt
		})),
		isExpert: user.role === 'EXPERT'
	};
};

export const actions: Actions = {
	apply: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const credential = form.get('credential');
		if (!(credential instanceof File) || credential.size === 0) {
			return fail(400, { error: 'Attach your credential (PDF or image).' });
		}
		const bytes = Buffer.from(await credential.arrayBuffer());
		const categoryIds = form.getAll('categoryIds').map((c) => String(c));
		const result = await applyForExpert(authDeps(), {
			userId: user.id,
			field: String(form.get('field') ?? ''),
			categoryIds,
			credential: { bytes, mime: credential.type }
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { applied: true };
	}
};
