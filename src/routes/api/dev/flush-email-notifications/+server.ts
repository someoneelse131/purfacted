import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { getAppSecret } from '$lib/server/app-secret';
import { getConfigNumber } from '$lib/server/services/config';
import { flushEmailNotifications } from '$lib/server/services/email/notify';

// Dev-only: forces a batched-notification flush so E2E does not have to wait on
// the worker tick. Disabled unless EMAIL_DEV_MAILBOX=true (never in production).
// An optional ?window=0 collapses the rate window so a fresh notification mails
// immediately regardless of a recent send.
export const POST: RequestHandler = async ({ url }) => {
	if (env.EMAIL_DEV_MAILBOX !== 'true') {
		error(404, 'Not found');
	}
	const deps = { prisma, redis: getRedis() };
	const override = url.searchParams.get('window');
	const windowHours =
		override !== null
			? Number(override)
			: await getConfigNumber(deps, 'email.notify_batch_window_hours');
	const origin = env.ORIGIN ?? url.origin;
	const sent = await flushEmailNotifications(deps, {
		windowMs: windowHours * 3600 * 1000,
		origin,
		secret: getAppSecret()
	});
	return json({ sent });
};
