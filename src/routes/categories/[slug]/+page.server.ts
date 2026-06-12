import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getCategoryPage } from '$lib/server/services/categories';

export const load: PageServerLoad = async ({ params }) => {
	const page = await getCategoryPage(authDeps(), params.slug);
	if (!page) error(404, 'Category not found');
	return { categoryPage: page };
};
