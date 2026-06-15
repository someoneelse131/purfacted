import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getCategoryPage } from '$lib/server/services/categories';
import { followTarget, isFollowing, unfollowTarget } from '$lib/server/services/follows';
import { requireVerified } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const deps = authDeps();
	const pageParam = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const page = await getCategoryPage(deps, params.slug, pageParam);
	if (!page) error(404, 'Category not found');
	const following = locals.user
		? await isFollowing(deps, locals.user.id, 'CATEGORY', page.category.id)
		: false;
	return { categoryPage: page, following };
};

export const actions: Actions = {
	follow: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const result = await followTarget(authDeps(), {
			followerId: user.id,
			targetType: 'CATEGORY',
			targetId: String(form.get('targetId') ?? '')
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { following: true };
	},

	unfollow: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		await unfollowTarget(authDeps(), {
			followerId: user.id,
			targetType: 'CATEGORY',
			targetId: String(form.get('targetId') ?? '')
		});
		return { following: false };
	}
};
