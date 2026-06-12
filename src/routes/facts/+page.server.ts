import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { listFeed, type DecidedFilter, type FeedSort } from '$lib/server/services/facts/feed';
import { getCategoryTree } from '$lib/server/services/categories';

export const load: PageServerLoad = async ({ url }) => {
	const deps = authDeps();
	const sortParam = url.searchParams.get('sort');
	const sort: FeedSort =
		sortParam === 'most-reviewed' || sortParam === 'controversial' ? sortParam : 'newest';
	const statusParam = url.searchParams.get('status');
	const status =
		statusParam === 'VERIFIED' || statusParam === 'DISPUTED' || statusParam === 'REFUTED'
			? (statusParam as DecidedFilter)
			: undefined;
	const categorySlug = url.searchParams.get('category') || undefined;
	const query = url.searchParams.get('q') || undefined;
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

	const [feed, tree] = await Promise.all([
		listFeed(deps, { sort, status, categorySlug, query, page }),
		getCategoryTree(deps)
	]);
	return {
		feed,
		tree,
		sort,
		status: status ?? '',
		categorySlug: categorySlug ?? '',
		query: query ?? ''
	};
};
