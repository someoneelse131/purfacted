import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { listReviewHub, type HubSort, type HubTab } from '$lib/server/services/facts/review-hub';
import { getCategoryTree } from '$lib/server/services/categories';

export const load: PageServerLoad = async ({ url }) => {
	const deps = authDeps();
	const tab: HubTab =
		url.searchParams.get('tab') === 'unsubstantiated' ? 'unsubstantiated' : 'review';
	const sortParam = url.searchParams.get('sort');
	const sort: HubSort =
		sortParam === 'oldest' || sortParam === 'close-to-quorum' ? sortParam : 'newest';
	const categorySlug = url.searchParams.get('category') || undefined;
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

	const [hub, tree] = await Promise.all([
		listReviewHub(deps, { tab, sort, categorySlug, page }),
		getCategoryTree(deps)
	]);
	return { hub, tree, tab, sort, categorySlug: categorySlug ?? '' };
};
