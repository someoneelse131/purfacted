import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { getAppSecret } from '$lib/server/app-secret';
import { verifyUnsubscribeToken } from '$lib/server/services/email/unsubscribe';

// One-click unsubscribe (R6/R17): a valid signed token disables email
// notifications for the user - no login required.
export const load: PageServerLoad = async ({ params }) => {
	const payload = verifyUnsubscribeToken(params.token, getAppSecret());
	if (!payload) return { ok: false };
	await prisma.user.updateMany({
		where: { id: payload.userId },
		data: { notifyEmail: false }
	});
	return { ok: true };
};
