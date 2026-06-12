import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { listUnderReview } from '$lib/server/services/facts/queries';

export const load: PageServerLoad = async () => {
	return { facts: await listUnderReview(authDeps()) };
};
