import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { verifyUnsubscribeToken } from '$lib/server/services/email/unsubscribe';

// One-click unsubscribe (R6/R17): a valid signed token disables email
// notifications for the user - no login required.
export const load: PageServerLoad = async ({ params }) => {
	const secret = env.APP_SECRET ?? 'dev-secret-change-me';
	const payload = verifyUnsubscribeToken(params.token, secret);
	if (!payload) return { ok: false };
	await prisma.user.updateMany({
		where: { id: payload.userId },
		data: { notifyEmail: false }
	});
	return { ok: true };
};
