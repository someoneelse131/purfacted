import type { PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { verifyEmail } from '$lib/server/services/auth/registration';

export const load: PageServerLoad = async ({ params }) => {
	const user = await verifyEmail(authDeps(), params.token);
	return { verified: user !== null, username: user?.username ?? null };
};
