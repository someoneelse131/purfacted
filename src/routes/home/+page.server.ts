import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getHomeFeed, type HomeFeedTab } from '$lib/server/services/home-feed';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const tab: HomeFeedTab = url.searchParams.get('tab') === 'global' ? 'global' : 'following';
	const feed = await getHomeFeed(authDeps(), { userId: locals.user.id, tab });
	return { feed };
};
