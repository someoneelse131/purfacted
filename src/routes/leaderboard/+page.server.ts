import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import {
	getLeaderboard,
	LEADERBOARD_WINDOWS,
	type LeaderboardWindow
} from '$lib/server/services/leaderboard';

function parseWindow(raw: string | null): LeaderboardWindow {
	return (LEADERBOARD_WINDOWS as readonly string[]).includes(raw ?? '')
		? (raw as LeaderboardWindow)
		: 'week';
}

export const load: PageServerLoad = async ({ url }) => {
	const deps = authDeps();
	const window = parseWindow(url.searchParams.get('window'));
	const categorySlug = url.searchParams.get('category') ?? '';

	const categories = await deps.prisma.category.findMany({
		where: { status: 'ACTIVE', parentId: null },
		select: { id: true, name: true, slug: true },
		orderBy: { name: 'asc' }
	});
	const category = categorySlug ? categories.find((c) => c.slug === categorySlug) : undefined;

	const entries = await getLeaderboard(deps, {
		window,
		categoryId: category?.id
	});

	return {
		window,
		windows: LEADERBOARD_WINDOWS,
		categories,
		categorySlug: category?.slug ?? '',
		entries
	};
};
