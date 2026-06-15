import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getHomeFeed, type HomeFeedTab } from '$lib/server/services/home-feed';
import { getHotspots } from '$lib/server/services/facts/hotspots';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const deps = authDeps();
	const tab: HomeFeedTab = url.searchParams.get('tab') === 'global' ? 'global' : 'following';
	const [feed, hotspots] = await Promise.all([
		getHomeFeed(deps, { userId: locals.user.id, tab }),
		getHotspots(deps)
	]);
	return { feed, hotspots };
};
