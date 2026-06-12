import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getPublicProfile } from '$lib/server/services/users/profile';

export const load: PageServerLoad = async ({ params }) => {
	const profile = await getPublicProfile(authDeps(), params.username);
	if (!profile) error(404, 'User not found');
	return { profile };
};
